import assert from 'node:assert/strict';
import { appendFile,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=await mkdtemp(join(tmpdir(),'content-studio-package-verify-'));
process.env.DB_PATH=join(root,'test.sqlite');
process.env.CONTENT_STUDIO_PACKAGE_DIR=join(root,'packages');
process.env.RENDER_QUEUE_PAUSED='true';

const core=await import('../src/studio/pipeline-v2.js');
const runtime=await import('../src/studio/pipeline-v2-runtime.js');
const generation=await import('../src/studio/pipeline-v2-generation.js');
const packages=await import('../src/studio/pipeline-v2-package.js');
const { db }=await import('../src/storage/db.js');

try{
 const owner='phase6c-owner';
 const project=core.createPipelineProject({
  ownerId:owner,templateId:'podcast-story',topic:'Verify release package',
  script:'Nội dung kiểm thử đủ dài để xác nhận checksum package, phát hiện chỉnh sửa file và xóa package an toàn.',
  outputIds:['podcast']
 });
 await runtime.preparePipelineProject(owner,project.id,{skipExternal:true});
 const artifact=join(root,'episode.mp3');await writeFile(artifact,Buffer.from('FAKE-MP3-PHASE6C-1234567890'));
 generation.recordStudioArtifact({projectId:project.id,ownerId:owner,outputId:'podcast',kind:'podcast',path:artifact,generator:'smoke'});
 runtime.setPipelineReleaseReview({ownerId:owner,projectId:project.id,gate:'copyright',status:'accepted',actor:'smoke',note:'Rights verified.'});
 runtime.setPipelineReleaseReview({ownerId:owner,projectId:project.id,gate:'final',status:'accepted',actor:'smoke',note:'Final verified.'});

 const first=await packages.createContentStudioExportPackage(owner,project.id);
 let verified=await packages.verifyContentStudioExportPackage(owner,first.id);
 assert.equal(verified.ok,true);assert.equal(verified.status,'verified');
 assert.equal(packages.getContentStudioExportPackage(owner,first.id)?.verificationStatus,'verified');

 await appendFile(first.path,Buffer.from('TAMPER'));
 verified=await packages.verifyContentStudioExportPackage(owner,first.id);
 assert.equal(verified.ok,false);assert.equal(verified.status,'tampered');

 const second=await packages.createContentStudioExportPackage(owner,project.id);
 assert.equal(await packages.deleteContentStudioExportPackage('other-owner',second.id),false);
 assert.equal(await packages.deleteContentStudioExportPackage(owner,second.id),true);
 assert.equal(existsSync(second.path),false);
 assert.equal(packages.getContentStudioExportPackage(owner,second.id),undefined);

 console.log(JSON.stringify({ok:true,verified:first.id,tamperDetected:true,deleted:second.id},null,2));
}finally{
 db.close();
 await rm(root,{recursive:true,force:true});
}
