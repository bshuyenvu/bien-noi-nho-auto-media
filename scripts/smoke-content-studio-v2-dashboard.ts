import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const dbPath=`/tmp/vietnewsflow-content-studio-v2-dashboard-${process.pid}.sqlite`;
process.env.DB_PATH=dbPath;
process.env.RENDER_QUEUE_PAUSED='true';

const core=await import('../src/studio/pipeline-v2.js');
const runtime=await import('../src/studio/pipeline-v2-runtime.js');
const dashboard=await import('../src/studio/pipeline-v2-dashboard.js');
const { db }=await import('../src/storage/db.js');

const ownerId='dashboard-smoke';

const visualProject=core.createPipelineProject({
  ownerId,
  templateId:'podcast-story',
  topic:'Một câu chuyện nhỏ về sự lắng nghe',
  seriesName:'Chuyện đời thường',
  episode:5,
  script:'Buổi tối, hai người ngồi lại và dành thời gian lắng nghe nhau. Cuộc trò chuyện chậm rãi giúp họ hiểu điều người kia đang lo và chọn cách hỗ trợ phù hợp.',
  outputIds:['short-9x16','video-16x9'],
});

let visual=dashboard.contentStudioProjectDashboard(ownerId,visualProject.id);
assert.equal(visual.nextAction.id,'prepare');
assert.equal(visual.scenes.total,visualProject.plan.scenes.length);

await runtime.preparePipelineProject(ownerId,visualProject.id,{skipExternal:true});
visual=dashboard.contentStudioProjectDashboard(ownerId,visualProject.id);
assert.equal(visual.gates.generationAllowed,true);
assert.equal(visual.nextAction.id,'generate-keyframes');
assert.equal(visual.scenes.missingVisual,visual.scenes.total);

const keyframeAction=await dashboard.runContentStudioDashboardAction({
  ownerId,
  projectId:visualProject.id,
  action:'generate-keyframes',
});
assert.equal(keyframeAction.ok,true);
assert.equal(keyframeAction.dashboard.nextAction.id,'run-scene-media');
assert.ok(Number(keyframeAction.result.created)>0);
assert.equal(keyframeAction.dashboard.scenes.statusCounts.queued,visual.scenes.total);

await assert.rejects(
  ()=>dashboard.runContentStudioDashboardAction({ownerId,projectId:visualProject.id,action:'render'}),
  /Workflow đã thay đổi/,
);

const podcastProject=core.createPipelineProject({
  ownerId,
  templateId:'podcast-story',
  topic:'Podcast chỉ có audio',
  script:'Một câu chuyện ngắn được kể bằng giọng đọc, không yêu cầu hình ảnh để hoàn thành đầu ra podcast.',
  outputIds:['podcast'],
});
await runtime.preparePipelineProject(ownerId,podcastProject.id,{skipExternal:true});
let podcast=dashboard.contentStudioProjectDashboard(ownerId,podcastProject.id);
assert.equal(podcast.nextAction.id,'render');

const renderAction=await dashboard.runContentStudioDashboardAction({
  ownerId,
  projectId:podcastProject.id,
  action:'render',
});
assert.equal(renderAction.ok,true);
assert.equal(renderAction.dashboard.nextAction.id,'render-running');
assert.ok(String(renderAction.result.batchId||'').length>10);

const cards=dashboard.listContentStudioDashboardProjects(ownerId);
assert.equal(cards.length,2);
const visualCard=cards.find(x=>x.project.id===visualProject.id);
const podcastCard=cards.find(x=>x.project.id===podcastProject.id);
assert.equal(visualCard?.nextAction.id,'run-scene-media');
assert.equal(podcastCard?.nextAction.id,'render-running');

console.log(JSON.stringify({
  ok:true,
  visualProjectId:visualProject.id,
  visualNext:visualCard?.nextAction,
  podcastProjectId:podcastProject.id,
  podcastNext:podcastCard?.nextAction,
  batchId:renderAction.result.batchId,
},null,2));

db.close();
for(const suffix of['','-shm','-wal'])await rm(`${dbPath}${suffix}`,{force:true});
