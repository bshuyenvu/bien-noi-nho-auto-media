import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=await mkdtemp(join(tmpdir(),'content-studio-reconcile-'));
process.env.DB_PATH=join(root,'test.sqlite');
process.env.RENDER_QUEUE_PAUSED='true';

const { run }=await import('../src/storage/db.js');
const generation=await import('../src/studio/pipeline-v2-generation.js');

try{
 const owner='reconcile-owner',project='reconcile-project',batch='reconcile-batch',job='reconcile-job',now=new Date().toISOString();
 run('INSERT INTO render_jobs(id,draft_id,status,progress,output,error,created_at,owner_id,payload_json,attempts,max_attempts,updated_at,checkpoint_stage,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   job,project,'ready',100,'output/reconcile.mp4',null,now,owner,'{}',1,3,now,'completed',now);
 run('INSERT INTO content_studio_generation_batches(id,project_id,owner_id,status,primary_output_id,outputs_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
   batch,project,owner,'rendering','video-16x9',JSON.stringify([{outputId:'video-16x9',kind:'video',aspectRatio:'16:9',status:'rendering',worker:'ffmpeg-landscape-16x9',renderJobId:job}]),now,now);
 const synced=generation.getGenerationBatch(owner,batch);
 assert.ok(synced);
 assert.equal(synced!.status,'ready');
 assert.equal(synced!.outputs[0].status,'ready');
 assert.equal(synced!.outputs[0].outputPath,'output/reconcile.mp4');
 const reread=generation.getGenerationBatch(owner,batch);
 assert.equal(reread!.status,'ready');
 console.log(JSON.stringify({ok:true,batch:synced!.status,output:synced!.outputs[0].status,path:synced!.outputs[0].outputPath},null,2));
}finally{
 const { db }=await import('../src/storage/db.js');db.close();
 await rm(root,{recursive:true,force:true});
}
