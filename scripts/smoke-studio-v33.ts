import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=await mkdtemp(join(tmpdir(),'studio-v33-'));
process.env.DB_PATH=join(root,'test.sqlite');
process.env.UPLOAD_MEDIA_DIR=join(root,'uploads');
const settings=await import('../src/studio/account-settings.js');
const uploads=await import('../src/media/uploads.js');

const a=settings.saveStudioAccountSettings('owner-a',{defaultTemplate:'breaking',autoScenes:false,autoVoice:false});
const b=settings.studioAccountSettings('owner-b');
assert.equal(a.defaultTemplate,'breaking');assert.equal(a.autoScenes,false);assert.equal(b.defaultTemplate,'clean');assert.equal(b.autoScenes,true);
const media=await uploads.saveUploadedMedia({ownerId:'owner-a',name:'clip.mp4',mime:'video/mp4',bytes:Buffer.from('synthetic-media'),rightsConfirmed:true});
assert.equal(media.kind,'video');assert.equal(uploads.listUploadedMedia('owner-a').length,1);assert.equal(uploads.listUploadedMedia('owner-b').length,0);assert.equal(uploads.resolveUploadedMedia('owner-a',[media.id])[0]?.id,media.id);assert.equal(uploads.resolveUploadedMedia('owner-b',[media.id]).length,0);
assert.equal(await uploads.deleteUploadedMedia('owner-a',media.id),true);assert.equal(uploads.listUploadedMedia('owner-a').length,0);
await rm(root,{recursive:true,force:true});
console.log('Production Studio V3.3 tenant/settings/upload smoke OK');
