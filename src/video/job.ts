import { generateSpeech, type VoiceId, type VoiceStyle } from '../tts/edge.js';
import { downloadRemoteImage } from '../media/download.js';
import { selectBestMedia } from '../media/select.js';
import { importArticleFromUrl } from '../import/url.js';
import { all, run } from '../storage/db.js';
import { readdir, rm } from 'node:fs/promises';
import { directScenes } from './scenes.js';
import { renderNewsVideo, type VideoTemplate, type MotionLevel, type TickerMode, type VideoScene } from './ffmpeg.js';
import { resourceSnapshot, waitForRenderResources } from '../system/resource-guard.js';
import { cleanupOldOutput, ensureStorageForRender, storageSnapshot } from '../system/storage-guard.js';

export type RenderStatus = 'queued' | 'rendering' | 'ready' | 'failed';
export interface RenderJob {
  id: string;
  draftId: string;
  ownerId: string;
  status: RenderStatus;
  progress: number;
  output?: string;
  error?: string;
  createdAt: string;
}

type JobRow = {
  id: string;
  draft_id: string;
  owner_id: string;
  status: RenderStatus;
  progress: number;
  output?: string;
  error?: string;
  created_at: string;
};

export const renderJobs: RenderJob[] = all<JobRow>('SELECT * FROM render_jobs ORDER BY created_at DESC LIMIT 100').map(r => ({
  id: r.id,
  draftId: r.draft_id,
  ownerId: r.owner_id || 'legacy-admin',
  status: r.status === 'rendering' || r.status === 'queued' ? 'failed' : r.status,
  progress: r.progress,
  output: r.output || undefined,
  error: r.status === 'rendering' || r.status === 'queued' ? 'Server restarted before render completed' : r.error || undefined,
  createdAt: r.created_at,
}));

for (const j of renderJobs) {
  if (j.status === 'failed' && j.error === 'Server restarted before render completed') {
    run('UPDATE render_jobs SET status=?,error=? WHERE id=?', 'failed', j.error, j.id);
  }
}

function save(job: RenderJob) {
  run(
    'INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,error,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,progress=excluded.progress,output=excluded.output,error=excluded.error',
    job.id,
    job.draftId,
    job.ownerId,
    job.status,
    job.progress,
    job.output || null,
    job.error || null,
    job.createdAt,
  );
}

async function cleanupArtifacts(jobId: string) {
  try {
    const files = await readdir('output');
    await Promise.allSettled(
      files
        .filter(name => name === jobId + '.mp4' || name === jobId + '.mp3' || name === jobId + '.srt' || name.startsWith(jobId + '-'))
        .map(name => rm(`output/${name}`, { force: true })),
    );
  } catch {}
}

export async function deleteRenderJob(id: string) {
  const i = renderJobs.findIndex(j => j.id === id);
  if (i < 0) return false;
  const [job] = renderJobs.splice(i, 1);
  renderInputs.delete(id);
  run('DELETE FROM render_jobs WHERE id=?', id);
  await cleanupArtifacts(job.id);
  return true;
}

export async function deleteRenderJobs(ids: string[]) {
  let deleted = 0;
  for (const id of [...new Set(ids)]) if (await deleteRenderJob(id)) deleted++;
  return deleted;
}

export async function deleteRenderJobsForDraft(draftId: string) {
  const ids = renderJobs.filter(j => j.draftId === draftId).map(j => j.id);
  return deleteRenderJobs(ids);
}

export interface EnqueueRenderInput {
  draftId: string;
  ownerId: string;
  text: string;
  headline: string;
  source?: string;
  sourceUrl?: string;
  publishedAt?: string;
  breaking?: boolean;
  voice?: VoiceId;
  voiceRate?: string;
  voiceStyle?: VoiceStyle;
  imageUrl?: string;
  imageUrls?: string[];
  autoCollectImages?: boolean;
  smartScenes?: boolean;
  scenes?: VideoScene[];
  template?: VideoTemplate;
  motion?: MotionLevel;
  tickerMode?: TickerMode;
  tickerText?: string;
  tickerSpeed?: number;
  channelName?: string;
}

type PendingRender = { job: RenderJob; input: EnqueueRenderInput };
const pendingRenders: PendingRender[] = [];
const renderInputs = new Map<string, EnqueueRenderInput>();
let workerBusy = false;
let workerPaused = process.env.RENDER_QUEUE_PAUSED === 'true';
let currentJobId: string | null = null;
let currentStage = 'idle';
let lastActivityAt = new Date().toISOString();
let completedSinceStart = 0;
let failedSinceStart = 0;

function touchActivity(stage?: string) {
  lastActivityAt = new Date().toISOString();
  if (stage) currentStage = stage;
}

function watchdogStatus() {
  const timeoutMs = Math.max(60_000, Number(process.env.RENDER_WATCHDOG_MS || 20 * 60_000));
  const idleMs = Date.now() - new Date(lastActivityAt).getTime();
  return {
    timeoutMs,
    idleMs,
    stalled: Boolean(workerBusy && currentJobId && idleMs > timeoutMs),
    stage: currentStage,
  };
}

export async function renderWorkerStatus() {
  return {
    singleWorker: true,
    lowMemoryMode: process.env.LOW_MEMORY_MODE !== 'false',
    paused: workerPaused,
    busy: workerBusy,
    currentJobId,
    pending: pendingRenders.length,
    completedSinceStart,
    failedSinceStart,
    lastActivityAt,
    watchdog: watchdogStatus(),
    resources: resourceSnapshot(),
    storage: await storageSnapshot().catch(() => null),
  };
}

export function pauseRenderQueue() {
  workerPaused = true;
  touchActivity('paused');
}

export function resumeRenderQueue() {
  workerPaused = false;
  touchActivity('resuming');
  void pumpRenderQueue();
}

export async function cleanupRenderOutput() {
  return cleanupOldOutput(currentJobId ? [currentJobId] : []);
}

export async function retryRenderJob(id: string) {
  const previous = renderJobs.find(j => j.id === id);
  if (!previous) throw new Error('Render job not found');
  if (previous.status !== 'failed') throw new Error('Only failed render jobs can be retried');
  const input = renderInputs.get(id);
  if (!input) throw new Error('Retry data is unavailable after server restart; render again from the draft');
  return enqueueRender({ ...input });
}

async function waitWhilePaused() {
  while (workerPaused) await new Promise(resolve => setTimeout(resolve, 1000));
}

async function processRender(job: RenderJob, input: EnqueueRenderInput) {
  try {
    await waitWhilePaused();
    touchActivity('resource-check');
    await waitForRenderResources();
    await ensureStorageForRender([job.id]);
    currentJobId = job.id;
    job.status = 'rendering';
    job.progress = 10;
    job.error = undefined;
    touchActivity('starting');
    save(job);

    const base = `output/${job.id}`;
    let discovered: string[] = [];
    let publishedAt = input.publishedAt;

    if (input.autoCollectImages !== false && input.sourceUrl) {
      try {
        touchActivity('collecting-media');
        const article = await importArticleFromUrl(input.sourceUrl);
        discovered = article.imageUrls || [];
        publishedAt = publishedAt || article.publishedAt;
        job.progress = 18;
        touchActivity('media-collected');
        save(job);
      } catch (e) {
        console.warn('Auto image collection skipped:', e);
      }
    }

    const manualUrls = [input.imageUrl, ...(input.imageUrls || [])].filter((x): x is string => Boolean(x));
    const urls = [...manualUrls, ...discovered.filter(x => !manualUrls.includes(x))]
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, process.env.LOW_MEMORY_MODE === 'false' ? 14 : 10);
    const downloaded: { path: string; url: string; manual: boolean }[] = [];

    for (let i = 0; i < urls.length; i++) {
      await waitWhilePaused();
      touchActivity(`downloading-image-${i + 1}`);
      const url = urls[i];
      try {
        downloaded.push({ path: await downloadRemoteImage(url, `${base}-image-${i + 1}`), url, manual: manualUrls.includes(url) });
      } catch (e) {
        console.warn(`Image ${i + 1} download skipped:`, e);
      }
      job.progress = Math.min(36, 20 + Math.round(((i + 1) / Math.max(1, urls.length)) * 16));
      save(job);
    }

    touchActivity('selecting-media');
    const media = await selectBestMedia(downloaded, process.env.LOW_MEMORY_MODE === 'false' ? 10 : 8);
    for (const r of media.rejected) console.warn(`Smart Media rejected ${r.url || r.path}: ${r.width}x${r.height} — ${r.reason}`);

    let selected = media.selected;
    if (manualUrls.length) {
      selected = [...selected].sort((a, b) => {
        const ai = manualUrls.indexOf(a.url || ''), bi = manualUrls.indexOf(b.url || '');
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return b.score - a.score;
      });
    }

    const imagePaths = selected.map(x => x.path);
    let scenes: VideoScene[] | undefined;
    if (input.smartScenes !== false) {
      const valid = (input.scenes || []).filter(s => s.imageIndex >= 0 && s.imageIndex < imagePaths.length && s.startRatio >= 0 && s.endRatio <= 1 && s.endRatio > s.startRatio);
      scenes = valid.length ? valid : directScenes(input.text, imagePaths.length);
    }

    job.progress = 42;
    touchActivity('tts');
    save(job);
    await waitWhilePaused();
    await generateSpeech({
      text: input.text,
      voice: input.voice ?? 'vi-male',
      rate: input.voiceRate ?? '+0%',
      style: input.voiceStyle ?? (input.breaking ? 'breaking' : 'news'),
      audioPath: `${base}.mp3`,
      srtPath: `${base}.srt`,
    });

    job.progress = 60;
    touchActivity('pre-ffmpeg-check');
    save(job);
    await waitWhilePaused();
    await waitForRenderResources();
    await ensureStorageForRender([job.id]);
    touchActivity('ffmpeg');
    job.output = await renderNewsVideo({
      audioPath: `${base}.mp3`,
      srtPath: `${base}.srt`,
      outputPath: `${base}.mp4`,
      headline: input.headline,
      source: input.source,
      publishedAt,
      breaking: input.breaking,
      imagePaths,
      scenes,
      template: input.template,
      motion: input.motion,
      tickerMode: input.tickerMode,
      tickerText: input.tickerText,
      tickerSpeed: input.tickerSpeed,
      channelName: input.channelName,
    });

    job.progress = 100;
    job.status = 'ready';
    completedSinceStart++;
    touchActivity('completed');
    save(job);
    await cleanupOldOutput([job.id]).catch(() => undefined);
  } catch (e) {
    job.status = 'failed';
    job.error = e instanceof Error ? e.message : String(e);
    failedSinceStart++;
    touchActivity('failed');
    save(job);
  } finally {
    currentJobId = null;
    currentStage = 'idle';
  }
}

async function pumpRenderQueue() {
  if (workerBusy || workerPaused) return;
  workerBusy = true;
  touchActivity('worker-start');
  try {
    while (pendingRenders.length) {
      if (workerPaused) break;
      const next = pendingRenders.shift();
      if (!next) break;
      await processRender(next.job, next.input);
    }
  } finally {
    workerBusy = false;
    currentJobId = null;
    touchActivity('idle');
    if (pendingRenders.length && !workerPaused) void pumpRenderQueue();
  }
}

export function enqueueRender(input: EnqueueRenderInput) {
  const job: RenderJob = {
    id: crypto.randomUUID(),
    draftId: input.draftId,
    ownerId: input.ownerId,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
  };
  renderJobs.unshift(job);
  renderInputs.set(job.id, input);
  save(job);
  pendingRenders.push({ job, input });
  touchActivity('queued');
  void pumpRenderQueue();
  return job;
}
