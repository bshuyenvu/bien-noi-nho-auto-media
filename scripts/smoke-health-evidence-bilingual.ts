import assert from 'node:assert/strict';
import { medicalTopicEntityMatch,normalizeResearchUrl,researchSourceAuthority } from '../src/research/health.js';

assert.equal(
  medicalTopicEntityMatch('Chú Tư tưởng chỉ đầy hơi – nhưng đó lại là cơn nhồi máu cơ tim','Heart attack warning signs can include chest discomfort. Myocardial infarction is a medical emergency.'),
  true,
);
assert.equal(
  medicalTopicEntityMatch('Dấu hiệu tăng huyết áp','High blood pressure is also called hypertension.'),
  true,
);
assert.equal(
  medicalTopicEntityMatch('Dấu hiệu đột quỵ','Stroke signs and symptoms require urgent assessment.'),
  true,
);
assert.equal(
  medicalTopicEntityMatch('Nhồi máu cơ tim','Seasonal influenza vaccination guidance.'),
  false,
);
assert.equal(
  normalizeResearchUrl('https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack?utm_source=chatgpt.com&utm_medium=test#top'),
  'https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack',
);
assert.equal(researchSourceAuthority('https://www.nhlbi.nih.gov/health/heart-attack'),98);
assert.equal(researchSourceAuthority('https://www.cdc.gov/heart-disease/about/heart-attack.html'),98);
assert.equal(researchSourceAuthority('https://www.heart.org/en/health-topics/heart-attack/'),96);

console.log('Bilingual medical evidence matching + URL normalization smoke OK');
