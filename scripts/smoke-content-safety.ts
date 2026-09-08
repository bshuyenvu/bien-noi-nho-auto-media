import { mkdtempSync,mkdirSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'content-safety-smoke-')),output=join(dir,'output');mkdirSync(output,{recursive:true});
Object.assign(process.env,{DB_PATH:join(dir,'test.sqlite'),RENDER_OUTPUT_DIR:output,NODE_ENV:'test',CI:'true',YOUTUBE_PRIVACY_STATUS:'public',PUBLISH_LIVE_ENABLED:'true',CONTENT_DUPLICATE_WINDOW_HOURS:'72',CONTENT_DUPLICATE_TITLE_SIMILARITY:'0.88',CONTENT_DUPLICATE_BODY_SIMILARITY:'0.92',PUBLIC_RAMP_STAGE1_HOURLY:'24',PUBLIC_RAMP_STAGE1_DAILY:'200',PUBLIC_RAMP_STAGE1_MIN_INTERVAL_MINUTES:'1'});
try{
  const {run,all}=await import('../src/storage/db.js');
  const {updateProductionActivation}=await import('../src/publish/activation-state.js');
  const {evaluateContentSafety,contentSafetyStats}=await import('../src/publish/content-safety.js');
  const {enqueuePublish}=await import('../src/publish/queue.js');
  const owner='content-owner',now=new Date().toISOString();
  run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-content','content@example.test','admin','pro','active',now,now);
  updateProductionActivation(owner,{status:'armed',armed:true,maxPrivacy:'public',publicApprovedAt:now,publicRolloutStatus:'completed',publicRolloutCompletedAt:now},'smoke');
  const add=(n:number,title:string,body:string,source:string,videoText:string)=>{const draft=`draft-${n}`,render=`render-${n}`,video=join(output,`${render}.mp4`);writeFileSync(video,Buffer.from(videoText.repeat(400)));run('INSERT INTO drafts(id,owner_id,title,body,source_url,format,status,created_at) VALUES(?,?,?,?,?,?,?,?)',draft,owner,title,body,source,'latest','approved',now);run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,created_at,updated_at,attempts,max_attempts) VALUES(?,?,?,?,?,?,?,?,?,?)',render,draft,owner,'ready',100,video,now,now,1,3);return{draft,render}};
  const body1='Bản tin về thị trường vàng trong nước hôm nay có biến động đáng chú ý. Người xem cần theo dõi giá mua bán, xu hướng quốc tế và các rủi ro trước khi đưa ra quyết định. '.repeat(3);
  const a=add(1,'Giá vàng hôm nay biến động mạnh',body1,'https://news.example.test/gold?utm_source=rss','video-a');
  const pre=evaluateContentSafety({ownerId:owner,draftId:a.draft,renderJobId:a.render,publishTitle:'Giá vàng hôm nay biến động mạnh'});if(!pre.ok)throw new Error(`first preflight should PASS: ${pre.blockers.join(' | ')}`);
  const first=enqueuePublish({ownerId:owner,renderJobId:a.render,draftId:a.draft,platform:'youtube',title:'Giá vàng hôm nay biến động mạnh',dryRun:false});run("UPDATE publish_jobs SET status='published',published_at=?,updated_at=? WHERE id=?",new Date(Date.now()-120000).toISOString(),now,first.id);
  if(Number(all<{n:number}>('SELECT COUNT(*) AS n FROM publish_content_fingerprints WHERE publish_job_id=?',first.id)[0]?.n||0)!==1)throw new Error('fingerprint was not persisted');
  const b=add(2,'Cập nhật giá vàng mới nhất',body1.replace('hôm nay','sáng nay'),'https://news.example.test/gold?utm_source=facebook','video-b');
  const duplicate=evaluateContentSafety({ownerId:owner,draftId:b.draft,renderJobId:b.render,publishTitle:'Cập nhật giá vàng mới nhất'});if(duplicate.ok||!duplicate.duplicate)throw new Error('same normalized source / near duplicate was not blocked');
  let queueBlocked=false;try{enqueuePublish({ownerId:owner,renderJobId:b.render,draftId:b.draft,platform:'youtube',title:'Cập nhật giá vàng mới nhất',dryRun:false})}catch(e){queueBlocked=String(e).includes('Content Safety')}if(!queueBlocked)throw new Error('enqueue bypassed Content Safety duplicate guard');
  const c=add(3,'Dự báo thời tiết miền Tây cuối tuần','Dự báo thời tiết miền Tây cuối tuần có mưa rào rải rác, nhiệt độ thay đổi nhẹ và người dân nên chuẩn bị áo mưa khi di chuyển. Thông tin được tổng hợp cho mục đích cập nhật cộng đồng. '.repeat(2),'https://weather.example.test/mekong/weekend','video-c');
  const unique=evaluateContentSafety({ownerId:owner,draftId:c.draft,renderJobId:c.render,publishTitle:'Dự báo thời tiết miền Tây cuối tuần'});if(!unique.ok)throw new Error(`unique content should PASS: ${unique.blockers.join(' | ')}`);
  const stats=contentSafetyStats(owner);if(stats.recentFingerprints<1||stats.config.windowHours!==72)throw new Error('content safety stats/config mismatch');
  console.log('Content Safety + duplicate publish guard smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
