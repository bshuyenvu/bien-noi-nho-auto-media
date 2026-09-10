import { createHash,randomUUID } from 'node:crypto';
import { db,all,run } from '../storage/db.js';
import { detectLanguage,type LanguageDetection } from './language.js';
import { providerCandidates,completeWithProvider,aiProviderFingerprint,type RuntimeAiProvider } from '../ai/runtime.js';
import { translateEnglishToVietnamese } from '../translation/local.js';

export type FactKind='event'|'person'|'place'|'time'|'number'|'cause'|'effect'|'quote'|'context'|'advice';
export interface SourceFact{kind:FactKind;text:string;sourceExcerpt?:string;confidence:number;corroboratedBy:number;corroboratingSourceIndexes?:number[];support:'primary'|'corroborated'|'uncertain'}
export interface SourceIntelligence{
  id:string;ownerId:string;sourceUrl:string;sourceName?:string;originalTitle:string;bodyHash:string;
  language:LanguageDetection;translationStatus:'not_needed'|'translated'|'pending';vietnameseTitle:string;vietnameseBrief:string;
  facts:SourceFact[];uncertainties:string[];warnings:string[];authorityScore:number;freshnessScore:number;sourceScore:number;
  corroborationCount:number;provider:RuntimeAiProvider|'rules';readyForEditorial:boolean;createdAt:string;updatedAt:string;cached?:boolean;
}
export interface AnalyzeSourceInput{ownerId?:string;sourceUrl:string;sourceName?:string;title:string;body:string;languageHint?:string;publishedAt?:string;corroboration?:Array<{name:string;title:string;summary:string;url?:string}>;force?:boolean}

db.exec(`CREATE TABLE IF NOT EXISTS source_intelligence(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,source_url TEXT NOT NULL,source_name TEXT,original_title TEXT NOT NULL,body_hash TEXT NOT NULL,
 language_json TEXT NOT NULL,translation_status TEXT NOT NULL,vietnamese_title TEXT NOT NULL,vietnamese_brief TEXT NOT NULL,facts_json TEXT NOT NULL,
 uncertainties_json TEXT NOT NULL,warnings_json TEXT NOT NULL,authority_score INTEGER NOT NULL,freshness_score INTEGER NOT NULL,source_score INTEGER NOT NULL,
 corroboration_count INTEGER NOT NULL DEFAULT 0,provider TEXT NOT NULL,ready_for_editorial INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(owner_id,source_url,body_hash));
CREATE INDEX IF NOT EXISTS idx_source_intelligence_owner_updated ON source_intelligence(owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_intelligence_url ON source_intelligence(owner_id,source_url);`);

type Row={id:string;owner_id:string;source_url:string;source_name?:string;original_title:string;body_hash:string;language_json:string;translation_status:SourceIntelligence['translationStatus'];vietnamese_title:string;vietnamese_brief:string;facts_json:string;uncertainties_json:string;warnings_json:string;authority_score:number;freshness_score:number;source_score:number;corroboration_count:number;provider:RuntimeAiProvider|'rules';ready_for_editorial:number;created_at:string;updated_at:string};
const clean=(v:unknown,max=10000)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const FACT_ENGINE_CACHE_VERSION='phase7-professional-v4-local-translate';
const bodyHash=(title:string,body:string,ownerId?:string)=>createHash('sha256').update(FACT_ENGINE_CACHE_VERSION+'\n'+aiProviderFingerprint(ownerId)+'\n'+clean(title,1000)+'\n'+clean(body,30000)).digest('hex');
function safeJson<T>(raw:string,fallback:T):T{try{return JSON.parse(raw) as T}catch{return fallback}}
function repairFactKinds(facts:SourceFact[]){return facts.map((f,i)=>{if(i===0&&f.kind==='event')return f;if(f.kind==='number'&&!hasMeaningfulNumber(f.text))return{...f,kind:classifyLocalFact(f.text)};return f})}
function mapRow(r:Row,cached=false):SourceIntelligence{return{id:r.id,ownerId:r.owner_id,sourceUrl:r.source_url,sourceName:r.source_name||undefined,originalTitle:r.original_title,bodyHash:r.body_hash,language:safeJson(r.language_json,detectLanguage('')),translationStatus:r.translation_status,vietnameseTitle:r.vietnamese_title,vietnameseBrief:r.vietnamese_brief,facts:repairFactKinds(safeJson<SourceFact[]>(r.facts_json,[])),uncertainties:safeJson(r.uncertainties_json,[]),warnings:safeJson(r.warnings_json,[]),authorityScore:r.authority_score,freshnessScore:r.freshness_score,sourceScore:r.source_score,corroborationCount:r.corroboration_count,provider:r.provider,readyForEditorial:Boolean(r.ready_for_editorial),createdAt:r.created_at,updatedAt:r.updated_at,...(cached?{cached:true}:{})}}

function hostname(url:string){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
export function sourceAuthorityScore(url:string,sourceName=''){
  const h=hostname(url),s=(h+' '+sourceName).toLowerCase();
  if(/(^|\.)(gov|gov\.vn)$/.test(h)||/(who\.int|cdc\.gov|nih\.gov|fda\.gov|un\.org|europa\.eu|ecdc\.europa\.eu|nasa\.gov|federalreserve\.gov)$/.test(h))return 97;
  if(/(reuters\.com|apnews\.com|afp\.com)$/.test(h))return 95;
  if(/(bbc\.|dw\.com|france24\.com|theguardian\.com|npr\.org|aljazeera\.com|cnn\.com|nhs\.uk|thelancet\.com|nejm\.org|bmj\.com)/.test(s))return 89;
  if(/(bộ |sở |cục |bệnh viện|university|institute|journal)/i.test(sourceName))return 86;
  return h?72:55;
}
function freshnessScore(publishedAt?:string){if(!publishedAt)return 65;const t=Date.parse(publishedAt);if(!Number.isFinite(t))return 60;const hours=Math.max(0,(Date.now()-t)/3600000);if(hours<=6)return 100;if(hours<=24)return 95;if(hours<=72)return 88;if(hours<=168)return 78;if(hours<=720)return 65;return 50}
function overallScore(authority:number,freshness:number,corroboration:number){const corroborationScore=Math.min(100,corroboration*28);return Math.round(authority*.62+freshness*.23+corroborationScore*.15)}
function sentences(text:string){return clean(text,30000).split(/(?<=[.!?。！？])\s+/u).map(x=>x.trim()).filter(x=>x.length>18)}
const LOCAL_NUMBER=/\b\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:%|phần trăm|triệu|tỷ|nghìn|người|ca|USD|EUR|km|mg|g|ml)?\b/i;
const LOCAL_ADVICE=/\b(khuyến cáo|khuyên|cần|nên|không nên|đi khám|thăm khám|liên hệ bác sĩ|cấp cứu|theo dõi|lưu ý)\b/i;
const LOCAL_EFFECT=/\b(khiến|dẫn đến|ảnh hưởng|hệ quả|hậu quả|làm tăng|làm giảm|nguy cơ|rủi ro|tử vong|biến chứng)\b/i;
const LOCAL_CAUSE=/\b(vì|do|nguyên nhân|liên quan đến|bắt nguồn từ|xuất phát từ)\b/i;
const LOCAL_TIME=/\b(today|yesterday|tomorrow|hôm nay|hôm qua|sáng nay|chiều nay|tối nay|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
function hasMeaningfulNumber(s:string){const scrub=s.replace(/\b(?:omega|vitamin|vit|gene|gen|type|loại)\s*[-–]?\s*\d+[a-z]?\b/gi,'');return LOCAL_NUMBER.test(scrub)}
function hasMeaningfulTime(s:string){return LOCAL_TIME.test(s)||/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(s)||/\b(?:ngày|tháng|năm)\s+\d{1,4}\b/i.test(s)||/\b\d{1,2}\s*(?:giờ|phút)\b/i.test(s)}
function classifyLocalFact(s:string):FactKind{if(LOCAL_ADVICE.test(s))return'advice';if(LOCAL_EFFECT.test(s))return'effect';if(LOCAL_CAUSE.test(s))return'cause';if(hasMeaningfulTime(s))return'time';if(hasMeaningfulNumber(s))return'number';return'context'}
function localFacts(text:string):SourceFact[]{
 const ss=sentences(text),out:SourceFact[]=[];
 const add=(kind:FactKind,s?:string,confidence=.7)=>{if(!s||out.some(x=>x.text===s))return;out.push({kind,text:s.slice(0,500),sourceExcerpt:s.slice(0,240),confidence,corroboratedBy:0,support:'primary'})};
 add('event',ss[0],.8);
 for(const s of ss.slice(1,24)){const kind=classifyLocalFact(s),confidence=(kind==='number'||kind==='advice')?0.82:(kind==='effect'||kind==='cause')?0.78:0.72;add(kind,s,confidence)}
 return out.slice(0,18)
}
function compactVietnamese(text:string){return sentences(text).slice(0,12).join(' ').slice(0,7000)||clean(text,7000)}

async function aiAnalyze(input:AnalyzeSourceInput,language:LanguageDetection){
  const corroboration=(input.corroboration||[]).slice(0,4).map((x,i)=>`[C${i+1}] ${clean(x.name,100)} | ${clean(x.title,300)} | ${clean(x.summary,1500)}`).join('\n');
  const prompt=`Bạn là Fact Editor của một newsroom tiếng Việt. Nguồn có thể ở bất kỳ ngôn ngữ nào.\nNGUYÊN TẮC BẮT BUỘC:\n1) Không dịch từng chữ. Chỉ dùng dữ kiện có trong PRIMARY hoặc nguồn đối chiếu. Không suy đoán và không thêm chi tiết.\n2) vietnameseTitle và vietnameseBrief phải là tiếng Việt tự nhiên, câu ngắn, dễ hiểu, giữ nguyên tên riêng/số liệu/đơn vị/ngày tháng. Brief 5-12 câu, trung tính, dùng làm nền cho biên tập video.\n3) facts chỉ chứa claim cụ thể; sourceExcerpt là đoạn rất ngắn từ PRIMARY hỗ trợ claim. Nếu C1..Cn xác nhận cùng claim, đặt support=corroborated, corroboratingSourceIndexes là danh sách số nguồn 1-based (ví dụ [1,3]) thực sự hỗ trợ claim, và corroboratedBy bằng số phần tử. Không được gán nguồn nếu nội dung đối chiếu không xác nhận claim.\n4) Mọi điểm chưa chắc chắn đưa vào uncertainties, không biến thành fact.\n5) Trả JSON duy nhất theo schema: {detectedLanguage:string,vietnameseTitle:string,vietnameseBrief:string,facts:[{kind:string,text:string,sourceExcerpt:string,confidence:number,corroboratedBy:number,corroboratingSourceIndexes:number[],support:string}],uncertainties:string[],warnings:string[]}.\nPRIMARY LANGUAGE HINT: ${language.code}\nPRIMARY TITLE: ${clean(input.title,500)}\nPRIMARY BODY:\n${clean(input.body,16000)}\n${corroboration?`CORROBORATION:\n${corroboration}`:'CORROBORATION: none'}`;
  const errors:string[]=[];
  for(const provider of providerCandidates(input.ownerId)){
    try{const raw=await completeWithProvider(provider,prompt,2800,.05),stripped=String(raw).replace(/^```(?:json)?\s*|\s*```$/gi,'').trim(),start=stripped.indexOf('{'),end=stripped.lastIndexOf('}'),data=JSON.parse(start>=0&&end>start?stripped.slice(start,end+1):stripped);return{data,provider:provider.id}}
    catch(e){errors.push(`${provider.id}: ${e instanceof Error?e.message:String(e)}`)}
  }
  if(errors.length)throw new Error(errors.join(' | '));
  return undefined;
}

function normalizeFacts(raw:any[]):SourceFact[]{const kinds=new Set<FactKind>(['event','person','place','time','number','cause','effect','quote','context','advice']);return(raw||[]).slice(0,20).map(x=>{const kind=kinds.has(x?.kind)?x.kind:'context';const indexes=[...new Set((Array.isArray(x?.corroboratingSourceIndexes)?x.corroboratingSourceIndexes:[]).map((v:any)=>Number(v)).filter((v:number)=>Number.isInteger(v)&&v>=1&&v<=4))].slice(0,4) as number[];const reported=Math.max(0,Math.min(4,Number(x?.corroboratedBy)||0));const corroboratedBy=Math.max(reported,indexes.length);const support:SourceFact['support']=x?.support==='corroborated'&&corroboratedBy>0?'corroborated':x?.support==='uncertain'?'uncertain':'primary';return{kind,text:clean(x?.text,500),sourceExcerpt:clean(x?.sourceExcerpt,240)||undefined,confidence:Math.max(0,Math.min(1,Number(x?.confidence)||.7)),corroboratedBy,...(indexes.length?{corroboratingSourceIndexes:indexes}:{}),support}}).filter(x=>x.text)}

export async function analyzeSourceIntelligence(input:AnalyzeSourceInput):Promise<SourceIntelligence>{
  const ownerId=input.ownerId||'legacy-admin',hash=bodyHash(input.title,input.body,ownerId);if(!input.force){const cached=all<Row>('SELECT * FROM source_intelligence WHERE owner_id=? AND source_url=? AND body_hash=? LIMIT 1',ownerId,input.sourceUrl,hash)[0];if(cached)return mapRow(cached,true)}
  let language=detectLanguage(`${input.title}\n${input.body}`,input.languageHint),provider:SourceIntelligence['provider']='rules';let vietnameseTitle='',vietnameseBrief='',facts:SourceFact[]=[],uncertainties:string[]=[],warnings:string[]=[];
  try{const result=await aiAnalyze({...input,ownerId},language);if(result){const ai=result.data;provider=result.provider;if(language.code==='und'&&ai.detectedLanguage)language=detectLanguage('',String(ai.detectedLanguage));vietnameseTitle=clean(ai.vietnameseTitle,180);vietnameseBrief=clean(ai.vietnameseBrief,7000);facts=normalizeFacts(ai.facts);uncertainties=(ai.uncertainties||[]).map((x:any)=>clean(x,500)).filter(Boolean).slice(0,10);warnings=(ai.warnings||[]).map((x:any)=>clean(x,500)).filter(Boolean).slice(0,10)}}catch(e){warnings.push(`AI Fact Engine fallback: ${e instanceof Error?e.message:String(e)}`)}
  if(!vietnameseBrief&&language.isVietnamese){vietnameseTitle=clean(input.title,180);vietnameseBrief=compactVietnamese(input.body);facts=localFacts(input.body)}
  if(!vietnameseBrief&&language.code==='en'){
    try{
      const translated=await translateEnglishToVietnamese({title:input.title,body:input.body});
      if(translated){
        vietnameseTitle=clean(translated.title,180);vietnameseBrief=compactVietnamese(translated.body);
        facts=localFacts(translated.body).map(f=>({...f,confidence:Math.min(f.confidence,.68)}));
        uncertainties.push('Bản Việt hóa dùng CTranslate2/OPUS-MT local; cần đối chiếu thuật ngữ và claim với nguồn tiếng Anh trước khi duyệt.');
        warnings.push('Local Translation fallback: CTranslate2 INT8 + Helsinki-NLP opus-mt-en-vi.');
      }
    }catch(e){warnings.push(`Local Translation fallback unavailable: ${e instanceof Error?e.message:String(e)}`)}
  }
  const translationStatus:SourceIntelligence['translationStatus']=language.isVietnamese?'not_needed':vietnameseBrief?'translated':'pending';if(translationStatus==='pending')warnings.push('Nguồn nước ngoài chưa được Việt hóa; chặn Editorial cho đến khi Fact Engine dịch được.');
  const authority=sourceAuthorityScore(input.sourceUrl,input.sourceName),freshness=freshnessScore(input.publishedAt),corroborationCount=(input.corroboration||[]).length,score=overallScore(authority,freshness,corroborationCount),now=new Date().toISOString(),ready=Boolean(vietnameseTitle&&vietnameseBrief&&translationStatus!=='pending');
  const out:SourceIntelligence={id:randomUUID(),ownerId,sourceUrl:input.sourceUrl,sourceName:input.sourceName,originalTitle:clean(input.title,180),bodyHash:hash,language,translationStatus,vietnameseTitle:vietnameseTitle||clean(input.title,180),vietnameseBrief,facts,uncertainties,warnings,authorityScore:authority,freshnessScore:freshness,sourceScore:score,corroborationCount,provider,readyForEditorial:ready,createdAt:now,updatedAt:now};
  run(`INSERT INTO source_intelligence(id,owner_id,source_url,source_name,original_title,body_hash,language_json,translation_status,vietnamese_title,vietnamese_brief,facts_json,uncertainties_json,warnings_json,authority_score,freshness_score,source_score,corroboration_count,provider,ready_for_editorial,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,source_url,body_hash) DO UPDATE SET source_name=excluded.source_name,language_json=excluded.language_json,translation_status=excluded.translation_status,vietnamese_title=excluded.vietnamese_title,vietnamese_brief=excluded.vietnamese_brief,facts_json=excluded.facts_json,uncertainties_json=excluded.uncertainties_json,warnings_json=excluded.warnings_json,authority_score=excluded.authority_score,freshness_score=excluded.freshness_score,source_score=excluded.source_score,corroboration_count=excluded.corroboration_count,provider=excluded.provider,ready_for_editorial=excluded.ready_for_editorial,updated_at=excluded.updated_at`,out.id,ownerId,input.sourceUrl,input.sourceName||null,out.originalTitle,hash,JSON.stringify(language),translationStatus,out.vietnameseTitle,out.vietnameseBrief,JSON.stringify(facts),JSON.stringify(uncertainties),JSON.stringify(warnings),authority,freshness,score,corroborationCount,provider,ready?1:0,now,now);
  const stored=all<Row>('SELECT * FROM source_intelligence WHERE owner_id=? AND source_url=? AND body_hash=? LIMIT 1',ownerId,input.sourceUrl,hash)[0];return stored?mapRow(stored):out;
}
export function sourceIntelligenceForUrl(ownerId:string,sourceUrl:string){const row=all<Row>('SELECT * FROM source_intelligence WHERE owner_id=? AND source_url=? ORDER BY updated_at DESC LIMIT 1',ownerId,sourceUrl)[0];return row?mapRow(row,true):undefined}
export function sourceIntelligenceStats(ownerId:string){const row=all<any>("SELECT COUNT(*) total,SUM(CASE WHEN ready_for_editorial=1 THEN 1 ELSE 0 END) ready,SUM(CASE WHEN translation_status='translated' THEN 1 ELSE 0 END) translated,AVG(source_score) avg_score FROM source_intelligence WHERE owner_id=?",ownerId)[0]||{};return{total:Number(row.total||0),ready:Number(row.ready||0),translated:Number(row.translated||0),averageSourceScore:Math.round(Number(row.avg_score||0))}}
