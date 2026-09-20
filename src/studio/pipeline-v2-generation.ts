import { randomUUID } from 'node:crypto';
import { all, db, run } from '../storage/db.js';
import { enqueueRender, renderJobs } from '../video/job.js';
import { isVoiceId, isVoiceStyle, type VoiceId, type VoiceStyle } from '../tts/edge.js';
import { buildGenerationHandoff, getPipelineRuntime } from './pipeline-v2-runtime.js';
import { getPipelineProject } from './pipeline-v2.js';
import { exportComicPackage,exportThumbnail } from './pipeline-v2-static-export.js';

export type MediaGenerationCapabilityStatus = 'ready' | 'configured' | 'planned' | 'disabled';

export interface MediaGenerationCapability {
  id: string;
  kind: 'image' | 'video' | 'voice' | 'compose' | 'export';
  status: MediaGenerationCapabilityStatus;
  mode: string;
  notes: string;
}

export interface PipelineGenerationOutput {
  outputId: string;
  kind: string;
  aspectRatio?: string;
  status: 'queued' | 'rendering' | 'ready' | 'failed' | 'planned';
  worker: string;
  renderJobId?: string;
  outputPath?: string;
  error?: string;
  assets?: string[];
}

export interface PipelineGenerationBatch {
  id: string;
  projectId: string;
  ownerId: string;
  status: 'queued' | 'rendering' | 'ready' | 'partial' | 'failed';
  primaryOutputId: string;
  outputs: PipelineGenerationOutput[];
  createdAt: string;
  updatedAt: string;
}

type BatchRow = {
  id: string;
  project_id: string;
  owner_id: string;
  status: PipelineGenerationBatch['status'];
  primary_output_id: string;
  outputs_json: string;
  created_at: string;
  updated_at: string;
};

db.exec(`
CREATE TABLE IF NOT EXISTS content_studio_generation_batches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  primary_output_id TEXT NOT NULL,
  outputs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_studio_generation_project
ON content_studio_generation_batches(owner_id, project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS content_studio_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  output_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  rights TEXT NOT NULL,
  generator TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(project_id,owner_id,output_id,path)
);
CREATE INDEX IF NOT EXISTS idx_content_studio_artifacts_owner_project
ON content_studio_artifacts(owner_id,project_id,created_at DESC);
`);

export interface ContentStudioArtifact {
  id:string;projectId:string;ownerId:string;outputId:string;kind:string;path:string;
  rights:'generated';generator:string;metadata?:Record<string,unknown>;createdAt:string;
}
type ArtifactRow={id:string;project_id:string;owner_id:string;output_id:string;kind:string;path:string;rights:'generated';generator:string;metadata_json?:string;created_at:string};
export function recordStudioArtifact(input:{projectId:string;ownerId:string;outputId:string;kind:string;path:string;generator:string;metadata?:Record<string,unknown>}){
  const now=new Date().toISOString(),id=randomUUID();
  run('INSERT OR IGNORE INTO content_studio_artifacts(id,project_id,owner_id,output_id,kind,path,rights,generator,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    id,input.projectId,input.ownerId,input.outputId,input.kind,input.path,'generated',input.generator,input.metadata?JSON.stringify(input.metadata):null,now);
}
export function listStudioArtifacts(ownerId:string,projectId:string):ContentStudioArtifact[]{
  return all<ArtifactRow>('SELECT * FROM content_studio_artifacts WHERE owner_id=? AND project_id=? ORDER BY created_at DESC',ownerId,projectId).map(r=>({
    id:r.id,projectId:r.project_id,ownerId:r.owner_id,outputId:r.output_id,kind:r.kind,path:r.path,rights:r.rights,generator:r.generator,
    metadata:r.metadata_json?JSON.parse(r.metadata_json):undefined,createdAt:r.created_at
  }));
}

function mapBatch(row: BatchRow): PipelineGenerationBatch {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    status: row.status,
    primaryOutputId: row.primary_output_id,
    outputs: JSON.parse(row.outputs_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function saveBatch(batch: PipelineGenerationBatch) {
  batch.updatedAt = new Date().toISOString();
  run(
    `INSERT INTO content_studio_generation_batches(id,project_id,owner_id,status,primary_output_id,outputs_json,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET status=excluded.status,outputs_json=excluded.outputs_json,updated_at=excluded.updated_at`,
    batch.id,
    batch.projectId,
    batch.ownerId,
    batch.status,
    batch.primaryOutputId,
    JSON.stringify(batch.outputs),
    batch.createdAt,
    batch.updatedAt,
  );
}

export function generationCapabilities(): MediaGenerationCapability[] {
  const imageWebhook = String(process.env.CONTENT_STUDIO_IMAGE_WEBHOOK_URL || '').trim();
  const videoWebhook = String(process.env.CONTENT_STUDIO_VIDEO_WEBHOOK_URL || '').trim();
  return [
    {
      id: 'local-original-scene-card',
      kind: 'image',
      status: 'ready',
      mode: 'local-fallback',
      notes: 'Sinh visual card nguyên bản theo từng scene; không cần media bên ngoài.',
    },
    {
      id: 'remote-image-provider',
      kind: 'image',
      status: imageWebhook ? 'configured' : 'planned',
      mode: 'webhook-adapter',
      notes: imageWebhook
        ? 'Adapter đã có endpoint cấu hình; remote execution vẫn khóa cho đến khi có provenance contract.'
        : 'Chưa cấu hình CONTENT_STUDIO_IMAGE_WEBHOOK_URL.',
    },
    {
      id: 'remote-video-provider',
      kind: 'video',
      status: videoWebhook ? 'configured' : 'planned',
      mode: 'image-to-video-adapter',
      notes: videoWebhook
        ? 'Adapter endpoint đã được cấu hình; execution sẽ được bật sau khi có provenance contract.'
        : 'Chưa cấu hình CONTENT_STUDIO_VIDEO_WEBHOOK_URL.',
    },
    {
      id: 'vietnamese-tts',
      kind: 'voice',
      status: 'ready',
      mode: process.env.VIENEU_TTS_ENABLED === 'true' ? 'vieneu-local-edge-fallback' : 'edge-fallback',
      notes: 'TTS hiện hữu tạo MP3 và SRT.',
    },
    {
      id: 'ffmpeg-short-9x16',
      kind: 'compose',
      status: 'ready',
      mode: 'ffmpeg-shotcraft',
      notes: 'Renderer production hiện tại hỗ trợ vertical 1080x1920.',
    },
    {
      id: 'ffmpeg-landscape-16x9',
      kind: 'compose',
      status: 'ready',
      mode: 'ffmpeg-landscape',
      notes: 'Renderer 1920x1080 dùng persistent render queue và ShotCraft scene plan.',
    },
    {
      id: 'podcast-audio-export',
      kind: 'export',
      status: 'ready',
      mode: 'tts-audio',
      notes: 'Xuất MP3 trực tiếp từ TTS worker, giữ SRT song song cho downstream.',
    },
    {
      id: 'comic-export',
      kind: 'export',
      status: 'ready',
      mode: 'local-png-sequence',
      notes: 'Xuất comic panels 1080x1080 PNG + manifest bằng renderer deterministic rights-safe.',
    },
    {
      id: 'thumbnail-export',
      kind: 'export',
      status: 'ready',
      mode: 'local-png',
      notes: 'Xuất cover 1280x720 PNG nguyên bản bằng renderer deterministic rights-safe.',
    },
  ];
}

export function getGenerationBatch(ownerId: string, batchId: string): PipelineGenerationBatch | undefined {
  const row = all<BatchRow>(
    'SELECT * FROM content_studio_generation_batches WHERE id=? AND owner_id=? LIMIT 1',
    batchId,
    ownerId,
  )[0];
  if (!row) return undefined;
  return syncBatch(mapBatch(row));
}

export function listGenerationBatches(ownerId: string, projectId: string): PipelineGenerationBatch[] {
  return all<BatchRow>(
    'SELECT * FROM content_studio_generation_batches WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 30',
    ownerId,
    projectId,
  ).map(mapBatch).map(syncBatch);
}

function syncBatch(batch: PipelineGenerationBatch) {
  let changed = false;
  const outputs = batch.outputs.map((output) => {
    if (!output.renderJobId) return output;
    const job = renderJobs.find((item) => item.id === output.renderJobId);
    if (!job) return output;
    const mapped: PipelineGenerationOutput['status'] =
      job.status === 'ready'
        ? 'ready'
        : job.status === 'failed'
          ? 'failed'
          : job.status === 'rendering'
            ? 'rendering'
            : 'queued';
    const next = {
      ...output,
      status: mapped,
      outputPath: job.output || output.outputPath,
      error: job.error || undefined,
    };
    if (next.status==='ready'&&next.outputPath){
      recordStudioArtifact({projectId:batch.projectId,ownerId:batch.ownerId,outputId:output.outputId,kind:output.kind,path:next.outputPath,generator:`render-job:${output.worker}`,metadata:{renderJobId:output.renderJobId,aspectRatio:output.aspectRatio}});
    }
    if (
      next.status !== output.status ||
      next.outputPath !== output.outputPath ||
      next.error !== output.error
    ) changed = true;
    return next;
  });

  const executable = outputs.filter((x) => x.status !== 'planned');
  let status: PipelineGenerationBatch['status'] = 'queued';
  if (executable.some((x) => x.status === 'failed')) {
    status = executable.some((x) => x.status === 'ready') ? 'partial' : 'failed';
  } else if (executable.length && executable.every((x) => x.status === 'ready')) {
    status = outputs.some((x) => x.status === 'planned') ? 'partial' : 'ready';
  } else if (executable.some((x) => x.status === 'rendering')) {
    status = 'rendering';
  }

  if (status !== batch.status) changed = true;
  const next = { ...batch, status, outputs };
  if (changed) saveBatch(next);
  return next;
}

function chooseVoice(value: string): VoiceId {
  return isVoiceId(value) ? value : 'vieneu-minh-duc';
}

function chooseStyle(value: string): VoiceStyle {
  return isVoiceStyle(value) ? value : 'podcast';
}

export async function enqueuePipelineGeneration(input: {
  ownerId: string;
  projectId: string;
  outputId?: string;
}): Promise<PipelineGenerationBatch> {
  const project = getPipelineProject(input.ownerId, input.projectId);
  if (!project) throw new Error('Content Studio project not found');
  const runtime = getPipelineRuntime(input.ownerId, input.projectId);
  if (!runtime) throw new Error('Project chưa có runtime; hãy chạy prepare trước.');
  const handoff = buildGenerationHandoff(input.ownerId, input.projectId);

  const supported = handoff.outputs.filter((output) =>
    output.kind === 'podcast' ||
    output.kind === 'comic' ||
    output.kind === 'thumbnail' ||
    (output.kind === 'short' && output.aspectRatio === '9:16') ||
    (output.kind === 'video' && (output.aspectRatio === '9:16' || output.aspectRatio === '16:9'))
  );
  const selected = input.outputId ? supported.filter((output) => output.id === input.outputId) : supported;
  if (!selected.length) throw new Error(input.outputId?'Output chưa có worker execution ở Phase 3C.':'Project chưa có output được hỗ trợ.');

  const selectedIds = new Set(selected.map((output) => output.id));
  const duplicate = listGenerationBatches(input.ownerId, input.projectId).find((batch) =>
    batch.outputs.some((output) => selectedIds.has(output.outputId) && ['queued','rendering'].includes(output.status))
  );
  if (duplicate) return duplicate;

  const batchId=randomUUID();
  const voice=chooseVoice(handoff.voicePlan.voice),voiceStyle=chooseStyle(handoff.voicePlan.style);
  const jobs=new Map<string,ReturnType<typeof enqueueRender>>();
  for(const output of selected.filter(x=>x.kind!=='comic'&&x.kind!=='thumbnail')){
    const renderMode=output.kind==='podcast'?'audio':output.aspectRatio==='16:9'?'landscape':'vertical';
    const job=enqueueRender({
      draftId:project.id,ownerId:input.ownerId,text:project.script,headline:project.topic,source:project.seriesName,
      autoCollectImages:false,smartScenes:true,shotCraft:true,voice,voiceStyle,template:'classic',motion:'light',
      tickerMode:'off',channelName:project.seriesName||'Content Studio',mediaProvenance:[],localMedia:[],renderMode
    });
    jobs.set(output.id,job);
  }

  let comicResult:Awaited<ReturnType<typeof exportComicPackage>>|undefined;
  if(selected.some(x=>x.kind==='comic')){
    comicResult=await exportComicPackage({
      projectId:project.id,batchId,seriesName:project.seriesName,topic:project.topic,
      scenes:runtime.scenePrompts.map(scene=>({index:scene.sceneIndex,beat:scene.beat,narration:scene.narration}))
    });
  }
  let thumbResult:Awaited<ReturnType<typeof exportThumbnail>>|undefined;
  if(selected.some(x=>x.kind==='thumbnail')){
    thumbResult=await exportThumbnail({projectId:project.id,batchId,seriesName:project.seriesName,topic:project.topic,episode:project.episode});
  }

  const primary=selected.find(x=>x.id==='short-9x16')||selected.find(x=>x.id==='video-16x9')||selected[0];
  const now=new Date().toISOString();
  const outputs:PipelineGenerationOutput[]=handoff.outputs.map(output=>{
    const job=jobs.get(output.id);
    if(output.kind==='comic'&&comicResult&&selectedIds.has(output.id)){
      recordStudioArtifact({projectId:project.id,ownerId:input.ownerId,outputId:output.id,kind:'comic',path:comicResult.outputPath,generator:'local-deterministic-comic',metadata:{assets:comicResult.assets}});
      return{outputId:output.id,kind:output.kind,aspectRatio:output.aspectRatio,status:'ready',worker:'local-comic-png',outputPath:comicResult.outputPath,assets:comicResult.assets};
    }
    if(output.kind==='thumbnail'&&thumbResult&&selectedIds.has(output.id)){
      recordStudioArtifact({projectId:project.id,ownerId:input.ownerId,outputId:output.id,kind:'thumbnail',path:thumbResult.outputPath,generator:'local-deterministic-thumbnail',metadata:{assets:thumbResult.assets}});
      return{outputId:output.id,kind:output.kind,aspectRatio:output.aspectRatio,status:'ready',worker:'local-thumbnail-png',outputPath:thumbResult.outputPath,assets:thumbResult.assets};
    }
    const worker=output.kind==='podcast'?'tts-audio-export':output.aspectRatio==='16:9'&&output.kind==='video'?'ffmpeg-landscape-16x9':output.aspectRatio==='9:16'&&(output.kind==='short'||output.kind==='video')?'ffmpeg-short-9x16':output.kind==='comic'?'local-comic-png':output.kind==='thumbnail'?'local-thumbnail-png':'planned';
    return{outputId:output.id,kind:output.kind,aspectRatio:output.aspectRatio,status:job?'queued':'planned',worker,renderJobId:job?.id};
  });

  const batch:PipelineGenerationBatch={id:batchId,projectId:project.id,ownerId:input.ownerId,status:'queued',primaryOutputId:primary.id,outputs,createdAt:now,updatedAt:now};
  saveBatch(batch);
  run('UPDATE content_studio_projects SET status=?,updated_at=? WHERE id=? AND owner_id=?','generation_ready',now,project.id,input.ownerId);
  return syncBatch(batch);
}
