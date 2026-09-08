import type { PublishJob, PublishPlatform } from './queue.js';
import { uploadYouTubeVideo } from './youtube.js';

export interface PublishCredential{platform:PublishPlatform;accountLabel:string;secret:Record<string,string>}
export interface PublishRequest{job:PublishJob;videoPath:string;credential?:PublishCredential}
export interface PublishResult{remoteId:string;remoteUrl?:string;publishedAt:string;dryRun:boolean}
export interface PublisherProvider{platform:PublishPlatform;validateCredential(credential?:PublishCredential):void;publish(input:PublishRequest):Promise<PublishResult>}
function dryRunResult(platform:PublishPlatform,job:PublishJob):PublishResult{return{remoteId:`dry-${platform}-${job.id}`,publishedAt:new Date().toISOString(),dryRun:true}}
class YouTubeProvider implements PublisherProvider{
  platform='youtube' as const;
  validateCredential(c?:PublishCredential){if(!c?.secret.refreshToken&&!c?.secret.accessToken)throw new Error('YouTube credential chưa được cấu hình')}
  async publish(input:PublishRequest){if(input.job.dryRun)return dryRunResult(this.platform,input.job);this.validateCredential(input.credential);return uploadYouTubeVideo(input.job,input.videoPath,input.credential)}
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
