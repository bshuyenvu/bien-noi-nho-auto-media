import { createHash } from 'node:crypto';
import type { SourceFact, FactKind } from './source-intelligence.js';

export type AudienceProfile='general'|'medical'|'investor'|'patient'|'social';
export type StoryAngle='direct'|'impact'|'explainer'|'human'|'number'|'risk'|'timeline';
export type NarrativePattern='breaking'|'explainer'|'analysis'|'story';
export interface RankedClaim{claimId:string;fact:SourceFact;score:number;mandatory:boolean;reason:string[]}
export interface StoryBlueprint{
 title:string;audience:AudienceProfile;angle:StoryAngle;narrative:NarrativePattern;centralQuestion:string;
 openingClaimId:string;requiredClaimIds:string[];supportingClaimIds:string[];omittedClaimIds:string[];
 rankedClaims:RankedClaim[];recommendedSeconds:45|60|90|120;complexity:'low'|'medium'|'high';
}

const KIND_WEIGHT:Record<FactKind,number>={event:100,effect:95,number:92,cause:90,advice:88,time:82,place:80,person:78,context:68,quote:62};
const supportWeight=(f:SourceFact)=>f.support==='corroborated'?10:f.support==='primary'?5:-18;
const claimId=(f:SourceFact,i:number)=>'C'+String(i+1).padStart(2,'0')+'-'+createHash('sha1').update(f.kind+'|'+f.text).digest('hex').slice(0,6);
function words(s:string){return s.trim().split(/\s+/).filter(Boolean)}
function angleScore(kind:StoryAngle,claims:RankedClaim[]){const has=(k:FactKind)=>claims.some(c=>c.fact.kind===k&&c.score>=68);const top=claims[0]?.score||0;switch(kind){case'impact':return(has('effect')?28:0)+(has('advice')?18:0)+top*.6;case'explainer':return(has('cause')?32:0)+(has('context')?12:0)+top*.58;case'human':return(has('person')?30:0)+(has('effect')?12:0)+top*.56;case'number':return(has('number')?30:0)+top*.57;case'risk':return(has('advice')?28:0)+(has('effect')?16:0)+top*.57;case'timeline':return(has('time')?25:0)+(has('event')?12:0)+top*.55;default:return top*.72+12}}
function centralQuestion(angle:StoryAngle,title:string){switch(angle){case'impact':return'Sự việc này tác động thế nào và ai chịu ảnh hưởng?';case'explainer':return'Vì sao diễn biến này xảy ra và điều gì giải thích nó?';case'human':return'Con người trong sự việc này đang chịu tác động ra sao?';case'number':return'Con số nào cho thấy quy mô thực sự của sự việc?';case'risk':return'Rủi ro chính là gì và cần lưu ý điều gì?';case'timeline':return'Diễn biến xảy ra theo trình tự nào?';default:return`Điều gì quan trọng nhất trong: ${title}?`}}
function narrativeFor(angle:StoryAngle):NarrativePattern{return angle==='explainer'?'explainer':angle==='human'?'story':angle==='impact'||angle==='risk'?'analysis':'breaking'}
export function rankNewsClaims(facts:SourceFact[],sourceScore=75){return facts.map((fact,i)=>{const reason:string[]=[];const base=KIND_WEIGHT[fact.kind]||65,confidence=Math.round(Math.max(0,Math.min(1,fact.confidence||0))*100),support=supportWeight(fact);let score=Math.round(base*.52+confidence*.2+Math.max(0,Math.min(100,sourceScore))*.16+support);if(fact.kind==='event')score+=7;if(fact.support==='uncertain')reason.push('uncertain');if(fact.support==='corroborated')reason.push('corroborated');if(/\b\d+(?:[.,]\d+)?\b/.test(fact.text))score+=3;score=Math.max(0,Math.min(100,score));const mandatory=fact.support!=='uncertain'&&(score>=78||fact.kind==='event');if(mandatory)reason.push('must-cover');reason.push(`kind:${fact.kind}`);return{claimId:claimId(fact,i),fact,score,mandatory,reason} satisfies RankedClaim}).sort((a,b)=>b.score-a.score)}
export function buildStoryBlueprint(input:{title:string;brief?:string;facts:SourceFact[];sourceScore?:number;audience?:AudienceProfile}){
 const rankedClaims=rankNewsClaims(input.facts,input.sourceScore),angles=(['direct','impact','explainer','human','number','risk','timeline'] as StoryAngle[]).map(angle=>({angle,score:angleScore(angle,rankedClaims)})).sort((a,b)=>b.score-a.score),angle=angles[0]?.angle||'direct';
 const required=rankedClaims.filter(x=>x.mandatory).slice(0,8),supporting=rankedClaims.filter(x=>!x.mandatory&&x.fact.support!=='uncertain'&&x.score>=58).slice(0,6),omitted=rankedClaims.filter(x=>!required.includes(x)&&!supporting.includes(x));
 const totalWords=[...required,...supporting.slice(0,2)].reduce((n,x)=>n+words(x.fact.text).length,0),complexity=required.length>=7||totalWords>170?'high':required.length>=4||totalWords>95?'medium':'low';
 const recommendedSeconds:45|60|90|120=required.length<=3&&totalWords<90?45:required.length<=5&&totalWords<145?60:required.length<=7&&totalWords<225?90:120;
 return{title:input.title,audience:input.audience||'general',angle,narrative:narrativeFor(angle),centralQuestion:centralQuestion(angle,input.title),openingClaimId:(required[0]||rankedClaims[0])?.claimId||'',requiredClaimIds:required.map(x=>x.claimId),supportingClaimIds:supporting.map(x=>x.claimId),omittedClaimIds:omitted.map(x=>x.claimId),rankedClaims,recommendedSeconds,complexity} satisfies StoryBlueprint;
}
