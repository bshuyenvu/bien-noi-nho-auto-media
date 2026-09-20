import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const dbPath=`/tmp/vietnewsflow-content-studio-v2-auto-${process.pid}.sqlite`;
process.env.DB_PATH=dbPath;
process.env.RENDER_QUEUE_PAUSED='true';

const core=await import('../src/studio/pipeline-v2.js');
const actions=await import('../src/studio/pipeline-v2-actions.js');
const media=await import('../src/studio/pipeline-v2-media-router.js');
const { db }=await import('../src/storage/db.js');

const ownerId='phase5c-smoke';
const project=core.createPipelineProject({
  ownerId,
  templateId:'podcast-story',
  topic:'Tự động hóa an toàn đến gate',
  seriesName:'Chuyện đời thường',
  script:'Hai người ngồi lại trò chuyện và lắng nghe nhau. Câu chuyện được chia thành các cảnh rõ ràng để kiểm tra quy trình tự động hóa kỹ thuật an toàn.',
  outputIds:['short-9x16','podcast'],
});

const result=await actions.runContentStudioUntilGate({
  ownerId,
  projectId:project.id,
  skipExternalPrepare:true,
  maxSteps:2,
});
assert.equal(result.performedSteps,2);
assert.deepEqual(result.trace.map(x=>x.action),['prepare','generate-keyframes']);
assert.equal(result.stoppedOn,'run-scene-media');
assert.equal(result.requiresHumanReview,false);
assert.ok(media.listSceneMediaJobs(ownerId,project.id).length>0);

console.log(JSON.stringify({ok:true,projectId:project.id,performedSteps:result.performedSteps,stoppedOn:result.stoppedOn,trace:result.trace},null,2));

db.close();
for(const suffix of['','-shm','-wal'])await rm(`${dbPath}${suffix}`,{force:true});
