import type { PublishCredential } from './providers.js';
import { youtubeAccessTokenFor } from './youtube.js';

const VIDEOS_URL='https://www.googleapis.com/youtube/v3/videos';
export type CanaryPrivacy='unlisted'|'public';

export interface YouTubeCanaryVerification{
  ok:boolean;
  readyForPromotion:boolean;
  videoId:string;
  expectedPrivacy:CanaryPrivacy;
  expectedChannelId?:string;
  channelId?:string;
  channelTitle?:string;
  title?:string;
  privacyStatus?:string;
  uploadStatus?:string;
  processingStatus?:string;
  failureReason?:string;
  rejectionReason?:string;
  processingFailureReason?:string;
  checkedAt:string;
  reasons:string[];
  error?:string;
}

function messageFrom(data:Record<string,unknown>,fallback:string){return String((data.error as any)?.message||fallback).slice(0,500)}

export async function verifyYouTubeCanary(credential:PublishCredential|undefined,videoId:string,expectedPrivacy:CanaryPrivacy):Promise<YouTubeCanaryVerification>{
  const id=String(videoId||'').trim(),checkedAt=new Date().toISOString(),expectedChannelId=String(credential?.secret.channelId||'').trim()||undefined;
  const base={ok:false,readyForPromotion:false,videoId:id,expectedPrivacy,expectedChannelId,checkedAt,reasons:[] as string[]};
  if(!id)return{...base,error:'Thiếu YouTube video ID',reasons:['Thiếu YouTube video ID']};
  if(!credential)return{...base,error:'YouTube credential chưa được cấu hình',reasons:['YouTube credential chưa được cấu hình']};
  if(!expectedChannelId)return{...base,error:'Credential chưa có Channel ID đã xác minh',reasons:['Credential chưa có Channel ID đã xác minh']};
  try{
    const token=await youtubeAccessTokenFor(credential),u=new URL(VIDEOS_URL);
    u.searchParams.set('part','snippet,status,processingDetails');
    u.searchParams.set('id',id);
    const r=await fetch(u,{headers:{authorization:`Bearer ${token}`}}),text=await r.text();let data:Record<string,unknown>={};
    try{data=text?JSON.parse(text) as Record<string,unknown>:{};}catch{}
    if(!r.ok){const error=`YouTube videos.list thất bại ${r.status}: ${messageFrom(data,text||'unknown')}`;return{...base,error,reasons:[error]}}
    const items=Array.isArray(data.items)?data.items as Array<Record<string,any>>:[],item=items[0];
    if(!item?.id){const error='Không tìm thấy video Canary bằng credential hiện tại';return{...base,error,reasons:[error]}}
    const channelId=String(item.snippet?.channelId||''),channelTitle=String(item.snippet?.channelTitle||''),title=String(item.snippet?.title||''),privacyStatus=String(item.status?.privacyStatus||''),uploadStatus=String(item.status?.uploadStatus||''),processingStatus=String(item.processingDetails?.processingStatus||'');
    const failureReason=item.status?.failureReason?String(item.status.failureReason):undefined,rejectionReason=item.status?.rejectionReason?String(item.status.rejectionReason):undefined,processingFailureReason=item.processingDetails?.processingFailureReason?String(item.processingDetails.processingFailureReason):undefined;
    const reasons:string[]=[];
    if(String(item.id)!==id)reasons.push('Remote video ID không khớp Canary đã ghi nhận');
    if(channelId!==expectedChannelId)reasons.push(`Video thuộc Channel ID khác (${channelId||'unknown'})`);
    if(privacyStatus!==expectedPrivacy)reasons.push(`privacyStatus phải là ${expectedPrivacy}, hiện tại là ${privacyStatus||'unknown'}`);
    if(uploadStatus!=='processed')reasons.push(`uploadStatus chưa processed (${uploadStatus||'unknown'})`);
    if(processingStatus!=='succeeded')reasons.push(`processingStatus chưa succeeded (${processingStatus||'unknown'})`);
    if(failureReason)reasons.push(`failureReason: ${failureReason}`);
    if(rejectionReason)reasons.push(`rejectionReason: ${rejectionReason}`);
    if(processingFailureReason)reasons.push(`processingFailureReason: ${processingFailureReason}`);
    return{ok:true,readyForPromotion:reasons.length===0,videoId:id,expectedPrivacy,expectedChannelId,channelId,channelTitle,title,privacyStatus,uploadStatus,processingStatus,failureReason,rejectionReason,processingFailureReason,checkedAt,reasons};
  }catch(e){const error=e instanceof Error?e.message:String(e);return{...base,error,reasons:[error]}}
}

export function verifyYouTubeUnlistedCanary(credential:PublishCredential|undefined,videoId:string){return verifyYouTubeCanary(credential,videoId,'unlisted')}
export function verifyYouTubePublicCanary(credential:PublishCredential|undefined,videoId:string){return verifyYouTubeCanary(credential,videoId,'public')}
