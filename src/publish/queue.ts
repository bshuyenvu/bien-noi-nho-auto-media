import { all, run } from '../storage/db.js';

export type PublishPlatform='youtube'|'facebook'|'tiktok';
export type PublishStatus='pending'|'scheduled'|'publishing'|'published'|'failed'|'cancelled';

export interface PublishJob{
  id:string; ownerId:string; renderJobId:string; draftId:string; platform:PublishPlatform; status:PublishStatus;
  title:string; description?:string; scheduledAt?:string; publishedAt?:string; remoteId?:string; remoteUrl?:string;
  error?:string; attempts:number; maxAttempts:number; dryRun:boolean; deploymentTest:boolean; createdAt:string; updatedAt:string;
}

type Row={id:string;owner_id:string;render_job_id:string;draft_id:string;platform:PublishPlatform;status:PublishStatus;title:string;description?:string;scheduled_at?:string;published_at?:string;remote_id?:string;remote_url?:string;error?:string;attempts:number;max_attempts:number;dry_run:number;deployment_test?:number;created_at:string;updated_at:string};

function fromRow(r:Row):PublishJob{return{id:r.id,ownerId:r.owner_id,renderJobId:r.render_job_id,draftId:r.draft_id,platform:r.platform,status:r.status,title:r.title,description:r.description||undefined,scheduledAt:r.scheduled_at||undefined,publishedAt:r.published_at||undefined,remoteId:r.remote_id||undefined,remoteUrl:r.remote_url||undefined,error:r.error||undefined,attempts:Number(r.attempts||0),maxAttempts:Number(r.max_attempts||3),dryRun:Boolean(r.dry_run),deploymentTest:Boolean(r.deployment_test),createdAt:r.created_at,updatedAt:r.updated_at}}

export function listPublishJobs(ownerId:string){return all<Row>('SELECT * FROM publish_jobs WHERE owner_id=? ORDER BY created_at DESC LIMIT 200',ownerId).map(fromRow)}
export function getPublishJob(id:string,ownerId:string){const row=all<Row>('SELECT * FROM publish_jobs WHERE id=? AND owner_id=? LIMIT 1',id,ownerId)[0];return row?fromRow(row):undefined}

export function enqueuePublish(input:{ownerId:string;renderJobId:string;draftId:string;platform:PublishPlatform;title:string;description?:string;scheduledAt?:string;dryRun?:boolean;maxAttempts?:number;deploymentTest?:boolean}){
  const duplicate=all<Row>("SELECT * FROM publish_jobs WHERE owner_id=? AND render_job_id=? AND platform=? AND status IN ('pending','scheduled','publishing') LIMIT 1",input.ownerId,input.renderJobId,input.platform)[0];
  if(duplicate)throw new Error('Video đã có tác vụ xuất bản đang hoạt động trên nền tảng này');
  const now=new Date().toISOString();
  const status:PublishStatus=input.scheduledAt&&new Date(input.scheduledAt).getTime()>Date.now()?'scheduled':'pending';
  const job:PublishJob={id:crypto.randomUUID(),ownerId:input.ownerId,renderJobId:input.renderJobId,draftId:input.draftId,platform:input.platform,status,title:input.title.trim(),description:input.description?.trim()||undefined,scheduledAt:input.scheduledAt,dryRun:input.dryRun!==false,deploymentTest:Boolean(input.deploymentTest),attempts:0,maxAttempts:Math.max(1,input.maxAttempts||3),createdAt:now,updatedAt:now};
  run('INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,description,scheduled_at,attempts,max_attempts,dry_run,deployment_test,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',job.id,job.ownerId,job.renderJobId,job.draftId,job.platform,job.status,job.title,job.description||null,job.scheduledAt||null,job.attempts,job.maxAttempts,job.dryRun?1:0,job.deploymentTest?1:0,job.createdAt,job.updatedAt);
  return job;
}

export function cancelPublishJob(id:string,ownerId:string){const job=getPublishJob(id,ownerId);if(!job)return undefined;if(job.status==='publishing'||job.status==='published')throw new Error('Cannot cancel a publishing or published job');const updatedAt=new Date().toISOString();run('UPDATE publish_jobs SET status=?,updated_at=? WHERE id=? AND owner_id=?','cancelled',updatedAt,id,ownerId);return{...job,status:'cancelled' as const,updatedAt}}
export function retryPublishJob(id:string,ownerId:string){const job=getPublishJob(id,ownerId);if(!job)return undefined;if(job.status!=='failed')throw new Error('Only failed publish jobs can be retried');if(job.attempts>=job.maxAttempts)throw new Error('Publish retry limit reached');const updatedAt=new Date().toISOString();run('UPDATE publish_jobs SET status=?,error=NULL,updated_at=? WHERE id=? AND owner_id=?','pending',updatedAt,id,ownerId);return{...job,status:'pending' as const,error:undefined,updatedAt}}
export function publishQueueStats(ownerId:string){const jobs=listPublishJobs(ownerId);return{total:jobs.length,pending:jobs.filter(x=>x.status==='pending'||x.status==='scheduled').length,publishing:jobs.filter(x=>x.status==='publishing').length,published:jobs.filter(x=>x.status==='published').length,failed:jobs.filter(x=>x.status==='failed').length,dryRun:jobs.filter(x=>x.dryRun&&x.status!=='published'&&x.status!=='cancelled').length,deploymentTests:jobs.filter(x=>x.deploymentTest).length}}
