import { all,run } from '../storage/db.js';
import { publisherFor } from './providers.js';
import { getCredential,saveCredential } from './vault.js';
import type { PublishJob,PublishPlatform,PublishStatus } from './queue.js';
import { getYouTubeUploadSession } from './upload-session.js';
import { YouTubeUploadNeedsReconcileError } from './youtube-resumable.js';
import { productionPublishGuard } from './activation-state.js';

type Row={id:string;owner_id:string;render_job_id:string;draft_id:string;platform:PublishPlatform;status:PublishStatus;title:string;description?:string;scheduled_at?:string;published_at?:string;remote_id?:string;remote_url?:string;error?:string;attempts:number;max_attempts:number;dry_run:number;deployment_test?:number;public_canary?:number;created_at:string;updated_at:string};
type RenderRow={id:string;output?:string};
function fromRow(r:Row):PublishJob{return{id:r.id,ownerId:r.owner_id,renderJobId:r.render_job_id,draftId:r.draft_id,platform:r.platform,status:r.status,title:r.title,description:r.description||undefined,scheduledAt:r.scheduled_at||undefined,publishedAt:r.published_at||undefined,remoteId:r.remote_id||undefined,remoteUrl:r.remote_url||undefined,error:r.error||undefined,attempts:Number(r.attempts||0),maxAttempts:Number(r.max_attempts||3),dryRun:Boolean(r.dry_run),deploymentTest:Boolean(r.deployment_test),publicCanary:Boolean(r.public_canary),createdAt:r.created_at,updatedAt:r.updated_at}}

let running=false,timer:NodeJS.Timeout|undefined,lastRunAt:string|undefined,lastError:string|undefined,lastErrorAt:string|undefined,lastSuccessAt:string|undefined,processed=0,recoveredForReconcile=0,recoveredResumable=0,recoveryChecked=false;
const intervalMs=Math.max(5000,Number(process.env.PUBLISH_WORKER_INTERVAL_MS||15000));

function dueJobs(){const now=new Date().toISOString();return all<Row>("SELECT * FROM publish_jobs WHERE status='pending' OR (status='scheduled' AND scheduled_at<=?) ORDER BY created_at LIMIT 10",now).map(fromRow)}
function quarantineInterrupted(row:Row,reason='server_restart_during_publish'){
  const now=new Date().toISOString(),message='Publish bị gián đoạn khi tiến trình dừng và không có resumable session an toàn. Hãy kiểm tra nền tảng từ xa trước khi Retry để tránh đăng trùng.';
  run("UPDATE publish_jobs SET status='needs_reconcile',error=?,reconcile_reason=?,reconcile_at=?,reconciled_at=NULL,reconciled_by=NULL,reconcile_note=NULL,updated_at=? WHERE id=? AND status='publishing'",message,reason,now,now,row.id);
}
export function recoverInterruptedPublishing(){
  if(recoveryChecked)return{resumable:0,reconcile:0};recoveryChecked=true;
  const rows=all<Row>("SELECT * FROM publish_jobs WHERE status='publishing' ORDER BY updated_at ASC");let resumable=0,reconcile=0;
  for(const row of rows){
    if(Boolean(row.dry_run)){const now=new Date().toISOString();run("UPDATE publish_jobs SET status='pending',error='Recovered dry-run after server restart',updated_at=? WHERE id=? AND status='publishing'",now,row.id);resumable++;continue}
    const session=row.platform==='youtube'?getYouTubeUploadSession(row.id,row.owner_id):undefined;
    if(row.platform==='youtube'&&session&&(session.state==='active'||session.state==='completed')){
      const now=new Date().toISOString();run("UPDATE publish_jobs SET status='pending',error='Recovered persisted YouTube resumable session; remote status will be checked before continuing',updated_at=? WHERE id=? AND status='publishing'",now,row.id);resumable++;continue;
    }
    quarantineInterrupted(row);reconcile++;
  }
  recoveredResumable+=resumable;recoveredForReconcile+=reconcile;
  if(resumable)console.info(`[publish-recovery] ${resumable} interrupted job(s) recovered from durable resumable state`);
  if(reconcile)console.warn(`[publish-recovery] ${reconcile} interrupted publishing job(s) moved to needs_reconcile; automatic retry blocked`);
  return{resumable,reconcile};
}

export async function processPublishJob(job:PublishJob){
  const render=all<RenderRow>('SELECT id,output FROM render_jobs WHERE id=? AND owner_id=? LIMIT 1',job.renderJobId,job.ownerId)[0];
  if(!render?.output)throw new Error('Không tìm thấy file video render để xuất bản');
  if(!job.dryRun&&process.env.PUBLISH_LIVE_ENABLED!=='true')throw new Error('Live publishing đang bị khóa bởi PUBLISH_LIVE_ENABLED');
  if(!job.dryRun&&job.platform==='youtube'){
    const activation=productionPublishGuard(job.ownerId,{deploymentTest:job.deploymentTest,publicCanary:job.publicCanary});
    if(!activation.allowed)throw new Error(`Production Activation chặn publish: ${activation.reason}`);
  }
  const credential=job.dryRun?undefined:getCredential(job.ownerId,job.platform),provider=publisherFor(job.platform);
  const startedAt=new Date().toISOString();
  run("UPDATE publish_jobs SET status='publishing',attempts=attempts+1,error=NULL,updated_at=? WHERE id=? AND status IN ('pending','scheduled')",startedAt,job.id);
  try{
    const activeJob={...job,status:'publishing' as const,attempts:job.attempts+1};
    const result=await provider.publish({job:activeJob,videoPath:render.output,credential});
    const completedAt=new Date().toISOString();
    run("UPDATE publish_jobs SET status='published',published_at=?,remote_id=?,remote_url=?,error=NULL,updated_at=? WHERE id=?",result.publishedAt,result.remoteId,result.remoteUrl||null,completedAt,job.id);
    if(job.platform==='youtube'&&job.deploymentTest&&!job.dryRun&&credential){
      saveCredential(job.ownerId,'youtube',credential.accountLabel,{...credential.secret,privateTestPassedAt:completedAt,privateTestVideoId:result.remoteId,privateTestJobId:job.id});
    }
    processed++;lastSuccessAt=completedAt;lastError=undefined;lastErrorAt=undefined;return result;
  }catch(e){
    const message=e instanceof Error?e.message:String(e),now=new Date().toISOString();
    if(e instanceof YouTubeUploadNeedsReconcileError||Boolean((e as any)?.needsReconcile)){
      run("UPDATE publish_jobs SET status='needs_reconcile',error=?,reconcile_reason='youtube_upload_uncertain',reconcile_at=?,reconciled_at=NULL,reconciled_by=NULL,reconcile_note=NULL,updated_at=? WHERE id=?",message,now,now,job.id);
    }else{
      run("UPDATE publish_jobs SET status='failed',error=?,updated_at=? WHERE id=?",message,now,job.id);
    }
    lastError=message;lastErrorAt=now;throw e;
  }
}

export async function runPublishWorkerOnce(){
  recoverInterruptedPublishing();
  if(running)return{ok:false,busy:true,processed:0};running=true;lastRunAt=new Date().toISOString();let count=0;
  try{for(const job of dueJobs()){try{await processPublishJob(job);count++}catch{}}return{ok:true,busy:false,processed:count}}finally{running=false}
}
export function startPublishWorker(){if(timer)return;recoverInterruptedPublishing();timer=setInterval(()=>void runPublishWorkerOnce(),intervalMs);timer.unref();void runPublishWorkerOnce()}
export function publishWorkerStatus(){return{running,started:Boolean(timer),intervalMs,lastRunAt,lastError,lastErrorAt,lastSuccessAt,processed,recoveredResumable,recoveredForReconcile,recoveryChecked,liveEnabled:process.env.PUBLISH_LIVE_ENABLED==='true'}}
