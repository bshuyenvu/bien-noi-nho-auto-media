import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'auto-media-maintenance-'));
process.env.DB_PATH=join(dir,'maintenance.sqlite');
process.env.ALERT_WEBHOOK_URL='https://alerts.example.test/hook';
process.env.ALERT_MIN_SEVERITY='red';
process.env.ALERT_COOLDOWN_MS='3600000';
process.env.MAINTENANCE_DEFAULT_MINUTES='30';
process.env.MAINTENANCE_MAX_MINUTES='240';
process.env.INCIDENT_SILENCE_DEFAULT_MINUTES='60';
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;return new Response('',{status:204})};

try{
  const {run,db}=await import('../src/storage/db.js');
  const {acknowledgeIncident,endMaintenance,maintenanceStatus,silenceIncident,startMaintenance,unsilenceIncident,incidentControl}=await import('../src/system/maintenance.js');
  const {dispatchExternalAlert}=await import('../src/system/alerts.js');
  const now=new Date().toISOString(),incidentId='system:memory:smoke';
  run('INSERT INTO system_incidents(id,owner_id,incident_key,component,severity,message,opened_at,last_seen_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,NULL)',incidentId,'system','memory','memory','red','RAM critical',now,now);
  const event={incidentId,ownerId:'system',kind:'open' as const,component:'memory',severity:'red' as const,message:'RAM critical',occurredAt:now};

  const started=startMaintenance('smoke',1,'deploy smoke');
  if(!started.active)throw new Error('maintenance did not start');
  const mutedByMaintenance=await dispatchExternalAlert(event);
  if(networkCalls!==0||!mutedByMaintenance.every(x=>x.suppressed&&x.suppressionReason==='maintenance'))throw new Error('maintenance did not suppress external alerts');
  endMaintenance('smoke');
  if(maintenanceStatus().active)throw new Error('maintenance did not end');

  const ack=acknowledgeIncident(incidentId,'smoke-owner','smoke-owner','ack smoke');
  if(!ack?.acknowledged||ack.ackNote!=='ack smoke')throw new Error('incident ACK not persisted');
  const silenced=silenceIncident(incidentId,'smoke-owner','smoke-owner',60,'silence smoke');
  if(!silenced?.silenced)throw new Error('incident silence not active');
  const mutedByIncident=await dispatchExternalAlert(event);
  if(networkCalls!==0||!mutedByIncident.every(x=>x.suppressed&&x.suppressionReason==='incident-silenced'))throw new Error('incident silence did not suppress external alerts');

  unsilenceIncident(incidentId,'smoke-owner');
  if(incidentControl(incidentId,'smoke-owner')?.silenced)throw new Error('incident unsilence failed');
  const delivered=await dispatchExternalAlert(event);
  if(networkCalls!==1||!delivered.some(x=>x.sent))throw new Error('alert was not delivered after unsilence');

  const expiring=startMaintenance('smoke',1,'expiry smoke');
  if(!expiring.active||!expiring.id)throw new Error('expiry maintenance did not start');
  run('UPDATE system_maintenance_windows SET ends_at=? WHERE id=?',new Date(Date.now()-1000).toISOString(),expiring.id);
  if(maintenanceStatus().active)throw new Error('expired maintenance did not auto-close');

  db.close();
  console.log('maintenance / ack / silence smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
