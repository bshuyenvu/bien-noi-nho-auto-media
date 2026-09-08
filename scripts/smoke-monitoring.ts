import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'auto-media-monitor-'));
process.env.DB_PATH=join(dir,'monitor.sqlite');
process.env.RENDER_OUTPUT_DIR=join(dir,'output');
process.env.RENDER_MIN_AVAILABLE_MB='1';
process.env.RENDER_MAX_LOAD_PER_CPU='999';
process.env.RENDER_MIN_FREE_DISK_MB='1';
process.env.RENDER_MAX_OUTPUT_MB='999999';
process.env.MONITOR_WARN_LOAD_PER_CPU='999';
process.env.MONITOR_HISTORY_DAYS='30';
mkdirSync(process.env.RENDER_OUTPUT_DIR,{recursive:true});

try{
  const {runProductionMonitorCycle,monitorIncidents}=await import('../src/system/monitor.js');
  const {db}=await import('../src/storage/db.js');
  process.env.MONITOR_WARN_AVAILABLE_MB='999999999';
  await runProductionMonitorCycle();
  const first=monitorIncidents('smoke-owner',100).find(x=>x.key==='memory'&&x.active);
  if(!first)throw new Error('memory warning incident was not opened');

  process.env.MONITOR_WARN_AVAILABLE_MB='1';
  await runProductionMonitorCycle();
  const resolved=monitorIncidents('smoke-owner',100).find(x=>x.id===first.id);
  if(!resolved?.resolvedAt||resolved.active)throw new Error('memory incident was not resolved');

  process.env.MONITOR_WARN_AVAILABLE_MB='999999999';
  const snapshot=await runProductionMonitorCycle();
  const reopened=monitorIncidents('smoke-owner',100).find(x=>x.key==='memory'&&x.active);
  if(!reopened||reopened.id===first.id)throw new Error('recurrent incident did not create a new occurrence id');
  if(!['yellow','red'].includes(snapshot.components.memory.severity))throw new Error('memory monitor severity was not elevated');
  if(!monitorIncidents('smoke-owner',100).some(x=>x.key==='publish-worker'))throw new Error('publish worker monitoring incident missing');
  db.close();
  console.log('production monitoring lifecycle smoke OK');
}finally{
  rmSync(dir,{recursive:true,force:true});
}
