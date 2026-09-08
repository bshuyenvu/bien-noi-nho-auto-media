import { all,run } from '../storage/db.js';

export type QueueStatus='waiting_review'|'approved'|'rendering'|'completed'|'failed';
export interface QueueItem{draftId:string;ownerId:string;title:string;status:QueueStatus;createdAt:string;updatedAt:string;jobId?:string;output?:string;error?:string}
type QueueRow={draft_id:string;owner_id:string;title:string;status:QueueStatus;created_at:string;updated_at:string;job_id?:string;output?:string;error?:string};
type DraftOwnerRow={owner_id?:string};

run(`CREATE TABLE IF NOT EXISTS production_queue (
  draft_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  job_id TEXT,
  output TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
run('CREATE INDEX IF NOT EXISTS idx_production_queue_owner_updated ON production_queue(owner_id,updated_at DESC)');
run('CREATE INDEX IF NOT EXISTS idx_production_queue_status_updated ON production_queue(status,updated_at DESC)');

function fromRow(r:QueueRow):QueueItem{return{draftId:r.draft_id,ownerId:r.owner_id,title:r.title,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,jobId:r.job_id||undefined,output:r.output||undefined,error:r.error||undefined}}
function ownerForDraft(draftId:string){return all<DraftOwnerRow>('SELECT owner_id FROM drafts WHERE id=? LIMIT 1',draftId)[0]?.owner_id||'legacy-admin'}

export function ensureQueueItem(draftId:string,title:string,ownerId?:string){
  const old=all<QueueRow>('SELECT * FROM production_queue WHERE draft_id=? LIMIT 1',draftId)[0];
  if(old){
    if(title&&old.title!==title){const updatedAt=new Date().toISOString();run('UPDATE production_queue SET title=?,updated_at=? WHERE draft_id=?',title,updatedAt,draftId);return fromRow({...old,title,updated_at:updatedAt})}
    return fromRow(old);
  }
  const now=new Date().toISOString(),owner=ownerId||ownerForDraft(draftId);
  run('INSERT INTO production_queue(draft_id,owner_id,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',draftId,owner,title,'waiting_review',now,now);
  return{draftId,ownerId:owner,title,status:'waiting_review' as const,createdAt:now,updatedAt:now};
}

export function setQueueStatus(draftId:string,status:QueueStatus,extra:Partial<QueueItem>={}){
  let old=all<QueueRow>('SELECT * FROM production_queue WHERE draft_id=? LIMIT 1',draftId)[0];
  if(!old){ensureQueueItem(draftId,extra.title||draftId,extra.ownerId);old=all<QueueRow>('SELECT * FROM production_queue WHERE draft_id=? LIMIT 1',draftId)[0];if(!old)return}
  const updatedAt=new Date().toISOString();
  run('UPDATE production_queue SET status=?,title=?,job_id=?,output=?,error=?,updated_at=? WHERE draft_id=?',status,extra.title||old.title,extra.jobId===undefined?old.job_id:extra.jobId||null,extra.output===undefined?old.output:extra.output||null,extra.error===undefined?old.error:extra.error||null,updatedAt,draftId);
  return fromRow({...old,status,title:extra.title||old.title,job_id:extra.jobId===undefined?old.job_id:extra.jobId,output:extra.output===undefined?old.output:extra.output,error:extra.error===undefined?old.error:extra.error,updated_at:updatedAt});
}

export function productionQueue(ownerId?:string){const rows=ownerId?all<QueueRow>('SELECT * FROM production_queue WHERE owner_id=? ORDER BY updated_at DESC',ownerId):all<QueueRow>('SELECT * FROM production_queue ORDER BY updated_at DESC');return rows.map(fromRow)}
export function deleteQueueItem(draftId:string){const result=run('DELETE FROM production_queue WHERE draft_id=?',draftId);return Number(result.changes||0)>0}
export function syncRenderJobs(jobs:any[]){
  for(const q of productionQueue()){
    const j=jobs.find(x=>x.draftId===q.draftId&&(!x.ownerId||x.ownerId===q.ownerId));if(!j)continue;const raw=String(j.status||'');
    if(raw==='queued'||raw==='running'||raw==='rendering')setQueueStatus(q.draftId,'rendering',{jobId:j.id,error:undefined});
    else if(raw==='ready'||raw==='completed'||raw==='done')setQueueStatus(q.draftId,'completed',{jobId:j.id,output:j.output||j.outputFile,error:undefined});
    else if(raw==='failed'||raw==='error')setQueueStatus(q.draftId,'failed',{jobId:j.id,error:j.error});
  }
}
