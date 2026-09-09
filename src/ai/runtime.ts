import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import { db,all,run } from '../storage/db.js';

export type RuntimeAiProvider='gemini'|'openai'|'ollama';
export type OpenAiProtocol='responses'|'chat_completions';
export interface RuntimeProviderConfig{ id:RuntimeAiProvider;base:string;key?:string;model:string;protocol?:OpenAiProtocol;source:'saved'|'env' }

db.exec(`CREATE TABLE IF NOT EXISTS ai_provider_settings(
 owner_id TEXT PRIMARY KEY,
 preferred_provider TEXT NOT NULL DEFAULT 'gemini',
 gemini_model TEXT,
 gemini_key_encrypted TEXT,
 openai_base_url TEXT,
 openai_model TEXT,
 openai_protocol TEXT,
 openai_key_encrypted TEXT,
 updated_at TEXT NOT NULL
)`);

type Row={owner_id:string;preferred_provider:string;gemini_model?:string;gemini_key_encrypted?:string;openai_base_url?:string;openai_model?:string;openai_protocol?:string;openai_key_encrypted?:string;updated_at:string};
function vaultKey(){const raw=process.env.CREDENTIAL_VAULT_KEY;if(!raw)throw new Error('CREDENTIAL_VAULT_KEY chưa được cấu hình');return createHash('sha256').update(raw).digest()}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',vaultKey(),iv),body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]),tag=cipher.getAuthTag();return Buffer.concat([iv,tag,body]).toString('base64')}
function decrypt(value?:string){if(!value)return'';const buf=Buffer.from(value,'base64'),iv=buf.subarray(0,12),tag=buf.subarray(12,28),body=buf.subarray(28),dec=createDecipheriv('aes-256-gcm',vaultKey(),iv);dec.setAuthTag(tag);return Buffer.concat([dec.update(body),dec.final()]).toString('utf8')}
function row(ownerId?:string){return ownerId?all<Row>('SELECT * FROM ai_provider_settings WHERE owner_id=? LIMIT 1',ownerId)[0]:undefined}
function safeProtocol(v?:string):OpenAiProtocol{return v==='chat_completions'?'chat_completions':'responses'}
function normalizeBase(raw?:string){return String(raw||'https://api.openai.com/v1').trim().replace(/\/$/,'')}
function savedGemini(r?:Row){try{return decrypt(r?.gemini_key_encrypted)}catch{return''}}
function savedOpenAi(r?:Row){try{return decrypt(r?.openai_key_encrypted)}catch{return''}}
export function aiProviderSettings(ownerId?:string){
 const r=row(ownerId),geminiSaved=Boolean(savedGemini(r)),openaiSaved=Boolean(savedOpenAi(r));
 const geminiEnv=Boolean(process.env.GEMINI_API_KEY?.trim()),openaiEnv=Boolean(process.env.AI_API_KEY?.trim());
 return{
  preferredProvider:(r?.preferred_provider==='openai'?'openai':'gemini') as 'gemini'|'openai',
  gemini:{model:r?.gemini_model||process.env.GEMINI_MODEL?.trim()||'gemini-3.6-flash',keyConfigured:geminiSaved||geminiEnv,keySource:geminiSaved?'saved':geminiEnv?'env':'none'},
  openai:{baseUrl:r?.openai_base_url||process.env.AI_API_URL?.trim()||'https://api.openai.com/v1',model:r?.openai_model||process.env.AI_MODEL?.trim()||'gpt-5.6-luna',protocol:safeProtocol(r?.openai_protocol||process.env.AI_API_PROTOCOL),keyConfigured:openaiSaved||openaiEnv,keySource:openaiSaved?'saved':openaiEnv?'env':'none'},
  ollama:{enabled:/^true$/i.test(process.env.OLLAMA_ENABLED||'')&&Boolean(process.env.OLLAMA_MODEL?.trim()),model:process.env.OLLAMA_MODEL?.trim()||''},
  updatedAt:r?.updated_at,
 }
}
export function providerCandidates(ownerId?:string):RuntimeProviderConfig[]{
 const r=row(ownerId),out:RuntimeProviderConfig[]=[];
 const geminiKey=savedGemini(r)||process.env.GEMINI_API_KEY?.trim()||'';
 const openaiKey=savedOpenAi(r)||process.env.AI_API_KEY?.trim()||'';
 const gemini:RuntimeProviderConfig|undefined=geminiKey?{id:'gemini',base:(process.env.GEMINI_API_URL||'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/,''),key:geminiKey,model:r?.gemini_model||process.env.GEMINI_MODEL?.trim()||'gemini-3.6-flash',source:savedGemini(r)?'saved':'env'}:undefined;
 const openai:RuntimeProviderConfig|undefined=openaiKey?{id:'openai',base:normalizeBase(r?.openai_base_url||process.env.AI_API_URL),key:openaiKey,model:r?.openai_model||process.env.AI_MODEL?.trim()||'gpt-5.6-luna',protocol:safeProtocol(r?.openai_protocol||process.env.AI_API_PROTOCOL),source:savedOpenAi(r)?'saved':'env'}:undefined;
 const preferred=r?.preferred_provider==='openai'?'openai':'gemini';
 for(const p of preferred==='openai'?[openai,gemini]:[gemini,openai])if(p)out.push(p);
 if(/^true$/i.test(process.env.OLLAMA_ENABLED||'')&&process.env.OLLAMA_MODEL?.trim())out.push({id:'ollama',base:(process.env.OLLAMA_API_URL||'http://host.docker.internal:11434/v1').replace(/\/$/,''),key:process.env.OLLAMA_API_KEY||'ollama',model:process.env.OLLAMA_MODEL.trim(),protocol:'chat_completions',source:'env'});
 return out
}
function validateOpenAiBase(raw:string){const u=new URL(raw);if(u.protocol==='https:')return u.toString().replace(/\/$/,'');const local=['localhost','127.0.0.1','host.docker.internal'].includes(u.hostname);if(u.protocol==='http:'&&local)return u.toString().replace(/\/$/,'');throw new Error('OpenAI-compatible Base URL phải dùng HTTPS (trừ local runtime)')}
export function saveAiProviderSettings(ownerId:string,input:{preferredProvider?:'gemini'|'openai';geminiModel?:string;geminiApiKey?:string;clearGeminiKey?:boolean;openaiBaseUrl?:string;openaiModel?:string;openaiProtocol?:OpenAiProtocol;openaiApiKey?:string;clearOpenAiKey?:boolean}){
 const existing=row(ownerId),now=new Date().toISOString();
 const preferred=input.preferredProvider||((existing?.preferred_provider==='openai'?'openai':'gemini') as 'gemini'|'openai');
 const geminiModel=(input.geminiModel?.trim()||existing?.gemini_model||process.env.GEMINI_MODEL?.trim()||'gemini-3.6-flash').slice(0,120);
 const openaiBase=validateOpenAiBase(input.openaiBaseUrl?.trim()||existing?.openai_base_url||process.env.AI_API_URL?.trim()||'https://api.openai.com/v1');
 const openaiModel=(input.openaiModel?.trim()||existing?.openai_model||process.env.AI_MODEL?.trim()||'gpt-5.6-luna').slice(0,160);
 const protocol=input.openaiProtocol||safeProtocol(existing?.openai_protocol||process.env.AI_API_PROTOCOL);
 let geminiEncrypted=existing?.gemini_key_encrypted||null,openaiEncrypted=existing?.openai_key_encrypted||null;
 if(input.clearGeminiKey)geminiEncrypted=null;else if(input.geminiApiKey?.trim())geminiEncrypted=encrypt(input.geminiApiKey.trim());
 if(input.clearOpenAiKey)openaiEncrypted=null;else if(input.openaiApiKey?.trim())openaiEncrypted=encrypt(input.openaiApiKey.trim());
 run(`INSERT INTO ai_provider_settings(owner_id,preferred_provider,gemini_model,gemini_key_encrypted,openai_base_url,openai_model,openai_protocol,openai_key_encrypted,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET preferred_provider=excluded.preferred_provider,gemini_model=excluded.gemini_model,gemini_key_encrypted=excluded.gemini_key_encrypted,openai_base_url=excluded.openai_base_url,openai_model=excluded.openai_model,openai_protocol=excluded.openai_protocol,openai_key_encrypted=excluded.openai_key_encrypted,updated_at=excluded.updated_at`,ownerId,preferred,geminiModel,geminiEncrypted,openaiBase,openaiModel,protocol,openaiEncrypted,now);
 return aiProviderSettings(ownerId)
}
export function aiProviderFingerprint(ownerId?:string){const s=aiProviderSettings(ownerId);return createHash('sha256').update(JSON.stringify({preferred:s.preferredProvider,gm:s.gemini.model,gk:s.gemini.keyConfigured,ob:s.openai.baseUrl,om:s.openai.model,op:s.openai.protocol,ok:s.openai.keyConfigured})).digest('hex').slice(0,16)}

const TRANSIENT_HTTP=new Set([408,425,429,500,502,503,504]);
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function requestWithRetry(url:string,makeInit:()=>RequestInit,timeoutMs:number,retries=2){let last='';for(let attempt=0;attempt<=retries;attempt++){const r=await fetch(url,{...makeInit(),signal:AbortSignal.timeout(timeoutMs)});if(r.ok)return r;const detail=await r.text().catch(()=>'');last=`HTTP ${r.status}${detail?': '+detail.slice(0,240):''}`;const hardQuota=r.status===429&&/exceeded your current quota|billing details|quota exhausted|insufficient_quota/i.test(detail);if(hardQuota||!TRANSIENT_HTTP.has(r.status)||attempt>=retries)throw new Error(last);await wait(450*(2**attempt)+Math.round(Math.random()*180))}throw new Error(last||'AI request failed')}
function responseText(data:any){if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();const output=Array.isArray(data?.output)?data.output:[];const parts=output.flatMap((x:any)=>Array.isArray(x?.content)?x.content:[]).map((x:any)=>x?.text||x?.output_text||'').filter(Boolean);return parts.join('').trim()}
export async function completeWithProvider(provider:RuntimeProviderConfig,prompt:string,maxTokens=2200,temperature=.2){
 if(provider.id==='gemini'){
  const root=provider.base.replace(/\/openai\/?$/i,'');
  const url=`${root}/models/${encodeURIComponent(provider.model)}:generateContent`;
  const r=await requestWithRetry(url,()=>({method:'POST',headers:{'content-type':'application/json','x-goog-api-key':provider.key||''},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature,maxOutputTokens:maxTokens,responseMimeType:'application/json'}})}),60000,2);
  const data:any=await r.json(),text=data?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('');if(!text)throw new Error('Gemini không trả nội dung');return String(text)
 }
 if(provider.id==='openai'&&provider.protocol==='responses'){
  const url=provider.base.endsWith('/responses')?provider.base:provider.base+'/responses';
  const r=await requestWithRetry(url,()=>({method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+(provider.key||'')},body:JSON.stringify({model:provider.model,input:prompt,max_output_tokens:maxTokens})}),60000,2);
  const data:any=await r.json(),text=responseText(data);if(!text)throw new Error('OpenAI Responses API không trả nội dung');return text
 }
 const base=provider.base.replace(/\/$/,''),url=/\/chat\/completions$/i.test(base)?base:base+'/chat/completions';
 const r=await requestWithRetry(url,()=>({method:'POST',headers:{'content-type':'application/json',...(provider.key?{authorization:'Bearer '+provider.key}:{})},body:JSON.stringify({model:provider.model,messages:[{role:'user',content:prompt}],temperature,max_tokens:maxTokens,response_format:{type:'json_object'}})}),provider.id==='ollama'?120000:60000,2);
 const data:any=await r.json(),text=data?.choices?.[0]?.message?.content;if(!text)throw new Error(`${provider.id} không trả nội dung`);return String(text)
}
export async function testAiProvider(ownerId?:string,providerId?:RuntimeAiProvider){const candidates=providerCandidates(ownerId).filter(x=>!providerId||x.id===providerId),errors:string[]=[];for(const p of candidates){try{await completeWithProvider(p,'Chỉ trả JSON: {"ok":true}',40,0);return{ok:true,provider:p.id,model:p.model,protocol:p.protocol||'native',source:p.source}}catch(e){errors.push(`${p.id}: ${e instanceof Error?e.message:String(e)}`)}}return{ok:false,provider:providerId,errors,settings:aiProviderSettings(ownerId)}}
