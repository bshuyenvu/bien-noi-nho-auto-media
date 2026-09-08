import { mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'activation-wizard-smoke-')),output=join(dir,'output');mkdirSync(output,{recursive:true});
Object.assign(process.env,{
  DB_PATH:join(dir,'test.sqlite'),RENDER_OUTPUT_DIR:output,CI:'true',NODE_ENV:'test',APP_REVISION:'activation-smoke',
  CREDENTIAL_VAULT_KEY:'activation-smoke-vault-key-1234567890',OAUTH_STATE_SECRET:'activation-smoke-oauth-key-1234567890',
  YOUTUBE_CLIENT_ID:'client',YOUTUBE_CLIENT_SECRET:'secret',YOUTUBE_REDIRECT_URI:'http://localhost:8787/api/publish-oauth/youtube/callback',
  YOUTUBE_PRIVACY_STATUS:'private',YOUTUBE_READINESS_MAX_AGE_MS:'900000',PUBLISH_LIVE_ENABLED:'true',PUBLISH_STARTUP_DIAGNOSTICS:'false',
  ACTIVATION_BACKUP_MAX_AGE_HOURS:'24',RENDER_QUEUE_PAUSED:'false',LOW_MEMORY_MODE:'true'
});

try{
  const {run}=await import('../src/storage/db.js');
  const {saveCredential}=await import('../src/publish/vault.js');
  const {YOUTUBE_REQUIRED_SCOPES}=await import('../src/publish/youtube.js');
  const {enqueuePublish}=await import('../src/publish/queue.js');
  const {
    activationWizardSnapshot,confirmActivationBackup,armProductionActivation,authorizeUnlistedTest,verifyUnlistedTest,approvePublicActivation,engageActivationKillSwitch,clearActivationKillSwitch,abortActivationWizard,
  }=await import('../src/publish/activation-wizard.js');
  const {productionPublishGuard}=await import('../src/publish/activation-state.js');
  const owner='activation-owner',now=new Date().toISOString();
  run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-activation','activation@example.test','admin','pro','active',now,now);
  saveCredential(owner,'youtube','Activation Smoke',{refreshToken:'refresh',scope:YOUTUBE_REQUIRED_SCOPES.join(' '),channelId:'UC_ACTIVATION',channelTitle:'Activation Smoke',verifiedAt:now,privateTestPassedAt:now,privateTestVideoId:'private-test-video'});

  const liveInput=(renderJobId:string)=>({ownerId:owner,renderJobId,draftId:`draft-${renderJobId}`,platform:'youtube' as const,title:`Live ${renderJobId}`,dryRun:false});
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
  const approved=await approvePublicActivation(owner,'smoke','APPROVE PUBLIC');if(approved.state.maxPrivacy!=='public'||!approved.state.publicApprovedAt)throw new Error('PUBLIC approval did not persist');
  process.env.YOUTUBE_PRIVACY_STATUS='public';
  enqueuePublish(liveInput('public-live'));

  await engageActivationKillSwitch(owner,'smoke','smoke emergency');
  let killBlocked=false;try{enqueuePublish(liveInput('kill-block'))}catch(e){killBlocked=String(e).includes('Kill Switch')}if(!killBlocked)throw new Error('Kill Switch did not block normal LIVE');
  let killBlockedTest=false;try{enqueuePublish({...liveInput('kill-private-test'),deploymentTest:true})}catch(e){killBlockedTest=String(e).includes('Kill Switch')}if(!killBlockedTest)throw new Error('Kill Switch did not block Private Test');
  const cleared=await clearActivationKillSwitch(owner,'smoke','CLEAR KILL SWITCH');if(cleared.killSwitch.engaged)throw new Error('Kill Switch did not clear');

  const aborted=await abortActivationWizard(owner,'smoke');if(aborted.state.armed||aborted.state.status!=='aborted')throw new Error('ABORT did not disarm activation');
  if(productionPublishGuard(owner).allowed)throw new Error('publish guard remained open after ABORT');
  console.log('Production activation wizard safety smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
