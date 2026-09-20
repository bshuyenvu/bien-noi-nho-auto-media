import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const dbPath=`/tmp/vietnewsflow-content-studio-v2-wizard-${process.pid}.sqlite`;
process.env.DB_PATH=dbPath;
process.env.RENDER_QUEUE_PAUSED='true';

const wizard=await import('../src/studio/pipeline-v2-wizard.js');
const core=await import('../src/studio/pipeline-v2.js');
const media=await import('../src/studio/pipeline-v2-media-router.js');
const { db }=await import('../src/storage/db.js');

const ownerId='phase6a-smoke';
const created=await wizard.createPipelineProjectAndStart({
  ownerId,
  templateId:'podcast-story',
  topic:'Một câu chuyện về sự kiên nhẫn',
  seriesName:'Chuyện đời thường',
  episode:8,
  script:'Một buổi chiều, hai người ngồi lại và nói chuyện chậm rãi. Họ học cách lắng nghe, chờ nhau nói hết ý và cùng tìm một cách giải quyết nhẹ nhàng hơn.',
  outputIds:['podcast','short-9x16'],
  autoAdvance:true,
  maxSteps:2,
  skipExternalPrepare:true,
});
assert.equal(created.version,'content-studio-wizard-v1');
assert.equal(created.project.templateId,'podcast-story');
assert.deepEqual(created.project.plan.outputs.map(x=>x.id),['podcast','short-9x16']);
assert.equal(created.autoAdvance?.performedSteps,2);
assert.equal(created.autoAdvance?.stoppedOn,'run-scene-media');
assert.equal(created.dashboard.project.id,created.project.id);
assert.ok(media.listSceneMediaJobs(ownerId,created.project.id).length>0);

const manual=await wizard.createPipelineProjectAndStart({
  ownerId,
  templateId:'comic-episode',
  topic:'Một câu chuyện ngắn',
  script:'Một nhân vật bắt đầu ngày mới, gặp một việc bất ngờ và kết thúc bằng một bài học đơn giản nhưng đáng nhớ.',
  outputIds:['comic','thumbnail'],
  autoAdvance:false,
});
assert.equal(manual.autoAdvance,null);
assert.equal(manual.dashboard.nextAction.id,'prepare');
assert.equal(core.listPipelineProjects(ownerId).length,2);
assert.equal(core.listPipelineProjects('other-owner').length,0);

console.log(JSON.stringify({
  ok:true,
  createdId:created.project.id,
  stop:created.autoAdvance?.stoppedOn,
  steps:created.autoAdvance?.performedSteps,
  outputs:created.project.plan.outputs.map(x=>x.id),
  manualId:manual.project.id,
},null,2));

db.close();
for(const suffix of['','-shm','-wal'])await rm(`${dbPath}${suffix}`,{force:true});
