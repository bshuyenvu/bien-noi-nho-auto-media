import type { StoryBlueprint, RankedClaim, StoryAngle } from './newsroom.js';
import type { HookStrategy } from './editorial-learning.js';

export interface HookCandidate{strategy:HookStrategy;text:string;origin:'rules'|'ai';truth:number;novelty:number;relevance:number;clarity:number;retention:number;specificity:number;clickbaitRisk:number;similarity:number;finalScore:number}
const norm=(s:string)=>s.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const STOP=new Set(['nhung','cac','mot','so','dang','duoc','nay','do','voi','trong','khi','dieu','thong','tin','ve','la','co','the','cho','tu','den']);
const tokenSet=(s:string)=>new Set(norm(s).split(' ').filter(x=>x.length>2&&!STOP.has(x)));
export function hookSimilarity(a:string,b:string){const A=tokenSet(a),B=tokenSet(b);if(!A.size||!B.size)return 0;let inter=0;for(const t of A)if(B.has(t))inter++;const j=inter/(A.size+B.size-inter),pa=norm(a).split(' ').slice(0,4).join(' '),pb=norm(b).split(' ').slice(0,4).join(' ');return Math.min(1,j+((pa&&pa===pb) ? 0.35 : 0))}
function overlap(a:string,b:string){const A=tokenSet(a),B=tokenSet(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.min(A.size,B.size)}
function sentenceCore(text:string,max=22){let s=text.trim().replace(/\s+/g,' '),clause=s.split(/[,;](?=\s)/)[0];if(clause.split(/\s+/).length>=7)s=clause;const w=s.split(/\s+/);if(w.length>max)s=w.slice(0,max).join(' ');return s.replace(/[,:;.!?]+$/,'').trim()}
function lowerFirst(s:string){return s?s[0].toLocaleLowerCase('vi-VN')+s.slice(1):s}
function byKind(claims:RankedClaim[],kind:string){return claims.find(x=>x.fact.kind===kind&&x.fact.support!=='uncertain')}
function questionHook(b:StoryBlueprint){
 const event=byKind(b.rankedClaims,'event')?.fact.text||'';
 const core=sentenceCore(event,30);
 if(/^Quan niệm\s+/i.test(core)){const proposition=core.replace(/^Quan niệm\s+/i,'').split(/\s+khiến\b/i)[0].replace(/[.!?]+$/,'');if(proposition)return`Có đúng rằng ${lowerFirst(proposition)}?`}
 const belief=core.match(/^(?:Nhiều|Không ít)\s+người\s+(?:vẫn\s+)?(?:cho rằng|tin rằng)\s+(.+)$/i)?.[1];
 if(belief)return`Có đúng rằng ${lowerFirst(belief.replace(/[.!?]+$/,''))}?`;
 return`Điều gì cần hiểu đúng về ${b.topic}?`;
}
function make(strategy:HookStrategy,b:StoryBlueprint):string{
 const top=b.rankedClaims[0],event=byKind(b.rankedClaims,'event')||top,num=byKind(b.rankedClaims,'number'),effect=byKind(b.rankedClaims,'effect'),cause=byKind(b.rankedClaims,'cause'),context=byKind(b.rankedClaims,'context'),person=byKind(b.rankedClaims,'person'),time=byKind(b.rankedClaims,'time'),advice=byKind(b.rankedClaims,'advice');
 switch(strategy){
  case'number':return num&&/\d|%/.test(num.fact.text)?sentenceCore(num.fact.text,18):sentenceCore(event?.fact.text||b.title,18);
  case'human':return person?sentenceCore(person.fact.text,18):sentenceCore(effect?.fact.text||event?.fact.text||b.title,18);
  case'consequence':return sentenceCore(effect?.fact.text||advice?.fact.text||event?.fact.text||b.title,20);
  case'timeline':return time?sentenceCore(time.fact.text,18):sentenceCore(event?.fact.text||b.title,18);
  case'explainer':return sentenceCore(cause?.fact.text||context?.fact.text||event?.fact.text||b.title,20);
  case'contrast':return context&&event?`${sentenceCore(event.fact.text,10)} — nhưng ${lowerFirst(sentenceCore(context.fact.text,10))}`:sentenceCore(event?.fact.text||b.title,18);
  case'alert':return sentenceCore(advice?.fact.text||effect?.fact.text||event?.fact.text||b.title,20);
  case'question':return questionHook(b);
  default:return sentenceCore(event?.fact.text||b.title,20)
 }
}
const CLICKBAIT=/\b(sốc|kinh hoàng|không thể tin|gây sốc|chấn động|bí mật|khủng khiếp)\b/i;
const GENERIC=/^(?:con số nào|điều gì|diễn biến này|sự việc này|chuyện này|thông tin này|một tín hiệu|câu chuyện này)\b/i;
const risky=(s:string)=>CLICKBAIT.test(s)?45:/\b(khẩn|nguy hiểm)\b/i.test(s)?14:0;
const ALIGN:Record<StoryAngle,HookStrategy[]>={direct:['direct','consequence'],impact:['consequence','direct','human'],explainer:['question','explainer','contrast'],human:['human','direct'],number:['number','direct'],risk:['question','alert','consequence','direct'],timeline:['timeline','direct']};
function relevance(strategy:HookStrategy,b:StoryBlueprint){
 let base=strategy==='number'&&byKind(b.rankedClaims,'number')?92:strategy==='human'&&byKind(b.rankedClaims,'person')?90:strategy==='consequence'&&byKind(b.rankedClaims,'effect')?94:strategy==='explainer'&&(byKind(b.rankedClaims,'cause')||byKind(b.rankedClaims,'context'))?92:strategy==='timeline'&&byKind(b.rankedClaims,'time')?90:strategy==='alert'&&byKind(b.rankedClaims,'advice')?92:strategy==='question'?90:84;
 if(ALIGN[b.angle].includes(strategy))base+=10;else if(strategy==='number'&&b.angle!=='number')base-=12;
 return Math.max(55,Math.min(100,base));
}
function numericSafe(text:string,b:StoryBlueprint){const allowed=new Set((b.title+' '+b.rankedClaims.map(x=>x.fact.text).join(' ')).match(/\d+(?:[.,]\d+)?/g)||[]);return(text.match(/\d+(?:[.,]\d+)?/g)||[]).every(x=>allowed.has(x))}
function specificity(text:string,b:StoryBlueprint){
 const topic=tokenSet(b.topic),hook=tokenSet(text);let topicHits=0;for(const t of topic)if(hook.has(t))topicHits++;
 const claimGround=Math.max(0,...b.rankedClaims.slice(0,10).map(x=>overlap(text,x.fact.text)));
 let score=32+Math.min(36,topicHits*18)+Math.round(claimGround*38);
 if(GENERIC.test(text)&&topicHits===0)score-=38;
 if(/\b(sự việc|diễn biến|chuyện này|thông tin này)\b/i.test(text)&&topicHits===0)score-=20;
 return Math.max(0,Math.min(100,score));
}
function score(strategy:HookStrategy,text:string,origin:'rules'|'ai',b:StoryBlueprint,recent:Array<{hook:string}>,boost:Record<string,number>){
 const similarity=Math.max(0,...recent.map(x=>hookSimilarity(text,x.hook))),novelty=Math.round((1-similarity)*100),rel=relevance(strategy,b),truth=numericSafe(text,b)?98:55,spec=specificity(text,b);
 const clarity=Math.max(55,100-Math.max(0,text.split(/\s+/).length-18)*3),retention=Math.min(98,74+(strategy==='question'||strategy==='consequence'?10:strategy==='number'?8:strategy==='human'?7:origin==='ai'?6:4)),clickbaitRisk=risky(text);
 const genericPenalty=GENERIC.test(text)&&spec<70?16:0;
 const finalScore=Math.round(truth*.2+novelty*.15+rel*.16+clarity*.1+retention*.14+spec*.25-clickbaitRisk*.35-genericPenalty+Number(boost[strategy]||0));
 return{strategy,text,origin,truth,novelty,relevance:rel,clarity,retention,specificity:spec,clickbaitRisk,similarity:Number(similarity.toFixed(3)),finalScore} satisfies HookCandidate
}
export function buildHookStudio(input:{blueprint:StoryBlueprint;recentHooks?:Array<{hook:string}>;strategyBoost?:Record<string,number>;aiCandidates?:Array<{strategy:HookStrategy;text:string}>}){
 const strategies:HookStrategy[]=['direct','question','number','human','contrast','consequence','timeline','explainer','alert'],recent=input.recentHooks||[],boost=input.strategyBoost||{},seen=new Set<string>(),out:HookCandidate[]=[];
 for(const strategy of strategies){const text=make(strategy,input.blueprint).replace(/\s+/g,' ').trim();if(text.length>=12&&!seen.has(norm(text))){seen.add(norm(text));out.push(score(strategy,text,'rules',input.blueprint,recent,boost))}}
 for(const x of input.aiCandidates||[]){const text=String(x.text||'').replace(/\s+/g,' ').trim(),n=norm(text);if(text.split(/\s+/).length<5||text.split(/\s+/).length>22||seen.has(n)||CLICKBAIT.test(text)||!numericSafe(text,input.blueprint))continue;seen.add(n);out.push(score(x.strategy,text,'ai',input.blueprint,recent,boost))}
 out.sort((a,b)=>b.finalScore-a.finalScore);
 const selected=out.find(x=>x.similarity<.72&&x.clickbaitRisk<30&&x.truth>=90&&x.specificity>=65)||out.find(x=>x.truth>=90&&x.specificity>=55)||out[0];
 return{selected,candidates:out.slice(0,8)}
}
