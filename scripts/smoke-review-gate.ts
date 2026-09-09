import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=mkdtempSync(join(tmpdir(),'review-gate-smoke-'));
Object.assign(process.env,{DB_PATH:join(root,'review.sqlite'),NODE_ENV:'test',CI:'true',RENDER_QUEUE_PAUSED:'true'});
try{
  const {run,all}=await import('../src/storage/db.js');
  const review=await import('../src/review/store.js');
  const integrity=await import('../src/review/render-integrity.js');
  const owner='review-owner',now=new Date().toISOString(),locks={script:true,media:true,voice:true,scenes:true};
  run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-review','review@example.test','admin','pro','active',now,now);
  const insertDraft=(id:string,status='draft',title='Bản tin kiểm thử Review',body='Nội dung bản tin kiểm thử đủ dài để xác minh approval theo phiên bản và cơ chế vô hiệu hóa khi nội dung thay đổi.')=>run('INSERT INTO drafts(id,owner_id,title,body,source_url,source_name,image_url,format,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,owner,title,body,'https://example.test/review','Nguồn kiểm thử','https://example.test/image.jpg','latest',status,now);

  insertDraft('draft-main');
  const initial=review.getReview('draft-main',owner);if(initial.status!=='needs_review'||initial.approvalCurrent)throw new Error('new draft should require review');
  const approved=review.setReview('draft-main',{status:'approved',locks},{ownerId:owner,actor:'operator:test'});
  if(!approved.approvalCurrent||approved.approvedBy!=='operator:test'||!approved.approvalHash)throw new Error('durable approval evidence missing');
  const persisted=all<{approval_hash?:string;approved_by?:string}>('SELECT approval_hash,approved_by FROM review_states WHERE draft_id=?','draft-main')[0];if(!persisted?.approval_hash||persisted.approved_by!=='operator:test')throw new Error('approval was not persisted in SQLite');
  if(!review.canRender('draft-main',owner))throw new Error('current approval did not allow render');

  const profile={voice:'vi-male',voiceRate:'+0%',voiceStyle:'news',imageUrl:'https://example.test/image.jpg',imageUrls:[],autoCollectImages:true,smartScenes:true,scenes:[],template:'classic',motion:'light',tickerMode:'headline',tickerText:null,tickerSpeed:85,channelName:'Biển & Nỗi Nhớ',breaking:false};
  const bound=review.bindReviewRenderProfile('draft-main',owner,profile,'operator:test');if(!bound.renderProfileHash||!bound.renderProfileBoundAt)throw new Error('render profile was not bound');
  review.bindReviewRenderProfile('draft-main',owner,{...profile},'operator:test');
  let changedProfileBlocked=false;try{review.bindReviewRenderProfile('draft-main',owner,{...profile,voice:'vi-female'},'operator:test')}catch{changedProfileBlocked=true}if(!changedProfileBlocked)throw new Error('changed render profile did not invalidate approval');
  let afterProfile=review.getReview('draft-main',owner);if(afterProfile.approvalCurrent||afterProfile.status!=='needs_review'||afterProfile.invalidationReason!=='render_profile_changed'||Object.values(afterProfile.locks).some(Boolean))throw new Error('profile invalidation state is incorrect');

  review.setReview('draft-main',{status:'approved',locks},{ownerId:owner,actor:'operator:test'});
  run('UPDATE drafts SET body=? WHERE id=?','Nội dung đã được sửa sau khi duyệt; approval cũ bắt buộc phải mất hiệu lực và cần duyệt lại trước khi render.','draft-main');
  const afterContent=review.getReview('draft-main',owner);if(afterContent.approvalCurrent||afterContent.invalidationReason!=='draft_content_changed')throw new Error('draft content mutation did not invalidate approval');

  insertDraft('draft-legacy','approved','Legacy approved draft','Nội dung legacy từng mang status approved nhưng không có durable approval evidence nên không được tự khôi phục sau restart.');
  const legacy=review.setReview('draft-legacy',{status:'approved',locks});if(legacy.approvalCurrent||legacy.status!=='needs_review'||legacy.invalidationReason!=='legacy_boot_recovery_without_durable_approval')throw new Error('legacy approved status was incorrectly trusted after restart');
  const legacyEvents=review.listReviewEvents('draft-legacy',owner,10);if(!legacyEvents.some(x=>x.action==='legacy_recovery_blocked'))throw new Error('legacy recovery rejection was not audited');

  const currentBody='Nội dung hiện tại đã được duyệt lại để kiểm tra retry render cũ và tính toàn vẹn payload sau khi draft thay đổi.';
  run('UPDATE drafts SET body=?,status=? WHERE id=?',currentBody,'approved','draft-main');
  review.setReview('draft-main',{status:'approved',locks},{ownerId:owner,actor:'operator:test'});
  const renderInput={draftId:'draft-main',ownerId:owner,text:currentBody,headline:'Bản tin kiểm thử Review',source:'Nguồn kiểm thử',sourceUrl:'https://example.test/review',breaking:false,voice:'vi-male',voiceRate:'+0%',voiceStyle:'news',imageUrl:'https://example.test/image.jpg',imageUrls:[],autoCollectImages:true,smartScenes:true,scenes:[],template:'classic',motion:'light',tickerMode:'headline',tickerSpeed:85,channelName:'Biển & Nỗi Nhớ'};
  review.bindReviewRenderProfile('draft-main',owner,integrity.canonicalReviewRenderProfile(renderInput),'operator:test');
  run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,created_at,updated_at,payload_json,attempts,max_attempts) VALUES(?,?,?,?,?,?,?,?,?,?)','render-old','draft-main',owner,'failed',0,now,now,JSON.stringify(renderInput),1,3);
  integrity.assertStoredRenderReview('render-old',owner,'operator:retry');
  run('UPDATE drafts SET body=? WHERE id=?','Draft đã đổi sau khi render cũ được tạo. Retry payload cũ phải bị chặn để không render nhầm phiên bản nội dung.','draft-main');
  review.setReview('draft-main',{status:'approved',locks},{ownerId:owner,actor:'operator:test'});
  let staleRetryBlocked=false;try{integrity.assertStoredRenderReview('render-old',owner,'operator:retry')}catch{staleRetryBlocked=true}if(!staleRetryBlocked)throw new Error('stale render payload retry was not blocked');
  const afterRetry=review.getReview('draft-main',owner);if(afterRetry.approvalCurrent||afterRetry.invalidationReason!=='stored_render_payload_no_longer_matches_draft')throw new Error('stale retry did not invalidate current approval');

  const events=review.listReviewEvents('draft-main',owner,50),actions=new Set(events.map(x=>x.action));for(const action of ['approved','render_profile_bound','invalidated'])if(!actions.has(action))throw new Error(`missing review audit action ${action}`);
  if(!events.some(x=>x.actor==='operator:test'))throw new Error('review actor was not persisted');
  console.log('Durable Review Gate + versioned approval audit smoke OK');
}finally{rmSync(root,{recursive:true,force:true})}
