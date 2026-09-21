import assert from 'node:assert/strict';
import { buildPipelinePlan } from '../src/studio/pipeline-v2.js';
import { smartScenePlan } from '../src/studio/pipeline-v2-smart.js';

const explainer=buildPipelinePlan({
  templateId:'topic-explainer',
  topic:'Vì sao cache giúp website nhanh hơn?',
  script:'Cache lưu lại dữ liệu thường dùng để giảm số lần truy vấn. Khi người dùng gửi yêu cầu mới, hệ thống có thể trả dữ liệu đã lưu thay vì xử lý lại từ đầu. Điều này giúp giảm độ trễ và tải cho máy chủ.',
  sourceUrls:[],
});
assert.equal(explainer.template.id,'topic-explainer');
assert.equal(explainer.gates.research,'optional');
assert.equal(explainer.gates.medicalReview,'optional');
assert.ok(explainer.outputs.some(x=>x.id==='short-9x16'));

const medicalCompare=buildPipelinePlan({
  templateId:'knowledge-compare',
  topic:'Troponin I vs Troponin T',
  script:'Troponin I và Troponin T đều là dấu ấn sinh học tim nhưng khác nhau về xét nghiệm, động học và bối cảnh sử dụng. Cần diễn giải kết quả cùng triệu chứng, điện tâm đồ và thời điểm lấy mẫu.',
  sourceUrls:['https://example.org/reference'],
});
assert.equal(medicalCompare.gates.research,'required');
assert.equal(medicalCompare.gates.medicalReview,'required');

const urlStory=buildPipelinePlan({
  templateId:'url-story',
  topic:'Một dự án mã nguồn mở mới',
  script:'Dự án giới thiệu một công cụ mới và mô tả cách sử dụng, các thành phần chính, điểm mạnh và các giới hạn cần lưu ý trước khi triển khai thực tế.',
  sourceUrls:['https://github.com/example/example'],
});
assert.equal(urlStory.template.inputMode,'url');
assert.equal(urlStory.gates.medicalReview,'optional');

const compareScene=smartScenePlan({
  beat:'development',
  narration:'Điểm khác nhau là A tối ưu tốc độ, trong khi B ưu tiên độ chính xác.',
  topic:'A vs B',
  templateId:'knowledge-compare',
});
assert.equal(compareScene.intent,'compare');
assert.equal(compareScene.renderer,'hyperframes');
assert.equal(compareScene.layout,'split-comparison');
assert.ok(compareScene.subtitleChunks.length>=1);

const statScene=smartScenePlan({
  beat:'evidence',
  narration:'Trong nghiên cứu, tỷ lệ cải thiện đạt 42%.',
  topic:'Hiệu quả can thiệp',
  templateId:'topic-explainer',
  evidenceRequired:true,
});
assert.equal(statScene.intent,'evidence');
assert.equal(statScene.renderer,'hyperframes');
assert.ok(statScene.estimatedDurationSec>1);

const storyScene=smartScenePlan({
  beat:'development',
  narration:'Một buổi sáng, nhân vật bước vào phòng và bắt đầu câu chuyện.',
  topic:'Câu chuyện đời thường',
  templateId:'podcast-story',
});
assert.equal(storyScene.renderer,'ffmpeg');
assert.equal(storyScene.layout,'cinematic');

console.log(JSON.stringify({
  ok:true,
  templates:['topic-explainer','url-story','knowledge-compare'],
  medicalDynamicGate:medicalCompare.gates,
  compareRenderer:compareScene.renderer,
  subtitleChunks:compareScene.subtitleChunks,
},null,2));
