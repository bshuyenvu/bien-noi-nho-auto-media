import { mkdtempSync,mkdirSync,writeFileSync,appendFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'artifact-integrity-smoke-')),output=join(dir,'output');mkdirSync(output,{recursive:true});
Object.assign(process.env,{DB_PATH:join(dir,'test.sqlite'),ARTIFACT_MANIFEST_WATCHER:'false',RENDER_QUEUE_PAUSED:'true',LOW_MEMORY_MODE:'true',CI:'true'});
try{
 const {run}=await import('../src/storage/db.js');
 const {setReview,bindReviewRenderProfile}=await import('../src/review/store.js');
 const {ensureAndVerifyRenderArtifact,artifactIntegritySnapshot,recordArtifactPublishLink,artifactProvenance}=await import('../src/video/provenance.js');
 const owner='artifact-owner',draft='draft-artifact',render='render-artifact',now=new Date().toISOString(),file=join(output,'artifact.mp4');
 run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-artifact','artifact@example.test','admin','pro','active',now,now);
 run('INSERT INTO drafts(id,owner_id,title,body,source_url,source_name,image_url,format,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',draft,owner,'Bản tin kiểm thử artifact','Nội dung kiểm thử đủ dài để tạo approval hash bền vững.','https://example.test/source','Smoke Source',null,'latest','approved',now);
 const locks={script:true,media:true,voice:true,scenes:true};setReview(draft,{status:'approved',locks},{ownerId:owner,actor:'smoke:review'});
 const profile={voice:'vi-male',voiceRate:'+0%',voiceStyle:'news',imageUrl:null,imageUrls:[],autoCollectImages:false,smartScenes:true,scenes:[],template:'clean',motion:'light',tickerMode:'headline',tickerText:null,tickerSpeed:85,channelName:'Smoke'};bindReviewRenderProfile(draft,owner,profile,'smoke:profile');
 const payload={draftId:draft,ownerId:owner,text:'Nội dung kiểm thử đủ dài để tạo approval hash bền vững.',headline:'Bản tin kiểm thử artifact',...profile};
 writeFileSync(file,Buffer.from('FAKE-MP4-BYTES-v1'));
 run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,error,created_at,payload_json,attempts,max_attempts,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',render,draft,owner,'ready',100,file,null,now,JSON.stringify(payload),1,3,now);
 const first=await ensureAndVerifyRenderArtifact(render,owner);if(!first.ok||!first.manifest?.outputSha256)throw new Error(`initial artifact verify failed: ${JSON.stringify(first)}`);
 const originalSha=first.manifest.outputSha256;
 appendFileSync(file,Buffer.from('X'));
 const tampered=await ensureAndVerifyRenderArtifact(render,owner);if(tampered.ok||tampered.reason!=='output_file_hash_mismatch')throw new Error(`tampered artifact was not quarantined: ${JSON.stringify(tampered)}`);
 let stats=artifactIntegritySnapshot(owner);if(stats.quarantined!==1)throw new Error('quarantine count did not persist');
 writeFileSync(file,Buffer.from('FAKE-MP4-BYTES-v1'));
 const restored=await ensureAndVerifyRenderArtifact(render,owner);if(!restored.ok||restored.manifest?.outputSha256!==originalSha)throw new Error('restored exact artifact did not verify');
 recordArtifactPublishLink({renderJobId:render,publishJobId:'publish-artifact',ownerId:owner,platform:'youtube',remoteId:'yt-artifact-123',remoteUrl:'https://youtube.com/watch?v=yt-artifact-123',publishedAt:now});
 const chain=artifactProvenance(render,owner);if(chain?.publishes?.[0]?.remoteId!=='yt-artifact-123'||chain?.manifest?.approvalSha256==null||chain?.manifest?.renderProfileSha256==null)throw new Error('provenance chain is incomplete');
 run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,error,created_at,payload_json,attempts,max_attempts,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)','render-missing',draft,owner,'ready',100,join(output,'missing.mp4'),null,now,JSON.stringify(payload),1,3,now);
 run('INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,dry_run,deployment_test,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)','publish-missing',owner,'render-missing',draft,'youtube','pending','Missing manifest',0,0,now,now);
 stats=artifactIntegritySnapshot(owner);if(stats.activeLiveMissing!==1||stats.activeLiveInvalid!==1)throw new Error(`active LIVE missing manifest was not detected: ${JSON.stringify(stats)}`);
 console.log('Immutable render artifact provenance + tamper quarantine smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
