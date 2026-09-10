import { importArticleFromUrl } from '../import/url.js';
import type { ForeignSource } from './foreign.js';

export interface HealthResearchSource extends ForeignSource {
  kind:'official'|'academic';
  authority:number;
  publishedAt?:string;
  language?:string;
  relevance?:number;
}
export interface HealthResearchPack {
  topic:string; query:string; sources:HealthResearchSource[];
  mode:'official+academic'|'official'|'academic'; warnings:string[];
}
const fold=(v:string)=>v.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const clean=(v:unknown,max=5000)=>String(v??'').replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const MEDICAL_TERMS:Array<[RegExp,string]>=[
 [/\b(dot quy|tai bien mach mau nao)\b/i,'stroke'],[/\b(ha duong huyet)\b/i,'hypoglycemia'],[/\b(tang duong huyet)\b/i,'hyperglycemia'],
 [/\b(tang huyet ap|cao huyet ap)\b/i,'hypertension'],[/\b(ha huyet ap)\b/i,'hypotension'],[/\b(dai thao duong|tieu duong)\b/i,'diabetes'],
 [/\b(suy tim)\b/i,'heart failure'],[/\b(nhoi mau co tim|dau tim)\b/i,'myocardial infarction'],[/\b(dau nguc)\b/i,'chest pain'],[/\b(kho tho)\b/i,'dyspnea'],
 [/\b(nhiem khuan huyet|sepsis)\b/i,'sepsis'],[/\b(viem tuy cap)\b/i,'acute pancreatitis'],[/\b(viem tuy)\b/i,'pancreatitis'],
 [/\b(hen phe quan|hen suyễn|hen suyen)\b/i,'asthma'],[/\b(copd|benh phoi tac nghen man tinh)\b/i,'chronic obstructive pulmonary disease'],
 [/\b(viem phoi)\b/i,'pneumonia'],[/\b(sot xuat huyet|dengue)\b/i,'dengue'],[/\b(cum|influenza)\b/i,'influenza'],[/\b(covid|covid-19)\b/i,'COVID-19'],
 [/\b(soi|measles)\b/i,'measles'],[/\b(beo phi|thua can)\b/i,'obesity'],[/\b(benh than man|suy than man)\b/i,'chronic kidney disease'],
 [/\b(suy than cap)\b/i,'acute kidney injury'],[/\b(tien san giat)\b/i,'preeclampsia'],[/\b(vac xin|vaccine|tiem chung)\b/i,'vaccination'],
 [/\b(mat nuoc)\b/i,'dehydration'],[/\b(ngo doc thuc pham)\b/i,'food poisoning'],[/\b(trao nguoc da day|gerd)\b/i,'gastroesophageal reflux disease'],
 [/\b(viem da day)\b/i,'gastritis'],[/\b(viem gan)\b/i,'hepatitis'],[/\b(xo gan)\b/i,'cirrhosis'],[/\b(gout|gut)\b/i,'gout'],
 [/\b(thieu mau)\b/i,'anemia'],[/\b(roi loan nhip|loạn nhịp|loan nhip)\b/i,'arrhythmia'],[/\b(nhiem trung duong tieu|viem duong tiet nieu)\b/i,'urinary tract infection'],
 [/\b(sot)\b/i,'fever'],
];
export function medicalQuery(topic:string){
 const f=fold(topic),condition=MEDICAL_TERMS.find(([re])=>re.test(f))?.[1],intent:string[]=[];
 if(/\b(dau hieu|trieu chung|canh bao)\b/i.test(f))intent.push('symptoms warning signs');
 if(/\b(dieu tri|xu tri)\b/i.test(f))intent.push('treatment management');
 if(/\b(phong ngua|du phong)\b/i.test(f))intent.push('prevention');
 if(/\b(nguy co|yeu to nguy co)\b/i.test(f))intent.push('risk factors');
 if(/\b(bien chung)\b/i.test(f))intent.push('complications');
 if(/\b(chan doan)\b/i.test(f))intent.push('diagnosis');
 if(/\b(nguyen nhan)\b/i.test(f))intent.push('causes');
 if(/\b(cap cuu|khan cap)\b/i.test(f))intent.push('emergency');
 // Never search generic intent by itself: that was the root cause of cross-topic evidence contamination.
 return condition?[condition,...intent].join(' ').trim():clean(topic,180)
}
const INTENT_SUFFIX=/(?:\s+(?:symptoms warning signs|treatment management|prevention|risk factors|complications|diagnosis|causes|emergency))+$/i;
function coreCondition(q:string){return q.replace(INTENT_SUFFIX,'').trim().toLowerCase()}
function coreMatch(q:string,hay:string){const c=coreCondition(q);if(!c)return true;const h=hay.toLowerCase().replace(/[-–—]/g,' ');const normalized=c.replace(/[-–—]/g,' ');return h.includes(normalized)}
export function medicalTopicEntityMatch(topic:string,text:string){
 const ft=fold(topic),fx=fold(text),matches=MEDICAL_TERMS.filter(([re])=>re.test(ft));
 if(matches.length)return matches.every(([re])=>re.test(fx));
 const topicWords=ft.replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(x=>x.length>=4&&!['dau','hieu','trieu','chung','canh','bao','dieu','tri','phong','ngua','nguyen','nhan','bien'].includes(x));
 if(!topicWords.length)return true;const unique=[...new Set(topicWords)],hits=unique.filter(x=>fx.includes(x)).length;return hits>=Math.max(1,Math.ceil(unique.length*.5));
}

const OFFICIAL:Array<{re:RegExp;name:string;title:string;url:string}>=[
 {re:/\bstroke\b/i,name:'CDC',title:'Signs and Symptoms of Stroke',url:'https://www.cdc.gov/stroke/signs-symptoms/index.html'},
 {re:/\bstroke\b/i,name:'NHS',title:'Symptoms of a stroke',url:'https://www.nhs.uk/conditions/stroke/symptoms/'},
 {re:/\bhypoglycemia\b/i,name:'NHS',title:'Low blood sugar (hypoglycaemia)',url:'https://www.nhs.uk/conditions/low-blood-sugar-hypoglycaemia/'},
 {re:/\bhypotension\b/i,name:'NHS',title:'Low blood pressure (hypotension)',url:'https://www.nhs.uk/conditions/low-blood-pressure-hypotension/'},
 {re:/\bmyocardial infarction\b/i,name:'NHS',title:'Heart attack',url:'https://www.nhs.uk/conditions/heart-attack/'},
 {re:/\bheart failure\b/i,name:'NHS',title:'Heart failure',url:'https://www.nhs.uk/conditions/heart-failure/'},
 {re:/\bpneumonia\b/i,name:'NHS',title:'Pneumonia',url:'https://www.nhs.uk/conditions/pneumonia/'},
 {re:/\bdehydration\b/i,name:'NHS',title:'Dehydration',url:'https://www.nhs.uk/conditions/dehydration/'},
 {re:/\bpreeclampsia\b/i,name:'NHS',title:'Pre-eclampsia',url:'https://www.nhs.uk/conditions/pre-eclampsia/'},
 {re:/\bchronic kidney disease\b/i,name:'NHS',title:'Chronic kidney disease - Symptoms',url:'https://www.nhs.uk/conditions/kidney-disease/symptoms/'},
 {re:/\bhypertension\b/i,name:'WHO',title:'Hypertension',url:'https://www.who.int/news-room/fact-sheets/detail/hypertension'},
 {re:/\bdiabetes\b/i,name:'WHO',title:'Diabetes',url:'https://www.who.int/news-room/fact-sheets/detail/diabetes'},
 {re:/\bsepsis\b/i,name:'CDC',title:'About Sepsis',url:'https://www.cdc.gov/sepsis/about/index.html'},
 {re:/\basthma\b/i,name:'WHO',title:'Asthma',url:'https://www.who.int/news-room/fact-sheets/detail/asthma'},
 {re:/\bCOPD\b/i,name:'WHO',title:'Chronic obstructive pulmonary disease (COPD)',url:'https://www.who.int/news-room/fact-sheets/detail/chronic-obstructive-pulmonary-disease-(copd)'},
 {re:/\bdengue\b/i,name:'WHO',title:'Dengue and severe dengue',url:'https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue'},
 {re:/\bobesity\b/i,name:'WHO',title:'Obesity and overweight',url:'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight'},
 {re:/\bpancreatitis\b/i,name:'NIDDK',title:'Pancreatitis',url:'https://www.niddk.nih.gov/health-information/digestive-diseases/pancreatitis'},
];
async function officialSources(query:string,max=2):Promise<HealthResearchSource[]>{
 const out:HealthResearchSource[]=[];
 for(const item of OFFICIAL.filter(x=>x.re.test(query))){
  if(out.length>=max)break;
  try{
   const a=await importArticleFromUrl(item.url),summary=clean(a.body,1800);
   if(summary.length<160)continue;
   out.push({name:item.name,url:a.sourceUrl||item.url,title:a.title||item.title,summary,imageUrls:[],kind:'official',authority:97,publishedAt:a.publishedAt,language:a.language});
  }catch{}
 }
 return out;
}
function relevanceScore(q:string,title:string,abstract:string,pubTypes:string[],date=''){
 const words=q.toLowerCase().split(/\W+/).filter(x=>x.length>3),hay=(title+' '+abstract).toLowerCase();
 const overlap=words.filter(x=>hay.includes(x)).length;
 const review=pubTypes.some(x=>/guideline|systematic review|meta-analysis|review/i.test(x))?24:0;
 const year=Number(date.slice(0,4)),fresh=year>=new Date().getUTCFullYear()-5?12:year>=2018?6:0;
 const core=coreMatch(q,hay)?30:-120;
 return overlap*18+review+fresh+(abstract.length>500?10:0)+core;
}
async function academicSources(query:string,max=5):Promise<HealthResearchSource[]>{
 const u='https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+encodeURIComponent(query)+'&format=json&pageSize=15&resultType=core';
 const r=await fetch(u,{headers:{'user-agent':'VietNewsFlow-HealthResearch/1.0'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Europe PMC HTTP '+r.status);
 const data:any=await r.json(),rows=Array.isArray(data?.resultList?.result)?data.resultList.result:[];
 return rows.map((x:any)=>{
  const title=clean(x.title,500),summary=clean(x.abstractText,1800),pubTypes=(x.pubTypeList?.pubType||[]).map((v:any)=>String(v)),date=String(x.firstPublicationDate||x.electronicPublicationDate||'');
  const pmid=clean(x.pmid,40),doi=clean(x.doi,200),url=pmid?`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`:doi?`https://doi.org/${doi}`:'';
  const score=relevanceScore(query,title,summary,pubTypes,date);
  return{source:{name:clean(x.journalTitle||'PubMed / Europe PMC',120),url,title,summary,imageUrls:[],kind:'academic' as const,authority:88,publishedAt:date,language:'en',relevance:score},score};
 }).filter((x:any)=>x.source.url&&x.source.summary.length>=180&&x.score>=28&&coreMatch(query,x.source.title)).sort((a:any,b:any)=>b.score-a.score).slice(0,max).map((x:any)=>x.source);
}
export async function researchHealthTopic(topic:string,max=5):Promise<HealthResearchPack>{
 const cleanTopic=clean(topic,180);if(cleanTopic.length<3)throw new Error('Chủ đề sức khỏe quá ngắn.');
 const query=medicalQuery(cleanTopic),warnings:string[]=[];
 let official:HealthResearchSource[]=[],academic:HealthResearchSource[]=[];
 try{official=await officialSources(query,2)}catch(e){warnings.push('Official source lookup: '+(e instanceof Error?e.message:String(e)))}
 if(/^[\x00-\x7F]+$/.test(query)){try{academic=await academicSources(query,Math.max(3,max-official.length))}catch(e){warnings.push('Europe PMC: '+(e instanceof Error?e.message:String(e)))}}else warnings.push('Chủ đề chưa được chuẩn hóa sang thuật ngữ y khoa tiếng Anh; không truy vấn PubMed để tránh ghép nhầm nguồn.')
 const academicFloor=official.length?112:82,filteredAcademic=academic.filter(x=>(x.relevance||0)>=academicFloor);
 const seen=new Set<string>(),sources=[...official,...filteredAcademic].filter(x=>{const k=x.url.toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,max);
 if(!sources.length)warnings.push('Chưa tìm được Evidence Pack đủ nội dung cho chủ đề này; có thể nhập thêm URL nguồn y khoa chính.');
 const mode=official.length&&filteredAcademic.length?'official+academic':official.length?'official':'academic';
 return{topic:cleanTopic,query,sources,mode,warnings};
}
