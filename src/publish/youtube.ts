import { createHmac,timingSafeEqual } from 'node:crypto';
import { open,stat } from 'node:fs/promises';
import type { PublishCredential,PublishResult } from './providers.js';
import type { PublishJob } from './queue.js';

const AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const UPLOAD_URL='https://www.googleapis.com/upload/youtube/v3/videos';
const SCOPE='https://www.googleapis.com/auth/youtube.upload';

function required(name:string){const v=process.env[name];if(!v)throw new Error(`${name} chưa được cấu hình`);return v}
function oauthConfig(){return{clientId:required('YOUTUBE_CLIENT_ID'),clientSecret:required('YOUTUBE_CLIENT_SECRET'),redirectUri:required('YOUTUBE_REDIRECT_URI')}}
function stateKey(){return Buffer.from(process.env.OAUTH_STATE_SECRET||process.env.CREDENTIAL_VAULT_KEY||required('OAUTH_STATE_SECRET'))}
function b64url(v:string){return Buffer.from(v).toString('base64url')}
function sign(v:string){return createHmac('sha256',stateKey()).update(v).digest('base64url')}

export function makeYouTubeOAuthState(ownerId:string){const payload=b64url(JSON.stringify({ownerId,exp:Date.now()+10*60_000}));return `${payload}.${sign(payload)}`}
export function parseYouTubeOAuthState(state:string){const [payload,sig]=state.split('.');if(!payload||!sig)throw new Error('OAuth state không hợp lệ');const expected=sign(payload),a=Buffer.from(sig),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('OAuth state signature không hợp lệ');const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as {ownerId:string;exp:number};if(!data.ownerId||Date.now()>data.exp)throw new Error('OAuth state đã hết hạn');return data}

export function youtubeAuthorizationUrl(ownerId:string){const c=oauthConfig(),u=new URL(AUTH_URL);u.searchParams.set('client_id',c.clientId);u.searchParams.set('redirect_uri',c.redirectUri);u.searchParams.set('response_type','code');u.searchParams.set('scope',SCOPE);u.searchParams.set('access_type','offline');u.searchParams.set('include_granted_scopes','true');u.searchParams.set('prompt','consent');u.searchParams.set('state',makeYouTubeOAuthState(ownerId));return u.toString()}

async function postToken(params:URLSearchParams){const r=await fetch(TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params});const data=await r.json() as Record<string,unknown>;if(!r.ok)throw new Error(`YouTube OAuth token error ${r.status}: ${String(data.error_description||data.error||'unknown')}`);return data}
export async function exchangeYouTubeCode(code:string){const c=oauthConfig(),data=await postToken(new URLSearchParams({code,client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,grant_type:'authorization_code'}));return{accessToken:String(data.access_token||''),refreshToken:String(data.refresh_token||''),expiresIn:Number(data.expires_in||0),scope:String(data.scope||SCOPE),tokenType:String(data.token_type||'Bearer')}}
async function refreshYouTubeAccessToken(refreshToken:string){const c=oauthConfig(),data=await postToken(new URLSearchParams({refresh_token:refreshToken,client_id:c.clientId,client_secret:c.clientSecret,grant_type:'refresh_token'}));const token=String(data.access_token||'');if(!token)throw new Error('Google không trả access token mới');return token}
async function accessTokenFor(c?:PublishCredential){const s=c?.secret;if(!s)throw new Error('YouTube credential chưa được cấu hình');if(s.refreshToken)return refreshYouTubeAccessToken(s.refreshToken);if(s.accessToken)return s.accessToken;throw new Error('YouTube credential thiếu refreshToken/accessToken')}

function privacyFor(job:PublishJob){if(job.scheduledAt&&new Date(job.scheduledAt).getTime()>Date.now())return'private';const p=String(process.env.YOUTUBE_PRIVACY_STATUS||'private');return p==='public'||p==='unlisted'?p:'private'}

export async function uploadYouTubeVideo(job:PublishJob,videoPath:string,credential?:PublishCredential):Promise<PublishResult>{
  const accessToken=await accessTokenFor(credential),info=await stat(videoPath),privacyStatus=privacyFor(job);
  const status:Record<string,unknown>={privacyStatus,selfDeclaredMadeForKids:false};
  if(job.scheduledAt&&new Date(job.scheduledAt).getTime()>Date.now())status.publishAt=new Date(job.scheduledAt).toISOString();
  if(process.env.YOUTUBE_CONTAINS_SYNTHETIC_MEDIA!=='false')status.containsSyntheticMedia=true;
  const metadata={snippet:{title:job.title.slice(0,100),description:(job.description||'').slice(0,5000),categoryId:String(process.env.YOUTUBE_CATEGORY_ID||'22')},status};
  const initUrl=new URL(UPLOAD_URL);initUrl.searchParams.set('uploadType','resumable');initUrl.searchParams.set('part','snippet,status');
  const init=await fetch(initUrl,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json; charset=UTF-8','x-upload-content-length':String(info.size),'x-upload-content-type':'video/mp4'},body:JSON.stringify(metadata)});
  if(!init.ok)throw new Error(`YouTube upload init thất bại ${init.status}: ${(await init.text()).slice(0,500)}`);const session=init.headers.get('location');if(!session)throw new Error('YouTube không trả resumable upload URL');
  const fh=await open(videoPath,'r');try{const chunkSize=Math.max(256*1024,Number(process.env.YOUTUBE_UPLOAD_CHUNK_BYTES||8*1024*1024));let offset=0,last:Record<string,unknown>|undefined;while(offset<info.size){const len=Math.min(chunkSize,info.size-offset),buf=Buffer.allocUnsafe(len),read=await fh.read(buf,0,len,offset);if(read.bytesRead<=0)throw new Error('Không đọc được dữ liệu video');const end=offset+read.bytesRead-1,r=await fetch(session,{method:'PUT',headers:{authorization:`Bearer ${accessToken}`,'content-type':'video/mp4','content-length':String(read.bytesRead),'content-range':`bytes ${offset}-${end}/${info.size}`},body:buf.subarray(0,read.bytesRead)});if(r.status===308){offset=end+1;continue}const text=await r.text();if(!r.ok)throw new Error(`YouTube upload thất bại ${r.status}: ${text.slice(0,500)}`);last=text?JSON.parse(text) as Record<string,unknown>:{};offset=end+1;}const id=String(last?.id||'');if(!id)throw new Error('YouTube upload hoàn tất nhưng thiếu video id');return{remoteId:id,remoteUrl:`https://www.youtube.com/watch?v=${id}`,publishedAt:new Date().toISOString(),dryRun:false}}finally{await fh.close()}
}
