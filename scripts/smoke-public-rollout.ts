import { mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'public-rollout-smoke-')),output=join(dir,'output');mkdirSync(output,{recursive:true});
Object.assign(process.env,{
  DB_PATH:join(dir,'test.sqlite'),RENDER_OUTPUT_DIR:output,CI:'true',NODE_ENV:'test',APP_REVISION:'public-rollout-smoke',
  CREDENTIAL_VAULT_KEY:'public-rollout-vault-key-1234567890',OAUTH_STATE_SECRET:'public-rollout-oauth-key-1234567890',
  YOUTUBE_CLIENT_ID:'client',YOUTUBE_CLIENT_SECRET:'secret',YOUTUBE_REDIRECT_URI:'http://localhost:8787/api/publish-oauth/youtube/callback',
  YOUTUBE_PRIVACY_STATUS:'public',YOUTUBE_READINESS_MAX_AGE_MS:'900000',PUBLISH_LIVE_ENABLED:'true',PUBLISH_STARTUP_DIAGNOSTICS:'false',
  PUBLIC_ROLLOUT_WATCH_MINUTES:'1',PUBLIC_ROLLOUT_WATCH_POLL_MS:'5000',RENDER_QUEUE_PAUSED:'false',LOW_MEMORY_MODE:'true'
});

const realFetch=globalThis.fetch;
try{
  const {run}=await import('../src/storage/db.js');
  const {saveCredential}=await import('../src/publish/vault.js');
  const {YOUTUBE_REQUIRED_SCOPES}=await import('../src/publish/youtube.js');
  const {enqueuePublish}=await import('../src/publish/queue.js');
  const {updateProductionActivation,productionPublishGuard,productionKillSwitch,clearProductionKillSwitch}=await import('../src/publish/activation-state.js');
  const {markPublicCanaryQueued,verifyPublicCanaryAndStartWatch,evaluatePublicRollout}=await import('../src/publish/public-rollout.js');
  const owner='rollout-owner',now=new Date().toISOString();
  run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-rollout','rollout@example.test','admin','pro','active',now,now);
  saveCredential(owner,'youtube','Rollout Smoke',{refreshToken:'refresh',scope:YOUTUBE_REQUIRED_SCOPES.join(' '),channelId:'UC_ROLLOUT',channelTitle:'Rollout Smoke',verifiedAt:now,privateTestPassedAt:now,privateTestVideoId:'private-test-video'});
  updateProductionActivation(owner,{status:'armed',armed:true,maxPrivacy:'public',publicApprovedAt:now,publicRolloutStatus:'idle'},'smoke');
  const base=(id:string)=>({ownerId:owner,renderJobId:id,draftId:`draft-${id}`,platform:'youtube' as const,title:`Public ${id}`,dryRun:false,maxAttempts:1});
  let normalBlocked=false;try{enqueuePublish(base('normal-before'))}catch(e){normalBlocked=String(e).includes('Public Canary')||String(e).includes('rollout')}if(!normalBlocked)throw new Error('normal PUBLIC was not blocked before rollout completion');
  const canary=enqueuePublish({...base('canary'),publicCanary:true});if(!canary.publicCanary)throw new Error('Public Canary flag was not persisted in returned job');
  await markPublicCanaryQueued(owner,'smoke',canary.id);run("UPDATE publish_jobs SET status='published',published_at=?,remote_id=?,remote_url=?,updated_at=? WHERE id=?",now,'PUBLIC_VIDEO','https://youtu.be/PUBLIC_VIDEO',now,canary.id);
  let videoCalls=0;globalThis.fetch=async(input:any)=>{const u=String(input);if(u.includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'token'}),{status:200,headers:{'content-type':'application/json'}});if(u.includes('youtube/v3/videos')){videoCalls++;return new Response(JSON.stringify({items:[{id:'PUBLIC_VIDEO',snippet:{channelId:'UC_ROLLOUT',channelTitle:'Rollout Smoke',title:'Public Canary'},status:{privacyStatus:'public',uploadStatus:'processed'},processingDetails:{processingStatus:'succeeded'}}]}),{status:200,headers:{'content-type':'application/json'}})}throw new Error(`unexpected fetch ${u}`)};
  const watching=await verifyPublicCanaryAndStartWatch(owner,'smoke');if(watching.state.publicRolloutStatus!=='watching'||!watching.state.publicWatchEndsAt)throw new Error('Public Canary verification did not start watch window');
  if(productionPublishGuard(owner).allowed)throw new Error('normal PUBLIC opened before watch completion');
  updateProductionActivation(owner,{publicWatchEndsAt:new Date(Date.now()-1000).toISOString()},'smoke');
  const done=await evaluatePublicRollout(owner,'smoke');if(done.status!=='completed')throw new Error(`Public rollout did not complete: ${JSON.stringify(done)}`);if(!productionPublishGuard(owner).allowed)throw new Error('normal PUBLIC did not open after completed watch');
  enqueuePublish(base('normal-after'));
  if(videoCalls<2)throw new Error('Public Canary was not verified both before and after watch window');

  const owner2='rollout-fail-owner';run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner2,'clerk-rollout-fail','rollout-fail@example.test','admin','pro','active',now,now);saveCredential(owner2,'youtube','Rollout Fail',{refreshToken:'refresh',scope:YOUTUBE_REQUIRED_SCOPES.join(' '),channelId:'UC_ROLLOUT',channelTitle:'Rollout Smoke',verifiedAt:now,privateTestPassedAt:now,privateTestVideoId:'private-test-video'});updateProductionActivation(owner2,{status:'armed',armed:true,maxPrivacy:'public',publicApprovedAt:now,publicRolloutStatus:'watching',publicCanaryJobId:'fail-job',publicWatchStartedAt:now,publicWatchEndsAt:new Date(Date.now()+60000).toISOString()},'smoke');
  run('INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,attempts,max_attempts,dry_run,deployment_test,public_canary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)','fail-job',owner2,'r-fail','d-fail','youtube','needs_reconcile','Fail Canary',1,1,0,0,1,now,now);
  const failed=await evaluatePublicRollout(owner2,'smoke');if(failed.status!=='failed'||!productionKillSwitch().engaged)throw new Error('watch failure did not engage Kill Switch');
  clearProductionKillSwitch('smoke-cleanup');
  console.log('Controlled Public Rollout safety smoke OK');
}finally{globalThis.fetch=realFetch;rmSync(dir,{recursive:true,force:true})}
