import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=await mkdtemp(join(tmpdir(),'youtube-resumable-smoke-'));
process.env.DB_PATH=join(dir,'test.sqlite');
process.env.YOUTUBE_UPLOAD_CHUNK_BYTES='300000';
process.env.YOUTUBE_UPLOAD_MAX_RETRIES='3';
process.env.YOUTUBE_UPLOAD_RETRY_BASE_MS='1';
process.env.YOUTUBE_UPLOAD_RETRY_MAX_MS='10';
process.env.YOUTUBE_UPLOAD_RETRY_JITTER='false';
process.env.YOUTUBE_UPLOAD_REQUEST_TIMEOUT_MS='5000';

const { uploadYouTubeResumable,normalizedYouTubeChunkSize,YouTubeUploadNeedsReconcileError }=await import('../src/publish/youtube-resumable.js');
const { createYouTubeUploadSession,getYouTubeUploadSession,markYouTubeUploadAttempt,updateYouTubeUploadProgress }=await import('../src/publish/upload-session.js');
const typeNow=()=>new Date().toISOString();
function job(id:string){const now=typeNow();return{id,ownerId:'owner-resume',renderJobId:`render-${id}`,draftId:`draft-${id}`,platform:'youtube' as const,status:'publishing' as const,title:`Video ${id}`,dryRun:false,deploymentTest:false,attempts:1,maxAttempts:3,createdAt:now,updatedAt:now}}
function rangeOf(init?:RequestInit){return new Headers(init?.headers).get('content-range')||''}

const chunk=normalizedYouTubeChunkSize();
if(chunk!==262144||chunk%(256*1024)!==0)throw new Error(`chunk normalization failed: ${chunk}`);
const video1=join(dir,'video1.mp4'),video2=join(dir,'video2.mp4'),video3=join(dir,'video3.mp4');
await writeFile(video1,Buffer.alloc(700000,1));await writeFile(video2,Buffer.alloc(600000,2));await writeFile(video3,Buffer.alloc(1024,3));

const originalFetch=globalThis.fetch;let initCount=0,secondChunkFailures=0,session2StatusChecks=0,session3Checks=0;
globalThis.fetch=async(input,init)=>{
  const url=String(input),range=rangeOf(init);
  if(url.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')){
    initCount++;return new Response(null,{status:200,headers:{location:'https://upload.example.test/session-1'}});
  }
  if(url==='https://upload.example.test/session-1'){
    if(range==='bytes 0-262143/700000')return new Response(null,{status:308,headers:{range:'bytes=0-262143'}});
    if(range==='bytes 262144-524287/700000'&&secondChunkFailures++===0)return new Response('temporary',{status:503,headers:{'retry-after':'0'}});
    if(range==='bytes */700000')return new Response(null,{status:308,headers:{range:'bytes=0-262143'}});
    if(range==='bytes 262144-524287/700000')return new Response(null,{status:308,headers:{range:'bytes=0-524287'}});
    if(range==='bytes 524288-699999/700000')return new Response(JSON.stringify({id:'video-resumed-1'}),{status:201,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected session-1 range ${range}`);
  }
  if(url==='https://upload.example.test/session-2'){
    if(range==='bytes */600000'){session2StatusChecks++;return new Response(null,{status:308,headers:{range:'bytes=0-262143'}})}
    if(range==='bytes 262144-524287/600000')return new Response(null,{status:308,headers:{range:'bytes=0-524287'}});
    if(range==='bytes 524288-599999/600000')return new Response(JSON.stringify({id:'video-resumed-2'}),{status:201,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected session-2 range ${range}`);
  }
  if(url==='https://upload.example.test/session-3'){
    if(range==='bytes */1024'){session3Checks++;return new Response('temporary',{status:503,headers:{'retry-after':'0'}})}
    throw new Error(`unexpected session-3 range ${range}`);
  }
  throw new Error(`unexpected fetch ${url}`);
};

try{
  const result1=await uploadYouTubeResumable({job:job('job-1'),videoPath:video1,metadata:{snippet:{title:'one'},status:{privacyStatus:'private'}},getAccessToken:async()=> 'token'});
  if(result1.remoteId!=='video-resumed-1')throw new Error('job-1 did not complete');
  const s1=getYouTubeUploadSession('job-1','owner-resume');if(s1?.state!=='completed'||s1.nextOffset!==700000||s1.retryCount<1)throw new Error(`job-1 session mismatch ${JSON.stringify(s1)}`);
  if(initCount!==1||secondChunkFailures<2)throw new Error('job-1 retry path was not exercised');

  createYouTubeUploadSession({publishJobId:'job-2',ownerId:'owner-resume',sessionUri:'https://upload.example.test/session-2',filePath:video2,fileSize:600000,chunkSize:chunk});
  markYouTubeUploadAttempt('job-2','owner-resume');updateYouTubeUploadProgress('job-2','owner-resume',262144,308);
  const result2=await uploadYouTubeResumable({job:job('job-2'),videoPath:video2,metadata:{},getAccessToken:async()=> 'token'});
  if(result2.remoteId!=='video-resumed-2'||session2StatusChecks<1)throw new Error('persisted session did not resume after restart');
  if(initCount!==1)throw new Error('resume path incorrectly created a new upload session');

  createYouTubeUploadSession({publishJobId:'job-3',ownerId:'owner-resume',sessionUri:'https://upload.example.test/session-3',filePath:video3,fileSize:1024,chunkSize:chunk});markYouTubeUploadAttempt('job-3','owner-resume');
  let uncertain=false;try{await uploadYouTubeResumable({job:job('job-3'),videoPath:video3,metadata:{},getAccessToken:async()=> 'token'})}catch(e){uncertain=e instanceof YouTubeUploadNeedsReconcileError||Boolean((e as any)?.needsReconcile)}
  const s3=getYouTubeUploadSession('job-3','owner-resume');if(!uncertain||s3?.state!=='needs_reconcile'||session3Checks!==3)throw new Error(`uncertain upload was not quarantined ${JSON.stringify({uncertain,s3,session3Checks})}`);
  console.log('YouTube resumable upload hardening smoke OK');
}finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true})}
