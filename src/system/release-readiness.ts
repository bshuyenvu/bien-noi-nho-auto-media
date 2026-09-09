import { all } from '../storage/db.js';
import '../queue/production.js';
import './audit.js';
import { contentSafetyStats } from '../publish/content-safety.js';
import { publisherDeploymentReadiness } from '../publish/deployment-readiness.js';
import { publicRampState } from '../publish/public-ramp.js';
import { productionMonitorSnapshot } from './monitor.js';
import { runtimeReleaseMetadata } from './version.js';

export type ReleaseCheckStatus='pass'|'warn'|'fail';
export interface ReleaseCheck{id:string;label:string;status:ReleaseCheckStatus;detail:string}

const REQUIRED_TABLES=['render_jobs','production_queue','publish_jobs','publish_content_fingerprints','youtube_upload_sessions','publish_credentials','system_incidents','system_audit_events'];
function check(id:string,label:string,status:ReleaseCheckStatus,detail:string):ReleaseCheck{return{id,label,status,detail}}
function count(sql:string,...params:any[]){return Number(all<{n:number}>(sql,...params)[0]?.n||0)}

function sqliteChecks(){
  let quick='unknown';
  try{const row=all<Record<string,unknown>>('PRAGMA quick_check')[0]||{};quick=String(row.quick_check??Object.values(row)[0]??'unknown')}catch(e){quick=e instanceof Error?e.message:String(e)}
  const tables=new Set(all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table'").map(x=>x.name));
  const missing=REQUIRED_TABLES.filter(x=>!tables.has(x));
  let journal='unknown';try{const row=all<Record<string,unknown>>('PRAGMA journal_mode')[0]||{};journal=String(row.journal_mode??Object.values(row)[0]??'unknown')}catch{}
  return{quickCheckOk:quick.toLowerCase()==='ok',quickCheck:quick,journalMode:journal,missingTables:missing,requiredTables:[...REQUIRED_TABLES]};
}

export async function releaseCandidateSnapshot(ownerId:string){
  const release=runtimeReleaseMetadata(),database=sqliteChecks(),monitor=await productionMonitorSnapshot(ownerId),deployment=publisherDeploymentReadiness(ownerId),ramp=publicRampState(ownerId),contentSafety=contentSafetyStats(ownerId);
  const needsReconcile=count("SELECT COUNT(*) AS n FROM publish_jobs WHERE owner_id=? AND status='needs_reconcile'",ownerId);
  const uncertainSessions=count("SELECT COUNT(*) AS n FROM youtube_upload_sessions WHERE owner_id=? AND state='needs_reconcile'",ownerId);
  const activeUploads=count("SELECT COUNT(*) AS n FROM youtube_upload_sessions WHERE owner_id=? AND state='active'",ownerId);
  const credentialReady=Boolean(deployment.credential?.liveReadyCached);
  const privateTestReady=!deployment.productionPrivacyNeedsPrivateTest||Boolean(deployment.privateTest?.passed);
  const productionRevisionReady=release.environment!=='production'||release.revision!=='unknown';
  const maintenanceActive=Boolean(monitor.maintenance?.active);
  const checks:ReleaseCheck[]=[
    check('version','Application version',release.version!=='unknown'?'pass':'fail',`${release.version} • ${release.channel}`),
    check('revision','Git revision',productionRevisionReady?(release.revision==='unknown'?'warn':'pass'):'fail',release.revision),
    check('sqlite-integrity','SQLite quick_check',database.quickCheckOk?'pass':'fail',database.quickCheck),
    check('sqlite-schema','Required SQLite schema',database.missingTables.length?'fail':'pass',database.missingTables.length?`Thiếu: ${database.missingTables.join(', ')}`:`${database.requiredTables.length} bảng bắt buộc`),
    check('sqlite-wal','SQLite WAL',database.journalMode.toLowerCase()==='wal'?'pass':'warn',database.journalMode),
    check('monitor','Production Monitor',monitor.overall==='red'?'fail':monitor.overall==='yellow'?'warn':'pass',String(monitor.overall).toUpperCase()),
    check('maintenance','Maintenance Mode',maintenanceActive?'fail':'pass',maintenanceActive?`ACTIVE đến ${monitor.maintenance?.endsAt||'?'}`:'OFF'),
    check('reconcile','Ambiguous publish jobs',needsReconcile||uncertainSessions?'fail':'pass',`${needsReconcile} job • ${uncertainSessions} upload session`),
    check('public-ramp','Public Ramp Circuit',ramp.circuitOpen?'fail':'pass',ramp.circuitOpen?`OPEN • ${ramp.circuitReason||'operator review required'}`:`CLOSED • Stage ${ramp.stage}`),
    check('content-safety','Content Safety duplicate window',contentSafety.config.windowHours<24?'warn':'pass',`${contentSafety.config.windowHours}h • title ≥${contentSafety.config.titleSimilarity} • body ≥${contentSafety.config.bodySimilarity} • ${contentSafety.recentFingerprints} fingerprint gần đây`),
    check('publisher-config','Publisher configuration',deployment.configurationReady?'pass':'fail',deployment.configurationReady?'Configured':deployment.blockers.filter(x=>!x.includes('PUBLISH_LIVE_ENABLED')).join(' | ')||'Incomplete'),
    check('youtube-credential','YouTube cached readiness',credentialReady?'pass':'fail',credentialReady?String(deployment.credential?.channelTitle||deployment.credential?.channelId||'Verified'):'Cần OAuth + TEST KẾT NỐI gần đây'),
    check('private-test','Private Live Test',privateTestReady?'pass':'fail',deployment.productionPrivacyNeedsPrivateTest?(deployment.privateTest?.passed?`PASS • ${deployment.privateTest.videoId||'video recorded'}`:'Bắt buộc trước Public/Unlisted'):'Không bắt buộc khi privacy=private'),
    check('resumable','Durable resumable upload',deployment.config.durableResumableSessions?'pass':'fail',deployment.config.durableResumableSessions?`${deployment.config.uploadChunk.bytes} bytes/chunk • retry ${deployment.config.uploadRetry.maxRetries}`:'Unavailable'),
  ];
  const failChecks=checks.filter(x=>x.status==='fail'),warnings=checks.filter(x=>x.status==='warn');
  const candidateReady=failChecks.length===0;
  const activationReady=candidateReady&&credentialReady&&privateTestReady;
  const liveOperational=activationReady&&Boolean(deployment.config.liveEnabled)&&Boolean(deployment.youtubeLiveReady);
  return{
    release,
    verdict:candidateReady?'GO':'NO_GO',
    candidateReady,
    activationReady,
    liveOperational,
    liveSwitchEnabled:Boolean(deployment.config.liveEnabled),
    checkedAt:new Date().toISOString(),
    checks,
    blockers:failChecks.map(x=>`${x.label}: ${x.detail}`),
    warnings:warnings.map(x=>`${x.label}: ${x.detail}`),
    database,
    queues:{needsReconcile,uncertainSessions,activeUploads},
    deployment,
    monitor:{overall:monitor.overall,maintenance:monitor.maintenance},
    publicRamp:{stage:ramp.stage,circuitOpen:ramp.circuitOpen,circuitReason:ramp.circuitReason,cooldownUntil:ramp.cooldownUntil},
    contentSafety,
  };
}
