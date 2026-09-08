import { mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';

const OUTPUT_DIR = process.env.RENDER_OUTPUT_DIR || 'output';
const DEFAULT_MIN_FREE_MB = 2048;
const DEFAULT_MAX_OUTPUT_MB = 8192;
const DEFAULT_RETENTION_HOURS = 72;

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface StorageSnapshot {
  outputDir: string;
  freeMb: number;
  outputMb: number;
  minFreeMb: number;
  maxOutputMb: number;
  diskOk: boolean;
}

async function outputUsageBytes() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  let total = 0;
  for (const name of await readdir(OUTPUT_DIR)) {
    try {
      const s = await stat(join(OUTPUT_DIR, name));
      if (s.isFile()) total += s.size;
    } catch {}
  }
  return total;
}

export async function storageSnapshot(): Promise<StorageSnapshot> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const fs = await statfs(OUTPUT_DIR);
  const freeMb = Math.round((Number(fs.bavail) * Number(fs.bsize)) / 1024 / 1024);
  const outputMb = Math.round((await outputUsageBytes()) / 1024 / 1024);
  const minFreeMb = envNumber('RENDER_MIN_FREE_DISK_MB', DEFAULT_MIN_FREE_MB);
  const maxOutputMb = envNumber('RENDER_MAX_OUTPUT_MB', DEFAULT_MAX_OUTPUT_MB);
  return { outputDir: OUTPUT_DIR, freeMb, outputMb, minFreeMb, maxOutputMb, diskOk: freeMb >= minFreeMb && outputMb <= maxOutputMb };
}

export async function cleanupOldOutput(excludeJobIds: string[] = []) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const retentionMs = envNumber('RENDER_OUTPUT_RETENTION_HOURS', DEFAULT_RETENTION_HOURS) * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  const excluded = new Set(excludeJobIds.filter(Boolean));
  let deleted = 0;
  let reclaimedBytes = 0;
  for (const name of await readdir(OUTPUT_DIR)) {
    if ([...excluded].some(id => name === id || name.startsWith(id + '.') || name.startsWith(id + '-'))) continue;
    const path = join(OUTPUT_DIR, name);
    try {
      const s = await stat(path);
      if (!s.isFile() || s.mtimeMs >= cutoff) continue;
      reclaimedBytes += s.size;
      await rm(path, { force: true });
      deleted++;
    } catch {}
  }
  return { deleted, reclaimedMb: Math.round(reclaimedBytes / 1024 / 1024) };
}

export async function ensureStorageForRender(excludeJobIds: string[] = []) {
  let snapshot = await storageSnapshot();
  if (!snapshot.diskOk) {
    await cleanupOldOutput(excludeJobIds);
    snapshot = await storageSnapshot();
  }
  if (!snapshot.diskOk) {
    throw new Error(`Disk guard blocked render: free=${snapshot.freeMb}MB output=${snapshot.outputMb}MB`);
  }
  return snapshot;
}
