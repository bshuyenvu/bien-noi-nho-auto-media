import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { all,db,run } from '../storage/db.js';
import { downloadRemoteImage,downloadRemoteVideo } from '../media/download.js';
import { runFfmpeg } from '../video/ffmpeg.js';
import { createSceneVisualCard } from '../video/scene-card.js';
import { buildGenerationHandoff } from './pipeline-v2-runtime.js';
import { getPipelineProject } from './pipeline-v2.js';

export type SceneMediaKind='image'|'video';
export type SceneMediaJobStatus='queued'|'running'|'ready'|'failed';
export type SceneMediaProviderId='local-original-card'|'remote-image-webhook'|'remote-video-webhook';

export interface SceneMediaProviderCapability{
  id:SceneMediaProviderId;kind:SceneMediaKind;status:'ready'|'configured'|'disabled';mode:string;model?:string;notes:string;
}
export interface SceneMediaJob{
  id:string;projectId:string;ownerId:string;sceneIndex:number;kind:SceneMediaKind;providerId:SceneMediaProviderId;
  model:string;prompt:string;negativePrompt?:string;continuityKey:string;status:SceneMediaJobStatus;attempts:number;maxAttempts:number;
  seed?:string;inputArtifactPath?:string;outputPath?:string;remoteAssetUrl?:string;costMicrousd?:number;error?:string;
  provenance?:Record<string,unknown>;createdAt:string;updatedAt:string;
}
type Row={id:string;project_id:string;owner_id:string;scene_index:number;kind:SceneMediaKind;provider_id:SceneMediaProviderId;model:string;prompt:string;negative_prompt?:string;continuity_key:string;status:SceneMediaJobStatus;attempts:number;max_attempts:number;seed?:string;input_artifact_path?:string;output_path?:string;remote_asset_url?:string;cost_microusd?:number;error?:string;provenance_json?:string;created_at:string;updated_at:string};

db.exec(`
CREATE TABLE IF NOT EXISTS content_studio_scene_media_jobs(
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL,owner_id TEXT NOT NULL,scene_index INTEGER NOT NULL,kind TEXT NOT NULL,provider_id TEXT NOT NULL,
 model TEXT NOT NULL,prompt TEXT NOT NULL,negative_prompt TEXT,continuity_key TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,max_attempts INTEGER NOT NULL DEFAULT 3,
 seed TEXT,input_artifact_path TEXT,output_path TEXT,remote_asset_url TEXT,cost_microusd INTEGER,error TEXT,provenance_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_studio_scene_media_project ON content_studio_scene_media_jobs(owner_id,project_id,scene_index,kind,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_studio_scene_media_status ON content_studio_scene_media_jobs(owner_id,status,updated_at DESC);
`);

function fromRow(r:Row):SceneMediaJob{return{id:r.id,projectId:r.project_id,ownerId:r.owner_id,sceneIndex:Number(r.scene_index),kind:r.kind,providerId:r.provider_id,model:r.model,prompt:r.prompt,negativePrompt:r.negative_prompt||undefined,continuityKey:r.continuity_key,status:r.status,attempts:Number(r.attempts||0),maxAttempts:Number(r.max_attempts||3),seed:r.seed||undefined,inputArtifactPath:r.input_artifact_path||undefined,outputPath:r.output_path||undefined,remoteAssetUrl:r.remote_asset_url||undefined,costMicrousd:r.cost_microusd==null?undefined:Number(r.cost_microusd),error:r.error||undefined,provenance:r.provenance_json?JSON.parse(r.provenance_json):undefined,createdAt:r.created_at,updatedAt:r.updated_at}}
function row(id:string,ownerId:string){return all<Row>('SELECT * FROM content_studio_scene_media_jobs WHERE id=? AND owner_id=? LIMIT 1',id,ownerId)[0]}
function save(job:SceneMediaJob){job.updatedAt=new Date().toISOString();run(`UPDATE content_studio_scene_media_jobs SET provider_id=?,model=?,status=?,attempts=?,max_attempts=?,seed=?,input_artifact_path=?,output_path=?,remote_asset_url=?,cost_microusd=?,error=?,provenance_json=?,updated_at=? WHERE id=? AND owner_id=?`,job.providerId,job.model,job.status,job.attempts,job.maxAttempts,job.seed||null,job.inputArtifactPath||null,job.outputPath||null,job.remoteAssetUrl||null,job.costMicrousd??null,job.error||null,job.provenance?JSON.stringify(job.provenance):null,job.updatedAt,job.id,job.ownerId);return job}
function bool(v?:string){return /^true$/i.test(String(v||''))}
function safeEndpoint(raw?:string){if(!raw?.trim())return undefined;const u=new URL(raw.trim());if(u.protocol==='https:')return u.toString();if(u.protocol==='http:'&&['localhost','127.0.0.1','host.docker.internal'].includes(u.hostname))return u.toString();throw new Error('Media webhook phải dùng HTTPS, trừ local runtime')}
function remoteEnabled(){return bool(process.env.CONTENT_STUDIO_REMOTE_MEDIA_ENABLED)}
function imageEndpoint(){return safeEndpoint(process.env.CONTENT_STUDIO_IMAGE_WEBHOOK_URL)}
function videoEndpoint(){return safeEndpoint(process.env.CONTENT_STUDIO_VIDEO_WEBHOOK_URL)}
function providerModel(kind:SceneMediaKind){return kind==='image'?(process.env.CONTENT_STUDIO_IMAGE_MODEL?.trim()||'remote-image'):(process.env.CONTENT_STUDIO_VIDEO_MODEL?.trim()||'remote-video')}
function providerToken(kind:SceneMediaKind){return kind==='image'?process.env.CONTENT_STUDIO_IMAGE_WEBHOOK_TOKEN?.trim():process.env.CONTENT_STUDIO_VIDEO_WEBHOOK_TOKEN?.trim()}

export function sceneMediaProviderCapabilities():SceneMediaProviderCapability[]{
  let imageUrl:string|undefined,videoUrl:string|undefined;try{imageUrl=imageEndpoint()}catch{}try{videoUrl=videoEndpoint()}catch{}
  return[
   {id:'local-original-card',kind:'image',status:'ready',mode:'local-deterministic',model:'local-scene-card-v1',notes:'Tạo keyframe PNG nguyên bản tại server; không gọi dịch vụ ngoài.'},
   {id:'remote-image-webhook',kind:'image',status:imageUrl?(remoteEnabled()?'ready':'configured'):'disabled',mode:'webhook',model:providerModel('image'),notes:imageUrl?(remoteEnabled()?'Remote image execution được operator bật.':'Đã cấu hình endpoint nhưng execution đang khóa.'):'Chưa cấu hình image webhook.'},
   {id:'remote-video-webhook',kind:'video',status:videoUrl?(remoteEnabled()?'ready':'configured'):'disabled',mode:'webhook',model:providerModel('video'),notes:videoUrl?(remoteEnabled()?'Remote video execution được operator bật.':'Đã cấu hình endpoint nhưng execution đang khóa.'):'Chưa cấu hình video webhook.'}
  ];
}

function defaultProvider(kind:SceneMediaKind):SceneMediaProviderId{
 if(kind==='image'){const cap=sceneMediaProviderCapabilities().find(x=>x.id==='remote-image-webhook');return cap?.status==='ready'?'remote-image-webhook':'local-original-card'}
 return 'remote-video-webhook';
}
function providerReady(id:SceneMediaProviderId){return sceneMediaProviderCapabilities().find(x=>x.id===id)?.status==='ready'}
function projectDir(projectId:string,jobId:string){return `output/content-studio/${projectId.replace(/[^a-zA-Z0-9_-]/g,'_')}/scene-media/${jobId}`}

export function listSceneMediaJobs(ownerId:string,projectId:string){return all<Row>('SELECT * FROM content_studio_scene_media_jobs WHERE owner_id=? AND project_id=? ORDER BY scene_index,kind,created_at',ownerId,projectId).map(fromRow)}
export function getSceneMediaJob(ownerId:string,id:string){const r=row(id,ownerId);return r?fromRow(r):undefined}

export function createSceneMediaJobs(input:{ownerId:string;projectId:string;kind:SceneMediaKind;providerId?:SceneMediaProviderId;sceneIndices?:number[]}):SceneMediaJob[]{
 const project=getPipelineProject(input.ownerId,input.projectId);if(!project)throw new Error('Content Studio project not found');
 const handoff=buildGenerationHandoff(input.ownerId,input.projectId);
 const providerId=input.providerId||defaultProvider(input.kind);
 if(input.kind==='video'&&providerId!=='remote-video-webhook')throw new Error('Video generation chỉ hỗ trợ remote-video-webhook ở Phase 4A.');
 if(input.kind==='image'&&providerId==='remote-video-webhook')throw new Error('Provider không phù hợp cho image job.');
 if(input.kind==='video'&&!providerReady(providerId))throw new Error('Remote video provider chưa READY; cần endpoint HTTPS và CONTENT_STUDIO_REMOTE_MEDIA_ENABLED=true.');
 if(input.kind==='image'&&providerId==='remote-image-webhook'&&!providerReady(providerId))throw new Error('Remote image provider chưa READY; execution đang khóa hoặc chưa cấu hình endpoint.');
 const wanted=input.sceneIndices?.length?new Set(input.sceneIndices):undefined,now=new Date().toISOString(),jobs:SceneMediaJob[]=[];
 for(const scene of handoff.scenes){if(wanted&&!wanted.has(scene.sceneIndex))continue;
   let inputArtifactPath:string|undefined;
   if(input.kind==='video'){
     const image=all<Row>(`SELECT * FROM content_studio_scene_media_jobs WHERE owner_id=? AND project_id=? AND scene_index=? AND kind='image' AND status='ready' AND output_path IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,input.ownerId,input.projectId,scene.sceneIndex)[0];
     if(!image)throw new Error(`Scene ${scene.sceneIndex+1} chưa có keyframe image READY để tạo video.`);inputArtifactPath=image.output_path;
   }
   const id=randomUUID(),model=providerId==='local-original-card'?'local-scene-card-v1':providerModel(input.kind),prompt=input.kind==='image'?scene.imagePrompt:scene.videoPrompt,negative=handoff.styleBible.negativePrompt.join(', ');
   run('INSERT INTO content_studio_scene_media_jobs(id,project_id,owner_id,scene_index,kind,provider_id,model,prompt,negative_prompt,continuity_key,status,attempts,max_attempts,input_artifact_path,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,input.projectId,input.ownerId,scene.sceneIndex,input.kind,providerId,model,prompt,negative,handoff.characterBible.continuityKey,'queued',0,3,inputArtifactPath||null,now,now);
   jobs.push(fromRow(row(id,input.ownerId)));
 }
 if(!jobs.length)throw new Error('Không có scene phù hợp để tạo media job.');return jobs;
}

async function remoteCall(job:SceneMediaJob){
 if(!remoteEnabled())throw new Error('Remote media execution đang bị khóa.');
 const endpoint=job.kind==='image'?imageEndpoint():videoEndpoint();if(!endpoint)throw new Error('Remote media endpoint chưa cấu hình.');
 const timeout=Math.max(15000,Number(process.env.CONTENT_STUDIO_REMOTE_MEDIA_TIMEOUT_MS||120000));
 const body={version:'content-studio-media-v1',jobId:job.id,projectId:job.projectId,sceneIndex:job.sceneIndex,kind:job.kind,model:job.model,prompt:job.prompt,negativePrompt:job.negativePrompt,continuityKey:job.continuityKey,inputArtifactPath:job.inputArtifactPath||null};
 const token=providerToken(job.kind),r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
 const text=await r.text();if(!r.ok)throw new Error(`Remote ${job.kind} provider HTTP ${r.status}: ${text.slice(0,500)}`);let data:any;try{data=JSON.parse(text)}catch{throw new Error('Remote media provider không trả JSON hợp lệ')}
 const assetUrl=String(data.assetUrl||data.outputUrl||'').trim();if(!assetUrl)throw new Error('Remote media provider thiếu assetUrl/outputUrl');
 const localBase=projectDir(job.projectId,job.id);await mkdir(dirname(localBase),{recursive:true});
 const outputPath=job.kind==='image'?await downloadRemoteImage(assetUrl,localBase):await downloadRemoteVideo(assetUrl,localBase);
 return{outputPath,assetUrl,model:String(data.model||job.model).slice(0,160),seed:data.seed==null?undefined:String(data.seed).slice(0,160),costMicrousd:Number.isFinite(Number(data.costUsd))?Math.max(0,Math.round(Number(data.costUsd)*1_000_000)):undefined,providerMeta:data.provenance&&typeof data.provenance==='object'?data.provenance:{}};
}

async function localImage(job:SceneMediaJob){
 const base=projectDir(job.projectId,job.id);await mkdir(dirname(base),{recursive:true});
 const svg=await createSceneVisualCard(base,job.sceneIndex,job.prompt.slice(0,500),`Scene ${job.sceneIndex+1}`),png=`${base}.png`;
 await runFfmpeg(['-y','-hide_banner','-loglevel','error','-i',svg,'-frames:v','1',png]);
 return{outputPath:png,model:'local-scene-card-v1',seed:`local-${job.sceneIndex}`,providerMeta:{source:'generated-original',rights:'generated',svg}};
}

export async function runSceneMediaJob(ownerId:string,id:string){
 const existing=getSceneMediaJob(ownerId,id);if(!existing)throw new Error('Scene media job not found');if(existing.status==='ready')return existing;if(existing.attempts>=existing.maxAttempts)throw new Error('Scene media job đã hết số lần thử; dùng retry để mở lại.');
 const job={...existing,status:'running' as const,attempts:existing.attempts+1,error:undefined};save(job);
 try{
   const result=job.providerId==='local-original-card'?await localImage(job):await remoteCall(job);
   job.status='ready';job.outputPath=result.outputPath;job.remoteAssetUrl='assetUrl'in result?result.assetUrl:undefined;job.model=result.model;job.seed=result.seed;job.costMicrousd='costMicrousd'in result?result.costMicrousd:undefined;
   job.provenance={schema:'content-studio.scene-media.v1',rights:'generated',projectId:job.projectId,sceneIndex:job.sceneIndex,kind:job.kind,providerId:job.providerId,model:job.model,seed:job.seed||null,prompt:job.prompt,negativePrompt:job.negativePrompt||null,continuityKey:job.continuityKey,inputArtifactPath:job.inputArtifactPath||null,outputPath:job.outputPath,remoteAssetUrl:job.remoteAssetUrl||null,costMicrousd:job.costMicrousd??null,providerMeta:result.providerMeta,createdAt:new Date().toISOString()};
   return save(job);
 }catch(e){job.status='failed';job.error=e instanceof Error?e.message:String(e);save(job);throw e}
}

export async function retrySceneMediaJob(ownerId:string,id:string){const job=getSceneMediaJob(ownerId,id);if(!job)throw new Error('Scene media job not found');if(job.status!=='failed')throw new Error('Chỉ job failed mới retry được');job.status='queued';job.error=undefined;job.attempts=Math.max(0,job.attempts-1);save(job);return runSceneMediaJob(ownerId,id)}
export async function runQueuedSceneMediaJobs(ownerId:string,projectId:string,limit=4){const jobs=listSceneMediaJobs(ownerId,projectId).filter(x=>x.status==='queued').slice(0,Math.max(1,Math.min(12,limit)));const results=[] as SceneMediaJob[];for(const job of jobs){try{results.push(await runSceneMediaJob(ownerId,job.id))}catch{const latest=getSceneMediaJob(ownerId,job.id);if(latest)results.push(latest)}}return results}