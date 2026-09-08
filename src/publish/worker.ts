import { all,run } from '../storage/db.js';
import { publisherFor } from './providers.js';
import { getCredential } from './vault.js';
import type { PublishJob,PublishPlatform,PublishStatus } from './queue.js';

type Row={id:string;owner_id:string;render_job_id:string;draft_id:string;platform:PublishPlatform;status:PublishStatus;title:string;description?:string;scheduled_at?:string;published_at?:string;remote_id?:string;remote_url?:string;error?:string;attempts:number;max_attempts:number;dry_run:number;created_at:string;updated_at:string};
type RenderRow={id:string;output?:string};
function fromRow(r:Row):PublishJob{return{id:r.id,ownerId:r.owner_id,renderJobId:r.render_job_id,draftId:r.draft_id,platform:r.platform,status:r.status,title:r.title,description:r.description||undefined,scheduledAt:r.scheduled_at||undefined,publishedAt:r.published_at||undefined,remoteId:r.remote_id||undefined,remoteUrl:r.remote_url||undefined,error:r.error||undefined,attempts:Number(r.attempts||0),maxAttempts:Number(r.max_attempts||3),dryRun:Boolean(r.dry_run),createdAt:r.created_at,updatedAt:r.updated_at}}

let running=false,timer:NodeJS.Timeout|undefined,lastRunAt:string|undefined,lastError:string|undefined,processed=0;
const intervalMs=Math.max(5000,Number(process.env.PUBLISH_WORKER_INTERVAL_MS||15000));

function dueJobs(){const now=new Date().toISOString();return all<Row>("SELECT * FROM publish_jobs WHERE status='pending' OR (status='scheduled' AND scheduled_at<=?) ORDER BY created_at LIMIT 10",now).map(fromRow)}

export async function processPublishJob(job:PublishJob){
  const render=all<RenderRow>('SELECT id,output FROM render_jobs WHERE id=? AND owner_id=? LIMIT 1',job.renderJobId,job.ownerId)[0];
  if(!render?.output)throw new Error('Không tìm thấy file video render để xuất bản');
  if(!job.dryRun&&process.env.PUBLISH_LIVE_ENABLED!=='true')throw new Error('Live publishing đang bị khóa bởi PUBLISH_LIVE_ENABLED');
  const credential=job.dryRun?undefined:getCredential(job.ownerId,job.platform),provider=publisherFor(job.platform);
  const startedAt=new Date().toISOString();
  run("UPDATE publish_jobs SET status='publishing',attempts=attempts+1,error=NULL,updated_at=? WHERE id=?",startedAt,job.id);
  try{
    const result=await provider.publish({job:{...job,status:'publishing',attempts:job.attempts+1},videoPath:render.output,credential});
    run("UPDATE publish_jobs SET status='published',published_at=?,remote_id=?,remote_url=?,error=NULL,updated_at=? WHERE id=?",result.publishedAt,result.remoteId,result.remoteUrl||null,new Date().toISOString(),job.id);
    processed++;return result;
  }catch(e){
    const message=e instanceof Error?e.message:String(e),attempts=job.attempts+1,final=attempts>=job.maxAttempts;
    run("UPDATE publish_jobs SET status=?,error=?,updated_at=? WHERE id=?",'failed',message,new Date().toISOString(),job.id);
    lastError=message;
    if(!final){} // retries are explicit through the existing retry endpoint
    throw e;
  }
}

export async function runPublishWorkerOnce(){
  if(running)return{ok:false,busy:true,processed:0};running=true;lastRunAt=new Date().toISOString();let count=0;
  try{for(const job of dueJobs()){try{await processPublishJob(job);count++}catch{}}return{ok:true,busy:false,processed:count}}finally{running=false}
}
export function startPublishWorker(){if(timer)return;timer=setInterval(()=>void runPublishWorkerOnce(),intervalMs);timer.unref();void runPublishWorkerOnce()}
export function publishWorkerStatus(){return{running,started:Boolean(timer),intervalMs,lastRunAt,lastError,processed,liveEnabled:process.env.PUBLISH_LIVE_ENABLED==='true'}}
