import assert from 'node:assert/strict';
import { evaluateSourceEvidence } from '../src/editorial/evidence-gate.js';
import type { SourceIntelligence } from '../src/editorial/source-intelligence.js';

function base(overrides: Partial<SourceIntelligence> = {}): SourceIntelligence {
  const now = new Date().toISOString();
  return {
    id: 'intel-test',
    ownerId: 'owner-test',
    sourceUrl: 'https://example.com/news',
    sourceName: 'Example',
    originalTitle: 'Example story',
    bodyHash: 'hash',
    language: { code: 'en', name: 'English', confidence: 0.99, script: 'latin', isVietnamese: false },
    translationStatus: 'translated',
    vietnameseTitle: 'Bản tin thử nghiệm',
    vietnameseBrief: 'Nội dung đã được chuẩn hóa sang tiếng Việt.',
    facts: [
      { kind: 'event', text: 'Sự kiện đã xảy ra.', confidence: 0.9, corroboratedBy: 2, support: 'corroborated' },
      { kind: 'number', text: 'Số liệu được xác nhận.', confidence: 0.88, corroboratedBy: 1, support: 'corroborated' },
    ],
    uncertainties: [],
    warnings: [],
    authorityScore: 95,
    freshnessScore: 95,
    sourceScore: 92,
    corroborationCount: 2,
    provider: 'gemini',
    readyForEditorial: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const pass = evaluateSourceEvidence(base());
assert.equal(pass.status, 'pass');
assert.ok(pass.score >= 72);
assert.equal(pass.corroboratedClaimCount, 2);

const review = evaluateSourceEvidence(base({
  sourceUrl: 'https://local.example.vn/story',
  authorityScore: 72,
  freshnessScore: 65,
  sourceScore: 60,
  corroborationCount: 0,
  facts: [{ kind: 'event', text: 'Một nguồn duy nhất đưa tin.', confidence: 0.75, corroboratedBy: 0, support: 'primary' }],
}));
assert.equal(review.status, 'review');
assert.ok(review.reasons.some((x) => x.includes('đối chiếu')));

const blockedTranslation = evaluateSourceEvidence(base({
  translationStatus: 'pending',
  readyForEditorial: false,
  vietnameseBrief: '',
}));
assert.equal(blockedTranslation.status, 'block');

const blockedClaims = evaluateSourceEvidence(base({
  authorityScore: 45,
  sourceScore: 40,
  corroborationCount: 0,
  facts: [{ kind: 'context', text: 'Claim chưa chắc chắn.', confidence: 0.35, corroboratedBy: 0, support: 'uncertain' }],
  uncertainties: ['Chưa xác minh độc lập.'],
}));
assert.equal(blockedClaims.status, 'block');
assert.equal(blockedClaims.supportedClaimCount, 0);

console.log('Evidence Gate smoke OK', {
  pass: pass.score,
  review: review.score,
  block: blockedClaims.score,
});
