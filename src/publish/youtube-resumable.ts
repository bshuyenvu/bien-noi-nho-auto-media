import { open, stat } from 'node:fs/promises';
import type { PublishJob } from './queue.js';
import type { PublishResult } from './providers.js';
import {
  bumpYouTubeUploadRetry,
  createYouTubeUploadSession,
  getYouTubeUploadSession,
  markYouTubeUploadAttempt,
  markYouTubeUploadCompleted,
  markYouTubeUploadFailed,
  markYouTubeUploadNeedsReconcile,
  resetYouTubeUploadSession,
  updateYouTubeUploadProgress,
  type YouTubeUploadSession,
} from './upload-session.js';

const UPLOAD_URL='https://www.googleapis.com/upload/youtube/v3/videos';
const CHUNK_QUANTUM=256*1024;
const DEFAULT_CHUNK=8*1024*1024;
const MAX_CHUNK=64*1024*1024;
const RETRYABLE_HTTP=new Set([429,500,502,503,504]);

export class YouTubeUploadNeedsReconcileError extends Error{
  readonly needsReconcile=true;
  readonly code='YOUTUBE_UPLOAD_NEEDS_RECONCILE';
  constructor(message:string,readonly httpStatus?:number){super(message);this.name='YouTubeUploadNeedsReconcileError'}
}
class YouTubeUploadPermanentError extends Error{constructor(message:string,readonly httpStatus:number){super(message);this.name='YouTubeUploadPermanentError'}}

function envNumber(name:string,fallback:number,min:number,max:number){const n=Number(process.env[name]);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
export function normalizedYouTubeChunkSize(raw=Number(process.env.YOUTUBE_UPLOAD_CHUNK_BYTES||DEFAULT_CHUNK)){
  const requested=Number.isFinite(raw)&&raw>0?raw:DEFAULT_CHUNK;
  return Math.max(CHUNK_QUANTUM,Math.min(MAX_CHUNK,Math.floor(requested/CHUNK_QUANTUM)*CHUNK_QUANTUM));
}
function retryMax(){return Math.trunc(envNumber('YOUTUBE_UPLOAD_MAX_RETRIES',6,1,12))}
function retryBaseMs(){return envNumber('YOUTUBE_UPLOAD_RETRY_BASE_MS',1000,1,60_000)}
function retryMaxMs(){return envNumber('YOUTUBE_UPLOAD_RETRY_MAX_MS',60_000,10,10*60_000)}
function requestTimeoutMs(){return envNumber('YOUTUBE_UPLOAD_REQUEST_TIMEOUT_MS',120_000,1000,30*60_000)}
function parseJson(text:string){try{return text?JSON.parse(text) as Record<string,unknown>:{};}catch{return{}}}
function remoteResult(body:Record<string,unknown>):PublishResult|undefined{const id=String(body.id||'');return id?{remoteId:id,remoteUrl:`https://www.youtube.com/watch?v=${id}`,publishedAt:new Date().toISOString(),dryRun:false}:undefined}
function nextOffsetFromRange(range:string|null,total:number){if(!range)return 0;const m=range.match(/(?:bytes=)?(\d+)-(\d+)/i);if(!m)return 0;const end=Number(m[2]);if(!Number.isFinite(end)||end<0||end>=total)throw new Error(`YouTube Range không hợp lệ: ${range}`);return end+1}
function retryAfterMs(value:string|null){if(!value)return 0;const seconds=Number(value);if(Number.isFinite(seconds)&&seconds>=0)return seconds*1000;const t=Date.parse(value);return Number.isFinite(t)?Math.max(0,t-Date.now()):0}
function backoffMs(attempt:number,retryAfter:string|null){const explicit=retryAfterMs(retryAfter);if(explicit>0)return Math.min(retryMaxMs(),explicit);const base=Math.min(retryMaxMs(),retryBaseMs()*2**Math.max(0,attempt-1));const jitter=process.env.YOUTUBE_UPLOAD_RETRY_JITTER==='false'?0:Math.floor(Math.random()*Math.max(1,Math.round(base*0.25)));return Math.min(retryMaxMs(),base+jitter)}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url:string|URL,init:RequestInit){return fetch(url,{...init,signal:AbortSignal.timeout(requestTimeoutMs())})}

async function createSession(input:{job:PublishJob;videoPath:string;fileSize:number;chunkSize:number;metadata:Record<string,unknown>;getAccessToken:()=>Promise<string>}){
  const initUrl=new URL(UPLOAD_URL);initUrl.searchParams.set('uploadType','resumable');initUrl.searchParams.set('part','snippet,status');
  let lastError='';
  for(let attempt=1;attempt<=retryMax();attempt++){
    const accessToken=await input.getAccessToken();let r:Response;
    try{r=await request(initUrl,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json; charset=UTF-8','x-upload-content-length':String(input.fileSize),'x-upload-content-type':'video/mp4'},body:JSON.stringify(input.metadata)})}
    catch(e){lastError=e instanceof Error?e.message:String(e);if(attempt<retryMax()){await sleep(backoffMs(attempt,null));continue}break}
    if(r.ok){const uri=r.headers.get('location');if(!uri)throw new Error('YouTube không trả resumable upload URL');return createYouTubeUploadSession({publishJobId:input.job.id,ownerId:input.job.ownerId,sessionUri:uri,filePath:input.videoPath,fileSize:input.fileSize,chunkSize:input.chunkSize})}
    const text=await r.text();lastError=`YouTube upload init thất bại ${r.status}: ${text.slice(0,500)}`;
    if(!RETRYABLE_HTTP.has(r.status))throw new YouTubeUploadPermanentError(lastError,r.status);
    if(attempt<retryMax())await sleep(backoffMs(attempt,r.headers.get('retry-after')));
  }
  throw new Error(`YouTube upload init không thành công sau ${retryMax()} lần: ${lastError}`);
}

type StatusResult={kind:'incomplete';offset:number}|{kind:'completed';result:PublishResult}|{kind:'expired'};
async function querySessionStatus(session:YouTubeUploadSession,getAccessToken:()=>Promise<string>):Promise<StatusResult>{
  let lastError='';
  for(let attempt=1;attempt<=retryMax();attempt++){
    const token=await getAccessToken();let r:Response;
    try{r=await request(session.sessionUri,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-length':'0','content-range':`bytes */${session.fileSize}`}})}
    catch(e){lastError=e instanceof Error?e.message:String(e);bumpYouTubeUploadRetry(session.publishJobId,session.ownerId);if(attempt<retryMax()){await sleep(backoffMs(attempt,null));continue}break}
    if(r.status===308){const offset=nextOffsetFromRange(r.headers.get('range'),session.fileSize);updateYouTubeUploadProgress(session.publishJobId,session.ownerId,offset,308);return{kind:'incomplete',offset}}
    const text=await r.text();
    if(r.ok){const result=remoteResult(parseJson(text));if(!result){markYouTubeUploadNeedsReconcile(session.publishJobId,session.ownerId,r.status);throw new YouTubeUploadNeedsReconcileError('YouTube báo upload hoàn tất nhưng phản hồi không có video id; cần Reconcile.',r.status)}markYouTubeUploadCompleted(session.publishJobId,session.ownerId,result.remoteId,result.remoteUrl);return{kind:'completed',result}}
    if(r.status===404)return{kind:'expired'};
    lastError=`YouTube status check ${r.status}: ${text.slice(0,500)}`;
    if(!RETRYABLE_HTTP.has(r.status)){markYouTubeUploadFailed(session.publishJobId,session.ownerId,r.status);throw new YouTubeUploadPermanentError(lastError,r.status)}
    bumpYouTubeUploadRetry(session.publishJobId,session.ownerId,r.status);if(attempt<retryMax())await sleep(backoffMs(attempt,r.headers.get('retry-after')));
  }
  markYouTubeUploadNeedsReconcile(session.publishJobId,session.ownerId);
  throw new YouTubeUploadNeedsReconcileError(`Không xác định được trạng thái resumable upload sau ${retryMax()} lần: ${lastError}`);
}

function ensureSessionMatchesFile(session:YouTubeUploadSession,videoPath:string,fileSize:number){
  if(session.filePath===videoPath&&session.fileSize===fileSize)return;
  if(!session.lastAttemptAt&&session.nextOffset===0){resetYouTubeUploadSession(session.publishJobId,session.ownerId);return;}
  markYouTubeUploadNeedsReconcile(session.publishJobId,session.ownerId);
  throw new YouTubeUploadNeedsReconcileError('File render đã thay đổi sau khi resumable upload bắt đầu; cần Reconcile để tránh đăng trùng.');
}

export async function uploadYouTubeResumable(input:{job:PublishJob;videoPath:string;metadata:Record<string,unknown>;getAccessToken:()=>Promise<string>}):Promise<PublishResult>{
  const info=await stat(input.videoPath),chunkSize=normalizedYouTubeChunkSize();
  let session=getYouTubeUploadSession(input.job.id,input.job.ownerId);
  if(session?.state==='completed'&&session.remoteId)return{remoteId:session.remoteId,remoteUrl:session.remoteUrl,publishedAt:new Date().toISOString(),dryRun:false};
  if(session?.state==='needs_reconcile')throw new YouTubeUploadNeedsReconcileError('Upload session đang ở trạng thái needs_reconcile; không tự upload lại.');
  if(session?.state==='failed'){resetYouTubeUploadSession(input.job.id,input.job.ownerId);session=undefined}
  if(session){ensureSessionMatchesFile(session,input.videoPath,info.size);session=getYouTubeUploadSession(input.job.id,input.job.ownerId)}
  if(session?.state==='active'){
    const status=await querySessionStatus(session,input.getAccessToken);
    if(status.kind==='completed')return status.result;
    if(status.kind==='expired'){
      if(session.lastAttemptAt||session.nextOffset>0){markYouTubeUploadNeedsReconcile(session.publishJobId,session.ownerId,404);throw new YouTubeUploadNeedsReconcileError('Resumable session đã hết hạn sau khi upload từng bắt đầu; cần kiểm tra YouTube trước khi tạo session mới.',404)}
      resetYouTubeUploadSession(session.publishJobId,session.ownerId);session=undefined;
    }else session=getYouTubeUploadSession(input.job.id,input.job.ownerId);
  }
  if(!session)session=await createSession({job:input.job,videoPath:input.videoPath,fileSize:info.size,chunkSize,metadata:input.metadata,getAccessToken:input.getAccessToken});
  let offset=session.nextOffset,stalled308=0,consecutiveFailures=0;
  const fh=await open(input.videoPath,'r');
  try{
    while(offset<info.size){
      const len=Math.min(session.chunkSize,info.size-offset),buf=Buffer.allocUnsafe(len),read=await fh.read(buf,0,len,offset);
      if(read.bytesRead<=0)throw new Error('Không đọc được dữ liệu video');
      const end=offset+read.bytesRead-1;markYouTubeUploadAttempt(input.job.id,input.job.ownerId);
      let response:Response|undefined,networkError:string|undefined;
      try{const token=await input.getAccessToken();response=await request(session.sessionUri,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'video/mp4','content-length':String(read.bytesRead),'content-range':`bytes ${offset}-${end}/${info.size}`},body:buf.subarray(0,read.bytesRead)})}catch(e){networkError=e instanceof Error?e.message:String(e)}
      if(response?.status===308){
        const next=nextOffsetFromRange(response.headers.get('range'),info.size);updateYouTubeUploadProgress(input.job.id,input.job.ownerId,next,308);
        if(next>offset){offset=next;stalled308=0;consecutiveFailures=0;continue}
        stalled308++;consecutiveFailures++;
        if(stalled308>=retryMax()||consecutiveFailures>=retryMax()){markYouTubeUploadNeedsReconcile(input.job.id,input.job.ownerId,308);throw new YouTubeUploadNeedsReconcileError('YouTube nhiều lần trả 308 nhưng không ghi nhận tiến độ; cần Reconcile.',308)}
        await sleep(backoffMs(stalled308,response.headers.get('retry-after')));continue;
      }
      if(response?.ok){const text=await response.text(),result=remoteResult(parseJson(text));if(!result){markYouTubeUploadNeedsReconcile(input.job.id,input.job.ownerId,response.status);throw new YouTubeUploadNeedsReconcileError('YouTube báo upload hoàn tất nhưng thiếu video id; cần Reconcile.',response.status)}markYouTubeUploadCompleted(input.job.id,input.job.ownerId,result.remoteId,result.remoteUrl);return result}
      const status=response?.status;
      if(response&&status===404){markYouTubeUploadNeedsReconcile(input.job.id,input.job.ownerId,404);throw new YouTubeUploadNeedsReconcileError('Resumable session hết hạn trong lúc upload; cần kiểm tra YouTube trước khi Retry.',404)}
      if(response&&status&&!RETRYABLE_HTTP.has(status)){const text=await response.text();markYouTubeUploadFailed(input.job.id,input.job.ownerId,status);throw new YouTubeUploadPermanentError(`YouTube upload thất bại ${status}: ${text.slice(0,500)}`,status)}
      consecutiveFailures++;bumpYouTubeUploadRetry(input.job.id,input.job.ownerId,status);
      const retryNo=Math.min(retryMax(),consecutiveFailures);await sleep(backoffMs(retryNo,response?.headers.get('retry-after')||null));
      const fresh=getYouTubeUploadSession(input.job.id,input.job.ownerId);if(!fresh){throw new YouTubeUploadNeedsReconcileError('Mất resumable session trong lúc phục hồi upload.')}
      const before=offset,checked=await querySessionStatus(fresh,input.getAccessToken);
      if(checked.kind==='completed')return checked.result;
      if(checked.kind==='expired'){markYouTubeUploadNeedsReconcile(input.job.id,input.job.ownerId,404);throw new YouTubeUploadNeedsReconcileError('Không thể xác nhận session sau lỗi truyền tải; session đã hết hạn.',404)}
      offset=checked.offset;stalled308=0;
      if(offset>before)consecutiveFailures=0;
      else if(consecutiveFailures>=retryMax()){markYouTubeUploadNeedsReconcile(input.job.id,input.job.ownerId,status);throw new YouTubeUploadNeedsReconcileError(`Không có tiến độ sau ${retryMax()} lần phục hồi resumable upload; cần Reconcile.`,status)}
      if(networkError)console.warn(`[youtube-upload] recovered after network error at byte ${offset}: ${networkError}`);
    }
  }finally{await fh.close()}
  markYouTubeUploadNeedsReconcile(input.job.id,input.job.ownerId);
  throw new YouTubeUploadNeedsReconcileError('Upload kết thúc vòng lặp nhưng chưa nhận video id; cần Reconcile.');
}
