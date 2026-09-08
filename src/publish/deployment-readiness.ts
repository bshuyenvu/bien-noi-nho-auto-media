import type { PublishCredential } from './providers.js';
import { credentialStatus,getCredential } from './vault.js';

export type YouTubePrivacyStatus='private'|'unlisted'|'public';

function configured(name:string){return Boolean(process.env[name]?.trim())}
function youtubePrivacy():YouTubePrivacyStatus{const v=String(process.env.YOUTUBE_PRIVACY_STATUS||'private');return v==='public'||v==='unlisted'?v:'private'}
function redirectStatus(){const raw=String(process.env.YOUTUBE_REDIRECT_URI||'').trim();if(!raw)return{configured:false,https:false,localhost:false,ok:false};try{const u=new URL(raw),localhost=u.hostname==='localhost'||u.hostname==='127.0.0.1'||u.hostname==='::1';return{configured:true,https:u.protocol==='https:',localhost,ok:u.protocol==='https:'||localhost}}catch{return{configured:true,https:false,localhost:false,ok:false}}}
function privateTest(secret?:Record<string,string>){const passedAt=secret?.privateTestPassedAt||'',ms=passedAt?Date.parse(passedAt):NaN;return{passed:Boolean(passedAt&&Number.isFinite(ms)),passedAt:passedAt||undefined,videoId:secret?.privateTestVideoId||undefined}}
function uploadChunk(){const q=256*1024,requestedRaw=Number(process.env.YOUTUBE_UPLOAD_CHUNK_BYTES||8*1024*1024),requested=Number.isFinite(requestedRaw)&&requestedRaw>0?requestedRaw:8*1024*1024,bytes=Math.max(q,Math.min(64*1024*1024,Math.floor(requested/q)*q));return{requestedBytes:requested,bytes,normalized:bytes!==requested,multipleOf256KiB:bytes%q===0,ok:true}}
function uploadRetry(){const clamp=(v:number,d:number,min:number,max:number)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):d;return{maxRetries:Math.trunc(clamp(Number(process.env.YOUTUBE_UPLOAD_MAX_RETRIES),6,1,12)),baseMs:clamp(Number(process.env.YOUTUBE_UPLOAD_RETRY_BASE_MS),1000,1,60_000),maxMs:clamp(Number(process.env.YOUTUBE_UPLOAD_RETRY_MAX_MS),60_000,10,10*60_000),requestTimeoutMs:clamp(Number(process.env.YOUTUBE_UPLOAD_REQUEST_TIMEOUT_MS),120_000,1000,30*60_000),jitter:process.env.YOUTUBE_UPLOAD_RETRY_JITTER!=='false'}}

export function publisherDeploymentReadiness(ownerId?:string){
  const redirect=redirectStatus(),privacyStatus=youtubePrivacy(),liveEnabled=process.env.PUBLISH_LIVE_ENABLED==='true',chunk=uploadChunk(),retry=uploadRetry();
  const config={
    credentialVault:configured('CREDENTIAL_VAULT_KEY'),
    oauthStateSecret:configured('OAUTH_STATE_SECRET'),
    youtubeClientId:configured('YOUTUBE_CLIENT_ID'),
    youtubeClientSecret:configured('YOUTUBE_CLIENT_SECRET'),
    youtubeRedirectUri:redirect,
    readinessTtlMs:Math.max(60_000,Number(process.env.YOUTUBE_READINESS_MAX_AGE_MS||15*60_000)),
    uploadChunk:chunk,
    uploadRetry:retry,
    durableResumableSessions:true,
    privacyStatus,
    liveEnabled,
  };
  const configurationReady=config.credentialVault&&config.oauthStateSecret&&config.youtubeClientId&&config.youtubeClientSecret&&redirect.ok&&chunk.ok;
  let youtubeCredential:ReturnType<typeof credentialStatus>[number]|undefined,credential:PublishCredential|undefined;
  if(ownerId){youtubeCredential=credentialStatus(ownerId).find(x=>x.platform==='youtube');try{credential=getCredential(ownerId,'youtube')}catch{}}
  const test=privateTest(credential?.secret);
  const productionPrivacyNeedsPrivateTest=privacyStatus!=='private';
  const youtubeLiveReady=Boolean(configurationReady&&liveEnabled&&youtubeCredential?.liveReadyCached&&(!productionPrivacyNeedsPrivateTest||test.passed));
  const blockers:string[]=[],warnings:string[]=[];
  if(!config.credentialVault)blockers.push('Thiếu CREDENTIAL_VAULT_KEY');
  if(!config.oauthStateSecret)blockers.push('Thiếu OAUTH_STATE_SECRET riêng cho production');
  if(!config.youtubeClientId)blockers.push('Thiếu YOUTUBE_CLIENT_ID');
  if(!config.youtubeClientSecret)blockers.push('Thiếu YOUTUBE_CLIENT_SECRET');
  if(!redirect.ok)blockers.push('YOUTUBE_REDIRECT_URI phải hợp lệ và dùng HTTPS ngoài localhost');
  if(chunk.normalized)warnings.push(`YOUTUBE_UPLOAD_CHUNK_BYTES=${chunk.requestedBytes} sẽ được chuẩn hóa thành ${chunk.bytes} byte (bội số 256 KiB)`);
  if(!liveEnabled)blockers.push('PUBLISH_LIVE_ENABLED đang false');
  if(ownerId&&!youtubeCredential)blockers.push('YouTube chưa kết nối OAuth');
  if(ownerId&&youtubeCredential&&!youtubeCredential.liveReadyCached)blockers.push('YouTube cần TEST KẾT NỐI gần đây');
  if(ownerId&&productionPrivacyNeedsPrivateTest&&!test.passed)blockers.push('Phải hoàn tất YouTube Private Live Test trước Public/Unlisted');
  return{configurationReady,youtubeLiveReady,config,credential:youtubeCredential?{...youtubeCredential,privateTest:test}:undefined,privateTest:test,productionPrivacyNeedsPrivateTest,blockers,warnings,apiAuditNote:privacyStatus==='private'?undefined:'Google có thể buộc upload private nếu dự án API chưa được audit để public/unlisted.'};
}

export function logPublisherStartupReadiness(){const x=publisherDeploymentReadiness();const missing=x.blockers.filter(b=>!b.includes('PUBLISH_LIVE_ENABLED'));if(missing.length)console.warn(`[publisher-readiness] ${missing.join(' | ')}`);else console.info(`[publisher-readiness] config ready; live=${x.config.liveEnabled}; youtubePrivacy=${x.config.privacyStatus}; chunk=${x.config.uploadChunk.bytes}; retries=${x.config.uploadRetry.maxRetries}`);for(const warning of x.warnings)console.warn(`[publisher-readiness] ${warning}`);if(process.env.PUBLISH_STRICT_STARTUP==='true'&&process.env.PUBLISH_LIVE_ENABLED==='true'&&!x.configurationReady)throw new Error(`Publisher production config chưa sẵn sàng: ${x.blockers.join('; ')}`);return x}

if(process.env.CI!=='true'&&process.env.PUBLISH_STARTUP_DIAGNOSTICS!=='false')setImmediate(()=>{try{logPublisherStartupReadiness()}catch(e){console.error(e);if(process.env.PUBLISH_STRICT_STARTUP==='true')process.exitCode=1}});
