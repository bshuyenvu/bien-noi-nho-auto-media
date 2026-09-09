import type { SourceFact, SourceIntelligence } from './source-intelligence.js';

export type EvidenceGateStatus = 'pass' | 'review' | 'block';

export interface EvidenceGateResult {
  status: EvidenceGateStatus;
  score: number;
  claimCount: number;
  supportedClaimCount: number;
  corroboratedClaimCount: number;
  uncertainClaimCount: number;
  effectiveCorroborationScore: number;
  reasons: string[];
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function factEvidenceScore(facts: SourceFact[]) {
  if (!facts.length) return 0;
  const total = facts.reduce((sum, fact) => {
    const confidence = clamp(Number(fact.confidence || 0) * 100);
    const supportWeight = fact.support === 'corroborated' ? 1 : fact.support === 'uncertain' ? 0.15 : 0.78;
    return sum + confidence * supportWeight;
  }, 0);
  return clamp(total / facts.length);
}

export function evaluateSourceEvidence(intelligence: SourceIntelligence): EvidenceGateResult {
  const facts = intelligence.facts || [];
  const supported = facts.filter((fact) => fact.support !== 'uncertain' && Number(fact.confidence || 0) >= 0.6);
  const corroborated = facts.filter((fact) => fact.support === 'corroborated' && Number(fact.corroboratedBy || 0) > 0);
  const uncertain = facts.filter((fact) => fact.support === 'uncertain' || Number(fact.confidence || 0) < 0.55);

  const effectiveCorroborationScore = corroborated.length
    ? clamp((intelligence.corroborationCount || 0) * 24 + corroborated.length * 14)
    : 0;
  const claimsScore = factEvidenceScore(facts);
  const uncertaintyPenalty = Math.min(24, uncertain.length * 5 + (intelligence.uncertainties?.length || 0) * 3);
  const score = Math.round(clamp(
    intelligence.authorityScore * 0.30 +
      intelligence.freshnessScore * 0.15 +
      intelligence.sourceScore * 0.25 +
      effectiveCorroborationScore * 0.20 +
      claimsScore * 0.10 -
      uncertaintyPenalty,
  ));

  const reasons: string[] = [];
  if (!intelligence.readyForEditorial || intelligence.translationStatus === 'pending') {
    reasons.push('Nguồn chưa vượt Source Intelligence gate hoặc chưa Việt hóa đầy đủ.');
    return {
      status: 'block',
      score,
      claimCount: facts.length,
      supportedClaimCount: supported.length,
      corroboratedClaimCount: corroborated.length,
      uncertainClaimCount: uncertain.length,
      effectiveCorroborationScore,
      reasons,
    };
  }
  if (!facts.length) reasons.push('Không có fact cụ thể để khóa trước Editorial.');
  if (facts.length && !supported.length) reasons.push('Không có claim đạt ngưỡng confidence tối thiểu 0,60.');
  if (!corroborated.length) reasons.push('Chưa có claim nào được xác nhận bởi nguồn đối chiếu độc lập.');
  if (uncertain.length) reasons.push(`${uncertain.length} claim cần thận trọng vì confidence thấp hoặc còn bất định.`);
  if ((intelligence.uncertainties?.length || 0) > 0) reasons.push(`${intelligence.uncertainties.length} điểm bất định đang được giữ ngoài fact list.`);
  if (intelligence.authorityScore < 60 && intelligence.corroborationCount === 0) reasons.push('Nguồn có authority thấp và chưa có đối chiếu độc lập.');

  let status: EvidenceGateStatus;
  if (!facts.length || !supported.length || (intelligence.authorityScore < 50 && intelligence.corroborationCount === 0) || score < 48) {
    status = 'block';
  } else if (
    score >= 72 &&
    uncertain.length <= Math.max(1, Math.floor(facts.length * 0.25)) &&
    (corroborated.length > 0 || intelligence.authorityScore >= 92)
  ) {
    status = 'pass';
  } else {
    status = 'review';
  }

  if (status === 'pass') reasons.unshift('Evidence đủ mạnh để chuyển sang Editorial, vẫn phải qua Durable Review Gate trước render/publish.');
  if (status === 'review') reasons.unshift('Evidence chưa đủ mạnh để tự tin hoàn toàn; cho phép tạo draft nhưng bắt buộc người vận hành kiểm tra nguồn/claim.');
  if (status === 'block') reasons.unshift('Evidence không đạt ngưỡng tối thiểu; không chuyển nội dung sang Editorial.');

  return {
    status,
    score,
    claimCount: facts.length,
    supportedClaimCount: supported.length,
    corroboratedClaimCount: corroborated.length,
    uncertainClaimCount: uncertain.length,
    effectiveCorroborationScore,
    reasons: [...new Set(reasons)].slice(0, 8),
  };
}
