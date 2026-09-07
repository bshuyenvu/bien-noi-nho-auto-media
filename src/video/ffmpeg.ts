import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function run(command:string,args:string[]){return new Promise<void>((resolve,reject)=>{let stderr='';const c=spawn(command,args,{stdio:['ignore','inherit','pipe']});c.stderr?.on('data',d=>{const s=String(d);stderr=(stderr+s).slice(-6000);process.stderr.write(s)});c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(new Error(`${command} exited with ${code}${stderr?`: ${stderr.trim().slice(-1800)}`:''}`)))});}
function escPath(s:string){return s.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");}
function wrapHeadline(input:string,max=28,maxLines=4){const words=input.trim().split(/\s+/);const lines:string[]=[];let line='';let index=0;for(;index<words.length;index++){const word=words[index],next=line?`${line} ${word}`:word;if(next.length<=max){line=next;continue;}if(line)lines.push(line);line=word;if(lines.length>=maxLines-1){index++;break;}}if(line&&lines.length<maxLines)lines.push(line);if(index<words.length&&lines.length)lines[lines.length-1]=lines[lines.length-1].replace(/[.,;:!?]*$/,'')+'…';return lines.join('\n');}

export type VideoTemplate='classic'|'breaking'|'clean';
export type MotionLevel='off'|'light'|'medium'|'strong';
export type TickerMode='off'|'headline'|'custom';

function templateOverlay(template:VideoTemplate,label:string,headlineFile:string,sourceFile?:string,srtPath?:string,tickerFile?:string,tickerSpeed=85){
 const headlineText=`textfile='${escPath(headlineFile)}':reload=0`;
 const subtitle=srtPath?`subtitles='${escPath(srtPath)}':force_style='FontName=DejaVu Sans,FontSize=12,Alignment=2,MarginV=120,Outline=2,Shadow=1'`:'null';
 const source=sourceFile?`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile='${escPath(sourceFile)}':reload=0:fontcolor=white:fontsize=24:x=78:y=1431`:'null';
 const ticker=tickerFile?[
  `drawbox=x=55:y=1560:w=970:h=48:color=0x061426@0.96:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile='${escPath(tickerFile)}':reload=0:fontcolor=white:fontsize=18:x='180+w-mod(t*${tickerSpeed},w+text_w)':y=1574`,
  `drawbox=x=55:y=1560:w=125:h=48:color=0x075bc7:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='TIN':fontcolor=white:fontsize=18:x=92:y=1574`
 ].join(','):'null';
 if(template==='clean')return [`drawbox=x=0:y=0:w=1080:h=178:color=0x071a33:t=fill`,`drawbox=x=0:y=0:w=280:h=178:color=0x075bc7:t=fill`,`drawbox=x=0:y=174:w=1080:h=4:color=0x22d3ee:t=fill`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='TIN MỚI':fontcolor=white:fontsize=42:x=58:y=68`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='BIỂN & NỖI NHỚ':fontcolor=white:fontsize=34:x=335:y=72`,`drawbox=x=38:y=225:w=1004:h=360:color=0x0b1628@0.93:t=fill`,`drawbox=x=38:y=584:w=1004:h=3:color=0x1da1f2:t=fill`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:${headlineText}:fontcolor=white:fontsize=46:line_spacing=14:x=68:y=278:fix_bounds=true`,`drawbox=x=55:y=1405:w=970:h=78:color=0x061426@0.94:t=fill`,`drawbox=x=55:y=1405:w=170:h=78:color=0xc81e1e:t=fill`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='NGUỒN':fontcolor=white:fontsize=25:x=82:y=1430`,sourceFile?`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile='${escPath(sourceFile)}':reload=0:fontcolor=white:fontsize=22:x=245:y=1433`:'null',ticker,subtitle].join(',');
 if(template==='breaking')return [`drawbox=x=0:y=0:w=1080:h=190:color=0x7f1d1d:t=fill`,`drawbox=x=45:y=50:w=250:h=84:color=0xdc2626:t=fill`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='TIN NÓNG':fontcolor=white:fontsize=42:x=72:y=70`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='BIỂN & NỖI NHỚ':fontcolor=white:fontsize=34:x=320:y=76`,`drawbox=x=45:y=230:w=990:h=390:color=0x111827@0.94:t=fill`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:${headlineText}:fontcolor=white:fontsize=50:line_spacing=14:x=78:y=285:fix_bounds=true`,source,ticker,subtitle].join(',');
 return [`drawbox=x=0:y=0:w=1080:h=170:color=0x111827:t=fill`,`drawbox=x=50:y=58:w=235:h=72:color=0xb91c1c:t=fill`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${label}':fontcolor=white:fontsize=40:x=75:y=72`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='BIỂN & NỖI NHỚ':fontcolor=white:fontsize=34:x=320:y=76`,`drawbox=x=55:y=250:w=970:h=330:color=0x0f172a@0.94:t=fill`,`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:${headlineText}:fontcolor=white:fontsize=48:line_spacing=12:x=85:y=300:fix_bounds=true`,source,ticker,subtitle].join(',');
}

function imageClip(inputIndex:number,outLabel:string,mediaH:number,level:MotionLevel,clipDuration:number){
 const normalize=`fps=30,setsar=1,setdar=970/${mediaH},format=yuv420p,trim=duration=${clipDuration.toFixed(3)},setpts=PTS-STARTPTS`;
 if(level==='off')return `[${inputIndex}:v]scale=970:${mediaH}:force_original_aspect_ratio=increase,crop=970:${mediaH},${normalize}[${outLabel}]`;
 const settings={light:{step:'0.00030',cap:'1.04'},medium:{step:'0.00055',cap:'1.075'},strong:{step:'0.00090',cap:'1.12'}}[level];
 return `[${inputIndex}:v]scale=1220:${mediaH+190}:force_original_aspect_ratio=increase,crop=1220:${mediaH+190},zoompan=z='min(max(zoom,pzoom)+${settings.step},${settings.cap})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=970x${mediaH}:fps=30,setsar=1,setdar=970/${mediaH},format=yuv420p,trim=duration=${clipDuration.toFixed(3)},setpts=PTS-STARTPTS[${outLabel}]`;
}

export async function renderNewsVideo(opts:{audioPath:string;srtPath?:string;outputPath:string;duration?:number;headline?:string;source?:string;breaking?:boolean;imagePath?:string;imagePaths?:string[];template?:VideoTemplate;motion?:MotionLevel;tickerMode?:TickerMode;tickerText?:string;tickerSpeed?:number}){
 await mkdir(dirname(opts.outputPath),{recursive:true});
 const duration=opts.duration??180,label=opts.breaking?'TIN NÓNG':'TIN MỚI',template=opts.template??(opts.breaking?'breaking':'classic'),motionLevel=opts.motion??'light';
 const headlineFile=opts.outputPath.replace(/\.mp4$/i,'-headline.txt');await writeFile(headlineFile,wrapHeadline(opts.headline??'BIỂN & NỖI NHỚ'),'utf8');
 let sourceFile:string|undefined;if(opts.source?.trim()){sourceFile=opts.outputPath.replace(/\.mp4$/i,'-source.txt');await writeFile(sourceFile,opts.source.trim(),'utf8');}
 let tickerFile:string|undefined;const tickerMode=opts.tickerMode??'headline';const tickerText=tickerMode==='custom'?opts.tickerText?.trim():tickerMode==='headline'?opts.headline?.trim():'';if(tickerText){tickerFile=opts.outputPath.replace(/\.mp4$/i,'-ticker.txt');await writeFile(tickerFile,tickerText.replace(/\s+/g,' ').trim(),'utf8');}
 const tickerSpeed=Math.max(35,Math.min(180,opts.tickerSpeed??85));
 const overlay=templateOverlay(template,label,headlineFile,sourceFile,opts.srtPath,tickerFile,tickerSpeed);const mediaY=template==='breaking'?650:630,mediaH=template==='breaking'?740:760;
 const images=(opts.imagePaths?.length?opts.imagePaths:(opts.imagePath?[opts.imagePath]:[])).slice(0,10);
 if(images.length){
  const clipDuration=duration/images.length;
  const clips=images.map((_,i)=>imageClip(i+1,`im${i}`,mediaH,motionLevel,clipDuration));
  const chain:string[]=[...clips,`[0:v]fps=30,setsar=1,format=yuv420p[bg0]`];
  let previous='bg0';
  images.forEach((_,i)=>{const start=i*clipDuration,end=(i+1)*clipDuration;const next=`scene${i}`;chain.push(`[${previous}][im${i}]overlay=55:${mediaY}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})':eof_action=pass[${next}]`);previous=next;});
  chain.push(`[${previous}]${overlay}[v]`);
  const filter=chain.join(';');
  const args=['-y','-f','lavfi','-i',`color=c=0x04111f:s=1080x1920:r=30:d=${duration}`];
  for(const image of images)args.push('-loop','1','-i',image);
  const audioIndex=images.length+1;args.push('-i',opts.audioPath,'-filter_complex',filter,'-map','[v]','-map',`${audioIndex}:a:0`,'-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',opts.outputPath);
  await run('ffmpeg',args);
 }else{
  const filters=`setsar=1,drawbox=x=55:y=${mediaY}:w=970:h=${mediaH}:color=0x172033:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='ẢNH / VIDEO MINH HỌA':fontcolor=0x94a3b8:fontsize=38:x=(w-text_w)/2:y=990,${overlay}`;
  await run('ffmpeg',['-y','-f','lavfi','-i',`color=c=0x04111f:s=1080x1920:r=30:d=${duration}`,'-i',opts.audioPath,'-vf',filters,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',opts.outputPath]);
 }
 return opts.outputPath;
}
