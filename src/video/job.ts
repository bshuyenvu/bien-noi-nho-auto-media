import { generateSpeech, type VoiceId, type VoiceStyle } from '../tts/edge.js';
import { downloadRemoteImage } from '../media/download.js';
import { selectBestMedia } from '../media/select.js';
import { importArticleFromUrl } from '../import/url.js';
import { all, run } from '../storage/db.js';
import { readdir, rm } from 'node:fs/promises';
import { directScenes } from './scenes.js';
import { cancelActiveFfmpeg, renderNewsVideo, type VideoTemplate, type MotionLevel, type TickerMode, type VideoScene } from './ffmpeg.js';
import { resourceSnapshot, waitForRenderResources } from '../system/resource-guard.js';
import { cleanupOldOutput, ensureStorageForRender, storageSnapshot } from '../system/storage-guard.js';

export type RenderStatus = 'queued' | 'rendering' | 'ready' | 'failed';
export interface EnqueueRenderInput {
  draftId:string; ownerId:string; text:string; headline:string; source?:string; sourceUrl?:string; publishedAt?:string;
  breaking?:boolean; voice?:VoiceId; voiceRate?:string; voiceStyle?:VoiceStyle; imageUrl?:string; imageUrls?:string[];
  autoCollectImages?:boolean; smartScenes?:boolean; scenes?:VideoScene[]; template?:VideoTemplate; motion?:MotionLevel;
  tickerMode?:TickerMode; tickerText?:string; tickerSpeed?:number; channelName?:string;
}
export interface RenderJob {
  id:string; draftId:string; ownerId:string; status:RenderStatus; progress:number; output?:string; error?:string;
  createdAt:string; updatedAt:string; attempts:number; maxAttempts:number; nextAttemptAt?:string; checkpointStage?:string; interruptedAt?:string;
}
type JobRow={id:string;draft_id:string;owner_id:string;status:RenderStatus;progress:number;output?:string;error?:string;created_at:string;updated_at?:string;payload_json?:string;attempts?:number;max_attempts?:number;next_attempt_at?:string;checkpoint_stage?:string;interrupted_at?:string};
type PendingRender={job:RenderJob;input:EnqueueRenderInput};

const pendingRenders:PendingRender[]=[];
const renderInputs=new Map<string,EnqueueRenderInput>();
const DEFAULT_MAX_ATTEMPTS=Math.max(1,Number(process.env.RENDER_MAX_ATTEMPTS||3));
const RETRY_BASE_MS=Math.max(1000,Number(process.env.RENDER_RETRY_BASE_MS||15000));
const TTS_TIMEOUT_MS=Math.max(30_000,Number(process.env.TTS_TIMEOUT_MS||5*60_000));
let workerBusy=false;
let workerPaused=process.env.RENDER_QUEUE_PAUSED==='true';
let currentJobId:string|null=null;
let currentStage='idle';
let lastActivityAt=new Date().toISOString();
let completedSinceStart=0;
let failedSinceStart=0;
let recoveredSinceStart=0;
let shuttingDown=false;

function parseInput(raw?:string){if(!raw)return undefined;try{return JSON.parse(raw) as EnqueueRenderInput}catch{return undefined}}
function touchActivity(stage?:string){lastActivityAt=new Date().toISOString();if(stage)currentStage=stage}
function save(job:RenderJob,input?:EnqueueRenderInput){const payload=input||renderInputs.get(job.id);job.updatedAt=new Date().toISOString();run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,error,created_at,payload_json,attempts,max_attempts,next_attempt_at,updated_at,checkpoint_stage,interrupted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,progress=excluded.progress,output=excluded.output,error=excluded.error,payload_json=COALESCE(excluded.payload_json,render_jobs.payload_json),attempts=excluded.attempts,max_attempts=excluded.max_attempts,next_attempt_at=excluded.next_attempt_at,updated_at=excluded.updated_at,checkpoint_stage=excluded.checkpoint_stage,interrupted_at=excluded.interrupted_at',job.id,job.draftId,job.ownerId,job.status,job.progress,job.output||null,job.error||null,job.createdAt,payload?JSON.stringify(payload):null,job.attempts,job.maxAttempts,job.nextAttemptAt||null,job.updatedAt,job.checkpointStage||null,job.interruptedAt||null)}
function checkpoint(job:RenderJob,stage:string,input?:EnqueueRenderInput){job.checkpointStage=stage;touchActivity(stage);save(job,input)}
function backoffMs(attempt:number){return Math.min(15*60_000,RETRY_BASE_MS*Math.pow(2,Math.max(0,attempt-1)))}
function queuePending(job:RenderJob,input:EnqueueRenderInput,delayMs=0){if(pendingRenders.some(x=>x.job.id===job.id)||currentJobId===job.id)return;const add=()=>{if(shuttingDown)return;if(!pendingRenders.some(x=>x.job.id===job.id)){pendingRenders.push({job,input});touchActivity('queued');void pumpRenderQueue()}};if(delayMs>0)setTimeout(add,delayMs);else add()}
function withTimeout<T>(promise:Promise<T>,ms:number,label:string){return new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${label} timed out after ${Math.round(ms/1000)}s`)),ms);promise.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)})})}

export const renderJobs:RenderJob[]=all<JobRow>('SELECT * FROM render_jobs ORDER BY created_at DESC LIMIT 100').map(r=>({id:r.id,draftId:r.draft_id,ownerId:r.owner_id||'legacy-admin',status:r.status,progress:r.progress,output:r.output||undefined,error:r.error||undefined,createdAt:r.created_at,updatedAt:r.updated_at||r.created_at,attempts:Number(r.attempts||0),maxAttempts:Number(r.max_attempts||DEFAULT_MAX_ATTEMPTS),nextAttemptAt:r.next_attempt_at||undefined,checkpointStage:r.checkpoint_stage||undefined,interruptedAt:r.interrupted_at||undefined}));
const bootRows=all<JobRow>('SELECT * FROM render_jobs WHERE status IN (?,?) ORDER BY created_at ASC','queued','rendering');
for(const row of bootRows){const input=parseInput(row.payload_json),job=renderJobs.find(x=>x.id===row.id);if(!job)continue;if(!input){job.status='failed';job.error='Recovery unavailable: render payload was not persisted';job.nextAttemptAt=undefined;checkpoint(job,'recovery-failed');continue}renderInputs.set(job.id,input);job.status='queued';job.progress=0;job.error=row.status==='rendering'?'Recovered after server restart':row.error||undefined;job.nextAttemptAt=undefined;job.checkpointStage='recovered';save(job,input);pendingRenders.push({job,input});recoveredSinceStart++}

async function cleanupArtifacts(jobId:string){try{const files=await readdir('output');await Promise.allSettled(files.filter(name=>name===jobId+'.mp4'||name===jobId+'.mp3'||name===jobId+'.srt'||name.startsWith(jobId+'-')).map(name=>rm(`output/${name}`,{force:true})))}catch{}}
export async function deleteRenderJob(id:string){const i=renderJobs.findIndex(j=>j.id===id);if(i<0)return false;const[job]=renderJobs.splice(i,1);renderInputs.delete(id);const p=pendingRenders.findIndex(x=>x.job.id===id);if(p>=0)pendingRenders.splice(p,1);run('DELETE FROM render_jobs WHERE id=?',id);await cleanupArtifacts(job.id);return true}
export async function deleteRenderJobs(ids:string[]){let deleted=0;for(const id of [...new Set(ids)])if(await deleteRenderJob(id))deleted++;return deleted}
export async function deleteRenderJobsForDraft(draftId:string){return deleteRenderJobs(renderJobs.filter(j=>j.draftId===draftId).map(j=>j.id))}

function watchdogStatus(){const timeoutMs=Math.max(60_000,Number(process.env.RENDER_WATCHDOG_MS||20*60_000)),idleMs=Date.now()-new Date(lastActivityAt).getTime();return{timeoutMs,idleMs,stalled:Boolean(workerBusy&&currentJobId&&idleMs>timeoutMs),stage:currentStage}}
export async function renderWorkerStatus(){return{singleWorker:true,persistentQueue:true,hardRecovery:true,gracefulShutdown:true,recoveredSinceStart,lowMemoryMode:process.env.LOW_MEMORY_MODE!=='false',paused:workerPaused,busy:workerBusy,shuttingDown,currentJobId,pending:pendingRenders.length,completedSinceStart,failedSinceStart,lastActivityAt,watchdog:watchdogStatus(),resources:resourceSnapshot(),storage:await storageSnapshot().catch(()=>null)}}
export function pauseRenderQueue(){workerPaused=true;touchActivity('paused')}
export function resumeRenderQueue(){if(shuttingDown)return;workerPaused=false;touchActivity('resuming');void pumpRenderQueue()}
export async function cleanupRenderOutput(){return cleanupOldOutput(currentJobId?[currentJobId]:[])}
export async function retryRenderJob(id:string){const job=renderJobs.find(j=>j.id===id);if(!job)throw new Error('Render job not found');if(job.status!=='failed')throw new Error('Only failed render jobs can be retried');const input=renderInputs.get(id)||parseInput(all<JobRow>('SELECT payload_json FROM render_jobs WHERE id=?',id)[0]?.payload_json);if(!input)throw new Error('Render payload is unavailable; render again from the draft');renderInputs.set(id,input);job.status='queued';job.progress=0;job.error=undefined;job.nextAttemptAt=undefined;job.interruptedAt=undefined;checkpoint(job,'manual-retry',input);queuePending(job,input);return job}
async function waitWhilePaused(){while(workerPaused&&!shuttingDown)await new Promise(r=>setTimeout(r,1000));if(shuttingDown)throw new Error('Worker is shutting down')}

async function processRender(job:RenderJob,input:EnqueueRenderInput){try{await waitWhilePaused();job.attempts++;job.nextAttemptAt=undefined;checkpoint(job,'resource-check',input);await waitForRenderResources();await ensureStorageForRender([job.id]);currentJobId=job.id;job.status='rendering';job.progress=10;job.error=undefined;checkpoint(job,'starting',input);
const base=`output/${job.id}`;let discovered:string[]=[],publishedAt=input.publishedAt;if(input.autoCollectImages!==false&&input.sourceUrl){try{checkpoint(job,'collecting-media');const article=await importArticleFromUrl(input.sourceUrl);discovered=article.imageUrls||[];publishedAt=publishedAt||article.publishedAt;job.progress=18;checkpoint(job,'media-collected')}catch(e){console.warn('Auto image collection skipped:',e)}}
const manualUrls=[input.imageUrl,...(input.imageUrls||[])].filter((x):x is string=>Boolean(x)),urls=[...manualUrls,...discovered.filter(x=>!manualUrls.includes(x))].filter((x,i,a)=>a.indexOf(x)===i).slice(0,process.env.LOW_MEMORY_MODE==='false'?14:10),downloaded:{path:string;url:string;manual:boolean}[]=[];for(let i=0;i<urls.length;i++){await waitWhilePaused();checkpoint(job,`downloading-image-${i+1}`);const url=urls[i];try{downloaded.push({path:await downloadRemoteImage(url,`${base}-image-${i+1}`),url,manual:manualUrls.includes(url)})}catch(e){console.warn(`Image ${i+1} download skipped:`,e)}job.progress=Math.min(36,20+Math.round(((i+1)/Math.max(1,urls.length))*16));save(job)}
checkpoint(job,'selecting-media');const media=await selectBestMedia(downloaded,process.env.LOW_MEMORY_MODE==='false'?10:8);for(const r of media.rejected)console.warn(`Smart Media rejected ${r.url||r.path}: ${r.width}x${r.height} — ${r.reason}`);let selected=media.selected;if(manualUrls.length)selected=[...selected].sort((a,b)=>{const ai=manualUrls.indexOf(a.url||''),bi=manualUrls.indexOf(b.url||'');if(ai>=0&&bi>=0)return ai-bi;if(ai>=0)return-1;if(bi>=0)return 1;return b.score-a.score});const imagePaths=selected.map(x=>x.path);let scenes:VideoScene[]|undefined;if(input.smartScenes!==false){const valid=(input.scenes||[]).filter(s=>s.imageIndex>=0&&s.imageIndex<imagePaths.length&&s.startRatio>=0&&s.endRatio<=1&&s.endRatio>s.startRatio);scenes=valid.length?valid:directScenes(input.text,imagePaths.length)}
job.progress=42;checkpoint(job,'tts');await waitWhilePaused();await withTimeout(generateSpeech({text:input.text,voice:input.voice??'vi-male',rate:input.voiceRate??'+0%',style:input.voiceStyle??(input.breaking?'breaking':'news'),audioPath:`${base}.mp3`,srtPath:`${base}.srt`}),TTS_TIMEOUT_MS,'TTS');job.progress=60;checkpoint(job,'pre-ffmpeg-check');await waitWhilePaused();await waitForRenderResources();await ensureStorageForRender([job.id]);checkpoint(job,'ffmpeg');job.output=await renderNewsVideo({audioPath:`${base}.mp3`,srtPath:`${base}.srt`,outputPath:`${base}.mp4`,headline:input.headline,source:input.source,publishedAt,breaking:input.breaking,imagePaths,scenes,template:input.template,motion:input.motion,tickerMode:input.tickerMode,tickerText:input.tickerText,tickerSpeed:input.tickerSpeed,channelName:input.channelName});job.progress=100;job.status='ready';job.error=undefined;job.nextAttemptAt=undefined;job.interruptedAt=undefined;completedSinceStart++;checkpoint(job,'completed');await cleanupOldOutput([job.id]).catch(()=>undefined)
}catch(e){if(shuttingDown){job.status='queued';job.progress=0;job.error='Interrupted during graceful shutdown; queued for recovery';job.nextAttemptAt=undefined;job.interruptedAt=new Date().toISOString();checkpoint(job,'interrupted',input);return}const message=e instanceof Error?e.message:String(e);failedSinceStart++;if(job.attempts<job.maxAttempts){const delay=backoffMs(job.attempts);job.status='queued';job.progress=0;job.error=`Attempt ${job.attempts}/${job.maxAttempts} failed: ${message}`;job.nextAttemptAt=new Date(Date.now()+delay).toISOString();checkpoint(job,'retry-backoff',input);queuePending(job,input,delay)}else{job.status='failed';job.error=`Failed after ${job.attempts} attempts: ${message}`;job.nextAttemptAt=undefined;checkpoint(job,'failed',input)}}finally{currentJobId=null;currentStage='idle'}}

async function pumpRenderQueue(){if(workerBusy||workerPaused||shuttingDown)return;workerBusy=true;touchActivity('worker-start');try{while(pendingRenders.length){if(workerPaused||shuttingDown)break;const next=pendingRenders.shift();if(!next)break;await processRender(next.job,next.input)}}finally{workerBusy=false;currentJobId=null;touchActivity(shuttingDown?'shutdown':'idle');if(pendingRenders.length&&!workerPaused&&!shuttingDown)void pumpRenderQueue()}}
export function enqueueRender(input:EnqueueRenderInput){if(shuttingDown)throw new Error('Render worker is shutting down');const now=new Date().toISOString(),job:RenderJob={id:crypto.randomUUID(),draftId:input.draftId,ownerId:input.ownerId,status:'queued',progress:0,createdAt:now,updatedAt:now,attempts:0,maxAttempts:DEFAULT_MAX_ATTEMPTS,checkpointStage:'queued'};renderJobs.unshift(job);renderInputs.set(job.id,input);save(job,input);queuePending(job,input);return job}

export async function prepareRenderShutdown(signal:'SIGTERM'|'SIGINT'){if(shuttingDown)return;shuttingDown=true;workerPaused=true;touchActivity('shutdown');const job=currentJobId?renderJobs.find(x=>x.id===currentJobId):undefined;if(job){const input=renderInputs.get(job.id);job.status='queued';job.progress=0;job.error=`Interrupted by ${signal}; queued for recovery`;job.nextAttemptAt=undefined;job.interruptedAt=new Date().toISOString();checkpoint(job,'interrupted',input);cancelActiveFfmpeg('SIGTERM')}for(const pending of pendingRenders){pending.job.status='queued';pending.job.nextAttemptAt=undefined;checkpoint(pending.job,'queued',pending.input)}}
function installSignal(signal:'SIGTERM'|'SIGINT'){process.once(signal,()=>{void prepareRenderShutdown(signal).finally(()=>{const graceMs=Math.max(250,Number(process.env.SHUTDOWN_GRACE_MS||5000));setTimeout(()=>process.exit(0),graceMs).unref()})})}
installSignal('SIGTERM');installSignal('SIGINT');

const watchdogTimer=setInterval(()=>{const w=watchdogStatus();if(w.stalled&&w.stage==='ffmpeg')cancelActiveFfmpeg('SIGTERM')},30_000);watchdogTimer.unref();
if(pendingRenders.length&&!workerPaused)queueMicrotask(()=>void pumpRenderQueue());
