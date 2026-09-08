import { all, run } from '../storage/db.js';
import { envYouTubePrivacy,productionPublishGuard,type ActivationPrivacy } from './activation-state.js';
import { assertContentSafety,evaluateContentSafety,recordContentFingerprint,type ContentSafetySnapshot } from './content-safety.js';
import { assertPublicRampAllowed } from './public-ramp.js';

export type PublishPlatform='youtube'|'facebook'|'tiktok';
export type PublishStatus='pending'|'scheduled'|'publishing'|'needs_reconcile'|'published'|'failed'|'cancelled';
export type ReconcileResolution='retry'|'cancel'|'published'|'failed';

export interface PublishJob{
  id:string; ownerId:string; renderJobId:string; draftId:string; platform:PublishPlatform; status:PublishStatus;
  title:string; description?:string; scheduledAt?:string; publishedAt?:string; remoteId?:string; remoteUrl?:string;
  error?:string; attempts:number; maxAttempts:number; dryRun:boolean; deploymentTest:boolean; publicCanary?:boolean; publishPrivacy?:ActivationPrivacy; createdAt:string; updatedAt:string;
  reconcileReason?:string; reconcileAt?:string; reconciledAt?:string; reconciledBy?:string; reconcileNote?:string;
}

type Row={id:string;owner_id:string;render_job_id:string;draft_id:string;platform:PublishPlatform;status:PublishStatus;title:string;description?:string;scheduled_at?:string;published_at?:string;remote_id?:string;remote_url?:string;error?:string;attempts:number;max_attempts:number;dry_run:number;deployment_test?:number;public_canary?:number;publish_privacy?:ActivationPrivacy;created_at:string;updated_at:string;reconcile_reason?:string;reconcile_at?:string;reconciled_at?:string;reconciled_by?:string;reconcile_note?:string};

for(const sql of[
  'ALTER TABLE publish_jobs ADD COLUMN reconcile_reason TEXT',
  'ALTER TABLE publish_jobs ADD COLUMN reconcile_at TEXT',
  'ALTER TABLE publish_jobs ADD COLUMN reconciled_at TEXT',
  'ALTER TABLE publish_jobs ADD COLUMN reconciled_by TEXT',
  'ALTER TABLE publish_jobs ADD COLUMN reconcile_note TEXT',
  'ALTER TABLE publish_jobs ADD COLUMN public_canary INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE publish_jobs ADD COLUMN publish_privacy TEXT'
]){try{run(sql)}catch{}}
try{run('CREATE INDEX IF NOT EXISTS idx_publish_jobs_reconcile ON publish_jobs(status,reconcile_at)')}catch{}
try{run('CREATE INDEX IF NOT EXISTS idx_publish_jobs_public_canary ON publish_jobs(owner_id,public_canary,status)')}catch{}
try{run('CREATE INDEX IF NOT EXISTS idx_publish_jobs_privacy ON publish_jobs(owner_id,platform,publish_privacy,status,published_at,scheduled_at)')}catch{}

function fromRow(r:Row):PublishJob{return{id:r.id,ownerId:r.owner_id,renderJobId:r.render_job_id,draftId:r.draft_id,platform:r.platform,status:r.status,title:r.title,description:r.description||undefined,scheduledAt:r.scheduled_at||undefined,publishedAt:r.published_at||undefined,remoteId:r.remote_id||undefined,remoteUrl:r.remote_url||undefined,error:r.error||undefined,attempts:Number(r.attempts||0),maxAttempts:Number(r.max_attempts||3),dryRun:Boolean(r.dry_run),deploymentTest:Boolean(r.deployment_test),publicCanary:Boolean(r.public_canary),publishPrivacy:r.publish_privacy||undefined,createdAt:r.created_at,updatedAt:r.updated_at,reconcileReason:r.reconcile_reason||undefined,reconcileAt:r.reconcile_at||undefined,reconciledAt:r.reconciled_at||undefined,reconciledBy:r.reconciled_by||undefined,reconcileNote:r.reconcile_note||undefined}}

export function listPublishJobs(ownerId:string){return all<Row>('SELECT * FROM publish_jobs WHERE owner_id=? ORDER BY created_at DESC LIMIT 200',ownerId).map(fromRow)}
export function getPublishJob(id:string,ownerId:string){const row=all<Row>('SELECT * FROM publish_jobs WHERE id=? AND owner_id=? LIMIT 1',id,ownerId)[0];return row?fromRow(row):undefined}

export function enqueuePublish(input:{ownerId:string;renderJobId:string;draftId:string;platform:PublishPlatform;title:string;description?:string;scheduledAt?:string;dryRun?:boolean;maxAttempts?:number;deploymentTest?:boolean;publicCanary?:boolean}){
  const dryRun=input.dryRun!==false,deploymentTest=Boolean(input.deploymentTest),publicCanary=Boolean(input.publicCanary),publishPrivacy:ActivationPrivacy|undefined=!dryRun&&input.platform==='youtube'?envYouTubePrivacy():undefined;
  if(publicCanary&&(dryRun||input.platform!=='youtube'||deploymentTest))throw new Error('publicCanary chỉ hợp lệ cho YouTube LIVE production job');
  const duplicate=all<Row>("SELECT * FROM publish_jobs WHERE owner_id=? AND render_job_id=? AND platform=? AND status IN ('pending','scheduled','publishing','needs_reconcile') LIMIT 1",input.ownerId,input.renderJobId,input.platform)[0];
  if(duplicate)throw new Error(duplicate.status==='needs_reconcile'?'Video đang có publish job cần Reconcile trước khi tạo job mới':'Video đã có tác vụ xuất bản đang hoạt động trên nền tảng này');
  let contentSafety:ContentSafetySnapshot|undefined;
  if(!dryRun&&input.platform==='youtube'){
    const guard=productionPublishGuard(input.ownerId,{deploymentTest,publicCanary,privacy:publishPrivacy});
    if(!guard.allowed)throw new Error(`Production Activation chặn publish: ${guard.reason}`);
    if(publishPrivacy==='public'){
      if(publicCanary)contentSafety=evaluateContentSafety({ownerId:input.ownerId,draftId:input.draftId,renderJobId:input.renderJobId,publishTitle:input.title});
      else{
        contentSafety=assertContentSafety({ownerId:input.ownerId,draftId:input.draftId,renderJobId:input.renderJobId,publishTitle:input.title});
        assertPublicRampAllowed(input.ownerId,{targetAt:input.scheduledAt});
      }
    }
  }
  const now=new Date().toISOString();
  const status:PublishStatus=input.scheduledAt&&new Date(input.scheduledAt).getTime()>Date.now()?'scheduled':'pending';
  const job:PublishJob={id:crypto.randomUUID(),ownerId:input.ownerId,renderJobId:input.renderJobId,draftId:input.draftId,platform:input.platform,status,title:input.title.trim(),description:input.description?.trim()||undefined,scheduledAt:input.scheduledAt,dryRun,deploymentTest,publicCanary,publishPrivacy,attempts:0,maxAttempts:Math.max(1,input.maxAttempts||3),createdAt:now,updatedAt:now};
  run('INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,description,scheduled_at,attempts,max_attempts,dry_run,deployment_test,public_canary,publish_privacy,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',job.id,job.ownerId,job.renderJobId,job.draftId,job.platform,job.status,job.title,job.description||null,job.scheduledAt||null,job.attempts,job.maxAttempts,job.dryRun?1:0,job.deploymentTest?1:0,job.publicCanary?1:0,job.publishPrivacy||null,job.createdAt,job.updatedAt);
  if(contentSafety)recordContentFingerprint(job.id,contentSafety);
  return job;
}

export function markPublishingJobsForReconcile(reason='server_restart_during_publish'){
  const rows=all<Row>("SELECT * FROM publish_jobs WHERE status='publishing' ORDER BY updated_at ASC");if(!rows.length)return[];
  const now=new Date().toISOString(),message='Publish bị gián đoạn khi tiến trình dừng. Hãy kiểm tra nền tảng từ xa trước khi Retry để tránh đăng trùng.';
  for(const row of rows)run("UPDATE publish_jobs SET status='needs_reconcile',error=?,reconcile_reason=?,reconcile_at=?,reconciled_at=NULL,reconciled_by=NULL,reconcile_note=NULL,updated_at=? WHERE id=? AND status='publishing'",message,reason,now,now,row.id);
  return rows.map(row=>fromRow({...row,status:'needs_reconcile',error:message,reconcile_reason:reason,reconcile_at:now,updated_at:now}));
}

export function reconcilePublishJob(id:string,ownerId:string,resolution:ReconcileResolution,input:{actor?:string;note?:string;remoteId?:string;remoteUrl?:string}={}){
  const job=getPublishJob(id,ownerId);if(!job)return undefined;if(job.status!=='needs_reconcile')throw new Error('Chỉ publish job ở trạng thái needs_reconcile mới có thể Reconcile');
  const now=new Date().toISOString(),actor=String(input.actor||ownerId).slice(0,200),note=input.note?.trim().slice(0,700)||undefined;
  if(resolution==='retry'){
    if(job.attempts>=job.maxAttempts)throw new Error('Publish retry limit reached');
    run("UPDATE publish_jobs SET status='pending',error=NULL,started_at=NULL,completed_at=NULL,reconciled_at=?,reconciled_by=?,reconcile_note=?,updated_at=? WHERE id=? AND owner_id=?",now,actor,note||'Operator confirmed remote publish did not complete; retry approved',now,id,ownerId);
  }else if(resolution==='cancel'){
    run("UPDATE publish_jobs SET status='cancelled',reconciled_at=?,reconciled_by=?,reconcile_note=?,updated_at=? WHERE id=? AND owner_id=?",now,actor,note||'Operator cancelled after reconciliation',now,id,ownerId);
  }else if(resolution==='published'){
    const remoteId=input.remoteId?.trim()||job.remoteId;if(!remoteId)throw new Error('Mark Published cần remoteId sau khi xác minh video đã tồn tại trên nền tảng');
    const remoteUrl=input.remoteUrl?.trim()||job.remoteUrl;
    run("UPDATE publish_jobs SET status='published',published_at=COALESCE(published_at,?),remote_id=?,remote_url=?,error=NULL,reconciled_at=?,reconciled_by=?,reconcile_note=?,updated_at=? WHERE id=? AND owner_id=?",now,remoteId,remoteUrl||null,now,actor,note||'Operator verified remote publish completed',now,id,ownerId);
  }else{
    run("UPDATE publish_jobs SET status='failed',error=?,reconciled_at=?,reconciled_by=?,reconcile_note=?,updated_at=? WHERE id=? AND owner_id=?",note||'Operator marked interrupted publish as failed after reconciliation',now,actor,note||'Marked failed after remote verification',now,id,ownerId);
  }
  return getPublishJob(id,ownerId);
}

export function cancelPublishJob(id:string,ownerId:string){const job=getPublishJob(id,ownerId);if(!job)return undefined;if(job.status==='publishing'||job.status==='published'||job.status==='needs_reconcile')throw new Error(job.status==='needs_reconcile'?'Job cần Reconcile trước khi Cancel':'Cannot cancel a publishing or published job');const updatedAt=new Date().toISOString();run('UPDATE publish_jobs SET status=?,updated_at=? WHERE id=? AND owner_id=?','cancelled',updatedAt,id,ownerId);return{...job,status:'cancelled' as const,updatedAt}}
export function retryPublishJob(id:string,ownerId:string){const job=getPublishJob(id,ownerId);if(!job)return undefined;if(job.status!=='failed')throw new Error(job.status==='needs_reconcile'?'Job needs_reconcile phải được xác minh remote trước khi Retry':'Only failed publish jobs can be retried');if(job.attempts>=job.maxAttempts)throw new Error('Publish retry limit reached');const updatedAt=new Date().toISOString();run("UPDATE publish_jobs SET status='pending',error=NULL,started_at=NULL,completed_at=NULL,updated_at=? WHERE id=? AND owner_id=?",updatedAt,id,ownerId);return{...job,status:'pending' as const,error:undefined,updatedAt}}
export function publishQueueStats(ownerId:string){const jobs=listPublishJobs(ownerId);return{total:jobs.length,pending:jobs.filter(x=>x.status==='pending'||x.status==='scheduled').length,publishing:jobs.filter(x=>x.status==='publishing').length,needsReconcile:jobs.filter(x=>x.status==='needs_reconcile').length,published:jobs.filter(x=>x.status==='published').length,failed:jobs.filter(x=>x.status==='failed').length,dryRun:jobs.filter(x=>x.dryRun&&x.status!=='published'&&x.status!=='cancelled').length,deploymentTests:jobs.filter(x=>x.deploymentTest).length,publicCanaries:jobs.filter(x=>x.publicCanary).length}}
