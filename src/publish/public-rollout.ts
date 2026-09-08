import { all } from '../storage/db.js';
import { releaseCandidateSnapshot } from '../system/release-readiness.js';
import { getCredential } from './vault.js';
import { getPublishJob } from './queue.js';
import { verifyYouTubePublicCanary } from './youtube-canary.js';
import { engageProductionKillSwitch,envYouTubePrivacy,productionActivationState,productionKillSwitch,updateProductionActivation } from './activation-state.js';

type RuntimeRow={state_key:string;value_json:string};
let timer:NodeJS.Timeout|undefined,running=false,lastRunAt:string|undefined,lastError:string|undefined;
function watchMinutes(){const n=Number(process.env.PUBLIC_ROLLOUT_WATCH_MINUTES||15);return Math.max(1,Math.min(240,Number.isFinite(n)?n:15))}
function pollMs(){const n=Number(process.env.PUBLIC_ROLLOUT_WATCH_POLL_MS||30000);return Math.max(5000,Math.min(300000,Number.isFinite(n)?n:30000))}
function fail(ownerId:string,reason:string,actor='system:public-rollout-watch'){
  const now=new Date().toISOString();engageProductionKillSwitch(actor,`Public rollout failed: ${reason}`);updateProductionActivation(ownerId,{publicRolloutStatus:'failed',publicRolloutFailureReason:reason.slice(0,500),publicRolloutCompletedAt:undefined},actor);return{ok:false,status:'failed',reason,at:now};
}
export async function publicRolloutSnapshot(ownerId:string){
  const state=productionActivationState(ownerId),killSwitch=productionKillSwitch(),privacy=envYouTubePrivacy(),release=await releaseCandidateSnapshot(ownerId),job=state.publicCanaryJobId?getPublishJob(state.publicCanaryJobId,ownerId):undefined;
  const reconcileClear=release.queues.needsReconcile===0&&release.queues.uncertainSessions===0,releaseGo=Boolean(release.candidateReady),monitorOk=release.monitor.overall!=='red';
  const status=state.publicRolloutStatus||'idle';
  const canQueue=Boolean(state.armed&&state.status==='armed'&&state.maxPrivacy==='public'&&state.publicApprovedAt&&privacy==='public'&&!killSwitch.engaged&&releaseGo&&reconcileClear&&monitorOk&&status==='idle');
  const canVerify=Boolean(status==='canary_queued'&&job?.publicCanary&&job.status==='published'&&job.remoteId&&!killSwitch.engaged&&releaseGo&&reconcileClear&&monitorOk&&privacy==='public');
  const watching=status==='watching',completed=status==='completed';
  return{state,killSwitch,privacy,release:{verdict:release.verdict,candidateReady:release.candidateReady,queues:release.queues,monitor:release.monitor},job,canQueue,canVerify,watching,completed,watchMinutes:watchMinutes(),pollMs:pollMs(),normalPublicOpen:completed&&!killSwitch.engaged,checkedAt:new Date().toISOString()};
}
export async function markPublicCanaryQueued(ownerId:string,actor:string,jobId:string){
  const state=productionActivationState(ownerId);if(!state.publicApprovedAt||state.maxPrivacy!=='public')throw new Error('PUBLIC chưa được operator phê duyệt');
  updateProductionActivation(ownerId,{publicRolloutStatus:'canary_queued',publicCanaryJobId:jobId,publicCanaryVideoId:undefined,publicCanaryVerifiedAt:undefined,publicCanaryChannelId:undefined,publicCanaryTitle:undefined,publicWatchStartedAt:undefined,publicWatchEndsAt:undefined,publicRolloutCompletedAt:undefined,publicRolloutFailureReason:undefined},actor);
  return publicRolloutSnapshot(ownerId);
}
export async function verifyPublicCanaryAndStartWatch(ownerId:string,actor:string){
  const snapshot=await publicRolloutSnapshot(ownerId);if(!snapshot.canVerify)throw new Error('Chưa thể VERIFY PUBLIC CANARY: cần job Public Canary published, Release GO, Monitor không RED, Reconcile clear, Kill Switch OFF và runtime privacy=public');
  const job=snapshot.job!,remoteId=String(job.remoteId||''),verification=await verifyYouTubePublicCanary(getCredential(ownerId,'youtube'),remoteId);
  if(!verification.readyForPromotion){const reason=(verification.reasons.length?verification.reasons:[verification.error||'Remote Public Canary verification failed']).join(' | ');fail(ownerId,reason,actor);throw new Error(`Public Canary remote verification thất bại; Kill Switch đã bật: ${reason}`)}
  const start=new Date(),end=new Date(start.getTime()+watchMinutes()*60000);
  updateProductionActivation(ownerId,{publicRolloutStatus:'watching',publicCanaryVideoId:verification.videoId,publicCanaryVerifiedAt:verification.checkedAt,publicCanaryChannelId:verification.channelId,publicCanaryTitle:verification.title,publicWatchStartedAt:start.toISOString(),publicWatchEndsAt:end.toISOString(),publicRolloutFailureReason:undefined},actor);
  return{...(await publicRolloutSnapshot(ownerId)),remoteVerification:verification};
}
export async function evaluatePublicRollout(ownerId:string,actor='system:public-rollout-watch'){
  const state=productionActivationState(ownerId);if(state.publicRolloutStatus!=='watching')return{ok:true,status:state.publicRolloutStatus||'idle',skipped:true};
  const kill=productionKillSwitch();if(kill.engaged)return fail(ownerId,`Kill Switch engaged${kill.reason?`: ${kill.reason}`:''}`,actor);
  const release=await releaseCandidateSnapshot(ownerId);
  if(!release.candidateReady)return fail(ownerId,`Release Gate NO-GO: ${release.blockers.join(' | ')}`,actor);
  if(release.monitor.overall==='red')return fail(ownerId,'Production Monitor RED during Public rollout watch',actor);
  if(release.queues.needsReconcile||release.queues.uncertainSessions)return fail(ownerId,`Reconcile appeared during watch: ${release.queues.needsReconcile} job / ${release.queues.uncertainSessions} session`,actor);
  const job=state.publicCanaryJobId?getPublishJob(state.publicCanaryJobId,ownerId):undefined;
  if(!job||!job.publicCanary||job.status!=='published'||!job.remoteId)return fail(ownerId,`Public Canary job is no longer safely published (${job?.status||'missing'})`,actor);
  const end=Date.parse(String(state.publicWatchEndsAt||''));if(!Number.isFinite(end))return fail(ownerId,'Public rollout watch deadline is invalid',actor);
  if(Date.now()<end)return{ok:true,status:'watching',watchEndsAt:state.publicWatchEndsAt};
  const verification=await verifyYouTubePublicCanary(getCredential(ownerId,'youtube'),String(job.remoteId));
  if(!verification.readyForPromotion){const reason=(verification.reasons.length?verification.reasons:[verification.error||'Final Public Canary verification failed']).join(' | ');return fail(ownerId,reason,actor)}
  const now=new Date().toISOString();updateProductionActivation(ownerId,{publicRolloutStatus:'completed',publicRolloutCompletedAt:now,publicRolloutFailureReason:undefined,publicCanaryVideoId:verification.videoId,publicCanaryVerifiedAt:verification.checkedAt,publicCanaryChannelId:verification.channelId,publicCanaryTitle:verification.title},actor);
  console.info(`[public-rollout] ${ownerId} completed after healthy watch window; normal PUBLIC publishing is now open`);
  return{ok:true,status:'completed',completedAt:now,verification};
}
export async function resetPublicRollout(ownerId:string,actor:string){
  const state=productionActivationState(ownerId);if(state.publicRolloutStatus!=='failed')throw new Error('Chỉ reset Public Rollout sau trạng thái FAILED');if(productionKillSwitch().engaged)throw new Error('Phải điều tra và clear Kill Switch thủ công trước khi reset Public Rollout');
  const release=await releaseCandidateSnapshot(ownerId);if(!release.candidateReady)throw new Error(`Release Gate chưa GO: ${release.blockers.join(' | ')}`);
  updateProductionActivation(ownerId,{publicRolloutStatus:'idle',publicCanaryJobId:undefined,publicCanaryVideoId:undefined,publicCanaryVerifiedAt:undefined,publicCanaryChannelId:undefined,publicCanaryTitle:undefined,publicWatchStartedAt:undefined,publicWatchEndsAt:undefined,publicRolloutCompletedAt:undefined,publicRolloutFailureReason:undefined},actor);
  return publicRolloutSnapshot(ownerId);
}
async function tick(){if(running)return;running=true;lastRunAt=new Date().toISOString();try{const rows=all<RuntimeRow>("SELECT state_key,value_json FROM system_runtime_state WHERE state_key LIKE 'publish.activation:%'");for(const row of rows){try{const state=JSON.parse(row.value_json||'{}');if(state.publicRolloutStatus==='watching'&&state.ownerId)await evaluatePublicRollout(String(state.ownerId))}catch(e){lastError=e instanceof Error?e.message:String(e);console.error('[public-rollout-watch]',lastError)}}}finally{running=false}}
export function startPublicRolloutWatcher(){if(timer)return;timer=setInterval(()=>void tick(),pollMs());timer.unref();void tick()}
export function publicRolloutWatcherStatus(){return{started:Boolean(timer),running,lastRunAt,lastError,pollMs:pollMs(),watchMinutes:watchMinutes()}}
