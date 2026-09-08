import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'auto-media-audit-'));
process.env.DB_PATH=join(dir,'audit.sqlite');
process.env.AUDIT_RETENTION_DAYS='90';

try{
  const {db,all}=await import('../src/storage/db.js');
  const {recordAuditEvent,listAuditEvents,auditStats,systemActor}=await import('../src/system/audit.js');
  const actor={id:'owner-1',label:'operator@example.test',role:'admin',authType:'api_key'};
  recordAuditEvent({ownerId:'owner-1',actor,action:'publish.create',targetType:'publish-job',targetId:'job-1',summary:'Created publish job',metadata:{platform:'youtube',accessToken:'raw-access-token',nested:{apiKey:'raw-api-key',safe:'ok'}}});
  await new Promise(r=>setTimeout(r,5));
  recordAuditEvent({ownerId:'system',actor:systemActor('self-heal'),action:'self-heal.pause',targetType:'render-queue',summary:'Auto paused render queue',metadata:{reason:'memory red'}});

  const items=listAuditEvents('owner-1',10);
  if(items.length!==2)throw new Error(`expected 2 audit events, got ${items.length}`);
  if(items[0]?.action!=='self-heal.pause'||items[1]?.action!=='publish.create')throw new Error('audit order/system visibility mismatch');
  const publish=items.find(x=>x.action==='publish.create');
  const raw=JSON.stringify(publish?.metadata||{});
  if(raw.includes('raw-access-token')||raw.includes('raw-api-key'))throw new Error('sensitive audit metadata was not redacted');
  if((publish?.metadata as any)?.accessToken!=='[redacted]'||(publish?.metadata as any)?.nested?.apiKey!=='[redacted]')throw new Error('audit redaction marker missing');
  const stats=auditStats('owner-1');
  if(stats.total!==2||stats.retentionDays!==90)throw new Error('audit stats mismatch');
  const rows=all<{metadata_json:string}>('SELECT metadata_json FROM system_audit_events WHERE action=?','publish.create');
  if(rows[0]?.metadata_json.includes('raw-access-token'))throw new Error('raw token persisted in SQLite');
  db.close();
  console.log('operator audit trail smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
