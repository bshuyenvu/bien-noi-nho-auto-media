import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'vietnews-publish-'));
process.env.DB_PATH=join(dir,'test.sqlite');
process.env.CREDENTIAL_VAULT_KEY='ci-smoke-test-key-only';
process.env.PUBLISH_LIVE_ENABLED='false';
try{
  const {run,all}=await import('../src/storage/db.js');
  const {enqueuePublish,getPublishJob,cancelPublishJob,retryPublishJob}=await import('../src/publish/queue.js');
  const {runPublishWorkerOnce}=await import('../src/publish/worker.js');
  const {saveCredential,getCredential,credentialStatus}=await import('../src/publish/vault.js');
  const owner='smoke-owner',draft='smoke-draft',now=new Date().toISOString();
  const addRender=(id:string)=>run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,draft,owner,'ready',100,`output/${id}.mp4`,now,now);

  addRender('smoke-render');
  const job=enqueuePublish({ownerId:owner,renderJobId:'smoke-render',draftId:draft,platform:'youtube',title:'Smoke publish',dryRun:true});
  const result=await runPublishWorkerOnce();
  const after=getPublishJob(job.id,owner);
  if(!result.ok||after?.status!=='published'||!after.remoteId?.startsWith('dry-youtube-'))throw new Error(`publish lifecycle failed: ${JSON.stringify(after)}`);

  addRender('smoke-cancel');
  const scheduled=enqueuePublish({ownerId:owner,renderJobId:'smoke-cancel',draftId:draft,platform:'youtube',title:'Smoke cancel',scheduledAt:new Date(Date.now()+3600_000).toISOString(),dryRun:true});
  const cancelled=cancelPublishJob(scheduled.id,owner);
  if(cancelled?.status!=='cancelled'||getPublishJob(scheduled.id,owner)?.status!=='cancelled')throw new Error('publish cancel lifecycle failed');

  addRender('smoke-retry');
  const retrySource=enqueuePublish({ownerId:owner,renderJobId:'smoke-retry',draftId:draft,platform:'youtube',title:'Smoke retry',dryRun:true,maxAttempts:3});
  run("UPDATE publish_jobs SET status='failed',attempts=1,error='synthetic failure' WHERE id=?",retrySource.id);
  const retried=retryPublishJob(retrySource.id,owner);
  const retryAfter=getPublishJob(retrySource.id,owner);
  if(retried?.status!=='pending'||retryAfter?.status!=='pending'||retryAfter.error)throw new Error('publish retry lifecycle failed');

  saveCredential(owner,'facebook','Smoke Page',{pageAccessToken:'secret-token',pageId:'123'});
  const credential=getCredential(owner,'facebook');
  if(credential?.secret.pageAccessToken!=='secret-token')throw new Error('vault decrypt failed');
  const raw=all<{secret_encrypted:string}>('SELECT secret_encrypted FROM publish_credentials WHERE owner_id=?',owner)[0]?.secret_encrypted||'';
  if(!raw||raw.includes('secret-token'))throw new Error('credential was not encrypted at rest');
  if(credentialStatus(owner).length!==1)throw new Error('credential status failed');
  console.log('publish smoke ok');
}finally{rmSync(dir,{recursive:true,force:true})}
