import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=await mkdtemp(join(tmpdir(),'content-studio-package-'));
process.env.DB_PATH=join(root,'test.sqlite');
process.env.CONTENT_STUDIO_PACKAGE_DIR=join(root,'packages');
process.env.RENDER_QUEUE_PAUSED='true';

const core=await import('../src/studio/pipeline-v2.js');
const runtime=await import('../src/studio/pipeline-v2-runtime.js');
const generation=await import('../src/studio/pipeline-v2-generation.js');
const packages=await import('../src/studio/pipeline-v2-package.js');
const { db }=await import('../src/storage/db.js');

try{
 const owner='phase6b-owner';
 const project=core.createPipelineProject({
  ownerId:owner,templateId:'podcast-story',topic:'Đóng gói phát hành an toàn',
  script:'Một kịch bản thử nghiệm đủ dài để kiểm tra toàn bộ quá trình đóng gói artifact, review report và manifest phát hành.',
  outputIds:['podcast']
 });
 await runtime.preparePipelineProject(owner,project.id,{skipExternal:true});
 const artifactPath=join(root,'episode.mp3'),srtPath=join(root,'episode.srt');
 await writeFile(artifactPath,Buffer.from('FAKE-MP3-CONTENT-1234567890'));
 await writeFile(srtPath,'1\n00:00:00,000 --> 00:00:02,000\nNội dung kiểm thử.\n','utf8');
 generation.recordStudioArtifact({projectId:project.id,ownerId:owner,outputId:'podcast',kind:'podcast',path:artifactPath,generator:'smoke'});
 assert.rejects(()=>packages.createContentStudioExportPackage(owner,project.id),/Release Gate chưa mở/);
 runtime.setPipelineReleaseReview({ownerId:owner,projectId:project.id,gate:'copyright',status:'accepted',actor:'smoke',note:'Artifact generated và provenance hợp lệ.'});
 runtime.setPipelineReleaseReview({ownerId:owner,projectId:project.id,gate:'final',status:'accepted',actor:'smoke',note:'Đã kiểm tra bản cuối.'});
 const pkg=await packages.createContentStudioExportPackage(owner,project.id);
 assert.equal(pkg.status,'ready');assert.ok(pkg.fileCount>=4);assert.ok(pkg.size>100);
 const bytes=await readFile(pkg.path);assert.equal(bytes.readUInt32LE(0),0x04034b50);
 const text=bytes.toString('utf8');assert.match(text,/manifest\.json/);assert.match(text,/review-report\.json/);assert.match(text,/script\.txt/);assert.match(text,/episode\.mp3/);assert.match(text,/episode\.srt/);
 assert.equal(pkg.sha256.length,64);assert.ok((await stat(pkg.path)).size===pkg.size);
 assert.equal(packages.listContentStudioExportPackages(owner,project.id).length,1);
 assert.equal(packages.getContentStudioExportPackage('other-owner',pkg.id),undefined);
 console.log(JSON.stringify({ok:true,packageId:pkg.id,fileCount:pkg.fileCount,size:pkg.size,sha256:pkg.sha256},null,2));
}finally{
 db.close();
 await rm(root,{recursive:true,force:true});
}
