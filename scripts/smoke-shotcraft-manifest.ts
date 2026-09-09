import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeShotCraftRenderManifest } from '../src/video/render-manifest.js';

const dir=await mkdtemp(join(tmpdir(),'shotcraft-manifest-'));
const output=join(dir,'render-123.mp4');
const path=await writeShotCraftRenderManifest({
  outputPath:output,
  headline:'Bản tin thử nghiệm ShotCraft',
  template:'clean',
  motion:'light',
  scenes:[
    {imageIndex:0,startRatio:0,endRatio:.4,shotRecipe:'slow-push',transition:'cut',holdRatio:.14,energy:.72,sourceCredit:'WHO'},
    {imageIndex:1,startRatio:.4,endRatio:1,shotRecipe:'still-hold',transition:'soft-dip',holdRatio:.3,energy:.2,sourceCredit:'Bộ Y tế'}
  ]
});
const manifest=JSON.parse(await readFile(path,'utf8'));
assert.equal(manifest.schema,'vietnewsflow.shotcraft-render.v1');
assert.equal(manifest.aspectRatio,'9:16');
assert.deepEqual(manifest.frame,{width:1080,height:1920,fps:30});
assert.equal(manifest.motion,'light');
assert.equal(manifest.scenes.length,2);
assert.equal(manifest.scenes[0].shotRecipe,'slow-push');
assert.equal(manifest.scenes[1].sourceCredit,'Bộ Y tế');
assert.equal(manifest.scenes[1].durationRatio,.6);
assert.ok(manifest.scenes[0].motionCap>manifest.scenes[1].motionCap,'higher scene energy must produce a larger effective camera cap');
assert.ok(manifest.scenes.every((x:any)=>Number.isFinite(x.motionCap)&&x.motionCap>=1));
console.log('ShotCraft render manifest smoke OK',JSON.stringify({path,schema:manifest.schema,scenes:manifest.scenes.length,caps:manifest.scenes.map((x:any)=>x.motionCap)}));
