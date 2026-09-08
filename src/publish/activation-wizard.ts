import { randomUUID } from 'node:crypto';
import { releaseCandidateSnapshot } from '../system/release-readiness.js';
import { getCredential } from './vault.js';
import { verifyYouTubeUnlistedCanary } from './youtube-canary.js';
import {
  abortProductionActivation,
  clearProductionKillSwitch,
  engageProductionKillSwitch,
  envYouTubePrivacy,
  productionActivationState,
  productionKillSwitch,
  productionPublishGuard,
  updateProductionActivation,
} from './activation-state.js';

function backupMaxAgeMs(){const h=Number(process.env.ACTIVATION_BACKUP_MAX_AGE_HOURS||24);return Math.max(1,Number.isFinite(h)?h:24)*60*60*1000}
function remoteCanaryMaxAgeMs(){const m=Number(process.env.ACTIVATION_REMOTE_CANARY_MAX_AGE_MINUTES||60);return Math.max(5,Number.isFinite(m)?m:60)*60*1000}
function fresh(iso:string|undefined,maxAge:number){if(!iso)return false;const t=Date.parse(iso);return Number.isFinite(t)&&Date.now()-t<=maxAge}
function requireConfirm(actual:unknown,expected:string){if(String(actual||'').trim()!==expected)throw new Error(`Xác nhận không hợp lệ. Cần nhập chính xác: ${expected}`)}
function clearRemoteEvidence(){return{remoteCanaryVerifiedAt:undefined,remoteCanaryVideoId:undefined,remoteCanaryChannelId:undefined,remoteCanaryTitle:undefined,remoteCanaryPrivacyStatus:undefined,remoteCanaryUploadStatus:undefined,remoteCanaryProcessingStatus:undefined}}

export async function activationWizardSnapshot(ownerId:string){
  const release=await releaseCandidateSnapshot(ownerId),state=productionActivationState(ownerId),killSwitch=productionKillSwitch(),privacy=envYouTubePrivacy();
  const backupFresh=fresh(state.backupConfirmedAt,backupMaxAgeMs()),oauthFresh=Boolean(release.deployment.credential?.liveReadyCached),privateTestPassed=Boolean(release.deployment.privateTest?.passed),reconcileClear=release.queues.needsReconcile===0&&release.queues.uncertainSessions===0;
  const liveEnvEnabled=Boolean(release.deployment.config.liveEnabled),releaseGo=Boolean(release.candidateReady),privateEnv=privacy==='private',expectedChannelId=String(release.deployment.credential?.channelId||'');
  const remoteCanaryFresh=Boolean(
    state.remoteCanaryVerifiedAt&&fresh(state.remoteCanaryVerifiedAt,remoteCanaryMaxAgeMs())&&
    state.unlistedTestVideoId&&state.remoteCanaryVideoId===state.unlistedTestVideoId&&
    expectedChannelId&&state.remoteCanaryChannelId===expectedChannelId&&
    state.remoteCanaryPrivacyStatus==='unlisted'&&state.remoteCanaryUploadStatus==='processed'&&state.remoteCanaryProcessingStatus==='succeeded'
  );
  const canArm=backupFresh&&releaseGo&&oauthFresh&&privateTestPassed&&reconcileClear&&liveEnvEnabled&&privateEnv&&!killSwitch.engaged;
  const canAuthorizeUnlisted=Boolean(state.armed&&state.status==='armed'&&state.maxPrivacy==='private'&&!killSwitch.engaged&&releaseGo);
  const canVerifyUnlisted=Boolean(state.armed&&state.unlistedAuthorizedAt&&privacy==='unlisted'&&!killSwitch.engaged);
  const canVerifyRemoteCanary=Boolean(state.armed&&state.unlistedVerifiedAt&&state.unlistedTestVideoId&&privacy==='unlisted'&&!killSwitch.engaged&&releaseGo&&reconcileClear&&oauthFresh);
  const canApprovePublic=Boolean(canVerifyRemoteCanary&&remoteCanaryFresh);
  const guard=productionPublishGuard(ownerId,{privacy});
  const steps=[
    {id:'backup',label:'Backup SQLite gần đây',ok:backupFresh,detail:backupFresh?`Đã xác nhận ${state.backupConfirmedAt}`:'Chạy backup-wyse.sh rồi xác nhận trong wizard'},
    {id:'release',label:'Release Gate GO',ok:releaseGo,detail:release.verdict},
    {id:'oauth',label:'YouTube OAuth fresh',ok:oauthFresh,detail:oauthFresh?String(release.deployment.credential?.channelTitle||release.deployment.credential?.channelId||'Verified'):'Cần TEST KẾT NỐI'},
    {id:'private-test',label:'Private Live Test',ok:privateTestPassed,detail:privateTestPassed?String(release.deployment.privateTest?.videoId||'PASS'):'Chưa PASS'},
    {id:'reconcile',label:'Không còn Needs Reconcile',ok:reconcileClear,detail:`${release.queues.needsReconcile} job • ${release.queues.uncertainSessions} session`},
    {id:'env-live',label:'PUBLISH_LIVE_ENABLED',ok:liveEnvEnabled,detail:liveEnvEnabled?'true':'false — cần đổi .env và recreate container'},
    {id:'private-env',label:'Khởi động activation ở PRIVATE',ok:privateEnv,detail:privacy.toUpperCase()},
    {id:'armed',label:'Activation ARM',ok:Boolean(state.armed),detail:state.armed?`ARMED • max ${state.maxPrivacy.toUpperCase()}`:'DISARMED'},
    {id:'unlisted',label:'Unlisted local verified',ok:Boolean(state.unlistedVerifiedAt),detail:state.unlistedVerifiedAt?`${state.unlistedVerifiedAt} • ${state.unlistedTestVideoId||'video verified'}`:'Chưa xác minh'},
    {id:'remote-canary',label:'YouTube Remote Canary verified',ok:remoteCanaryFresh,detail:remoteCanaryFresh?`${state.remoteCanaryVerifiedAt} • ${state.remoteCanaryChannelId} • processed/succeeded`:state.remoteCanaryVerifiedAt?'Evidence đã cũ hoặc không còn khớp video/channel hiện tại':'Chưa kiểm tra live videos.list'},
    {id:'public',label:'Public approved',ok:Boolean(state.publicApprovedAt),detail:state.publicApprovedAt||'Chưa phê duyệt'},
  ];
  return{release,state,killSwitch,privacy,guard,steps,canArm,canAuthorizeUnlisted,canVerifyUnlisted,canVerifyRemoteCanary,canApprovePublic,remoteCanaryFresh,backupMaxAgeHours:backupMaxAgeMs()/3600000,remoteCanaryMaxAgeMinutes:remoteCanaryMaxAgeMs()/60000,commands:{backup:'bash scripts/backup-wyse.sh',deploy:'bash scripts/deploy-wyse.sh'},checkedAt:new Date().toISOString()};
}

export async function confirmActivationBackup(ownerId:string,actor:string,note?:string){const now=new Date().toISOString();updateProductionActivation(ownerId,{backupConfirmedAt:now,backupNote:String(note||'Operator confirmed successful SQLite backup').slice(0,300)},actor);return activationWizardSnapshot(ownerId)}
export async function armProductionActivation(ownerId:string,actor:string,confirmation:unknown){requireConfirm(confirmation,'ARM LIVE');const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canArm)throw new Error(`Chưa thể ARM: ${snapshot.steps.filter(x=>!x.ok&&['backup','release','oauth','private-test','reconcile','env-live','private-env'].includes(x.id)).map(x=>x.label).join(', ')||'gate chưa đạt'}`);updateProductionActivation(ownerId,{sessionId:randomUUID(),status:'armed',armed:true,maxPrivacy:'private',armedAt:new Date().toISOString(),abortedAt:undefined,unlistedAuthorizedAt:undefined,unlistedVerifiedAt:undefined,unlistedTestVideoId:undefined,...clearRemoteEvidence(),publicApprovedAt:undefined},actor);return activationWizardSnapshot(ownerId)}
export async function authorizeUnlistedTest(ownerId:string,actor:string,confirmation:unknown){requireConfirm(confirmation,'AUTHORIZE UNLISTED');const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canAuthorizeUnlisted)throw new Error('Chưa thể mở mức UNLISTED; cần Activation ARM + Release GO + Kill Switch OFF');updateProductionActivation(ownerId,{maxPrivacy:'unlisted',unlistedAuthorizedAt:new Date().toISOString(),unlistedVerifiedAt:undefined,unlistedTestVideoId:undefined,...clearRemoteEvidence(),publicApprovedAt:undefined},actor);return activationWizardSnapshot(ownerId)}
export async function verifyUnlistedTest(ownerId:string,actor:string,input:{confirmation?:unknown;remoteId?:unknown}){requireConfirm(input.confirmation,'UNLISTED VERIFIED');const remoteId=String(input.remoteId||'').trim();if(!remoteId)throw new Error('Cần remote/video ID của video Unlisted đã kiểm tra');const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canVerifyUnlisted)throw new Error('Chỉ xác minh Unlisted khi wizard đã AUTHORIZE UNLISTED và container đang chạy YOUTUBE_PRIVACY_STATUS=unlisted');updateProductionActivation(ownerId,{unlistedVerifiedAt:new Date().toISOString(),unlistedTestVideoId:remoteId.slice(0,300),...clearRemoteEvidence(),publicApprovedAt:undefined},actor);return activationWizardSnapshot(ownerId)}
export async function verifyRemoteCanary(ownerId:string,actor:string){
  const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canVerifyRemoteCanary)throw new Error('Chưa thể kiểm tra Remote Canary: cần Unlisted local verified, Release Gate GO, OAuth fresh, Reconcile clear và Kill Switch OFF');
  const videoId=String(snapshot.state.unlistedTestVideoId||''),credential=getCredential(ownerId,'youtube'),verification=await verifyYouTubeUnlistedCanary(credential,videoId);
  if(!verification.readyForPromotion)throw new Error(`Remote Canary chưa đạt Public Promotion Gate: ${(verification.reasons.length?verification.reasons:[verification.error||'unknown']).join(' | ')}`);
  updateProductionActivation(ownerId,{remoteCanaryVerifiedAt:verification.checkedAt,remoteCanaryVideoId:verification.videoId,remoteCanaryChannelId:verification.channelId,remoteCanaryTitle:verification.title,remoteCanaryPrivacyStatus:verification.privacyStatus,remoteCanaryUploadStatus:verification.uploadStatus,remoteCanaryProcessingStatus:verification.processingStatus,publicApprovedAt:undefined},actor);
  return{...(await activationWizardSnapshot(ownerId)),remoteVerification:verification};
}
export async function approvePublicActivation(ownerId:string,actor:string,confirmation:unknown){requireConfirm(confirmation,'APPROVE PUBLIC');const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canApprovePublic)throw new Error('PUBLIC chỉ được phê duyệt khi Remote Canary vừa được xác minh live: đúng video/channel, privacy=unlisted, upload=processed, processing=succeeded, Release Gate GO và không có Reconcile/Kill Switch');updateProductionActivation(ownerId,{maxPrivacy:'public',publicApprovedAt:new Date().toISOString()},actor);return activationWizardSnapshot(ownerId)}
export async function abortActivationWizard(ownerId:string,actor:string){abortProductionActivation(ownerId,actor);return activationWizardSnapshot(ownerId)}
export async function engageActivationKillSwitch(ownerId:string,actor:string,reason?:string){engageProductionKillSwitch(actor,String(reason||'Emergency operator kill switch').slice(0,300));return activationWizardSnapshot(ownerId)}
export async function clearActivationKillSwitch(ownerId:string,actor:string,confirmation:unknown){requireConfirm(confirmation,'CLEAR KILL SWITCH');const release=await releaseCandidateSnapshot(ownerId);if(!release.candidateReady)throw new Error(`Không thể clear Kill Switch khi Release Gate NO-GO: ${release.blockers.join(' | ')}`);clearProductionKillSwitch(actor);return activationWizardSnapshot(ownerId)}
