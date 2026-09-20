import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderStudioLandscapeVideo } from '../dist/video/ffmpeg-landscape.js';

function cmd(bin,args){
  const r=spawnSync(bin,args,{encoding:'utf8'});
  if(r.error)throw new Error(`${bin} unavailable: ${r.error.message}`);
  if(r.status!==0)throw new Error(`${bin} failed (${r.status}): ${r.stderr||r.stdout||'no output'}`);
  return r.stdout;
}

const dir=await mkdtemp(join(tmpdir(),'content-studio-landscape-'));
const images=[];
for(const [i,color] of ['0x174a72','0x24613f','0x6b3b67'].entries()){
  const path=join(dir,`scene-${i}.png`);
  cmd('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',`color=c=${color}:s=1600x900:d=0.1`,'-frames:v','1','-y',path]);
  images.push(path);
}
const audio=join(dir,'audio.m4a');
cmd('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=420:sample_rate=44100:duration=6','-c:a','aac','-b:a','96k','-y',audio]);
const output=join(dir,'landscape.mp4');
await renderStudioLandscapeVideo({
  audioPath:audio,
  outputPath:output,
  duration:6,
  headline:'Content Studio Landscape Acceptance',
  channelName:'Chuyện Sức Khỏe Quanh Ta',
  mediaItems:images.map(path=>({path,kind:'image'})),
  scenes:[
    {imageIndex:0,startRatio:0,endRatio:.34},
    {imageIndex:1,startRatio:.34,endRatio:.67},
    {imageIndex:2,startRatio:.67,endRatio:1},
  ],
});
const info=JSON.parse(cmd('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name,width,height','-of','json',output]));
const video=info.streams.find(x=>x.codec_name==='h264');
assert.ok(video,'H.264 stream missing');
assert.equal(video.width,1920);
assert.equal(video.height,1080);
assert.ok(Number(info.format.duration)>=5.5);
assert.ok(Number((await stat(output)).size)>10_000);
console.log('Content Studio 16:9 FFmpeg render smoke OK',JSON.stringify({duration:info.format.duration,size:info.format.size,width:video.width,height:video.height}));
