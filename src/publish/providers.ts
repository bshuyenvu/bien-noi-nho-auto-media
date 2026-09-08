import type { PublishJob, PublishPlatform } from './queue.js';
import { uploadYouTubeVideo, YOUTUBE_REQUIRED_SCOPES, youtubeReadiness } from './youtube.js';

export interface PublishCredential{platform:PublishPlatform;accountLabel:string;secret:Record<string,string>}
export interface PublishRequest{job:PublishJob;videoPath:string;credential?:PublishCredential}
export interface PublishResult{remoteId:string;remoteUrl?:string;publishedAt:string;dryRun:boolean}
export interface PublisherProvider{platform:PublishPlatform;validateCredential(credential?:PublishCredential):void;publish(input:PublishRequest):Promise<PublishResult>}
function dryRunResult(platform:PublishPlatform,job:PublishJob):PublishResult{return{remoteId:`dry-${platform}-${job.id}`,publishedAt:new Date().toISOString(),dryRun:true}}
function readinessMaxAgeMs(){return Math.max(60_000,Number(process.env.YOUTUBE_READINESS_MAX_AGE_MS||15*60_000))}
class YouTubeProvider implements PublisherProvider{
  platform='youtube' as const;
  validateCredential(c?:PublishCredential){
    const s=c?.secret;
    if(!s?.refreshToken)throw new Error('YouTube LIVE cần refresh token OAuth');
    if(!s.channelId)throw new Error('YouTube LIVE chưa xác minh channel ID; hãy kết nối/test lại');
    const scopes=String(s.scope||'').split(/\s+/).filter(Boolean),missing=YOUTUBE_REQUIRED_SCOPES.filter(x=>!scopes.includes(x));
    if(missing.length)throw new Error(`YouTube LIVE thiếu quyền OAuth: ${missing.join(', ')}`);
    const verifiedAt=Date.parse(String(s.verifiedAt||''));
    if(!Number.isFinite(verifiedAt)||Date.now()-verifiedAt>readinessMaxAgeMs())throw new Error('YouTube readiness đã cũ; hãy bấm TEST KẾT NỐI trước khi tạo job LIVE');
  }
  async publish(input:PublishRequest){
    if(input.job.dryRun)return dryRunResult(this.platform,input.job);
    this.validateCredential(input.credential);
    const readiness=await youtubeReadiness(input.credential);
    if(!readiness.ok)throw new Error(readiness.error||'YouTube readiness check thất bại trước khi upload');
    if(input.credential?.secret.channelId&&readiness.channelId!==input.credential.secret.channelId)throw new Error('Kênh YouTube hiện tại khác channel ID đã xác minh; dừng xuất bản để tránh đăng nhầm kênh');
    return uploadYouTubeVideo(input.job,input.videoPath,input.credential);
  }
}
class FacebookProvider implements PublisherProvider{
  platform='facebook' as const;
  validateCredential(c?:PublishCredential){if(!c?.secret.pageAccessToken||!c?.secret.pageId)throw new Error('Facebook Page credential chưa được cấu hình')}
  async publish(input:PublishRequest){if(input.job.dryRun)return dryRunResult(this.platform,input.job);this.validateCredential(input.credential);throw new Error('Facebook live publishing chưa được bật cho đến khi Graph API hiện hành được xác minh')}
}
class TikTokProvider implements PublisherProvider{
  platform='tiktok' as const;
  validateCredential(c?:PublishCredential){if(!c?.secret.accessToken)throw new Error('TikTok credential chưa được cấu hình')}
  async publish(input:PublishRequest){if(input.job.dryRun)return dryRunResult(this.platform,input.job);this.validateCredential(input.credential);throw new Error('TikTok provider đang ở chế độ placeholder')}
}
const providers:Record<PublishPlatform,PublisherProvider>={youtube:new YouTubeProvider(),facebook:new FacebookProvider(),tiktok:new TikTokProvider()};
export function publisherFor(platform:PublishPlatform){return providers[platform]}
