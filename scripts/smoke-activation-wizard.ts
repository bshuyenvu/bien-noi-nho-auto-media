import { mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'activation-wizard-smoke-')),output=join(dir,'output'),originalFetch=globalThis.fetch;
Object.assign(process.env,{
  DB_PATH:join(dir,'test.sqlite'),RENDER_OUTPUT_DIR:output,CI:'true',NODE_ENV:'test',APP_REVISION:'activation-smoke',
  CREDENTIAL_VAULT_KEY:'activation-smoke-vault-key-1234567890',OAUTH_STATE_SECRET:'activation-smoke-oauth-key-1234567890',
  YOUTUBE_CLIENT_ID:'client',YOUTUBE_CLIENT_SECRET:'secret',YOUTUBE_REDIRECT_URI:'http://localhost:8787/api/publish-oauth/youtube/callback',
  YOUTUBE_PRIVACY_STATUS:'private',YOUTUBE_READINESS_MAX_AGE_MS:'900000',PUBLISH_LIVE_ENABLED:'true',PUBLISH_STARTUP_DIAGNOSTICS:'false',
  ACTIVATION_BACKUP_MAX_AGE_HOURS:'24',ACTIVATION_REMOTE_CANARY_MAX_AGE_MINUTES:'60',RENDER_QUEUE_PAUSED:'false',LOW_MEMORY_MODE:'true',
  ARTIFACT_MANIFEST_WATCHER:'false',CONSISTENCY_AUDITOR_ENABLED:'false'
});

try{
  const {run}=await import('../src/storage/db.js');
  const {setReview}=await import('../src/review/store.js');
  const {saveCredential}=await import('../src/publish/vault.js');
  const {YOUTUBE_REQUIRED_SCOPES}=await import('../src/publish/youtube.js');
  const {enqueuePublish}=await import('../src/publish/queue.js');
  const {
    activationWizardSnapshot,confirmActivationBackup,armProductionActivation,authorizeUnlistedTest,verifyUnlistedTest,verifyRemoteCanary,approvePublicActivation,engageActivationKillSwitch,clearActivationKillSwitch,abortActivationWizard,
  }=await import('../src/publish/activation-wizard.js');
  const {productionPublishGuard}=await import('../src/publish/activation-state.js');
  const owner='activation-owner',now=new Date().toISOString(),reviewLocks={script:true,media:true,voice:true,scenes:true};
  run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-activation','activation@example.test','admin','pro','active',now,now);
  saveCredential(owner,'youtube','Activation Smoke',{refreshToken:'refresh',scope:YOUTUBE_REQUIRED_SCOPES.join(' '),channelId:'UC_ACTIVATION',channelTitle:'Activation Smoke',verifiedAt:now,privateTestPassedAt:now,privateTestVideoId:'private-test-video'});

  const liveInput=(renderJobId:string)=>{const draftId=`draft-${renderJobId}`,body=`Nội dung kiểm thử activation ${renderJobId} có durable Review evidence để Release Gate xác minh an toàn trước LIVE publish.`;run('INSERT OR IGNORE INTO drafts(id,owner_id,title,body,format,status,created_at) VALUES(?,?,?,?,?,?,?)',draftId,owner,`Activation ${renderJobId}`,body,'latest','draft',now);setReview(draftId,{status:'approved',locks:reviewLocks},{ownerId:owner,actor:'smoke:activation'});run('INSERT OR IGNORE INTO render_jobs(id,draft_id,owner_id,status,progress,output,error,created_at,payload_json,attempts,max_attempts,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',renderJobId,draftId,owner,'ready',100,join(output,`${renderJobId}.mp4`),null,now,JSON.stringify({draftId,ownerId:owner,text:body,headline:`Activation ${renderJobId}`}),1,3,now);return{ownerId:owner,renderJobId,draftId,platform:'youtube' as const,title:`Live ${renderJobId}`,dryRun:false}};
  let blockedBeforeArm=false;try{enqueuePublish(liveInput('before-arm'))}catch(e){blockedBeforeArm=String(e).includes('Activation')}
  if(!blockedBeforeArm)throw new Error('normal LIVE was not blocked before ARM');
  const privateTest=enqueuePublish({...liveInput('deployment-test'),deploymentTest:true});
  if(!privateTest.deploymentTest)throw new Error('Private Test should be allowed before ARM when kill switch is off');

  await confirmActivationBackup(owner,'smoke','backup verified');
  const preArm=await activationWizardSnapshot(owner);if(!preArm.canArm)throw new Error(`wizard should be armable: ${JSON.stringify(preArm.steps.filter(x=>!x.ok))}`);
  let wrongArmRejected=false;try{await armProductionActivation(owner,'smoke','YES')}catch{wrongArmRejected=true}if(!wrongArmRejected)throw new Error('ARM confirmation phrase was not enforced');
  const armed=await armProductionActivation(owner,'smoke','ARM LIVE');if(!armed.state.armed||armed.state.maxPrivacy!=='private')throw new Error('ARM did not persist PRIVATE ceiling');
  enqueuePublish(liveInput('private-live'));

  await authorizeUnlistedTest(owner,'smoke','AUTHORIZE UNLISTED');
  process.env.YOUTUBE_PRIVACY_STATUS='unlisted';
  const unlistedGuard=productionPublishGuard(owner);if(!unlistedGuard.allowed)throw new Error(`UNLISTED should be allowed after authorization: ${unlistedGuard.reason}`);
  const verified=await verifyUnlistedTest(owner,'smoke',{confirmation:'UNLISTED VERIFIED',remoteId:'unlisted-video-123'});if(!verified.state.unlistedVerifiedAt)throw new Error('UNLISTED verification did not persist');
  if(verified.canApprovePublic)throw new Error('PUBLIC opened before live Remote Canary verification');
  let earlyPublicRejected=false;try{await approvePublicActivation(owner,'smoke','APPROVE PUBLIC')}catch{earlyPublicRejected=true}if(!earlyPublicRejected)throw new Error('PUBLIC approval did not require Remote Canary evidence');

  let videoChannel='UC_WRONG';
  globalThis.fetch=async(input:any)=>{
    const url=String(input instanceof Request?input.url:input);
    if(url.includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'access-smoke'}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('youtube/v3/videos'))return new Response(JSON.stringify({items:[{id:'unlisted-video-123',snippet:{channelId:videoChannel,title:'Activation Canary'},status:{privacyStatus:'unlisted',uploadStatus:'processed'},processingDetails:{processingStatus:'succeeded'}}]}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`Unexpected fetch in activation smoke: ${url}`);
  };
  let wrongChannelRejected=false;try{await verifyRemoteCanary(owner,'smoke')}catch(e){wrongChannelRejected=String(e).includes('Channel ID khác')}if(!wrongChannelRejected)throw new Error('Remote Canary did not reject wrong channel');
  videoChannel='UC_ACTIVATION';
  const remote=await verifyRemoteCanary(owner,'smoke');if(!remote.remoteCanaryFresh||!remote.canApprovePublic)throw new Error(`Remote Canary evidence did not open promotion gate: ${JSON.stringify(remote.state)}`);
  if(remote.state.remoteCanaryVideoId!=='unlisted-video-123'||remote.state.remoteCanaryProcessingStatus!=='succeeded')throw new Error('Remote Canary evidence did not persist sanitized status');
  const approved=await approvePublicActivation(owner,'smoke','APPROVE PUBLIC');if(approved.state.maxPrivacy!=='public'||!approved.state.publicApprovedAt)throw new Error('PUBLIC approval did not persist');
  process.env.YOUTUBE_PRIVACY_STATUS='public';
  let normalPublicBlocked=false;try{enqueuePublish(liveInput('public-live'))}catch(e){normalPublicBlocked=String(e).includes('Public Canary')||String(e).includes('rollout')}if(!normalPublicBlocked)throw new Error('normal PUBLIC was not held behind Controlled Public Rollout after approval');
  const publicCanary=enqueuePublish({...liveInput('public-canary'),publicCanary:true});if(!publicCanary.publicCanary)throw new Error('Public Canary was not allowed after explicit Public approval');

  await engageActivationKillSwitch(owner,'smoke','smoke emergency');
  let killBlocked=false;try{enqueuePublish(liveInput('kill-block'))}catch(e){killBlocked=String(e).includes('Kill Switch')}if(!killBlocked)throw new Error('Kill Switch did not block normal LIVE');
  let killBlockedTest=false;try{enqueuePublish({...liveInput('kill-private-test'),deploymentTest:true})}catch(e){killBlockedTest=String(e).includes('Kill Switch')}if(!killBlockedTest)throw new Error('Kill Switch did not block Private Test');
  const cleared=await clearActivationKillSwitch(owner,'smoke','CLEAR KILL SWITCH');if(cleared.killSwitch.engaged)throw new Error('Kill Switch did not clear');

  const aborted=await abortActivationWizard(owner,'smoke');if(aborted.state.armed||aborted.state.status!=='aborted')throw new Error('ABORT did not disarm activation');
  if(aborted.state.remoteCanaryVerifiedAt)throw new Error('ABORT did not clear Remote Canary evidence');
  if(aborted.state.publicRolloutStatus!=='idle')throw new Error('ABORT did not clear Public Rollout state');
  if(productionPublishGuard(owner).allowed)throw new Error('publish guard remained open after ABORT');
  console.log('Production activation wizard + Remote Canary + controlled Public lock smoke OK');
}finally{globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true})}
