import { mkdtempSync,rmSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'public-ramp-smoke-')),output=join(dir,'output');mkdirSync(output,{recursive:true});
Object.assign(process.env,{DB_PATH:join(dir,'test.sqlite'),RENDER_OUTPUT_DIR:output,NODE_ENV:'test',CI:'true',YOUTUBE_PRIVACY_STATUS:'public',PUBLISH_LIVE_ENABLED:'true',PUBLIC_RAMP_STAGE1_HOURLY:'1',PUBLIC_RAMP_STAGE1_DAILY:'3',PUBLIC_RAMP_STAGE1_MIN_INTERVAL_MINUTES:'60',PUBLIC_RAMP_CIRCUIT_COOLDOWN_MINUTES:'5',PUBLIC_RAMP_CIRCUIT_FAILURES:'2'});
try{
  const {run,all}=await import('../src/storage/db.js');
  const {updateProductionActivation}=await import('../src/publish/activation-state.js');
  const ramp=await import('../src/publish/public-ramp.js');
  const queue=await import('../src/publish/queue.js');
  const owner='ramp-owner',now=new Date().toISOString();
  run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-ramp','ramp@example.test','admin','pro','active',now,now);
  updateProductionActivation(owner,{status:'armed',armed:true,maxPrivacy:'public',publicApprovedAt:now,publicRolloutStatus:'completed',publicRolloutCompletedAt:now},'smoke');
  const first=queue.enqueuePublish({ownerId:owner,renderJobId:'render-1',draftId:'draft-1',platform:'youtube',title:'Public 1',dryRun:false});
  if(first.publishPrivacy!=='public')throw new Error('publish_privacy was not persisted on enqueue object');
  let burstBlocked=false;try{queue.enqueuePublish({ownerId:owner,renderJobId:'render-2',draftId:'draft-2',platform:'youtube',title:'Public 2',dryRun:false})}catch(e){burstBlocked=String(e).includes('Public Ramp')}
  if(!burstBlocked)throw new Error('Stage 1 did not block immediate second PUBLIC enqueue');
  const snap=ramp.publicRampSnapshot(owner);if(snap.limits.hourly!==1||snap.usage.hour!==1)throw new Error(`unexpected Stage 1 snapshot: ${JSON.stringify(snap)}`);
  ramp.recordPublicRampFailure(owner,'YouTube HTTP 429 quotaExceeded');
  const open=ramp.publicRampState(owner);if(!open.circuitOpen||!String(open.circuitReason).match(/quota/i))throw new Error('429 did not open Public Ramp Circuit');
  let resetEarly=false;try{ramp.resetPublicRampCircuit(owner,'smoke')}catch{resetEarly=true}if(!resetEarly)throw new Error('Circuit reset ignored cooldown');
  const row=all<{value_json:string}>('SELECT value_json FROM system_runtime_state WHERE state_key=?',`publish.public-ramp:${owner}`)[0],state=JSON.parse(row.value_json);state.cooldownUntil=new Date(Date.now()-1000).toISOString();run('UPDATE system_runtime_state SET value_json=?,updated_at=? WHERE state_key=?',JSON.stringify(state),new Date().toISOString(),`publish.public-ramp:${owner}`);
  const reset=ramp.resetPublicRampCircuit(owner,'smoke');if(reset.circuitOpen)throw new Error('Circuit did not reset after cooldown');
  run("UPDATE publish_jobs SET status='published',published_at=?,updated_at=? WHERE id=?",new Date(Date.now()-2*3600000).toISOString(),new Date().toISOString(),first.id);
  const promoted=ramp.promotePublicRamp(owner,'smoke');if(promoted.stage!==2)throw new Error('Ramp did not promote to Stage 2');
  const stage2=ramp.publicRampSnapshot(owner);if(stage2.limits.hourly!==2||stage2.limits.daily!==6)throw new Error('Stage 2 defaults are incorrect');
  ramp.recordPublicRampFailure(owner,'upload became uncertain',{needsReconcile:true});if(!ramp.publicRampState(owner).circuitOpen)throw new Error('needs_reconcile did not open circuit');
  console.log('Gradual Public Ramp + Circuit Breaker smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
