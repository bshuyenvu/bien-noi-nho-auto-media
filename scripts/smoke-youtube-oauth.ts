import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeYouTubeOAuthState,parseYouTubeOAuthState,uploadYouTubeVideo,youtubeAuthorizationUrl } from '../src/publish/youtube.js';
import type { PublishJob } from '../src/publish/queue.js';

process.env.YOUTUBE_CLIENT_ID='test-client';
process.env.YOUTUBE_CLIENT_SECRET='test-secret';
process.env.YOUTUBE_REDIRECT_URI='http://localhost:8787/api/publish-oauth/youtube/callback';
process.env.OAUTH_STATE_SECRET='smoke-oauth-state-secret-1234567890';
process.env.YOUTUBE_UPLOAD_CHUNK_BYTES='262144';

const ownerId='owner-smoke';
const state=makeYouTubeOAuthState(ownerId);
const parsed=parseYouTubeOAuthState(state);
if(parsed.ownerId!==ownerId)throw new Error('OAuth state owner mismatch');
const auth=new URL(youtubeAuthorizationUrl(ownerId));
if(auth.searchParams.get('scope')!=='https://www.googleapis.com/auth/youtube.upload')throw new Error('YouTube scope mismatch');
if(auth.searchParams.get('access_type')!=='offline')throw new Error('OAuth offline access missing');
if(!auth.searchParams.get('state'))throw new Error('OAuth state missing');

const dir=await mkdtemp(join(tmpdir(),'youtube-smoke-'));
const video=join(dir,'video.mp4');
await writeFile(video,Buffer.alloc(1024,7));
const originalFetch=globalThis.fetch;
let initChecked=false,putChecked=false;
globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')){
    initChecked=true;
    if(init?.method!=='POST')throw new Error('Upload init must be POST');
    const u=new URL(url);
    if(u.searchParams.get('uploadType')!=='resumable')throw new Error('Missing resumable uploadType');
    if(u.searchParams.get('part')!=='snippet,status')throw new Error('Missing metadata parts');
    const body=JSON.parse(String(init.body||'{}')) as any;
    if(body.snippet?.title!=='Smoke YouTube')throw new Error('Metadata title mismatch');
    return new Response('',{status:200,headers:{location:'https://upload.example.test/session-1'}});
  }
  if(url==='https://upload.example.test/session-1'){
    putChecked=true;
    if(init?.method!=='PUT')throw new Error('Upload chunk must be PUT');
    if(!String((init?.headers as Record<string,string>)?.['content-range']||'').startsWith('bytes 0-1023/1024'))throw new Error('Content-Range mismatch');
    return new Response(JSON.stringify({id:'video-smoke-123'}),{status:200,headers:{'content-type':'application/json'}});
  }
  throw new Error(`Unexpected fetch ${url}`);
};

try{
  const now=new Date().toISOString();
  const job:PublishJob={id:'publish-smoke',ownerId,renderJobId:'render-smoke',draftId:'draft-smoke',platform:'youtube',status:'publishing',title:'Smoke YouTube',description:'Smoke upload',dryRun:false,attempts:1,maxAttempts:3,createdAt:now,updatedAt:now};
  const result=await uploadYouTubeVideo(job,video,{platform:'youtube',accountLabel:'Smoke',secret:{accessToken:'test-access-token'}});
  if(result.remoteId!=='video-smoke-123'||result.dryRun)throw new Error('Upload result mismatch');
  if(!initChecked||!putChecked)throw new Error('Upload flow incomplete');
  console.log('YouTube OAuth/upload smoke OK');
}finally{
  globalThis.fetch=originalFetch;
  await rm(dir,{recursive:true,force:true});
}
