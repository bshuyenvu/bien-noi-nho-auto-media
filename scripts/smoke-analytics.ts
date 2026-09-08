import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'auto-media-analytics-'));
process.env.DB_PATH=join(dir,'analytics.sqlite');
try{
  const {all,run,db}=await import('../src/storage/db.js');
  const owner='analytics-owner',now=new Date(Date.now()-60_000).toISOString();
  run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,created_at,updated_at,attempts,max_attempts) VALUES(?,?,?,?,?,?,?,?,?)','render-1','draft-1',owner,'queued',0,now,now,0,3);
  run("UPDATE render_jobs SET status='rendering',updated_at=? WHERE id=?",new Date().toISOString(),'render-1');
  await new Promise(r=>setTimeout(r,8));
  run("UPDATE render_jobs SET status='ready',progress=100,updated_at=? WHERE id=?",new Date().toISOString(),'render-1');
  const render=all<any>('SELECT started_at,completed_at FROM render_jobs WHERE id=?','render-1')[0];
  if(!render?.started_at||!render?.completed_at)throw new Error('render timing triggers did not persist timestamps');

  run('INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,attempts,max_attempts,dry_run,deployment_test,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)','publish-1',owner,'render-1','draft-1','youtube','pending','Smoke publish',0,3,1,0,now,now);
  run("UPDATE publish_jobs SET status='publishing',attempts=1,updated_at=? WHERE id=?",new Date().toISOString(),'publish-1');
  await new Promise(r=>setTimeout(r,8));
  run("UPDATE publish_jobs SET status='published',published_at=?,updated_at=? WHERE id=?",new Date().toISOString(),new Date().toISOString(),'publish-1');
  const publish=all<any>('SELECT started_at,completed_at FROM publish_jobs WHERE id=?','publish-1')[0];
  if(!publish?.started_at||!publish?.completed_at)throw new Error('publish timing triggers did not persist timestamps');

  run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,error,created_at,updated_at,attempts,max_attempts) VALUES(?,?,?,?,?,?,?,?,?,?)','render-old','draft-old',owner,'failed',0,'historical',now,new Date().toISOString(),1,3);
  const {productionAnalyticsSnapshot}=await import('../src/analytics/production.js');
  const snapshot=productionAnalyticsSnapshot(owner,7);
  if(snapshot.kpis.videosReady!==1||snapshot.kpis.renderFailed!==1)throw new Error('render KPI counts mismatch');
  if(snapshot.kpis.publishPublished!==1||snapshot.kpis.publishSuccessRate!==100)throw new Error('publish KPI counts mismatch');
  if(snapshot.render.timingMeasured!==1||snapshot.publish.timingMeasured!==1)throw new Error('measured timing counts mismatch');
  if(snapshot.kpis.avgRenderQueueMs==null||snapshot.kpis.avgPublishQueueMs==null)throw new Error('queue latency was not calculated');
  if(snapshot.daily.reduce((s,x)=>s+x.renderReady,0)!==1)throw new Error('daily render throughput mismatch');
  if(snapshot.daily.reduce((s,x)=>s+x.publishPublished,0)!==1)throw new Error('daily publish throughput mismatch');
  db.close();
  console.log('production analytics KPI smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
