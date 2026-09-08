import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { all, run } from '../storage/db.js';

export type ContentSafetySeverity='pass'|'warn'|'fail';
export interface ContentSafetyCheck{id:string;label:string;severity:ContentSafetySeverity;detail:string}
export interface ContentSafetySnapshot{
  ok:boolean;ownerId:string;draftId:string;renderJobId:string;publishTitle:string;checkedAt:string;windowHours:number;
  checks:ContentSafetyCheck[];blockers:string[];warnings:string[];
  fingerprints:{title:string;body:string;source?:string;video?:string};
  duplicate?:{publishJobId:string;draftId:string;reason:string;publishedAt?:string;titleSimilarity?:number;bodySimilarity?:number};
}

type DraftRow={id:string;owner_id:string;title:string;body:string;source_url?:string};
type RenderRow={id:string;owner_id:string;draft_id:string;status:string;output?:string};
type FingerprintRow={publish_job_id:string;draft_id:string;title_hash:string;body_hash:string;source_hash?:string;video_hash?:string;title_tokens_json:string;body_tokens_json:string;created_at:string};
type PublishedRow=FingerprintRow&{published_at?:string};

try{run(`CREATE TABLE IF NOT EXISTS publish_content_fingerprints (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, publish_job_id TEXT NOT NULL UNIQUE, draft_id TEXT NOT NULL, render_job_id TEXT NOT NULL,
  title_hash TEXT NOT NULL, body_hash TEXT NOT NULL, source_hash TEXT, video_hash TEXT, title_tokens_json TEXT NOT NULL, body_tokens_json TEXT NOT NULL,
  source_normalized TEXT, created_at TEXT NOT NULL
)`)}catch{}
try{run('CREATE INDEX IF NOT EXISTS idx_content_fingerprints_owner_created ON publish_content_fingerprints(owner_id,created_at DESC)')}catch{}
try{run('CREATE INDEX IF NOT EXISTS idx_content_fingerprints_hashes ON publish_content_fingerprints(owner_id,title_hash,body_hash,source_hash,video_hash)')}catch{}

function num(name:string,fallback:number,min:number,max:number){const n=Number(process.env[name]||fallback);return Math.max(min,Math.min(max,Number.isFinite(n)?n:fallback))}
export function contentSafetyConfig(){return{
  windowHours:num('CONTENT_DUPLICATE_WINDOW_HOURS',72,1,720),
  titleSimilarity:num('CONTENT_DUPLICATE_TITLE_SIMILARITY',0.88,0.5,1),
  bodySimilarity:num('CONTENT_DUPLICATE_BODY_SIMILARITY',0.92,0.5,1),
  warnSimilarity:num('CONTENT_DUPLICATE_WARN_SIMILARITY',0.75,0.4,0.99),
  sampleBytes:Math.floor(num('CONTENT_VIDEO_FINGERPRINT_SAMPLE_BYTES',524288,65536,2097152)),
}}
function sha(v:string|Buffer){return createHash('sha256').update(v).digest('hex')}
function normalizeText(v:string){return String(v||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()}
function tokens(v:string,limit=256){return [...new Set(normalizeText(v).split(' ').filter(x=>x.length>=2))].slice(0,limit)}
function normalizeUrl(raw:string|undefined){if(!raw)return'';try{const u=new URL(raw);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||['fbclid','gclid','mc_cid','mc_eid'].includes(k.toLowerCase()))u.searchParams.delete(k);u.searchParams.sort();u.hostname=u.hostname.toLowerCase();return u.toString().replace(/\/$/,'')}catch{return normalizeText(raw)}}
function jaccard(a:string[],b:string[]){if(!a.length||!b.length)return 0;const A=new Set(a),B=new Set(b);let inter=0;for(const x of A)if(B.has(x))inter++;return inter/(A.size+B.size-inter)}
function videoFingerprint(path:string|undefined,sampleBytes:number){if(!path||!existsSync(path))return undefined;const st=statSync(path);if(!st.isFile())return undefined;const fd=openSync(path,'r');try{const n=Math.min(sampleBytes,st.size),first=Buffer.alloc(n),last=Buffer.alloc(n);if(n)readSync(fd,first,0,n,0);if(n)readSync(fd,last,0,n,Math.max(0,st.size-n));return sha(Buffer.concat([Buffer.from(String(st.size)),first,last]))}finally{closeSync(fd)}}
function parseTokens(raw:string){try{const v=JSON.parse(raw);return Array.isArray(v)?v.map(String):[]}catch{return[]}}
function pass(id:string,label:string,detail:string):ContentSafetyCheck{return{id,label,severity:'pass',detail}}
function warn(id:string,label:string,detail:string):ContentSafetyCheck{return{id,label,severity:'warn',detail}}
function fail(id:string,label:string,detail:string):ContentSafetyCheck{return{id,label,severity:'fail',detail}}

export function evaluateContentSafety(input:{ownerId:string;draftId:string;renderJobId:string;publishTitle?:string}):ContentSafetySnapshot{
  const cfg=contentSafetyConfig(),checkedAt=new Date().toISOString(),draft=all<DraftRow>('SELECT id,owner_id,title,body,source_url FROM drafts WHERE id=? AND owner_id=? LIMIT 1',input.draftId,input.ownerId)[0],render=all<RenderRow>('SELECT id,owner_id,draft_id,status,output FROM render_jobs WHERE id=? AND owner_id=? LIMIT 1',input.renderJobId,input.ownerId)[0];
  const checks:ContentSafetyCheck[]=[];
  if(!draft)checks.push(fail('draft','Draft nguồn','Không tìm thấy draft thuộc tài khoản'));else checks.push(pass('draft','Draft nguồn',draft.id));
  if(!render||render.draft_id!==input.draftId)checks.push(fail('render','Render nguồn','Không tìm thấy render đúng draft'));else if(render.status!=='ready'||!render.output)checks.push(fail('render','Render READY','Video chưa READY hoặc chưa có output'));else checks.push(pass('render','Render READY',render.id));
  const title=String(input.publishTitle||draft?.title||'').trim(),body=String(draft?.body||'').trim(),source=normalizeUrl(draft?.source_url);
  if(title.length<8)checks.push(fail('title','Tiêu đề','Tiêu đề quá ngắn'));else checks.push(pass('title','Tiêu đề',`${title.length} ký tự`));
  if(body.length<80)checks.push(fail('body','Nội dung','Nội dung quá ngắn cho PUBLIC'));else checks.push(pass('body','Nội dung',`${body.length} ký tự`));
  if(draft?.source_url){try{const u=new URL(draft.source_url);checks.push(/^https?:$/.test(u.protocol)?pass('source','Nguồn URL',source):fail('source','Nguồn URL','Chỉ chấp nhận http/https'))}catch{checks.push(fail('source','Nguồn URL','URL nguồn không hợp lệ'))}}else checks.push(warn('source','Nguồn URL','Draft không có source_url; vẫn kiểm tra title/body/video'));
  const titleNorm=normalizeText(title),bodyNorm=normalizeText(body),titleHash=sha(titleNorm),bodyHash=sha(bodyNorm),sourceHash=source?sha(source):undefined,videoHash=videoFingerprint(render?.output,cfg.sampleBytes),titleTokens=tokens(title,80),bodyTokens=tokens(body,256);
  if(videoHash)checks.push(pass('video-fingerprint','Video fingerprint','Đã tạo fingerprint từ kích thước + mẫu đầu/cuối file'));else checks.push(fail('video-fingerprint','Video fingerprint','Không đọc được file output để fingerprint'));
  const cutoff=new Date(Date.now()-cfg.windowHours*3600000).toISOString();
  const recent=all<PublishedRow>(`SELECT f.*,p.published_at FROM publish_content_fingerprints f JOIN publish_jobs p ON p.id=f.publish_job_id WHERE f.owner_id=? AND p.platform='youtube' AND p.status='published' AND COALESCE(p.published_at,p.updated_at)>=? ORDER BY COALESCE(p.published_at,p.updated_at) DESC LIMIT 200`,input.ownerId,cutoff);
  let duplicate:ContentSafetySnapshot['duplicate'];let bestWarn:{title:number;body:number;job:string}|undefined;
  for(const r of recent){
    const exact=r.title_hash===titleHash||r.body_hash===bodyHash||Boolean(sourceHash&&r.source_hash===sourceHash)||Boolean(videoHash&&r.video_hash===videoHash);
    const ts=jaccard(titleTokens,parseTokens(r.title_tokens_json)),bs=jaccard(bodyTokens,parseTokens(r.body_tokens_json));
    if(exact||ts>=cfg.titleSimilarity||bs>=cfg.bodySimilarity){duplicate={publishJobId:r.publish_job_id,draftId:r.draft_id,publishedAt:r.published_at,reason:exact?'Trùng fingerprint/source/video':'Nội dung gần giống vượt ngưỡng',titleSimilarity:Number(ts.toFixed(3)),bodySimilarity:Number(bs.toFixed(3))};break}
    if(Math.max(ts,bs)>=cfg.warnSimilarity&&(!bestWarn||Math.max(ts,bs)>Math.max(bestWarn.title,bestWarn.body)))bestWarn={title:ts,body:bs,job:r.publish_job_id};
  }
  if(duplicate)checks.push(fail('duplicate','Chống đăng trùng',`${duplicate.reason} • job ${duplicate.publishJobId} • title ${Math.round((duplicate.titleSimilarity||0)*100)}% • body ${Math.round((duplicate.bodySimilarity||0)*100)}%`));
  else if(bestWarn)checks.push(warn('duplicate','Chống đăng trùng',`Có nội dung tương tự nhưng dưới ngưỡng khóa • job ${bestWarn.job} • title ${Math.round(bestWarn.title*100)}% • body ${Math.round(bestWarn.body*100)}%`));
  else checks.push(pass('duplicate','Chống đăng trùng',`Không thấy bản PUBLIC trùng trong ${cfg.windowHours} giờ`));
  const blockers=checks.filter(x=>x.severity==='fail').map(x=>`${x.label}: ${x.detail}`),warnings=checks.filter(x=>x.severity==='warn').map(x=>`${x.label}: ${x.detail}`);
  return{ok:blockers.length===0,ownerId:input.ownerId,draftId:input.draftId,renderJobId:input.renderJobId,publishTitle:title,checkedAt,windowHours:cfg.windowHours,checks,blockers,warnings,fingerprints:{title:titleHash,body:bodyHash,source:sourceHash,video:videoHash},duplicate};
}

export function assertContentSafety(input:{ownerId:string;draftId:string;renderJobId:string;publishTitle?:string}){const x=evaluateContentSafety(input);if(!x.ok)throw new Error(`Pre-Publish Content Safety chặn PUBLIC: ${x.blockers.join(' | ')}`);return x}
export function recordContentFingerprint(publishJobId:string,snapshot:ContentSafetySnapshot){
  const draft=all<DraftRow>('SELECT title,body,source_url,id,owner_id FROM drafts WHERE id=? AND owner_id=? LIMIT 1',snapshot.draftId,snapshot.ownerId)[0];if(!draft)return;
  const source=normalizeUrl(draft.source_url),now=new Date().toISOString();
  run('INSERT OR REPLACE INTO publish_content_fingerprints(id,owner_id,publish_job_id,draft_id,render_job_id,title_hash,body_hash,source_hash,video_hash,title_tokens_json,body_tokens_json,source_normalized,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),snapshot.ownerId,publishJobId,snapshot.draftId,snapshot.renderJobId,snapshot.fingerprints.title,snapshot.fingerprints.body,snapshot.fingerprints.source||null,snapshot.fingerprints.video||null,JSON.stringify(tokens(snapshot.publishTitle,80)),JSON.stringify(tokens(draft.body,256)),source||null,now);
}
export function contentSafetyStats(ownerId:string){const cfg=contentSafetyConfig(),cutoff=new Date(Date.now()-cfg.windowHours*3600000).toISOString(),recent=Number(all<{n:number}>('SELECT COUNT(*) AS n FROM publish_content_fingerprints WHERE owner_id=? AND created_at>=?',ownerId,cutoff)[0]?.n||0);return{config:cfg,recentFingerprints:recent}}
