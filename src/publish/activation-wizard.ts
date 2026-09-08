import { randomUUID } from 'node:crypto';
import { releaseCandidateSnapshot } from '../system/release-readiness.js';
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
function fresh(iso?:string,maxAge=backupMaxAgeMs()){if(!iso)return false;const t=Date.parse(iso);return Number.isFinite(t)&&Date.now()-t<=maxAge}
function requireConfirm(actual:unknown,expected:string){if(String(actual||'').trim()!==expected)throw new Error(`Xác nhận không hợp lệ. Cần nhập chính xác: ${expected}`)}

export async function activationWizardSnapshot(ownerId:string){
  const release=await releaseCandidateSnapshot(ownerId),state=productionActivationState(ownerId),killSwitch=productionKillSwitch(),privacy=envYouTubePrivacy();
  const backupFresh=fresh(state.backupConfirmedAt),oauthFresh=Boolean(release.deployment.credential?.liveReadyCached),privateTestPassed=Boolean(release.deployment.privateTest?.passed),reconcileClear=release.queues.needsReconcile===0&&release.queues.uncertainSessions===0;
  const liveEnvEnabled=Boolean(release.deployment.config.liveEnabled),releaseGo=Boolean(release.candidateReady),privateEnv=privacy==='private';
  const canArm=backupFresh&&releaseGo&&oauthFresh&&privateTestPassed&&reconcileClear&&liveEnvEnabled&&privateEnv&&!killSwitch.engaged;
  const canAuthorizeUnlisted=Boolean(state.armed&&state.status==='armed'&&state.maxPrivacy==='private'&&!killSwitch.engaged&&releaseGo);
  const canVerifyUnlisted=Boolean(state.armed&&state.unlistedAuthorizedAt&&privacy==='unlisted'&&!killSwitch.engaged);
  const canApprovePublic=Boolean(state.armed&&state.unlistedVerifiedAt&&privacy==='unlisted'&&!killSwitch.engaged&&releaseGo);
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
    {id:'unlisted',label:'Unlisted verified',ok:Boolean(state.unlistedVerifiedAt),detail:state.unlistedVerifiedAt?`${state.unlistedVerifiedAt} • ${state.unlistedTestVideoId||'video verified'}`:'Chưa xác minh'},
    {id:'public',label:'Public approved',ok:Boolean(state.publicApprovedAt),detail:state.publicApprovedAt||'Chưa phê duyệt'},
  ];
  return{release,state,killSwitch,privacy,guard,steps,canArm,canAuthorizeUnlisted,canVerifyUnlisted,canApprovePublic,backupMaxAgeHours:backupMaxAgeMs()/3600000,commands:{backup:'bash scripts/backup-wyse.sh',deploy:'bash scripts/deploy-wyse.sh'},checkedAt:new Date().toISOString()};
}

export async function confirmActivationBackup(ownerId:string,actor:string,note?:string){const now=new Date().toISOString();updateProductionActivation(ownerId,{backupConfirmedAt:now,backupNote:String(note||'Operator confirmed successful SQLite backup').slice(0,300)},actor);return activationWizardSnapshot(ownerId)}
export async function armProductionActivation(ownerId:string,actor:string,confirmation:unknown){requireConfirm(confirmation,'ARM LIVE');const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canArm)throw new Error(`Chưa thể ARM: ${snapshot.steps.filter(x=>!x.ok&&['backup','release','oauth','private-test','reconcile','env-live','private-env'].includes(x.id)).map(x=>x.label).join(', ')||'gate chưa đạt'}`);updateProductionActivation(ownerId,{sessionId:randomUUID(),status:'armed',armed:true,maxPrivacy:'private',armedAt:new Date().toISOString(),abortedAt:undefined,unlistedAuthorizedAt:undefined,unlistedVerifiedAt:undefined,unlistedTestVideoId:undefined,publicApprovedAt:undefined},actor);return activationWizardSnapshot(ownerId)}
export async function authorizeUnlistedTest(ownerId:string,actor:string,confirmation:unknown){requireConfirm(confirmation,'AUTHORIZE UNLISTED');const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canAuthorizeUnlisted)throw new Error('Chưa thể mở mức UNLISTED; cần Activation ARM + Release GO + Kill Switch OFF');updateProductionActivation(ownerId,{maxPrivacy:'unlisted',unlistedAuthorizedAt:new Date().toISOString()},actor);return activationWizardSnapshot(ownerId)}
export async function verifyUnlistedTest(ownerId:string,actor:string,input:{confirmation?:unknown;remoteId?:unknown}){requireConfirm(input.confirmation,'UNLISTED VERIFIED');const remoteId=String(input.remoteId||'').trim();if(!remoteId)throw new Error('Cần remote/video ID của video Unlisted đã kiểm tra');const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canVerifyUnlisted)throw new Error('Chỉ xác minh Unlisted khi wizard đã AUTHORIZE UNLISTED và container đang chạy YOUTUBE_PRIVACY_STATUS=unlisted');updateProductionActivation(ownerId,{unlistedVerifiedAt:new Date().toISOString(),unlistedTestVideoId:remoteId.slice(0,300)},actor);return activationWizardSnapshot(ownerId)}
export async function approvePublicActivation(ownerId:string,actor:string,confirmation:unknown){requireConfirm(confirmation,'APPROVE PUBLIC');const snapshot=await activationWizardSnapshot(ownerId);if(!snapshot.canApprovePublic)throw new Error('PUBLIC chỉ được phê duyệt sau khi Unlisted đã được xác minh và Release Gate vẫn GO');updateProductionActivation(ownerId,{maxPrivacy:'public',publicApprovedAt:new Date().toISOString()},actor);return activationWizardSnapshot(ownerId)}
export async function abortActivationWizard(ownerId:string,actor:string){abortProductionActivation(ownerId,actor);return activationWizardSnapshot(ownerId)}
export async function engageActivationKillSwitch(ownerId:string,actor:string,reason?:string){engageProductionKillSwitch(actor,String(reason||'Emergency operator kill switch').slice(0,300));return activationWizardSnapshot(ownerId)}
export async function clearActivationKillSwitch(ownerId:string,actor:string,confirmation:unknown){requireConfirm(confirmation,'CLEAR KILL SWITCH');const release=await releaseCandidateSnapshot(ownerId);if(!release.candidateReady)throw new Error(`Không thể clear Kill Switch khi Release Gate NO-GO: ${release.blockers.join(' | ')}`);clearProductionKillSwitch(actor);return activationWizardSnapshot(ownerId)}
