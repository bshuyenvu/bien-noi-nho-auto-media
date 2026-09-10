import { importArticleFromUrl } from '../import/url.js';
import type { ForeignSource } from './foreign.js';

export interface HealthResearchSource extends ForeignSource {
  kind:'official'|'academic';
  authority:number;
  publishedAt?:string;
  language?:string;
}
export interface HealthResearchPack {
  topic:string; query:string; sources:HealthResearchSource[];
  mode:'official+academic'|'official'|'academic'; warnings:string[];
}
const fold=(v:string)=>v.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const clean=(v:unknown,max=5000)=>String(v??'').replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const MEDICAL_TERMS:Array<[RegExp,string]>=[
 [/\b(dot quy|tai bien mach mau nao)\b/i,'stroke'],[/\b(tang huyet ap|cao huyet ap)\b/i,'hypertension'],
 [/\b(dai thao duong|tieu duong)\b/i,'diabetes'],[/\b(suy tim)\b/i,'heart failure'],
 [/\b(nhoi mau co tim|dau tim)\b/i,'heart attack'],[/\b(nhiem khuan huyet|sepsis)\b/i,'sepsis'],
 [/\b(viem tuy cap|viem tuy)\b/i,'acute pancreatitis'],[/\b(hen phe quan|hen suyễn|hen suyen)\b/i,'asthma'],
 [/\b(copd|benh phoi tac nghen man tinh)\b/i,'COPD'],[/\b(viem phoi)\b/i,'pneumonia'],
 [/\b(sot xuat huyet|dengue)\b/i,'dengue'],[/\b(soi|measles)\b/i,'measles'],
 [/\b(beo phi|thua can)\b/i,'obesity'],[/\b(benh than man|suy than man)\b/i,'chronic kidney disease'],
 [/\b(tien san giat)\b/i,'preeclampsia'],[/\b(vac xin|vaccine|tiem chung)\b/i,'vaccination'],
];
function medicalQuery(topic:string){
 const f=fold(topic),hits=MEDICAL_TERMS.filter(([re])=>re.test(f)).map(([,en])=>en),intent:string[]=[];
 if(/\b(dau hieu|trieu chung|canh bao)\b/i.test(f))intent.push('symptoms warning signs');
 if(/\b(dieu tri|xu tri)\b/i.test(f))intent.push('treatment management');
 if(/\b(phong ngua|du phong)\b/i.test(f))intent.push('prevention');
 if(/\b(nguy co|yeu to nguy co)\b/i.test(f))intent.push('risk factors');
 if(/\b(bien chung)\b/i.test(f))intent.push('complications');
 if(/\b(chan doan)\b/i.test(f))intent.push('diagnosis');
 const query=[...new Set([...hits,...intent])].join(' ').trim();return query||clean(topic,180)
}

const OFFICIAL:Array<{re:RegExp;name:string;title:string;url:string}>=[
 {re:/\bstroke\b/i,name:'CDC',title:'Signs and Symptoms of Stroke',url:'https://www.cdc.gov/stroke/signs-symptoms/index.html'},
 {re:/\bstroke\b/i,name:'NHS',title:'Symptoms of a stroke',url:'https://www.nhs.uk/conditions/stroke/symptoms/'},
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
 return overlap*18+review+fresh+(abstract.length>500?10:0);
}
async function academicSources(query:string,max=5):Promise<HealthResearchSource[]>{
 const u='https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+encodeURIComponent(query)+'&format=json&pageSize=15&resultType=core';
 const r=await fetch(u,{headers:{'user-agent':'VietNewsFlow-HealthResearch/1.0'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Europe PMC HTTP '+r.status);
 const data:any=await r.json(),rows=Array.isArray(data?.resultList?.result)?data.resultList.result:[];
 return rows.map((x:any)=>{
  const title=clean(x.title,500),summary=clean(x.abstractText,1800),pubTypes=(x.pubTypeList?.pubType||[]).map((v:any)=>String(v)),date=String(x.firstPublicationDate||x.electronicPublicationDate||'');
  const pmid=clean(x.pmid,40),doi=clean(x.doi,200),url=pmid?`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`:doi?`https://doi.org/${doi}`:'';
  return{source:{name:clean(x.journalTitle||'PubMed / Europe PMC',120),url,title,summary,imageUrls:[],kind:'academic' as const,authority:88,publishedAt:date,language:'en'},score:relevanceScore(query,title,summary,pubTypes,date)};
 }).filter((x:any)=>x.source.url&&x.source.summary.length>=180).sort((a:any,b:any)=>b.score-a.score).slice(0,max).map((x:any)=>x.source);
}
export async function researchHealthTopic(topic:string,max=5):Promise<HealthResearchPack>{
 const cleanTopic=clean(topic,180);if(cleanTopic.length<3)throw new Error('Chủ đề sức khỏe quá ngắn.');
 const query=medicalQuery(cleanTopic),warnings:string[]=[];
 let official:HealthResearchSource[]=[],academic:HealthResearchSource[]=[];
 try{official=await officialSources(query,2)}catch(e){warnings.push('Official source lookup: '+(e instanceof Error?e.message:String(e)))}
 try{academic=await academicSources(query,Math.max(3,max-official.length))}catch(e){warnings.push('Europe PMC: '+(e instanceof Error?e.message:String(e)))}
 const seen=new Set<string>(),sources=[...official,...academic].filter(x=>{const k=x.url.toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,max);
 if(!sources.length)warnings.push('Chưa tìm được Evidence Pack đủ nội dung cho chủ đề này; có thể nhập thêm URL nguồn y khoa chính.');
 const mode=official.length&&academic.length?'official+academic':official.length?'official':'academic';
 return{topic:cleanTopic,query,sources,mode,warnings};
}
