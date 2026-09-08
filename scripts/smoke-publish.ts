import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'vietnews-publish-'));
process.env.DB_PATH=join(dir,'test.sqlite');
process.env.CREDENTIAL_VAULT_KEY='ci-smoke-test-key-only';
process.env.PUBLISH_LIVE_ENABLED='false';
try{
  const {run,all}=await import('../src/storage/db.js');
  const {enqueuePublish,getPublishJob}=await import('../src/publish/queue.js');
  const {runPublishWorkerOnce}=await import('../src/publish/worker.js');
  const {saveCredential,getCredential,credentialStatus}=await import('../src/publish/vault.js');
  const owner='smoke-owner',draft='smoke-draft',render='smoke-render',now=new Date().toISOString();
  run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',render,draft,owner,'ready',100,'output/smoke.mp4',now,now);
  const job=enqueuePublish({ownerId:owner,renderJobId:render,draftId:draft,platform:'youtube',title:'Smoke publish',dryRun:true});
  const result=await runPublishWorkerOnce();
  const after=getPublishJob(job.id,owner);
  if(!result.ok||after?.status!=='published'||!after.remoteId?.startsWith('dry-youtube-'))throw new Error(`publish lifecycle failed: ${JSON.stringify(after)}`);
  saveCredential(owner,'facebook','Smoke Page',{pageAccessToken:'secret-token',pageId:'123'});
  const credential=getCredential(owner,'facebook');
  if(credential?.secret.pageAccessToken!=='secret-token')throw new Error('vault decrypt failed');
  const raw=all<{secret_encrypted:string}>('SELECT secret_encrypted FROM publish_credentials WHERE owner_id=?',owner)[0]?.secret_encrypted||'';
  if(!raw||raw.includes('secret-token'))throw new Error('credential was not encrypted at rest');
  if(credentialStatus(owner).length!==1)throw new Error('credential status failed');
  console.log('publish smoke ok');
}finally{rmSync(dir,{recursive:true,force:true})}
