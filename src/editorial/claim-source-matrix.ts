import { createHash } from 'node:crypto';
import type { SourceIntelligence } from './source-intelligence.js';

export interface CorroborationSource { name:string; title:string; summary?:string; url?:string }
export interface ClaimSourceRef { role:'primary'|'corroborating'; sourceIndex?:number; name?:string; title?:string; url?:string; excerpt?:string }
export interface ClaimSourceEntry {
  claimId:string; kind:string; text:string; confidence:number; support:string;
  primarySource:ClaimSourceRef; corroboratingSources:ClaimSourceRef[];
  reportedCorroborationCount:number; mappingComplete:boolean; requiresReview:boolean;
}
export interface ClaimSourceMatrix {
  sourceIntelligenceId:string; primarySource:ClaimSourceRef; entries:ClaimSourceEntry[];
  claimCount:number; mappedCorroboratedClaimCount:number; unmappedCorroboratedClaimCount:number;
  uncertainClaimCount:number; createdAt:string;
}

const idFor=(intelId:string,index:number,text:string)=>createHash('sha256').update(`${intelId}:${index}:${text}`).digest('hex').slice(0,20);

export function buildClaimSourceMatrix(intelligence:SourceIntelligence,corroboration:CorroborationSource[]=[]):ClaimSourceMatrix{
  const primary:ClaimSourceRef={role:'primary',name:intelligence.sourceName,title:intelligence.originalTitle,url:intelligence.sourceUrl};
  const entries=(intelligence.facts||[]).map((fact,index)=>{
    const indexes=[...new Set((fact.corroboratingSourceIndexes||[]).filter(x=>Number.isInteger(x)&&x>=1&&x<=corroboration.length))];
    const refs=indexes.map(sourceIndex=>{const source=corroboration[sourceIndex-1];return{role:'corroborating' as const,sourceIndex,name:source.name,title:source.title,url:source.url}});
    const reported=Math.max(0,Number(fact.corroboratedBy)||0);
    const mappingComplete=fact.support!=='corroborated'||(reported>0&&refs.length>=reported);
    return {
      claimId:idFor(intelligence.id,index,fact.text),kind:fact.kind,text:fact.text,confidence:Number(fact.confidence||0),support:fact.support,
      primarySource:{...primary,excerpt:fact.sourceExcerpt},corroboratingSources:refs,reportedCorroborationCount:reported,
      mappingComplete,requiresReview:fact.support==='uncertain'||Number(fact.confidence||0)<0.6||!mappingComplete,
    } satisfies ClaimSourceEntry;
  });
  return {
    sourceIntelligenceId:intelligence.id,primarySource:primary,entries,claimCount:entries.length,
    mappedCorroboratedClaimCount:entries.filter(x=>x.support==='corroborated'&&x.mappingComplete).length,
    unmappedCorroboratedClaimCount:entries.filter(x=>x.support==='corroborated'&&!x.mappingComplete).length,
    uncertainClaimCount:entries.filter(x=>x.support==='uncertain'||x.confidence<0.55).length,createdAt:new Date().toISOString(),
  };
}
