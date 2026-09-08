import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../auth/access.js';
import { all, run } from '../storage/db.js';

export interface AuditActor {id:string;label:string;role?:string;authType?:string}
export interface AuditInput {
  ownerId:string;
  actor:AuditActor;
  action:string;
  targetType:string;
  targetId?:string;
  summary:string;
  metadata?:unknown;
}
type AuditRow={id:string;owner_id:string;actor_id:string;actor_label:string;actor_role?:string;auth_type?:string;action:string;target_type:string;target_id?:string;summary:string;metadata_json?:string;created_at:string};

run('CREATE TABLE IF NOT EXISTS system_audit_events (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,actor_id TEXT NOT NULL,actor_label TEXT NOT NULL,actor_role TEXT,auth_type TEXT,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,summary TEXT NOT NULL,metadata_json TEXT,created_at TEXT NOT NULL)');
run('CREATE INDEX IF NOT EXISTS idx_system_audit_owner_created ON system_audit_events(owner_id,created_at DESC)');
run('CREATE INDEX IF NOT EXISTS idx_system_audit_action_created ON system_audit_events(action,created_at DESC)');

const SENSITIVE_KEY=/(token|secret|password|pass|authorization|cookie|api[_-]?key|credential|bearer|client[_-]?secret|refresh[_-]?token|access[_-]?token)/i;
function envNumber(name:string,fallback:number){const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?n:fallback}
function clean(value:unknown,depth=0):unknown{
  if(depth>4)return '[truncated]';
  if(value==null||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string')return value.slice(0,500);
  if(Array.isArray(value))return value.slice(0,25).map(v=>clean(v,depth+1));
  if(typeof value==='object'){
    const out:Record<string,unknown>={};
    for(const [key,val] of Object.entries(value as Record<string,unknown>).slice(0,50))out[key]=SENSITIVE_KEY.test(key)?'[redacted]':clean(val,depth+1);
    return out;
  }
  return String(value).slice(0,200);
}
function parse(raw?:string){if(!raw)return undefined;try{return JSON.parse(raw)}catch{return undefined}}
function trim(){const days=Math.max(7,envNumber('AUDIT_RETENTION_DAYS',90)),cutoff=new Date(Date.now()-days*86400000).toISOString();run('DELETE FROM system_audit_events WHERE created_at<?',cutoff)}
export function auditActor(access:AccessContext):AuditActor{
  let label=access.accountId;
  if(access.accountId==='legacy-admin')label='legacy-admin';
  else{const row=all<{email?:string}>('SELECT email FROM accounts WHERE id=? LIMIT 1',access.accountId)[0];if(row?.email)label=row.email}
  return{id:access.accountId,label,role:access.role,authType:access.authType};
}
export function systemActor(label='system'):AuditActor{return{id:`system:${label}`,label,role:'system',authType:'system'}}
export function recordAuditEvent(input:AuditInput){
  const createdAt=new Date().toISOString(),id=randomUUID(),metadata=input.metadata==null?undefined:clean(input.metadata);
  run('INSERT INTO system_audit_events(id,owner_id,actor_id,actor_label,actor_role,auth_type,action,target_type,target_id,summary,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,input.ownerId,input.actor.id,input.actor.label,input.actor.role||null,input.actor.authType||null,input.action.slice(0,120),input.targetType.slice(0,80),input.targetId?.slice(0,200)||null,input.summary.slice(0,700),metadata==null?null:JSON.stringify(metadata),createdAt);
  trim();
  return{id,createdAt};
}
export function listAuditEvents(ownerId:string,limit=80){
  return all<AuditRow>("SELECT * FROM system_audit_events WHERE owner_id=? OR owner_id='system' ORDER BY created_at DESC LIMIT ?",ownerId,Math.max(1,Math.min(200,limit))).map(row=>({id:row.id,ownerId:row.owner_id,actor:{id:row.actor_id,label:row.actor_label,role:row.actor_role,authType:row.auth_type},action:row.action,targetType:row.target_type,targetId:row.target_id||undefined,summary:row.summary,metadata:parse(row.metadata_json),createdAt:row.created_at}));
}
export function auditStats(ownerId:string){
  const total=Number(all<{n:number}>("SELECT COUNT(*) AS n FROM system_audit_events WHERE owner_id=? OR owner_id='system'",ownerId)[0]?.n||0),last=all<{created_at:string}>("SELECT created_at FROM system_audit_events WHERE owner_id=? OR owner_id='system' ORDER BY created_at DESC LIMIT 1",ownerId)[0];
  return{total,lastActivityAt:last?.created_at,retentionDays:Math.max(7,envNumber('AUDIT_RETENTION_DAYS',90))};
}
