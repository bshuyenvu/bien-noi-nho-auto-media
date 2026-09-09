import { importArticleFromUrl } from '../import/url.js';
import { editNews, type ScriptLength } from '../ai/editor.js';
import { analyzeMediaStudio } from '../media/studio.js';
import { directScenes } from '../video/scenes.js';
import { matchImagesToScenes } from '../video/matching.js';
import { castVietnameseVoice } from '../tts/casting.js';
import { findForeignSources } from '../research/foreign.js';
import { analyzeSourceIntelligence } from '../editorial/source-intelligence.js';
import { evaluateSourceEvidence } from '../editorial/evidence-gate.js';
import { all } from '../storage/db.js';

function effectiveOwnerId(ownerId?: string) {
  return ownerId || all<{ id: string }>("SELECT id FROM accounts WHERE role='admin' AND status='active' ORDER BY created_at LIMIT 1")[0]?.id || 'legacy-admin';
}

export async function prepareAutoNews(input: {
  ownerId?: string;
  url: string;
  length: ScriptLength;
  format: 'breaking' | 'latest' | 'standard';
  fallback?: { title: string; summary?: string; sourceName?: string; imageUrl?: string };
}) {
  const ownerId = effectiveOwnerId(input.ownerId);
  let article;
  try {
    article = await importArticleFromUrl(input.url);
  } catch (error) {
    const summary = input.fallback?.summary?.trim() || '';
    if (summary.length < 120) throw error;
    article = {
      title: input.fallback!.title,
      body: summary,
      sourceName: input.fallback?.sourceName,
      sourceUrl: input.url,
      imageUrl: input.fallback?.imageUrl,
      imageUrls: input.fallback?.imageUrl ? [input.fallback.imageUrl] : [],
      language: undefined,
      publishedAt: undefined,
    };
  }

  const research = await findForeignSources(article.title, 3);
  const intelligence = await analyzeSourceIntelligence({
    ownerId,
    sourceUrl: article.sourceUrl,
    sourceName: article.sourceName,
    title: article.title,
    body: article.body,
    languageHint: article.language,
    publishedAt: article.publishedAt,
    corroboration: research.sources.map((x) => ({ name: x.name, title: x.title, summary: x.summary, url: x.url })),
  });
  if (!intelligence.readyForEditorial) {
    throw new Error('Nguồn chưa sẵn sàng cho biên tập tiếng Việt: ' + intelligence.warnings.join(' | '));
  }

  const evidenceGate = evaluateSourceEvidence(intelligence);
  if (evidenceGate.status === 'block') {
    throw new Error('Evidence Gate chặn Editorial: ' + evidenceGate.reasons.join(' | '));
  }

  const factBasis = intelligence.facts
    .filter((x) => x.support !== 'uncertain' && Number(x.confidence || 0) >= 0.6)
    .slice(0, 14)
    .map((x) => x.text)
    .filter(Boolean);
  const editorialBody = [
    intelligence.vietnameseBrief,
    factBasis.length ? 'DỮ KIỆN ĐÃ KHÓA:\n- ' + factBasis.join('\n- ') : '',
    evidenceGate.status === 'review' ? 'LƯU Ý BIÊN TẬP: Evidence Gate yêu cầu kiểm tra thủ công các claim và nguồn đối chiếu trước khi duyệt.' : '',
  ].filter(Boolean).join('\n\n');

  const sourceName = [article.sourceName, ...research.sources.map((x) => x.name)].filter(Boolean).join(' • ').slice(0, 120);
  const edited = await editNews({ title: intelligence.vietnameseTitle, body: editorialBody, sourceName, length: input.length });
  const studio = await analyzeMediaStudio({
    sourceUrl: article.sourceUrl,
    imageUrl: article.imageUrl,
    imageUrls: [...(article.imageUrls || []), ...research.imageUrls].slice(0, 19),
  });
  const chosen = studio.candidates.filter((x) => x.selected && x.url).slice(0, 10);
  const images = chosen.map((x) => ({
    url: x.url!,
    label: [x.metadata.caption, ...(x.metadata.keywords || [])].join(' '),
    score: x.score,
  }));
  let scenes = directScenes(`${edited.headline}. ${edited.script}`, Math.max(1, images.length));
  if (images.length) scenes = matchImagesToScenes(scenes, images);
  const voice = castVietnameseVoice({ title: edited.headline, text: edited.script, format: input.format });

  return {
    stage: 'review' as const,
    article: {
      sourceUrl: article.sourceUrl,
      sourceName: article.sourceName,
      originalTitle: article.title,
      language: article.language,
    },
    intelligence: {
      id: intelligence.id,
      language: intelligence.language,
      translationStatus: intelligence.translationStatus,
      sourceScore: intelligence.sourceScore,
      authorityScore: intelligence.authorityScore,
      freshnessScore: intelligence.freshnessScore,
      corroborationCount: intelligence.corroborationCount,
      provider: intelligence.provider,
      facts: intelligence.facts,
      uncertainties: intelligence.uncertainties,
      warnings: intelligence.warnings,
      readyForEditorial: intelligence.readyForEditorial,
    },
    evidenceGate,
    research: { sources: research.sources.map((x) => ({ name: x.name, url: x.url, title: x.title })), count: research.sources.length },
    edited,
    media: { images: chosen.map((x) => ({ url: x.url, score: x.score, width: x.width, height: x.height, metadata: x.metadata })), summary: studio.summary },
    scenes,
    voice,
    reviewRequired: true,
  };
}
