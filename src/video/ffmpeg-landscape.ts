import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runFfmpeg, type RenderMediaItem, type VideoScene } from './ffmpeg.js';
const RENDER_FPS=Math.max(20,Math.min(30,Number(process.env.FFMPEG_RENDER_FPS||30)));
const X264_PRESET=String(process.env.FFMPEG_X264_PRESET||'veryfast');
const X264_CRF=String(process.env.FFMPEG_CRF||'23');

function escPath(value:string){
  return value.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
}
function wrapHeadline(input:string,max=48,maxLines=2){
  const words=input.replace(/\s+/g,' ').trim().split(' ').filter(Boolean),lines:string[]=[];let line='';
  for(const word of words){
    const next=line?`${line} ${word}`:word;
    if(next.length<=max){line=next;continue}
    if(line)lines.push(line);
    line=word;
    if(lines.length>=maxLines-1)break;
  }
  if(line&&lines.length<maxLines)lines.push(line);
  return lines.join('\n');
}
function clipImage(inputIndex:number,label:string,duration:number,start:number){
  return `[${inputIndex}:v]scale=1600:720:force_original_aspect_ratio=increase,crop=1600:720,fps=${RENDER_FPS},setsar=1,format=yuv420p,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[${label}]`;
}
function clipVideo(inputIndex:number,label:string,duration:number,start:number){
  return `[${inputIndex}:v]fps=${RENDER_FPS},scale=1600:720:force_original_aspect_ratio=increase,crop=1600:720,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,setsar=1,format=yuv420p[${label}]`;
}

export async function renderStudioLandscapeVideo(opts:{
  audioPath:string;
  srtPath?:string;
  outputPath:string;
  duration:number;
  headline:string;
  channelName?:string;
  mediaItems?:RenderMediaItem[];
  scenes?:VideoScene[];
}){
  await mkdir(dirname(opts.outputPath),{recursive:true});
  const duration=Math.max(.5,opts.duration);
  const headlineFile=opts.outputPath.replace(/\.mp4$/i,'-landscape-headline.txt');
  const brandFile=opts.outputPath.replace(/\.mp4$/i,'-landscape-brand.txt');
  await writeFile(headlineFile,wrapHeadline(opts.headline),'utf8');
  await writeFile(brandFile,(opts.channelName||'Content Studio').replace(/\s+/g,' ').trim().slice(0,80),'utf8');

  const media=(opts.mediaItems||[]).slice(0,10);
  const fallbackScenes:VideoScene[]=media.map((_,index)=>({
    imageIndex:index,
    startRatio:index/media.length,
    endRatio:(index+1)/media.length,
  }));
  const scenes=(opts.scenes?.length?opts.scenes:fallbackScenes)
    .filter(scene=>scene.imageIndex>=0&&scene.imageIndex<media.length&&scene.endRatio>scene.startRatio);

  const headline=`textfile='${escPath(headlineFile)}':reload=0`;
  const brand=`textfile='${escPath(brandFile)}':reload=0`;
  const subtitles=opts.srtPath
    ? `subtitles='${escPath(opts.srtPath)}':force_style='FontName=DejaVu Sans,FontSize=22,Alignment=2,MarginV=52,Outline=2,Shadow=0'`
    : 'null';
  const overlay=[
    'drawbox=x=0:y=0:w=1920:h=170:color=0x071522@0.98:t=fill',
    'drawbox=x=0:y=0:w=1920:h=8:color=0x22d3ee:t=fill',
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:${brand}:fontcolor=0x8de8dd:fontsize=30:x=86:y=40`,
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:${headline}:fontcolor=white:fontsize=42:line_spacing=8:x=86:y=86:fix_bounds=true`,
    'drawbox=x=110:y=200:w=1700:h=760:color=0x0b1d32@0.82:t=fill',
    subtitles,
  ].join(',');

  if(media.length&&scenes.length){
    const chains:string[]=[];
    for(const [i,scene] of scenes.entries()){
      const start=scene.startRatio*duration,end=scene.endRatio*duration,d=Math.max(.2,end-start),item=media[scene.imageIndex];
      chains.push(item.kind==='video'?clipVideo(scene.imageIndex+1,`ls${i}`,d,start):clipImage(scene.imageIndex+1,`ls${i}`,d,start));
    }
    chains.push(`[0:v]fps=${RENDER_FPS},setsar=1,format=yuv420p[bg0]`);
    let previous='bg0';
    for(const [i,scene] of scenes.entries()){
      const start=scene.startRatio*duration,end=scene.endRatio*duration,next=`scene${i}`;
      chains.push(`[${previous}][ls${i}]overlay=160:220:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})':eof_action=pass[${next}]`);
      previous=next;
    }
    chains.push(`[${previous}]${overlay}[v]`);
    const args=['-y','-f','lavfi','-i',`color=c=0x04111f:s=1920x1080:r=${RENDER_FPS}:d=${duration.toFixed(3)}`];
    for(const item of media){
      if(item.kind==='image')args.push('-loop','1','-i',item.path);
      else args.push('-stream_loop','-1','-i',item.path);
    }
    const audioIndex=media.length+1;
    args.push(
      '-i',opts.audioPath,
      '-filter_complex',chains.join(';'),
      '-map','[v]','-map',`${audioIndex}:a:0`,
      '-c:v','libx264','-preset',X264_PRESET,'-crf',X264_CRF,'-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','128k','-t',duration.toFixed(3),'-movflags','+faststart',opts.outputPath,
    );
    await runFfmpeg(args);
  }else{
    const filters=[
      'setsar=1',
      'drawbox=x=110:y=200:w=1700:h=760:color=0x0b1d32@0.94:t=fill',
      "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='MINH HỌA NGUYÊN BẢN':fontcolor=0x94a3b8:fontsize=44:x=(w-text_w)/2:y=565",
      overlay,
    ].join(',');
    await runFfmpeg([
      '-y','-f','lavfi','-i',`color=c=0x04111f:s=1920x1080:r=${RENDER_FPS}:d=${duration.toFixed(3)}`,
      '-i',opts.audioPath,
      '-vf',filters,'-map','0:v:0','-map','1:a:0',
      '-c:v','libx264','-preset',X264_PRESET,'-crf',X264_CRF,'-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','128k','-t',duration.toFixed(3),'-movflags','+faststart',opts.outputPath,
    ]);
  }
  return opts.outputPath;
}
