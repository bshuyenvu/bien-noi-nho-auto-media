import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const dbPath = `/tmp/vietnewsflow-content-studio-v2-${process.pid}.sqlite`;
process.env.DB_PATH = dbPath;

const studio = await import('../src/studio/pipeline-v2.js');
const { db } = await import('../src/storage/db.js');

const templates = studio.listPipelineTemplates();
assert.ok(templates.length >= 5, 'template registry must expose reusable templates');
assert.ok(templates.some((x) => x.id === 'health-story' && x.medicalReviewRequired));

const project = studio.createPipelineProject({
  ownerId: 'smoke-owner',
  templateId: 'health-story',
  topic: 'Nhận biết sớm đột quỵ',
  seriesName: 'Chuyện Sức Khỏe Quanh Ta',
  episode: 2,
  sourceUrls: ['https://example.org/source'],
  outputIds: ['video-16x9', 'short-9x16', 'podcast', 'comic'],
  script:
    'Một buổi sáng, người thân nhận thấy chú Ba đột ngột nói khó và yếu một bên tay. ' +
    'Gia đình nhận ra đây có thể là dấu hiệu cảnh báo cần được đánh giá y tế khẩn cấp. ' +
    'Thông điệp chính là ghi nhớ các dấu hiệu bất thường xuất hiện đột ngột và tìm trợ giúp y tế phù hợp. ' +
    'Nội dung cuối cùng phải được kiểm tra y khoa trước khi xuất bản.',
});

assert.equal(project.plan.gates.research, 'required');
assert.equal(project.plan.gates.medicalReview, 'required');
assert.equal(project.plan.gates.copyrightReview, 'required');
assert.ok(project.plan.scenes.length >= 2, 'scene planner should split the script');
assert.ok(project.plan.outputs.some((x) => x.kind === 'comic'));
assert.equal(studio.getPipelineProject('smoke-owner', project.id)?.id, project.id);
assert.equal(studio.listPipelineProjects('smoke-owner').length, 1);
assert.equal(studio.getPipelineProject('other-owner', project.id), undefined, 'tenant isolation failed');

console.log(JSON.stringify({
  ok: true,
  version: project.plan.version,
  templates: templates.map((x) => x.id),
  projectId: project.id,
  scenes: project.plan.scenes.length,
  outputs: project.plan.outputs.map((x) => x.id),
  gates: project.plan.gates,
}, null, 2));

db.close();
await rm(dbPath, { force: true });
await rm(`${dbPath}-shm`, { force: true });
await rm(`${dbPath}-wal`, { force: true });
