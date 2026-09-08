import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root=mkdtempSync(join(tmpdir(),'vnf-durable-'));
process.env.DB_PATH=join(root,'test.sqlite');
process.env.PUBLISH_LIVE_ENABLED='false';
process.env.RENDER_QUEUE_PAUSED='true';

try{
  const {run,all}=await import('../src/storage/db.js');
  const queue=await import('../src/queue/production.js');
  const publish=await import('../src/publish/queue.js');
  const owner='owner-durable',draft='draft-durable',now=new Date().toISOString();
  run('INSERT INTO drafts(id,owner_id,title,body,format,status,created_at) VALUES(?,?,?,?,?,?,?)',draft,owner,'Durable Queue Test','Nội dung kiểm thử production queue bền vững.','latest','approved',now);
  const first=queue.ensureQueueItem(draft,'Durable Queue Test',owner);
  if(first.ownerId!==owner||first.status!=='waiting_review')throw new Error('production queue create mismatch');
  queue.setQueueStatus(draft,'approved',{jobId:'render-durable'});
  const persisted=all<any>('SELECT * FROM production_queue WHERE draft_id=?',draft)[0];
  if(!persisted||persisted.status!=='approved'||persisted.job_id!=='render-durable')throw new Error('production queue was not persisted in SQLite');
  const listed=queue.productionQueue(owner);
  if(listed.length!==1||listed[0].draftId!==draft)throw new Error('tenant durable queue listing mismatch');

  run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,created_at,updated_at,attempts,max_attempts) VALUES(?,?,?,?,?,?,?,?,?,?)','render-durable',draft,owner,'ready',100,'output/test.mp4',now,now,1,3);
  const job=publish.enqueuePublish({ownerId:owner,renderJobId:'render-durable',draftId:draft,platform:'youtube',title:'Interrupted publish',dryRun:true,maxAttempts:3});
  run("UPDATE publish_jobs SET status='publishing',attempts=1,updated_at=? WHERE id=?",new Date().toISOString(),job.id);
  const recovered=publish.markPublishingJobsForReconcile();
  if(recovered.length!==1)throw new Error('interrupted publish was not quarantined');
  let current=publish.getPublishJob(job.id,owner);
  if(current?.status!=='needs_reconcile'||!current.reconcileAt)throw new Error('needs_reconcile state was not persisted');
  let duplicateBlocked=false;try{publish.enqueuePublish({ownerId:owner,renderJobId:'render-durable',draftId:draft,platform:'youtube',title:'duplicate',dryRun:true})}catch{duplicateBlocked=true}
  if(!duplicateBlocked)throw new Error('needs_reconcile did not block duplicate publish');
  let retryBlocked=false;try{publish.retryPublishJob(job.id,owner)}catch{retryBlocked=true}
  if(!retryBlocked)throw new Error('direct retry bypassed reconciliation');

  current=publish.reconcilePublishJob(job.id,owner,'retry',{actor:'operator',note:'remote checked: not published'});
  if(current?.status!=='pending'||!current.reconciledAt)throw new Error('reconcile retry failed');
  run("UPDATE publish_jobs SET status='publishing',updated_at=? WHERE id=?",new Date().toISOString(),job.id);
  publish.markPublishingJobsForReconcile('smoke_second_interrupt');
  current=publish.reconcilePublishJob(job.id,owner,'published',{actor:'operator',remoteId:'yt-verified-123',remoteUrl:'https://youtube.com/watch?v=yt-verified-123',note:'verified on remote'});
  if(current?.status!=='published'||current.remoteId!=='yt-verified-123')throw new Error('mark published reconciliation failed');
  const stats=publish.publishQueueStats(owner);
  if(stats.needsReconcile!==0||stats.published!==1)throw new Error('publish reconcile stats mismatch');

  console.log('Durable production queue + stuck publish reconcile smoke: PASS');
}finally{rmSync(root,{recursive:true,force:true})}
