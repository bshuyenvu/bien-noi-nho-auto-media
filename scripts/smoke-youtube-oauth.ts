import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeYouTubeOAuthState,parseYouTubeOAuthState,uploadYouTubeVideo,youtubeAuthorizationUrl,youtubeReadiness,youtubePrivacyFor,YOUTUBE_REQUIRED_SCOPES } from '../src/publish/youtube.js';
import { publisherFor } from '../src/publish/providers.js';
import type { PublishJob } from '../src/publish/queue.js';

process.env.YOUTUBE_CLIENT_ID='test-client';
process.env.YOUTUBE_CLIENT_SECRET='test-secret';
process.env.YOUTUBE_REDIRECT_URI='http://localhost:8787/api/publish-oauth/youtube/callback';
process.env.OAUTH_STATE_SECRET='smoke-oauth-state-secret-1234567890';
process.env.YOUTUBE_UPLOAD_CHUNK_BYTES='262144';
process.env.YOUTUBE_READINESS_MAX_AGE_MS='900000';
process.env.YOUTUBE_PRIVACY_STATUS='public';

const ownerId='owner-smoke';
const state=makeYouTubeOAuthState(ownerId);
const parsed=parseYouTubeOAuthState(state);
if(parsed.ownerId!==ownerId)throw new Error('OAuth state owner mismatch');
const auth=new URL(youtubeAuthorizationUrl(ownerId)),scopes=String(auth.searchParams.get('scope')||'').split(/\s+/);
for(const scope of YOUTUBE_REQUIRED_SCOPES)if(!scopes.includes(scope))throw new Error(`Missing YouTube OAuth scope ${scope}`);
if(auth.searchParams.get('access_type')!=='offline')throw new Error('OAuth offline access missing');
if(!auth.searchParams.get('state'))throw new Error('OAuth state missing');

const dir=await mkdtemp(join(tmpdir(),'youtube-smoke-'));
const video=join(dir,'video.mp4');
await writeFile(video,Buffer.alloc(1024,7));
const originalFetch=globalThis.fetch;
let channelChecked=false,initChecked=false,putChecked=false,tokenRefreshes=0;
globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='https://oauth2.googleapis.com/token'){
    tokenRefreshes++;
    if(init?.method!=='POST')throw new Error('Token refresh must be POST');
    return new Response(JSON.stringify({access_token:'refreshed-access-token',expires_in:3600,token_type:'Bearer'}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.startsWith('https://www.googleapis.com/youtube/v3/channels')){
    channelChecked=true;
    const u=new URL(url);
    if(u.searchParams.get('mine')!=='true'||u.searchParams.get('part')!=='snippet')throw new Error('YouTube channel readiness query mismatch');
    return new Response(JSON.stringify({items:[{id:'UC_SMOKE_123',snippet:{title:'Smoke Channel'}}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')){
    initChecked=true;
    if(init?.method!=='POST')throw new Error('Upload init must be POST');
    const u=new URL(url);
    if(u.searchParams.get('uploadType')!=='resumable')throw new Error('Missing resumable uploadType');
    if(u.searchParams.get('part')!=='snippet,status')throw new Error('Missing metadata parts');
    const body=JSON.parse(String(init.body||'{}')) as any;
    if(body.snippet?.title!=='Smoke YouTube')throw new Error('Metadata title mismatch');
    if(body.status?.privacyStatus!=='public')throw new Error('Normal production privacy mismatch');
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
  const verifiedAt=new Date().toISOString();
  const credential={platform:'youtube' as const,accountLabel:'Smoke Channel',secret:{refreshToken:'refresh-smoke',scope:YOUTUBE_REQUIRED_SCOPES.join(' '),channelId:'UC_SMOKE_123',channelTitle:'Smoke Channel',verifiedAt}};
  const readiness=await youtubeReadiness(credential);
  if(!readiness.ok||readiness.channelId!=='UC_SMOKE_123'||readiness.channelTitle!=='Smoke Channel')throw new Error(`readiness failed: ${JSON.stringify(readiness)}`);
  publisherFor('youtube').validateCredential(credential);
  let staleRejected=false;
  try{publisherFor('youtube').validateCredential({...credential,secret:{...credential.secret,verifiedAt:new Date(Date.now()-60*60_000).toISOString()}})}catch{staleRejected=true}
  if(!staleRejected)throw new Error('stale readiness credential was accepted');
  const now=new Date().toISOString();
  const job:PublishJob={id:'publish-smoke',ownerId,renderJobId:'render-smoke',draftId:'draft-smoke',platform:'youtube',status:'publishing',title:'Smoke YouTube',description:'Smoke upload',dryRun:false,deploymentTest:false,attempts:1,maxAttempts:3,createdAt:now,updatedAt:now};
  if(youtubePrivacyFor(job)!=='public')throw new Error('production privacy should be public in smoke config');
  if(youtubePrivacyFor({...job,deploymentTest:true})!=='private')throw new Error('deployment test must always force private privacy');
  const result=await uploadYouTubeVideo(job,video,credential);
  if(result.remoteId!=='video-smoke-123'||result.dryRun)throw new Error('Upload result mismatch');
  if(!channelChecked||!initChecked||!putChecked||tokenRefreshes<2)throw new Error('YouTube readiness/upload flow incomplete');
  console.log('YouTube OAuth/readiness/private-gate/upload smoke OK');
}finally{
  globalThis.fetch=originalFetch;
  await rm(dir,{recursive:true,force:true});
}
