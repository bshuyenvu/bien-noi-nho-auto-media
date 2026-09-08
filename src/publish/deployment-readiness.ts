import type { PublishCredential } from './providers.js';
import { credentialStatus,getCredential } from './vault.js';

export type YouTubePrivacyStatus='private'|'unlisted'|'public';

function configured(name:string){return Boolean(process.env[name]?.trim())}
function youtubePrivacy():YouTubePrivacyStatus{const v=String(process.env.YOUTUBE_PRIVACY_STATUS||'private');return v==='public'||v==='unlisted'?v:'private'}
function redirectStatus(){const raw=String(process.env.YOUTUBE_REDIRECT_URI||'').trim();if(!raw)return{configured:false,https:false,localhost:false,ok:false};try{const u=new URL(raw),localhost=u.hostname==='localhost'||u.hostname==='127.0.0.1'||u.hostname==='::1';return{configured:true,https:u.protocol==='https:',localhost,ok:u.protocol==='https:'||localhost}}catch{return{configured:true,https:false,localhost:false,ok:false}}}
function privateTest(secret?:Record<string,string>){const passedAt=secret?.privateTestPassedAt||'',ms=passedAt?Date.parse(passedAt):NaN;return{passed:Boolean(passedAt&&Number.isFinite(ms)),passedAt:passedAt||undefined,videoId:secret?.privateTestVideoId||undefined}}

export function publisherDeploymentReadiness(ownerId?:string){
  const redirect=redirectStatus(),privacyStatus=youtubePrivacy(),liveEnabled=process.env.PUBLISH_LIVE_ENABLED==='true';
  const config={
    credentialVault:configured('CREDENTIAL_VAULT_KEY'),
    oauthStateSecret:configured('OAUTH_STATE_SECRET'),
    youtubeClientId:configured('YOUTUBE_CLIENT_ID'),
    youtubeClientSecret:configured('YOUTUBE_CLIENT_SECRET'),
    youtubeRedirectUri:redirect,
    readinessTtlMs:Math.max(60_000,Number(process.env.YOUTUBE_READINESS_MAX_AGE_MS||15*60_000)),
    privacyStatus,
    liveEnabled,
  };
  const configurationReady=config.credentialVault&&config.oauthStateSecret&&config.youtubeClientId&&config.youtubeClientSecret&&redirect.ok;
  let youtubeCredential:ReturnType<typeof credentialStatus>[number]|undefined,credential:PublishCredential|undefined;
  if(ownerId){youtubeCredential=credentialStatus(ownerId).find(x=>x.platform==='youtube');try{credential=getCredential(ownerId,'youtube')}catch{}}
  const test=privateTest(credential?.secret);
  const productionPrivacyNeedsPrivateTest=privacyStatus!=='private';
  const youtubeLiveReady=Boolean(configurationReady&&liveEnabled&&youtubeCredential?.liveReadyCached&&(!productionPrivacyNeedsPrivateTest||test.passed));
  const blockers:string[]=[];
  if(!config.credentialVault)blockers.push('Thiếu CREDENTIAL_VAULT_KEY');
  if(!config.oauthStateSecret)blockers.push('Thiếu OAUTH_STATE_SECRET riêng cho production');
  if(!config.youtubeClientId)blockers.push('Thiếu YOUTUBE_CLIENT_ID');
  if(!config.youtubeClientSecret)blockers.push('Thiếu YOUTUBE_CLIENT_SECRET');
  if(!redirect.ok)blockers.push('YOUTUBE_REDIRECT_URI phải hợp lệ và dùng HTTPS ngoài localhost');
  if(!liveEnabled)blockers.push('PUBLISH_LIVE_ENABLED đang false');
  if(ownerId&&!youtubeCredential)blockers.push('YouTube chưa kết nối OAuth');
  if(ownerId&&youtubeCredential&&!youtubeCredential.liveReadyCached)blockers.push('YouTube cần TEST KẾT NỐI gần đây');
  if(ownerId&&productionPrivacyNeedsPrivateTest&&!test.passed)blockers.push('Phải hoàn tất YouTube Private Live Test trước Public/Unlisted');
  return{configurationReady,youtubeLiveReady,config,credential:youtubeCredential?{...youtubeCredential,privateTest:test}:undefined,privateTest:test,productionPrivacyNeedsPrivateTest,blockers,apiAuditNote:privacyStatus==='private'?undefined:'Google có thể buộc upload private nếu dự án API chưa được audit để public/unlisted.'};
}

export function logPublisherStartupReadiness(){const x=publisherDeploymentReadiness();const missing=x.blockers.filter(b=>!b.includes('PUBLISH_LIVE_ENABLED'));if(missing.length)console.warn(`[publisher-readiness] ${missing.join(' | ')}`);else console.info(`[publisher-readiness] config ready; live=${x.config.liveEnabled}; youtubePrivacy=${x.config.privacyStatus}`);if(process.env.PUBLISH_STRICT_STARTUP==='true'&&process.env.PUBLISH_LIVE_ENABLED==='true'&&!x.configurationReady)throw new Error(`Publisher production config chưa sẵn sàng: ${x.blockers.join('; ')}`);return x}
