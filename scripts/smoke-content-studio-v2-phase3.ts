import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const dbPath = `/tmp/vietnewsflow-content-studio-v2-phase3-${process.pid}.sqlite`;
process.env.DB_PATH = dbPath;
process.env.RENDER_QUEUE_PAUSED = 'true';

const core = await import('../src/studio/pipeline-v2.js');
const phase2 = await import('../src/studio/pipeline-v2-runtime.js');
const phase3 = await import('../src/studio/pipeline-v2-generation.js');
const { db } = await import('../src/storage/db.js');

const ownerId = 'phase3-smoke';
const project = core.createPipelineProject({
  ownerId,
  templateId: 'podcast-story',
  topic: 'Một câu chuyện nhỏ về sự lắng nghe',
  seriesName: 'Chuyện đời thường',
  episode: 3,
  script:
    'Buổi tối, cả nhà ngồi lại sau một ngày dài. Một người định đưa ra lời khuyên thật nhanh nhưng rồi chọn lắng nghe trước. ' +
    'Câu chuyện chậm lại, ai cũng có cơ hội nói rõ điều mình đang lo. Cuối cùng, điều khiến họ gần nhau hơn là cảm giác được lắng nghe.',
  outputIds: ['short-9x16', 'podcast', 'video-16x9'],
});
await phase2.preparePipelineProject(ownerId, project.id, { skipExternal: true });

const caps = phase3.generationCapabilities();
assert.equal(caps.find((x) => x.id === 'local-original-scene-card')?.status, 'ready');
assert.equal(caps.find((x) => x.id === 'ffmpeg-short-9x16')?.status, 'ready');
assert.equal(caps.find((x) => x.id === 'ffmpeg-landscape-16x9')?.status, 'ready');
assert.equal(caps.find((x) => x.id === 'podcast-audio-export')?.status, 'ready');

const batch = await phase3.enqueuePipelineGeneration({ ownerId, projectId: project.id });
assert.equal(batch.primaryOutputId, 'short-9x16');
assert.equal(batch.status, 'queued');
const short = batch.outputs.find((x) => x.outputId === 'short-9x16');
assert.equal(short?.status, 'queued');
assert.ok(short?.renderJobId);
const landscape = batch.outputs.find((x) => x.outputId === 'video-16x9');
const podcast = batch.outputs.find((x) => x.outputId === 'podcast');
assert.equal(landscape?.status, 'queued');
assert.equal(podcast?.status, 'queued');
assert.ok(landscape?.renderJobId);
assert.ok(podcast?.renderJobId);
assert.equal(landscape?.worker, 'ffmpeg-landscape-16x9');
assert.equal(podcast?.worker, 'tts-audio-export');

const again = await phase3.enqueuePipelineGeneration({ ownerId, projectId: project.id });
assert.equal(again.id, batch.id, 'must not duplicate active generation batch');

console.log(JSON.stringify({
  ok: true,
  projectId: project.id,
  batchId: batch.id,
  primary: batch.primaryOutputId,
  outputs: batch.outputs.map((x) => ({ id: x.outputId, status: x.status, worker: x.worker })),
  capabilities: caps.map((x) => ({ id: x.id, status: x.status })),
}, null, 2));

db.close();
for (const suffix of ['', '-shm', '-wal']) await rm(`${dbPath}${suffix}`, { force: true });
