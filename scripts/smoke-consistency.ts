import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'consistency-smoke-'));
Object.assign(process.env,{DB_PATH:join(dir,'test.sqlite'),CONSISTENCY_AUDITOR_ENABLED:'false',ARTIFACT_MANIFEST_WATCHER:'false',RENDER_QUEUE_PAUSED:'true',CI:'true'});
try{
 const {run,all}=await import('../src/storage/db.js');
 const {runConsistencyAudit,consistencySnapshot,latestConsistencyRuns}=await import('../src/system/consistency.js');
 const {createYouTubeUploadSession,getYouTubeUploadSession}=await import('../src/publish/upload-session.js');
 const owner='consistency-owner',draft='draft-consistency',now=new Date().toISOString();
 run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-consistency','consistency@example.test','admin','pro','active',now,now);
 run('INSERT INTO drafts(id,owner_id,title,body,format,status,created_at) VALUES(?,?,?,?,?,?,?)',draft,owner,'Consistency Draft','Nội dung consistency đủ dài để kiểm thử recovery audit.','latest','draft',now);
 let before=consistencySnapshot(owner);if(!before.issues.some(x=>x.code==='queue_missing'))throw new Error('missing Production Queue was not detected');
 const repaired=runConsistencyAudit(owner,{repairSafe:true,persistent:true});if(repaired.repairs<1)throw new Error('safe queue repair did not run');
 const queue=all<any>('SELECT * FROM production_queue WHERE draft_id=?',draft)[0];if(!queue||queue.status!=='waiting_review')throw new Error('Production Queue was not safely reconstructed');
 run("UPDATE production_queue SET title='WRONG',status='completed',job_id='ghost' WHERE draft_id=?",draft);
 const repairedMetadata=runConsistencyAudit(owner,{repairSafe:true,persistent:true});if(repairedMetadata.repairs<1)throw new Error('queue metadata/status mismatch was not repaired');
 const queue2=all<any>('SELECT * FROM production_queue WHERE draft_id=?',draft)[0];if(queue2.title!=='Consistency Draft'||queue2.status!=='waiting_review'||queue2.job_id!=null)throw new Error('queue deterministic state repair is wrong');
 run('INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,dry_run,deployment_test,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)','broken-live',owner,'missing-render',draft,'youtube','pending','Broken live',0,0,now,now);
 const broken=consistencySnapshot(owner);if(!broken.issues.some(x=>x.code==='active_publish_missing_render'&&x.severity==='blocker'))throw new Error('active LIVE missing render was not a blocker');
 run('DELETE FROM publish_jobs WHERE id=?','broken-live');
 run('INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,dry_run,deployment_test,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)','failed-upload',owner,'render-old',draft,'youtube','failed','Failed upload',0,0,now,now);
 createYouTubeUploadSession({publishJobId:'failed-upload',ownerId:owner,sessionUri:'https://upload.example/session',filePath:'/tmp/video.mp4',fileSize:100,chunkSize:262144});
 const sessionBefore=getYouTubeUploadSession('failed-upload',owner);if(sessionBefore?.state!=='active')throw new Error('test upload session did not start active');
 const repairedSession=runConsistencyAudit(owner,{repairSafe:true,persistent:true});if(repairedSession.repairs<1)throw new Error('terminal publish/upload-session mismatch was not repaired');
 const sessionAfter=getYouTubeUploadSession('failed-upload',owner);if(sessionAfter?.state!=='failed')throw new Error('failed publish did not move active session to failed');
 const final=consistencySnapshot(owner);if(final.blockers!==0)throw new Error(`unexpected blockers after safe repair: ${JSON.stringify(final.issues)}`);
 const runs=latestConsistencyRuns(owner,10);if(runs.length<3)throw new Error('consistency audit history was not persisted');
 console.log('End-to-end consistency + deterministic local recovery smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
