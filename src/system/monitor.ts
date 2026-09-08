import { randomUUID } from 'node:crypto';
import { all, run } from '../storage/db.js';
import { resourceSnapshot } from './resource-guard.js';
import { storageSnapshot } from './storage-guard.js';
import { renderWorkerStatus } from '../video/job.js';
import { publishWorkerStatus } from '../publish/worker.js';
import { publisherDeploymentReadiness } from '../publish/deployment-readiness.js';

export type MonitorSeverity='green'|'yellow'|'red';
type IncidentRow={id:string;owner_id:string;incident_key:string;component:string;severity:MonitorSeverity;message:string;metadata_json?:string;opened_at:string;last_seen_at:string;resolved_at?:string};
type QueueCountRow={status:string;count:number};
type PublishingRow={id:string;updated_at:string};

const severityRank:Record<MonitorSeverity,number>={green:0,yellow:1,red:2};
let timer:NodeJS.Timeout|undefined,lastCycleAt:string|undefined,lastCycleError:string|undefined;

function envNumber(name:string,fallback:number){const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?n:fallback}
function worst(...values:MonitorSeverity[]):MonitorSeverity{return values.reduce((a,b)=>severityRank[b]>severityRank[a]?b:a,'green' as MonitorSeverity)}
function ageMs(iso?:string){if(!iso)return Number.POSITIVE_INFINITY;const t=Date.parse(iso);return Number.isFinite(t)?Date.now()-t:Number.POSITIVE_INFINITY}
function parseMetadata(raw?:string){if(!raw)return undefined;try{return JSON.parse(raw)}catch{return undefined}}
function incidentId(ownerId:string,key:string){return `${ownerId}:${key}:${randomUUID()}`}

function reconcileIncident(ownerId:string,key:string,component:string,severity:MonitorSeverity,message:string,metadata:Record<string,unknown>){
  const now=new Date().toISOString();
  const open=all<IncidentRow>('SELECT * FROM system_incidents WHERE owner_id=? AND incident_key=? AND resolved_at IS NULL LIMIT 1',ownerId,key)[0];
  if(severity==='green'){
    if(open){run('UPDATE system_incidents SET resolved_at=?,last_seen_at=? WHERE id=?',now,now,open.id);console.info(`[monitor-recovery] ${component}: ${open.message}`)}
    return;
  }
  const json=JSON.stringify(metadata);
  if(open){
    run('UPDATE system_incidents SET severity=?,message=?,metadata_json=?,last_seen_at=? WHERE id=?',severity,message,json,now,open.id);
    if(open.severity!==severity)console.warn(`[monitor-alert] ${component}: ${open.severity} -> ${severity}: ${message}`);
  }else{
    run('INSERT INTO system_incidents(id,owner_id,incident_key,component,severity,message,metadata_json,opened_at,last_seen_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)',incidentId(ownerId,key),ownerId,key,component,severity,message,json,now,now);
    console.warn(`[monitor-alert] ${component}: ${severity}: ${message}`);
  }
}

function trimHistory(){const days=envNumber('MONITOR_HISTORY_DAYS',30),cutoff=new Date(Date.now()-days*86400000).toISOString();run('DELETE FROM system_incidents WHERE resolved_at IS NOT NULL AND resolved_at<?',cutoff)}
function publishQueueSnapshot(){
  const rows=all<QueueCountRow>('SELECT status,COUNT(*) AS count FROM publish_jobs GROUP BY status'),counts:Record<string,number>={};
  for(const row of rows)counts[row.status]=Number(row.count||0);
  const oldest=all<PublishingRow>("SELECT id,updated_at FROM publish_jobs WHERE status='publishing' ORDER BY updated_at ASC LIMIT 1")[0];
  const queued=(counts.pending||0)+(counts.scheduled||0),publishing=counts.publishing||0;
  return{counts,queued,publishing,oldestPublishingId:oldest?.id,oldestPublishingAt:oldest?.updated_at,oldestPublishingAgeMs:oldest?ageMs(oldest.updated_at):0};
}

export async function productionMonitorSnapshot(ownerId?:string){
  const [render,storage]=await Promise.all([renderWorkerStatus(),storageSnapshot().catch(()=>null)]),resources=resourceSnapshot(),publish=publishWorkerStatus(),publishQueue=publishQueueSnapshot();
  const warnMemoryMb=envNumber('MONITOR_WARN_AVAILABLE_MB',768),warnLoadPerCpu=envNumber('MONITOR_WARN_LOAD_PER_CPU',0.70),warnCgroupPct=envNumber('MONITOR_WARN_CGROUP_MEMORY_PCT',75),critCgroupPct=envNumber('MONITOR_CRIT_CGROUP_MEMORY_PCT',90),loadPerCpu=resources.cpuLoad1m/Math.max(1,resources.cpuCount),cgroupPct=resources.cgroupMemoryUsagePct;
  const memorySeverity:MonitorSeverity=!resources.memoryOk||(cgroupPct!=null&&cgroupPct>=critCgroupPct)?'red':resources.availableMemoryMb<warnMemoryMb||(cgroupPct!=null&&cgroupPct>=warnCgroupPct)?'yellow':'green';
  const cpuSeverity:MonitorSeverity=!resources.cpuOk?'red':loadPerCpu>warnLoadPerCpu?'yellow':'green';
  let diskSeverity:MonitorSeverity='green';
  if(!storage)diskSeverity='red';
  else if(!storage.diskOk)diskSeverity='red';
  else if(storage.freeMb<Math.max(storage.minFreeMb*1.5,3072)||storage.outputMb>storage.maxOutputMb*0.8)diskSeverity='yellow';
  const renderBacklogWarn=envNumber('MONITOR_WARN_RENDER_BACKLOG',5),renderSeverity:MonitorSeverity=render.watchdog?.stalled?'red':render.shuttingDown||render.paused||render.pending>=renderBacklogWarn?'yellow':'green';
  const publishErrorAge=ageMs(publish.lastErrorAt),warnPublishBacklog=envNumber('MONITOR_WARN_PUBLISH_BACKLOG',20),publishStuckMs=envNumber('MONITOR_PUBLISH_STUCK_MS',15*60_000);
  const publishWorkerSeverity:MonitorSeverity=!publish.started?'yellow':publish.lastError&&publishErrorAge<10*60_000?'red':publish.lastError&&publishErrorAge<60*60_000?'yellow':'green';
  const publishQueueSeverity:MonitorSeverity=publishQueue.publishing>0&&publishQueue.oldestPublishingAgeMs>publishStuckMs?'red':publishQueue.queued>=warnPublishBacklog?'yellow':'green',publishSeverity=worst(publishWorkerSeverity,publishQueueSeverity);
  const deployment=ownerId?publisherDeploymentReadiness(ownerId):undefined;
  const youtubeSeverity:MonitorSeverity=!deployment?'green':deployment.config.liveEnabled&&!deployment.youtubeLiveReady?'red':!deployment.configurationReady?'yellow':'green';
  const cgroupDetail=resources.cgroupMemoryUsagePct!=null?` • container ${resources.cgroupMemoryUsagePct}% (${resources.cgroupMemoryCurrentMb}/${resources.cgroupMemoryLimitMb} MB)`:'';
  const components={
    memory:{severity:memorySeverity,message:memorySeverity==='green'?'RAM ổn định':`RAM khả dụng ${resources.availableMemoryMb} MB${cgroupDetail}`,availableMb:resources.availableMemoryMb,warnMb:warnMemoryMb,cgroupMemoryCurrentMb:resources.cgroupMemoryCurrentMb,cgroupMemoryLimitMb:resources.cgroupMemoryLimitMb,cgroupMemoryUsagePct:resources.cgroupMemoryUsagePct,warnCgroupPct,critCgroupPct},
    cpu:{severity:cpuSeverity,message:cpuSeverity==='green'?'CPU ổn định':`CPU load ${resources.cpuLoad1m.toFixed(2)} / ${resources.cpuCount} core`,load1m:resources.cpuLoad1m,loadPerCpu,cpuCount:resources.cpuCount},
    disk:{severity:diskSeverity,message:!storage?'Không đọc được trạng thái ổ đĩa':diskSeverity==='green'?'Dung lượng ổ đĩa ổn định':`Còn ${storage.freeMb} MB, output ${storage.outputMb} MB`,...(storage||{})},
    render:{severity:renderSeverity,message:render.watchdog?.stalled?`Render worker STALLED tại ${render.watchdog.stage}`:render.paused?'Render queue đang PAUSED':render.pending>=renderBacklogWarn?`Render backlog ${render.pending} job`:'Render worker hoạt động',busy:render.busy,pending:render.pending,currentJobId:render.currentJobId,watchdog:render.watchdog,lastActivityAt:render.lastActivityAt,warnBacklog:renderBacklogWarn},
    publish:{severity:publishSeverity,message:publishQueueSeverity==='red'?`Publish job bị kẹt ${Math.round(publishQueue.oldestPublishingAgeMs/60000)} phút`:publishQueueSeverity==='yellow'?`Publish backlog ${publishQueue.queued} job`:publishWorkerSeverity!=='green'?publish.lastError||'Publish worker chưa khởi động':'Publish worker hoạt động',...publish,queue:publishQueue,warnBacklog:warnPublishBacklog,stuckMs:publishStuckMs},
    youtube:{severity:youtubeSeverity,message:!deployment?'Chưa nạp owner readiness':youtubeSeverity==='green'?'YouTube gate phù hợp trạng thái hiện tại':deployment.blockers.join(' | '),ready:deployment?.youtubeLiveReady,configurationReady:deployment?.configurationReady,liveEnabled:deployment?.config.liveEnabled,privacyStatus:deployment?.config.privacyStatus},
  };
  const overall=worst(memorySeverity,cpuSeverity,diskSeverity,renderSeverity,publishSeverity,youtubeSeverity);
  return{overall,checkedAt:new Date().toISOString(),components,render,publish,publishQueue,deployment,monitor:{started:Boolean(timer),intervalMs:envNumber('MONITOR_INTERVAL_MS',30000),lastCycleAt,lastCycleError}};
}

export async function runProductionMonitorCycle(ownerId?:string){
  try{
    const snapshot=await productionMonitorSnapshot(ownerId),systemOwner='system';
    reconcileIncident(systemOwner,'memory','memory',snapshot.components.memory.severity,snapshot.components.memory.message,snapshot.components.memory);
    reconcileIncident(systemOwner,'cpu','cpu',snapshot.components.cpu.severity,snapshot.components.cpu.message,snapshot.components.cpu);
    reconcileIncident(systemOwner,'disk','disk',snapshot.components.disk.severity,snapshot.components.disk.message,snapshot.components.disk);
    reconcileIncident(systemOwner,'render-worker','render',snapshot.components.render.severity,snapshot.components.render.message,snapshot.components.render);
    reconcileIncident(systemOwner,'publish-worker','publish',snapshot.components.publish.severity,snapshot.components.publish.message,snapshot.components.publish);
    if(ownerId)reconcileIncident(ownerId,'youtube-readiness','youtube',snapshot.components.youtube.severity,snapshot.components.youtube.message,snapshot.components.youtube);
    trimHistory();lastCycleAt=new Date().toISOString();lastCycleError=undefined;return snapshot;
  }catch(e){lastCycleError=e instanceof Error?e.message:String(e);lastCycleAt=new Date().toISOString();throw e}
}

export function monitorIncidents(ownerId:string,limit=50){
  return all<IncidentRow>("SELECT * FROM system_incidents WHERE owner_id='system' OR owner_id=? ORDER BY (resolved_at IS NULL) DESC,last_seen_at DESC LIMIT ?",ownerId,Math.max(1,Math.min(200,limit))).map(x=>({id:x.id,ownerId:x.owner_id,key:x.incident_key,component:x.component,severity:x.severity,message:x.message,metadata:parseMetadata(x.metadata_json),openedAt:x.opened_at,lastSeenAt:x.last_seen_at,resolvedAt:x.resolved_at||undefined,active:!x.resolved_at}));
}

export function startProductionMonitor(){if(timer)return;const intervalMs=envNumber('MONITOR_INTERVAL_MS',30000);timer=setInterval(()=>void runProductionMonitorCycle().catch(e=>console.warn('[production-monitor]',e instanceof Error?e.message:String(e))),intervalMs);timer.unref();void runProductionMonitorCycle().catch(e=>console.warn('[production-monitor]',e instanceof Error?e.message:String(e)))}
