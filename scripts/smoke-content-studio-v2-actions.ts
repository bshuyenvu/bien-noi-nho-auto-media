import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const dbPath=`/tmp/vietnewsflow-content-studio-v2-actions-${process.pid}.sqlite`;
process.env.DB_PATH=dbPath;
process.env.RENDER_QUEUE_PAUSED='true';

const core=await import('../src/studio/pipeline-v2.js');
const actions=await import('../src/studio/pipeline-v2-actions.js');
const dashboard=await import('../src/studio/pipeline-v2-dashboard.js');
const generation=await import('../src/studio/pipeline-v2-generation.js');
const runtime=await import('../src/studio/pipeline-v2-runtime.js');
const media=await import('../src/studio/pipeline-v2-media-router.js');
const { db }=await import('../src/storage/db.js');

const ownerId='phase5b-smoke';
const project=core.createPipelineProject({
  ownerId,
  templateId:'podcast-story',
  topic:'Một câu chuyện về sự lắng nghe',
  seriesName:'Chuyện đời thường',
  episode:6,
  script:'Buổi tối, hai người ngồi lại và lắng nghe nhau. Cuộc trò chuyện chậm rãi giúp họ hiểu điều người kia đang lo và chọn cách hỗ trợ phù hợp.',
  outputIds:['short-9x16','podcast'],
});

let snap=dashboard.contentStudioProjectDashboard(ownerId,project.id);
assert.equal(snap.nextAction.id,'prepare');

const prepared=await actions.runContentStudioDashboardAction({ownerId,projectId:project.id,skipExternalPrepare:true});
assert.equal(prepared.action,'prepare');
assert.equal(prepared.performed,true);
assert.equal(prepared.dashboard.nextAction.id,'generate-keyframes');

const keyframes=await actions.runContentStudioDashboardAction({ownerId,projectId:project.id});
assert.equal(keyframes.action,'generate-keyframes');
assert.equal(keyframes.performed,true);
assert.ok(media.listSceneMediaJobs(ownerId,project.id).length>0);
assert.equal(keyframes.dashboard.nextAction.id,'run-scene-media');

generation.recordStudioArtifact({
  projectId:project.id,
  ownerId,
  outputId:'manual-review-smoke',
  kind:'thumbnail',
  path:'/tmp/manual-review-smoke.png',
  generator:'phase5b-smoke',
  metadata:{smoke:true},
});

let reviewed=runtime.setPipelineReleaseReview({
  ownerId,
  projectId:project.id,
  gate:'copyright',
  status:'accepted',
  actor:'phase5b-smoke',
  note:'Đã kiểm tra provenance và artifact trong smoke test.',
});
assert.equal(reviewed.reviews.copyright,'accepted');

reviewed=runtime.setPipelineReleaseReview({
  ownerId,
  projectId:project.id,
  gate:'final',
  status:'accepted',
  actor:'phase5b-smoke',
  note:'Đã kiểm tra nội dung cuối cùng trong smoke test.',
});
assert.equal(reviewed.reviews.final,'accepted');

const events=runtime.listPipelineReviewEvents(ownerId,project.id);
assert.ok(events.some(x=>x.gate==='copyright'&&x.status==='accepted'));
assert.ok(events.some(x=>x.gate==='final'&&x.status==='accepted'));

const noArtifact=core.createPipelineProject({
  ownerId,
  templateId:'podcast-story',
  topic:'Project chưa có artifact',
  script:'Một đoạn kịch bản đủ dài để kiểm tra review gate khi chưa có artifact thực tế.',
  outputIds:['podcast'],
});
await runtime.preparePipelineProject(ownerId,noArtifact.id,{skipExternal:true});
assert.throws(()=>runtime.setPipelineReleaseReview({
  ownerId,
  projectId:noArtifact.id,
  gate:'copyright',
  status:'accepted',
  actor:'phase5b-smoke',
}),/Chưa có artifact/);

console.log(JSON.stringify({
  ok:true,
  projectId:project.id,
  firstActions:['prepare','generate-keyframes'],
  mediaJobs:media.listSceneMediaJobs(ownerId,project.id).length,
  copyright:reviewed.reviews.copyright,
  final:reviewed.reviews.final,
  reviewEvents:events.length,
},null,2));

db.close();
for(const suffix of['','-shm','-wal'])await rm(`${dbPath}${suffix}`,{force:true});
