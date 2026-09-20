import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const dbPath = `/tmp/vietnewsflow-content-studio-v2-phase2-${process.pid}.sqlite`;
process.env.DB_PATH = dbPath;

const core = await import('../src/studio/pipeline-v2.js');
const runtimeApi = await import('../src/studio/pipeline-v2-runtime.js');
const { db } = await import('../src/storage/db.js');

const ownerId = 'phase2-smoke';
const story = core.createPipelineProject({
  ownerId,
  templateId: 'podcast-story',
  topic: 'Một câu chuyện về sự lắng nghe trong gia đình',
  seriesName: 'Chuyện đời thường',
  episode: 1,
  script:
    'Buổi tối, cả nhà ngồi lại sau một ngày dài. Người cha định đưa ra lời khuyên ngay, nhưng rồi ông chọn lắng nghe. ' +
    'Câu chuyện chậm lại khi mỗi người nói rõ điều mình đang lo. Cuối cùng, điều giúp họ gần nhau hơn không phải là một câu trả lời thật lớn, mà là cảm giác được lắng nghe.',
  outputIds: ['podcast', 'video-16x9', 'short-9x16'],
});

const prepared = await runtimeApi.preparePipelineProject(ownerId, story.id, { skipExternal: true });
assert.equal(prepared.research.status, 'not_required');
assert.equal(prepared.reviews.medical, 'not_required');
assert.equal(prepared.generationAllowed, true);
assert.ok(prepared.characterBible.cast.length >= 1);
assert.ok(prepared.scenePrompts.length >= 2);
assert.ok(prepared.shotPlan.scenes.length >= 1);
assert.ok(prepared.composePlan.some((x) => x.kind === 'podcast'));

const handoff = runtimeApi.buildGenerationHandoff(ownerId, story.id);
assert.equal(handoff.version, 'generation-handoff-v1');
assert.equal(handoff.mediaStrategy.primary, 'generated-original');
assert.equal(handoff.mediaStrategy.externalAutoUse, false);

const health = core.createPipelineProject({
  ownerId,
  templateId: 'health-story',
  topic: 'Nhận biết sớm đột quỵ',
  seriesName: 'Chuyện Sức Khỏe Quanh Ta',
  episode: 2,
  script:
    'Một người trong gia đình đột ngột nói khó và yếu một bên tay. Những thay đổi xuất hiện đột ngột như vậy cần được xem là dấu hiệu cảnh báo. ' +
    'Gia đình cần tìm trợ giúp y tế khẩn cấp và ghi nhận thời điểm triệu chứng bắt đầu. Nội dung này phải được bác sĩ kiểm tra trước khi phát hành.',
});

const healthPrepared = await runtimeApi.preparePipelineProject(ownerId, health.id, { skipExternal: true });
assert.equal(healthPrepared.research.status, 'review');
assert.equal(healthPrepared.reviews.medical, 'pending');
assert.equal(healthPrepared.generationAllowed, false);
assert.throws(
  () => runtimeApi.buildGenerationHandoff(ownerId, health.id),
  /Generation Gate chưa mở/,
);

console.log(JSON.stringify({
  ok: true,
  storyProjectId: story.id,
  healthProjectId: health.id,
  characterBible: prepared.characterBible.version,
  styleBible: prepared.styleBible.version,
  scenes: prepared.scenePrompts.length,
  shotCraft: prepared.shotPlan.version,
  voice: prepared.voicePlan.voice,
  outputs: prepared.composePlan.map((x) => x.id),
  healthGate: {
    research: healthPrepared.research.status,
    medical: healthPrepared.reviews.medical,
    generationAllowed: healthPrepared.generationAllowed,
  },
}, null, 2));

db.close();
for (const suffix of ['', '-shm', '-wal']) await rm(`${dbPath}${suffix}`, { force: true });
