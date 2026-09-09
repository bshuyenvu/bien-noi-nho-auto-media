import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderNewsVideo } from '../dist/video/ffmpeg.js';

function cmd(bin,args){const r=spawnSync(bin,args,{encoding:'utf8'});if(r.error)throw new Error(`${bin} unavailable: ${r.error.message}`);if(r.status!==0)throw new Error(`${bin} failed (${r.status}): ${r.stderr||r.stdout||'no output'}`);return r.stdout}
const dir=await mkdtemp(join(tmpdir(),'shotcraft-render-'));
const colors=['0x174a72','0x6b3b67','0x24613f','0x73501f'];
const images=[];
for(let i=0;i<colors.length;i++){
  const path=join(dir,`image-${i}.png`);
  cmd('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',`color=c=${colors[i]}:s=1200x900:d=0.1`,'-frames:v','1','-y',path]);
  images.push(path);
}
const audio=join(dir,'audio.m4a');
cmd('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=8','-c:a','aac','-b:a','96k','-y',audio]);
const scenes=[
  {imageIndex:0,startRatio:0,endRatio:.25,shotRecipe:'slow-push',transition:'cut',holdRatio:.15,energy:.3,sourceCredit:'Nature Medicine'},
  {imageIndex:1,startRatio:.25,endRatio:.5,shotRecipe:'pan-right',transition:'cut',holdRatio:.15,energy:.45,sourceCredit:'ECDC'},
  {imageIndex:2,startRatio:.5,endRatio:.75,shotRecipe:'drift-up',transition:'soft-dip',holdRatio:.16,energy:.5,sourceCredit:'EMA'},
  {imageIndex:3,startRatio:.75,endRatio:1,shotRecipe:'still-hold',transition:'cut',holdRatio:.28,energy:.25,sourceCredit:'Minh họa'},
];
const output=join(dir,'shotcraft-lite.mp4');
await renderNewsVideo({audioPath:audio,outputPath:output,duration:8,headline:'ShotCraft Lite render smoke',imagePaths:images,scenes,template:'clean',motion:'light',tickerMode:'off',channelName:'VietNewsFlow AI'});
const info=JSON.parse(cmd('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name,width,height','-of','json',output]));
const video=info.streams.find(x=>x.codec_name==='h264');
assert.ok(video,'H.264 stream missing');
assert.equal(video.width,1080);assert.equal(video.height,1920);
assert.ok(Number(info.format.duration)>=7.5);assert.ok(Number((await stat(output)).size)>10_000);
console.log('ShotCraft Lite FFmpeg render smoke OK',JSON.stringify({duration:info.format.duration,size:info.format.size,recipes:scenes.map(x=>x.shotRecipe)}));
