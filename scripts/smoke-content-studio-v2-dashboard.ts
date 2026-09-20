import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const dbPath=`/tmp/vietnewsflow-content-studio-v2-dashboard-${process.pid}.sqlite`;
process.env.DB_PATH=dbPath;
process.env.RENDER_QUEUE_PAUSED='true';

const core=await import('../src/studio/pipeline-v2.js');
const runtime=await import('../src/studio/pipeline-v2-runtime.js');
const media=await import('../src/studio/pipeline-v2-media-router.js');
const generation=await import('../src/studio/pipeline-v2-generation.js');
const dashboard=await import('../src/studio/pipeline-v2-dashboard.js');
const { db }=await import('../src/storage/db.js');

const ownerId='dashboard-smoke';
const project=core.createPipelineProject({
  ownerId,
  templateId:'podcast-story',
  topic:'Một câu chuyện nhỏ về sự lắng nghe',
  seriesName:'Chuyện đời thường',
  episode:5,
  script:'Buổi tối, hai người ngồi lại và dành thời gian lắng nghe nhau. Cuộc trò chuyện chậm rãi giúp họ hiểu điều người kia đang lo và chọn cách hỗ trợ phù hợp.',
  outputIds:['short-9x16','video-16x9','podcast'],
});

let x=dashboard.contentStudioProjectDashboard(ownerId,project.id);
assert.equal(x.nextAction.id,'prepare');
assert.equal(x.scenes.total,project.plan.scenes.length);

await runtime.preparePipelineProject(ownerId,project.id,{skipExternal:true});
x=dashboard.contentStudioProjectDashboard(ownerId,project.id);
assert.equal(x.gates.generationAllowed,true);
assert.equal(x.nextAction.id,'generate-keyframes');
assert.equal(x.scenes.missingVisual,x.scenes.total);

const jobs=media.createSceneMediaJobs({ownerId,projectId:project.id,kind:'image',providerId:'local-original-card'});
assert.ok(jobs.length>0);
x=dashboard.contentStudioProjectDashboard(ownerId,project.id);
assert.equal(x.nextAction.id,'run-scene-media');
assert.equal(x.scenes.statusCounts.queued,jobs.length);

const batch=await generation.enqueuePipelineGeneration({ownerId,projectId:project.id,outputId:'podcast'});
assert.ok(batch.outputs.some(output=>output.outputId==='podcast'&&output.status==='queued'));
x=dashboard.contentStudioProjectDashboard(ownerId,project.id);
assert.equal(x.nextAction.id,'render-running');
assert.equal(x.generation.latestBatch?.id,batch.id);

const cards=dashboard.listContentStudioDashboardProjects(ownerId);
assert.equal(cards.length,1);
assert.equal(cards[0].project.id,project.id);
assert.equal(cards[0].nextAction.id,'render-running');

console.log(JSON.stringify({ok:true,projectId:project.id,nextAction:x.nextAction,scenes:x.scenes.total,queuedMedia:x.scenes.statusCounts.queued,batchId:batch.id},null,2));

db.close();
for(const suffix of['','-shm','-wal'])await rm(`${dbPath}${suffix}`,{force:true});
