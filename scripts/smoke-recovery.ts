import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'vietnewsflow-smoke-'));
process.env.DB_PATH = join(dir, 'smoke.sqlite');
process.env.RENDER_QUEUE_PAUSED = 'true';
process.env.LOW_MEMORY_MODE = 'true';

try {
  const { run, all } = await import('../src/storage/db.js');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const payload = {
    draftId: 'smoke-draft',
    ownerId: 'smoke-owner',
    text: 'Đây là bản tin kiểm tra phục hồi hàng đợi.',
    headline: 'Smoke recovery',
    template: 'clean',
    motion: 'light',
    channelName: 'Biển & Nỗi Nhớ',
  };

  run(
    'INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,created_at,payload_json,attempts,max_attempts,next_attempt_at,updated_at,checkpoint_stage) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    payload.draftId,
    payload.ownerId,
    'rendering',
    60,
    now,
    JSON.stringify(payload),
    1,
    3,
    null,
    now,
    'ffmpeg',
  );

  const worker = await import('../src/video/job.js');
  const state = await worker.renderWorkerStatus();
  const rows = all<{ status:string; progress:number; checkpoint_stage?:string }>('SELECT status,progress,checkpoint_stage FROM render_jobs WHERE id=?', id);
  const row = rows[0];
  const recovered = worker.renderJobs.find(job => job.id === id);

  if (!state.persistentQueue) throw new Error('persistentQueue flag is false');
  if (state.recoveredSinceStart < 1) throw new Error('no job recovered at boot');
  if (!recovered || recovered.status !== 'queued') throw new Error('render job was not restored to queued state');
  if (!row || row.status !== 'queued') throw new Error('SQLite row was not restored to queued state');
  if (row.progress !== 0) throw new Error('recovered SQLite progress was not reset');
  if (state.pending < 1) throw new Error('recovered job was not placed in pending queue');

  console.log('Recovery smoke test passed', {
    recoveredSinceStart: state.recoveredSinceStart,
    pending: state.pending,
    checkpoint: recovered.checkpointStage,
  });
} finally {
  await rm(dir, { recursive: true, force: true });
}
