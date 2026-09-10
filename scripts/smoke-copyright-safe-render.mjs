import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderNewsVideo } from '../dist/video/ffmpeg.js';

const dir=await mkdtemp(join(tmpdir(),'copyright-safe-render-'));
const audio=join(dir,'silence.m4a'),output=join(dir,'safe.mp4');
const audioRun=spawnSync('ffmpeg',['-y','-f','lavfi','-i','anullsrc=channel_layout=mono:sample_rate=44100','-t','2','-c:a','aac',audio],{stdio:'pipe'});
if(audioRun.status!==0)throw new Error('Không tạo được audio smoke');
await renderNewsVideo({audioPath:audio,outputPath:output,duration:2,headline:'Khuyến cáo sức khỏe nguyên bản',imagePaths:[],template:'clean',motion:'off',tickerMode:'off',channelName:'Health Original'});
const info=await stat(output);if(info.size<1000)throw new Error('Copyright-safe no-media MP4 quá nhỏ');
const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',output],{encoding:'utf8'});
if(probe.status!==0)throw new Error('ffprobe copyright-safe MP4 thất bại');
const parsed=JSON.parse(probe.stdout||'{}');
const video=(parsed.streams||[]).find(x=>x.codec_name==='h264');
if(!video||video.width!==1080||video.height!==1920)throw new Error('Copyright-safe MP4 sai định dạng');
console.log('Copyright Safe no-media production render OK',JSON.stringify({bytes:info.size,width:video.width,height:video.height}));
