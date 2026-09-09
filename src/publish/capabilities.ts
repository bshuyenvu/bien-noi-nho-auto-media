import type { PublishPlatform } from './queue.js';

export type ProviderCredentialMode='oauth'|'manual'|'none';
export type ProviderReleaseMode='production'|'operator_confirmed'|'dry_run_only';
export interface PublishCapability{
  platform:PublishPlatform;label:string;dryRun:boolean;liveImplemented:boolean;productionApproved:boolean;
  credentialMode:ProviderCredentialMode;releaseMode:ProviderReleaseMode;requiresPerPostConsent:boolean;
  supportedPrivacy:string[];reason?:string;
}

const definitions:Record<PublishPlatform,Omit<PublishCapability,'productionApproved'>>={
  youtube:{platform:'youtube',label:'YouTube',dryRun:true,liveImplemented:true,credentialMode:'oauth',releaseMode:'production',requiresPerPostConsent:false,supportedPrivacy:['private','unlisted','public']},
  facebook:{platform:'facebook',label:'Facebook',dryRun:true,liveImplemented:false,credentialMode:'manual',releaseMode:'dry_run_only',requiresPerPostConsent:false,supportedPrivacy:[],reason:'Graph API video provider chưa được production-verified trong release này.'},
  tiktok:{platform:'tiktok',label:'TikTok',dryRun:true,liveImplemented:false,credentialMode:'none',releaseMode:'dry_run_only',requiresPerPostConsent:true,supportedPrivacy:[],reason:'Direct Post không được bật cho workflow auto-media nội bộ; dùng Safe Export Handoff để đăng thủ công theo guideline nền tảng.'},
};

export function isPublishPlatform(value:string):value is PublishPlatform{return value==='youtube'||value==='facebook'||value==='tiktok'}
export function publishCapability(platform:PublishPlatform):PublishCapability{
  const d=definitions[platform];
  const productionApproved=platform==='youtube';
  return{...d,productionApproved};
}
export function listPublishCapabilities(){return(['youtube','facebook','tiktok'] as PublishPlatform[]).map(p=>publishCapability(p))}
export function assertLivePlatformAllowed(platform:PublishPlatform){
  if(process.env.PUBLISH_LIVE_ENABLED!=='true')throw new Error('Live publishing đang bị khóa bởi PUBLISH_LIVE_ENABLED');
  const c=publishCapability(platform);
  if(!c.liveImplemented)throw new Error(`${c.label} LIVE chưa được triển khai production: ${c.reason||'provider unavailable'}`);
  if(!c.productionApproved)throw new Error(`${c.label} LIVE chưa được production-approved`);
  return c;
}
