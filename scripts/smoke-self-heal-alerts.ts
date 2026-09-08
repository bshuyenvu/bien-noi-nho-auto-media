import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'auto-media-self-heal-'));
const received:string[]=[];
const server=createServer((req,res)=>{let body='';req.on('data',c=>body+=String(c));req.on('end',()=>{received.push(body);res.writeHead(204);res.end()})});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();if(!address||typeof address==='string')throw new Error('test webhook server did not start');

process.env.DB_PATH=join(dir,'self-heal.sqlite');
process.env.RENDER_OUTPUT_DIR=join(dir,'output');
process.env.RENDER_MIN_AVAILABLE_MB='999999999';
process.env.RENDER_MAX_LOAD_PER_CPU='999';
process.env.RENDER_MIN_FREE_DISK_MB='1';
process.env.RENDER_MAX_OUTPUT_MB='999999';
process.env.MONITOR_WARN_AVAILABLE_MB='1';
process.env.MONITOR_WARN_LOAD_PER_CPU='999';
process.env.MONITOR_WARN_CGROUP_MEMORY_PCT='999';
process.env.MONITOR_CRIT_CGROUP_MEMORY_PCT='999';
process.env.SELF_HEAL_ENABLED='true';
process.env.SELF_HEAL_GREEN_CYCLES='2';
process.env.ALERT_MIN_SEVERITY='red';
process.env.ALERT_COOLDOWN_MS='600000';
process.env.ALERT_FAILURE_RETRY_MS='1000';
process.env.ALERT_NOTIFY_RECOVERY='true';
process.env.ALERT_WEBHOOK_URL=`http://127.0.0.1:${address.port}`;
process.env.ALERT_WEBHOOK_ALLOW_HTTP='true';
process.env.ALERT_SEND_TIMEOUT_MS='2000';
mkdirSync(process.env.RENDER_OUTPUT_DIR,{recursive:true});

try{
  const {runProductionMonitorCycle}=await import('../src/system/monitor.js');
  const {renderWorkerStatus}=await import('../src/video/job.js');
  const {db}=await import('../src/storage/db.js');

  const first=await runProductionMonitorCycle();
  const firstWorker=await renderWorkerStatus();
  if(first.components.memory.severity!=='red')throw new Error('forced memory RED was not detected');
  if(!first.selfHealing.autoPaused||!firstWorker.paused)throw new Error('render queue was not auto-paused on RED memory');
  if(received.length!==1)throw new Error(`expected one initial alert, got ${received.length}`);

  await runProductionMonitorCycle();
  if(received.length!==1)throw new Error('alert cooldown did not suppress duplicate incident notification');

  process.env.RENDER_MIN_AVAILABLE_MB='1';
  const recovery1=await runProductionMonitorCycle();
  if(!recovery1.selfHealing.autoPaused||recovery1.selfHealing.greenCycles!==1)throw new Error('self-heal did not require consecutive green cycles');
  if(received.length!==2)throw new Error('recovery notification was not delivered exactly once');

  const recovery2=await runProductionMonitorCycle();
  const finalWorker=await renderWorkerStatus();
  if(recovery2.selfHealing.autoPaused||finalWorker.paused)throw new Error('render queue did not auto-resume after stable green cycles');
  if(received.length!==2)throw new Error('recovery alert was duplicated');

  db.close();
  console.log('safe self-heal and external alert smoke OK');
}finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  rmSync(dir,{recursive:true,force:true});
}
