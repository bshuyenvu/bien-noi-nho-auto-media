import { prepareAutoNews } from '../producer/auto.js';
import { sourceCoherenceScore } from '../import/url.js';
import { auditHealthEditorial } from './safety.js';
import type { ScriptLength } from '../ai/editor.js';

export interface HealthStudioInput{
  ownerId:string;
  primaryUrl:string;
  topic?:string;
  length?:ScriptLength;
  format?:'latest'|'standard';
  audience?:'general'|'medical'|'patient'|'social';
}

export async function prepareHealthStudio(input:HealthStudioInput){
  const length=input.length||'60',format=input.format||'standard',audience=input.audience||'general';
  const prepared=await prepareAutoNews({
    ownerId:input.ownerId,url:input.primaryUrl,length,format,audience,
  });
  const healthSafety=auditHealthEditorial({
    title:prepared.edited.headline,script:prepared.edited.script,
    facts:prepared.intelligence.facts,audience,
  });
  const topic=(input.topic||'').trim();
  const topicMatch=topic?sourceCoherenceScore(topic,`${prepared.edited.headline} ${prepared.edited.script}`):1;
  const topicGate=topicMatch>=.35?'pass':topicMatch>=.18?'review':'block';
  const readyForDraft=healthSafety.status!=='block'&&topicGate!=='block'&&prepared.evidenceGate.status!=='block'&&prepared.copyrightSafety.originality.safe;
  const sourceName=prepared.article.sourceName||prepared.research.sources.map(x=>x.name).filter(Boolean).join(' • ').slice(0,120)||undefined;
  const draftPayload=readyForDraft?{
    title:prepared.edited.headline,
    body:prepared.edited.script,
    sourceUrl:prepared.article.sourceUrl,
    sourceName,
    format,
    evidenceBundleId:prepared.evidenceBundleId,
    mediaProvenance:[],
  }:undefined;
  return{
    ...prepared,
    stage:readyForDraft?'draft-ready':'blocked',
    healthStudio:{version:'1.0',topic:topic||prepared.edited.headline,audience,topicMatch:Number(topicMatch.toFixed(3)),topicGate,healthSafety,readyForDraft,medicalReviewRequired:true,visualPolicy:'original-cards-or-rights-verified-media'},
    draftPayload,
  };
}
