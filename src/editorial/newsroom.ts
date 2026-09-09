import { createHash } from 'node:crypto';
import type { SourceFact, FactKind } from './source-intelligence.js';

export type AudienceProfile='general'|'medical'|'investor'|'patient'|'social';
export type StoryAngle='direct'|'impact'|'explainer'|'human'|'number'|'risk'|'timeline';
export type NarrativePattern='breaking'|'explainer'|'analysis'|'story';
export interface RankedClaim{claimId:string;fact:SourceFact;score:number;mandatory:boolean;reason:string[]}
export interface StoryBlueprint{
 title:string;topic:string;audience:AudienceProfile;angle:StoryAngle;narrative:NarrativePattern;centralQuestion:string;
 openingClaimId:string;requiredClaimIds:string[];supportingClaimIds:string[];omittedClaimIds:string[];
 rankedClaims:RankedClaim[];recommendedSeconds:45|60|90|120;complexity:'low'|'medium'|'high';angleReason:string[];
}

const KIND_WEIGHT:Record<FactKind,number>={event:100,effect:95,advice:92,cause:90,number:88,time:82,place:80,person:78,context:72,quote:62};
const supportWeight=(f:SourceFact)=>f.support==='corroborated'?10:f.support==='primary'?5:-18;
const claimId=(f:SourceFact,i:number)=>'C'+String(i+1).padStart(2,'0')+'-'+createHash('sha1').update(f.kind+'|'+f.text).digest('hex').slice(0,6);
const norm=(s:string)=>s.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
function words(s:string){return s.trim().split(/\s+/).filter(Boolean)}

export function storyTopic(title:string){
 const clean=title.replace(/[“”"'‘’]/g,'').replace(/\s+/g,' ').trim();
 const childImmunity=clean.match(/(trẻ.{0,28}sức đề kháng)/i)?.[1];if(childImmunity)return childImmunity.trim();
 const about=clean.match(/\bvề\s+(.+?)(?=\s+(?:dễ|khiến|có thể|và|nhưng|trước|sau|:|-)|$)/i)?.[1];
 if(about&&words(about).length<=7)return about.trim();
 const after=clean.replace(/^(?:những|các|một số|sự thật|hiểu lầm|cảnh báo|dấu hiệu|nguy cơ|rủi ro)\s+/i,'');
 return words(after).slice(0,7).join(' ')||clean;
}
function countKind(claims:RankedClaim[],kind:FactKind){return claims.filter(c=>c.fact.kind===kind&&c.score>=62).length}
function angleScore(kind:StoryAngle,claims:RankedClaim[],title:string,brief:string,audience:AudienceProfile){
 const titleText=norm(title),leadText=norm(title+' '+brief.slice(0,420)),top=claims[0]?.score||0;
 const n=(k:FactKind)=>countKind(claims,k),has=(k:FactKind)=>n(k)>0;
 const explainSignal=/hieu lam|su that|vi sao|giai thich|nguyen nhan|co phai|an gi|nen lam gi|cach nao|myth|misconception/.test(leadText);
 const riskSignal=/canh bao|nguy co|rui ro|bo qua|dau hieu|trieu chung|khuyen cao|an toan|ung thu|tu vong|bien chung/.test(titleText);
 const impactSignal=/anh huong|tac dong|khien|he qua|hau qua/.test(leadText);
 const titleHasNumber=/\d|%|triệu|tỷ|million|billion/i.test(title);
 switch(kind){
  case'impact':return(has('effect')?28:0)+(has('advice')?10:0)+(impactSignal?22:0)+top*.48;
  case'explainer':return(has('cause')?24:0)+(has('context')?16:0)+(explainSignal?55:0)+(riskSignal?6:0)+top*.46;
  case'human':return(has('person')?34:0)+(has('effect')?12:0)+top*.45;
  case'number':return(titleHasNumber?34:n('number')>=3?12:n('number')?4:0)+(explainSignal||riskSignal&&!titleHasNumber?-12:0)+top*.38;
  case'risk':return(has('advice')?15:0)+(has('effect')?12:0)+(riskSignal?35:0)-(explainSignal?8:0)+((audience==='patient'||audience==='medical')?8:0)+top*.42;
  case'timeline':return(has('time')?28:0)+(has('event')?10:0)+top*.42;
  default:return top*.58+(has('event')?18:0)-(explainSignal||riskSignal?10:0)
 }
}
function centralQuestion(angle:StoryAngle,title:string,brief:string){
 const topic=storyTopic(title),medical=/ung thư|bệnh|sức khỏe|triệu chứng|dấu hiệu|điều trị|thuốc/i.test(title+' '+brief);
 switch(angle){
  case'impact':return`${topic} tác động cụ thể đến ai và theo cách nào?`;
  case'explainer':return`Điều gì cần được hiểu đúng về ${topic}?`;
  case'human':return`${topic} đang ảnh hưởng đến con người ra sao?`;
  case'number':return`Con số nào thực sự quan trọng khi nói về ${topic}?`;
  case'risk':return medical?`Điều gì về ${topic} dễ bị hiểu sai hoặc bỏ qua?`:`Rủi ro nào quanh ${topic} cần được nhìn rõ?`;
  case'timeline':return`${topic} diễn biến theo trình tự nào?`;
  default:return`Thông tin cốt lõi về ${topic} là gì?`
 }
}
function narrativeFor(angle:StoryAngle):NarrativePattern{return angle==='explainer'?'explainer':angle==='human'?'story':angle==='impact'||angle==='risk'?'analysis':'breaking'}
export function rankNewsClaims(facts:SourceFact[],sourceScore=75){
 return facts.map((fact,i)=>{
  const reason:string[]=[],base=KIND_WEIGHT[fact.kind]||65;
  const confidence=Math.round(Math.max(0,Math.min(1,fact.confidence||0))*100),support=supportWeight(fact);
  let score=Math.round(base*.52+confidence*.2+Math.max(0,Math.min(100,sourceScore))*.16+support);
  if(fact.kind==='event')score+=7;
  if(fact.support==='uncertain')reason.push('uncertain');
  if(fact.support==='corroborated')reason.push('corroborated');
  if(fact.kind==='number'&&/\d|%/.test(fact.text))score+=4;
  score=Math.max(0,Math.min(100,score));
  const mandatory=fact.support!=='uncertain'&&(score>=86||fact.kind==='event');
  if(mandatory)reason.push('must-cover');reason.push(`kind:${fact.kind}`);
  return{claimId:claimId(fact,i),fact,score,mandatory,reason} satisfies RankedClaim
 }).sort((a,b)=>b.score-a.score)
}
export function buildStoryBlueprint(input:{title:string;brief?:string;facts:SourceFact[];sourceScore?:number;audience?:AudienceProfile}){
 const brief=input.brief||'',audience=input.audience||'general',rankedClaims=rankNewsClaims(input.facts,input.sourceScore);
 const angles=(['direct','impact','explainer','human','number','risk','timeline'] as StoryAngle[])
  .map(angle=>({angle,score:angleScore(angle,rankedClaims,input.title,brief,audience)})).sort((a,b)=>b.score-a.score);
 const angle=angles[0]?.angle||'direct';
 const requiredMap=new Map(rankedClaims.filter(x=>x.mandatory).slice(0,4).map(x=>[x.claimId,x]));
 const essentialKinds:Record<StoryAngle,FactKind[]>={direct:['event'],impact:['event','effect'],explainer:['event','context','cause','advice'],human:['person','event','effect'],number:['event','number'],risk:['event','effect','advice'],timeline:['event','time']};
 for(const kind of essentialKinds[angle]){const c=rankedClaims.find(x=>x.fact.kind===kind&&x.fact.support!=='uncertain');if(c)requiredMap.set(c.claimId,c)}
 const required=[...requiredMap.values()].sort((a,b)=>b.score-a.score).slice(0,5);
 const supporting=rankedClaims.filter(x=>!requiredMap.has(x.claimId)&&x.fact.support!=='uncertain'&&x.score>=58).slice(0,7);
 const omitted=rankedClaims.filter(x=>!required.includes(x)&&!supporting.includes(x));
 const totalWords=[...required,...supporting.slice(0,3)].reduce((n,x)=>n+words(x.fact.text).length,0);
 const complexity=required.length>=7||totalWords>170?'high':required.length>=4||totalWords>95?'medium':'low';
 const recommendedSeconds:45|60|90|120=required.length<=3&&totalWords<90?45:required.length<=5&&totalWords<145?60:required.length<=7&&totalWords<225?90:120;
 return{title:input.title,topic:storyTopic(input.title),audience,angle,narrative:narrativeFor(angle),centralQuestion:centralQuestion(angle,input.title,brief),openingClaimId:(required[0]||rankedClaims[0])?.claimId||'',requiredClaimIds:required.map(x=>x.claimId),supportingClaimIds:supporting.map(x=>x.claimId),omittedClaimIds:omitted.map(x=>x.claimId),rankedClaims,recommendedSeconds,complexity,angleReason:angles.slice(0,3).map(x=>`${x.angle}:${Math.round(x.score)}`)} satisfies StoryBlueprint;
}
