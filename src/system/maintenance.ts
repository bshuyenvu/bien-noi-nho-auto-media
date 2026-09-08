import { randomUUID } from 'node:crypto';
import { all, run } from '../storage/db.js';

type MaintenanceRow={id:string;owner_id:string;reason:string;created_by:string;started_at:string;ends_at:string;ended_at?:string};
type IncidentControlRow={id:string;owner_id:string;acknowledged_at?:string;acknowledged_by?:string;ack_note?:string;silenced_until?:string;silenced_by?:string;silence_reason?:string};

function envNumber(name:string,fallback:number){const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?n:fallback}
function nowIso(){return new Date().toISOString()}
function activeWindow(){
  const now=nowIso(),row=all<MaintenanceRow>('SELECT * FROM system_maintenance_windows WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1')[0];
  if(row&&row.ends_at<=now){run('UPDATE system_maintenance_windows SET ended_at=? WHERE id=?',row.ends_at,row.id);return undefined}
  return row;
}
export function maintenanceStatus(){
  const row=activeWindow();
  return row?{active:true,id:row.id,reason:row.reason,createdBy:row.created_by,startedAt:row.started_at,endsAt:row.ends_at,remainingMs:Math.max(0,Date.parse(row.ends_at)-Date.now())}:{active:false};
}
export function startMaintenance(createdBy:string,minutes?:number,reason?:string){
  const requested=Math.max(1,Math.round(Number(minutes||envNumber('MAINTENANCE_DEFAULT_MINUTES',30)))),max=Math.max(1,Math.round(envNumber('MAINTENANCE_MAX_MINUTES',240))),duration=Math.min(requested,max),now=nowIso(),endsAt=new Date(Date.now()+duration*60_000).toISOString();
  const existing=activeWindow();if(existing)run('UPDATE system_maintenance_windows SET ended_at=? WHERE id=?',now,existing.id);
  const id=randomUUID();run('INSERT INTO system_maintenance_windows(id,owner_id,reason,created_by,started_at,ends_at,ended_at) VALUES(?,?,?,?,?,?,NULL)',id,'system',String(reason||'Bảo trì hệ thống').slice(0,300),createdBy||'operator',now,endsAt);
  console.info(`[maintenance] started for ${duration}m until ${endsAt}`);return maintenanceStatus();
}
export function endMaintenance(endedBy:string){const row=activeWindow();if(!row)return maintenanceStatus();const now=nowIso();run('UPDATE system_maintenance_windows SET ended_at=? WHERE id=?',now,row.id);console.info(`[maintenance] ended by ${endedBy||'operator'}`);return maintenanceStatus()}

function incidentForOwner(id:string,ownerId:string){return all<IncidentControlRow>("SELECT id,owner_id,acknowledged_at,acknowledged_by,ack_note,silenced_until,silenced_by,silence_reason FROM system_incidents WHERE id=? AND (owner_id='system' OR owner_id=?) LIMIT 1",id,ownerId)[0]}
export function acknowledgeIncident(id:string,ownerId:string,actor:string,note?:string){const row=incidentForOwner(id,ownerId);if(!row)throw new Error('Không tìm thấy incident');const at=nowIso();run('UPDATE system_incidents SET acknowledged_at=?,acknowledged_by=?,ack_note=? WHERE id=?',at,actor||ownerId,String(note||'').slice(0,500)||null,id);return incidentControl(id,ownerId)}
export function silenceIncident(id:string,ownerId:string,actor:string,minutes?:number,reason?:string){const row=incidentForOwner(id,ownerId);if(!row)throw new Error('Không tìm thấy incident');const requested=Math.max(1,Math.round(Number(minutes||envNumber('INCIDENT_SILENCE_DEFAULT_MINUTES',60)))),max=Math.max(1,Math.round(envNumber('INCIDENT_SILENCE_MAX_MINUTES',10080))),duration=Math.min(requested,max),until=new Date(Date.now()+duration*60_000).toISOString();run('UPDATE system_incidents SET silenced_until=?,silenced_by=?,silence_reason=? WHERE id=?',until,actor||ownerId,String(reason||'Tạm ẩn cảnh báo').slice(0,500),id);return incidentControl(id,ownerId)}
export function unsilenceIncident(id:string,ownerId:string){const row=incidentForOwner(id,ownerId);if(!row)throw new Error('Không tìm thấy incident');run('UPDATE system_incidents SET silenced_until=NULL,silenced_by=NULL,silence_reason=NULL WHERE id=?',id);return incidentControl(id,ownerId)}
export function incidentControl(id:string,ownerId='system'){
  const row=incidentForOwner(id,ownerId);if(!row)return undefined;const silenced=Boolean(row.silenced_until&&Date.parse(row.silenced_until)>Date.now());
  return{acknowledged:Boolean(row.acknowledged_at),acknowledgedAt:row.acknowledged_at,acknowledgedBy:row.acknowledged_by,ackNote:row.ack_note,silenced,silencedUntil:silenced?row.silenced_until:undefined,silencedBy:silenced?row.silenced_by:undefined,silenceReason:silenced?row.silence_reason:undefined};
}
export function alertSuppression(incidentId:string,ownerId:string){const maintenance=maintenanceStatus();if(maintenance.active)return{suppressed:true,reason:'maintenance' as const,maintenance};const control=incidentControl(incidentId,ownerId);if(control?.silenced)return{suppressed:true,reason:'incident-silenced' as const,control};return{suppressed:false as const}}
