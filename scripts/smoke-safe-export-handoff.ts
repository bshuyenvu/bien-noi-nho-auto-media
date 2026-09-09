import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExportHandoff } from '../src/publish/export-handoff.js';
import { assertLivePlatformAllowed } from '../src/publish/capabilities.js';

const root=await mkdtemp(join(tmpdir(),'safe-export-'));const cwd=process.cwd();
try{
  process.chdir(root);await mkdir('output',{recursive:true});await writeFile('output/render-1.mp4',Buffer.from('mp4-smoke'));
  const x=await createExportHandoff({platform:'tiktok',renderOutput:'output/render-1.mp4',renderJobId:'render-1',draftId:'draft-1',title:'Bản tin thử',caption:'Caption thử',sourceName:'Nguồn thử',sourceUrl:'https://example.test/news'});
  assert.equal(x.automatedLiveAllowed,false);assert.equal(x.releaseMode,'dry_run_only');assert.match(x.videoUrl,/render-1\.mp4/);
  const manifest=JSON.parse(await readFile('output/render-1-tiktok.json','utf8'));assert.equal(manifest.platform,'tiktok');assert.equal(manifest.operatorActionRequired,true);
  assert.match(await readFile('output/render-1-tiktok.txt','utf8'),/Caption thử/);
  process.env.PUBLISH_LIVE_ENABLED='true';assert.throws(()=>assertLivePlatformAllowed('tiktok'),/chưa được triển khai/);assert.throws(()=>assertLivePlatformAllowed('facebook'),/chưa được triển khai/);
  console.log('Safe Export Handoff + non-YouTube LIVE lock smoke OK');
}finally{process.chdir(cwd);await rm(root,{recursive:true,force:true})}
