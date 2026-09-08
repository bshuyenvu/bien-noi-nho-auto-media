import { mkdtemp,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root=await mkdtemp(join(tmpdir(),'release-gate-smoke-')),dbPath=join(root,'app.sqlite'),output=join(root,'output'),backup=join(root,'backup.sqlite');
await mkdir(output,{recursive:true});
Object.assign(process.env,{
  DB_PATH:dbPath,RENDER_OUTPUT_DIR:output,CI:'true',NODE_ENV:'test',APP_REVISION:'release-smoke-rev',RELEASE_CHANNEL:'rc',
  CREDENTIAL_VAULT_KEY:'release-smoke-vault-key-1234567890',OAUTH_STATE_SECRET:'release-smoke-oauth-key-1234567890',
  YOUTUBE_CLIENT_ID:'client',YOUTUBE_CLIENT_SECRET:'secret',YOUTUBE_REDIRECT_URI:'http://localhost:8787/api/publish-oauth/youtube/callback',
  YOUTUBE_PRIVACY_STATUS:'private',YOUTUBE_READINESS_MAX_AGE_MS:'900000',PUBLISH_LIVE_ENABLED:'false',PUBLISH_STARTUP_DIAGNOSTICS:'false',
  RENDER_QUEUE_PAUSED:'false',LOW_MEMORY_MODE:'true'
});

const { run,db }=await import('../src/storage/db.js');
const { saveCredential }=await import('../src/publish/vault.js');
const { YOUTUBE_REQUIRED_SCOPES }=await import('../src/publish/youtube.js');
const { releaseCandidateSnapshot }=await import('../src/system/release-readiness.js');
const owner='owner-release-smoke',now=new Date().toISOString();
run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-release-smoke','release@example.test','admin','pro','active',now,now);
saveCredential(owner,'youtube','Release Smoke Channel',{refreshToken:'refresh',scope:YOUTUBE_REQUIRED_SCOPES.join(' '),channelId:'UC_RELEASE_SMOKE',channelTitle:'Release Smoke Channel',verifiedAt:now});

try{
  const good=await releaseCandidateSnapshot(owner);
  if(!good.candidateReady||good.verdict!=='GO')throw new Error(`expected GO release candidate: ${JSON.stringify(good.blockers)}`);
  if(good.release.version!=='6.3.0'||good.release.revision!=='release-smoke-rev')throw new Error('release metadata mismatch');
  if(!good.database.quickCheckOk||good.database.missingTables.length)throw new Error('database acceptance checks failed');
  if(!good.deployment.config.durableResumableSessions)throw new Error('durable resumable capability missing');

  run("INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,attempts,max_attempts,dry_run,deployment_test,created_at,updated_at) VALUES(?,?,?,?,?,'needs_reconcile',?,1,3,0,0,?,?)",'pub-release-block',owner,'render-x','draft-x','youtube','Ambiguous publish',now,now);
  const blocked=await releaseCandidateSnapshot(owner);
  if(blocked.candidateReady||blocked.verdict!=='NO_GO'||!blocked.blockers.some(x=>x.includes('Ambiguous publish jobs')))throw new Error('needs_reconcile did not block release gate');

  const escaped=backup.replaceAll("'","''");db.exec(`VACUUM INTO '${escaped}'`);
  const restored=new DatabaseSync(backup),quick=restored.prepare('PRAGMA quick_check').get() as Record<string,unknown>;
  const quickValue=String(quick.quick_check??Object.values(quick)[0]??'');
  const restoredJob=Number((restored.prepare("SELECT COUNT(*) AS n FROM publish_jobs WHERE id='pub-release-block'").get() as {n:number}).n||0);
  restored.close();
  if(quickValue.toLowerCase()!=='ok'||restoredJob!==1)throw new Error('SQLite backup/restore drill failed');
  console.log('Release candidate GO/NO-GO and SQLite backup/restore smoke OK');
}finally{await rm(root,{recursive:true,force:true})}
