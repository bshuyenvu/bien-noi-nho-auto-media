import { readFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';

export interface ResourceSnapshot {
  availableMemoryMb: number;
  cpuLoad1m: number;
  cpuCount: number;
  cgroupMemoryCurrentMb?: number;
  cgroupMemoryLimitMb?: number;
  cgroupMemoryUsagePct?: number;
  memoryOk: boolean;
  cpuOk: boolean;
  allowed: boolean;
}

const DEFAULT_MIN_AVAILABLE_MB = 512;
const DEFAULT_MAX_LOAD_PER_CPU = 0.85;
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_MAX_WAIT_MS = 15 * 60_000;

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function availableMemoryMb() {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
    if (match) return Math.round(Number(match[1]) / 1024);
  } catch {}
  return Number.POSITIVE_INFINITY;
}

function cgroupMemory(){
  try{
    const currentRaw=readFileSync('/sys/fs/cgroup/memory.current','utf8').trim(),maxRaw=readFileSync('/sys/fs/cgroup/memory.max','utf8').trim();
    const current=Number(currentRaw),limit=maxRaw==='max'?NaN:Number(maxRaw);
    if(!Number.isFinite(current)||current<0)return{};
    const currentMb=Math.round(current/1024/1024);
    if(!Number.isFinite(limit)||limit<=0)return{cgroupMemoryCurrentMb:currentMb};
    const limitMb=Math.round(limit/1024/1024),usagePct=Math.round((current/limit)*1000)/10;
    return{cgroupMemoryCurrentMb:currentMb,cgroupMemoryLimitMb:limitMb,cgroupMemoryUsagePct:usagePct};
  }catch{return{}}
}

export function resourceSnapshot(): ResourceSnapshot {
  const cpuCount = Math.max(1, cpus().length);
  const cpuLoad1m = loadavg()[0] || 0;
  const available = availableMemoryMb();
  const minAvailableMb = envNumber('RENDER_MIN_AVAILABLE_MB', DEFAULT_MIN_AVAILABLE_MB);
  const maxLoadPerCpu = envNumber('RENDER_MAX_LOAD_PER_CPU', DEFAULT_MAX_LOAD_PER_CPU);
  const memoryOk = available >= minAvailableMb;
  const cpuOk = cpuLoad1m <= cpuCount * maxLoadPerCpu;
  return {
    availableMemoryMb: available,
    cpuLoad1m,
    cpuCount,
    ...cgroupMemory(),
    memoryOk,
    cpuOk,
    allowed: memoryOk && cpuOk,
  };
}

export async function waitForRenderResources() {
  const pollMs = envNumber('RENDER_RESOURCE_POLL_MS', DEFAULT_POLL_MS);
  const maxWaitMs = envNumber('RENDER_RESOURCE_MAX_WAIT_MS', DEFAULT_MAX_WAIT_MS);
  const started = Date.now();
  let snapshot = resourceSnapshot();
  while (!snapshot.allowed) {
    if (Date.now() - started >= maxWaitMs) {
      throw new Error(`Resource guard timeout: available=${snapshot.availableMemoryMb}MB load1m=${snapshot.cpuLoad1m.toFixed(2)}`);
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
    snapshot = resourceSnapshot();
  }
  return snapshot;
}
