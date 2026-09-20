import { randomUUID } from 'node:crypto';
import { all, db, run } from '../storage/db.js';
import { enqueueRender, renderJobs } from '../video/job.js';
import { isVoiceId, isVoiceStyle, type VoiceId, type VoiceStyle } from '../tts/edge.js';
import { buildGenerationHandoff, getPipelineRuntime } from './pipeline-v2-runtime.js';
import { getPipelineProject } from './pipeline-v2.js';

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
`);

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
        ? 'Adapter đã có endpoint cấu hình; worker gọi provider sẽ được bật ở Phase 3B.'
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
      status: 'planned',
      mode: 'ffmpeg-landscape',
      notes: 'Chưa bật cho đến khi renderer 1920x1080 có acceptance smoke test riêng.',
    },
    {
      id: 'comic-export',
      kind: 'export',
      status: 'planned',
      mode: 'image-sequence',
      notes: 'Chưa bật execution; manifest vẫn được giữ trong generation handoff.',
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

export function enqueuePipelineGeneration(input: {
  ownerId: string;
  projectId: string;
  outputId?: string;
}): PipelineGenerationBatch {
  const project = getPipelineProject(input.ownerId, input.projectId);
  if (!project) throw new Error('Content Studio project not found');
  const runtime = getPipelineRuntime(input.ownerId, input.projectId);
  if (!runtime) throw new Error('Project chưa có runtime; hãy chạy prepare trước.');
  const handoff = buildGenerationHandoff(input.ownerId, input.projectId);

  const vertical = handoff.outputs.find((output) => output.id === (input.outputId || 'short-9x16'));
  if (!vertical) throw new Error('Project không có output Short 9:16 để chạy renderer hiện tại.');
  if (vertical.aspectRatio !== '9:16' || (vertical.kind !== 'short' && vertical.kind !== 'video')) {
    throw new Error('Phase 3A hiện chỉ execution Short/Video 9:16; output khác vẫn được giữ ở trạng thái planned.');
  }

  const duplicate = listGenerationBatches(input.ownerId, input.projectId)
    .find((batch) => batch.outputs.some((output) =>
      output.outputId === vertical.id &&
      ['queued', 'rendering'].includes(output.status),
    ));
  if (duplicate) return duplicate;

  const voice = chooseVoice(handoff.voicePlan.voice);
  const voiceStyle = chooseStyle(handoff.voicePlan.style);
  const renderJob = enqueueRender({
    draftId: project.id,
    ownerId: input.ownerId,
    text: project.script,
    headline: project.topic,
    source: project.seriesName,
    autoCollectImages: false,
    smartScenes: true,
    shotCraft: true,
    voice,
    voiceStyle,
    template: 'classic',
    motion: 'light',
    tickerMode: 'off',
    channelName: project.seriesName || 'Content Studio',
    mediaProvenance: [],
    localMedia: [],
  });

  const now = new Date().toISOString();
  const outputs: PipelineGenerationOutput[] = handoff.outputs.map((output) => ({
    outputId: output.id,
    kind: output.kind,
    aspectRatio: output.aspectRatio,
    status: output.id === vertical.id ? 'queued' : 'planned',
    worker:
      output.id === vertical.id
        ? 'ffmpeg-short-9x16'
        : output.kind === 'podcast'
          ? 'tts-audio-export-planned'
          : output.kind === 'comic' || output.kind === 'thumbnail'
            ? 'image-sequence-planned'
            : 'ffmpeg-landscape-planned',
    renderJobId: output.id === vertical.id ? renderJob.id : undefined,
  }));

  const batch: PipelineGenerationBatch = {
    id: randomUUID(),
    projectId: project.id,
    ownerId: input.ownerId,
    status: 'queued',
    primaryOutputId: vertical.id,
    outputs,
    createdAt: now,
    updatedAt: now,
  };
  saveBatch(batch);

  run(
    'UPDATE content_studio_projects SET status=?,updated_at=? WHERE id=? AND owner_id=?',
    'generation_ready',
    now,
    project.id,
    input.ownerId,
  );
  return batch;
}
