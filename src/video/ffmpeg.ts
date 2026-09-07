import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function run(command:string,args:string[]){return new Promise<void>((resolve,reject)=>{const c=spawn(command,args,{stdio:'inherit'});c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(new Error(`${command} exited with ${code}`)))});}
function esc(s:string){return s.replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/%/g,'\\%');}
function wrapHeadline(input:string,max=28,maxLines=4){
 const words=input.trim().split(/\s+/);const lines:string[]=[];let line='';
 for(const word of words){const next=line?`${line} ${word}`:word;if(next.length<=max){line=next;continue;}if(line)lines.push(line);line=word;if(lines.length>=maxLines-1)break;}
 if(line&&lines.length<maxLines)lines.push(line);
 const used=lines.join(' ').split(/\s+/).length;if(used<words.length&&lines.length){lines[lines.length-1]=lines[lines.length-1].replace(/[.,;:!?]*$/,'')+'…';}
 return esc(lines.join('\\n'));
}

export type VideoTemplate='classic'|'breaking'|'clean';

function templateOverlay(template:VideoTemplate,label:string,headline:string,source:string,srtPath?:string){
 const shared=[
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='BIỂN & NỖI NHỚ':fontcolor=white:fontsize=34:x=320:y=76`,
  source?`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Nguồn: ${source}':fontcolor=0xcbd5e1:fontsize=27:x=65:y=1425`:'null',
  srtPath?`subtitles=${srtPath}:force_style='FontName=DejaVu Sans,FontSize=18,Alignment=2,MarginV=170,Outline=2,Shadow=1'`:'null'
 ];
 if(template==='clean')return [
  `drawbox=x=0:y=0:w=1080:h=170:color=0x0f172a:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='TIN MỚI':fontcolor=0x38bdf8:fontsize=38:x=58:y=76`,
  ...shared,
  `drawbox=x=55:y=230:w=970:h=360:color=0x111827@0.88:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${headline}':fontcolor=white:fontsize=46:line_spacing=14:x=82:y=285:fix_bounds=true`
 ].join(',');
 if(template==='breaking')return [
  `drawbox=x=0:y=0:w=1080:h=190:color=0x7f1d1d:t=fill`,
  `drawbox=x=45:y=50:w=250:h=84:color=0xdc2626:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='TIN NÓNG':fontcolor=white:fontsize=42:x=72:y=70`,
  ...shared,
  `drawbox=x=45:y=230:w=990:h=390:color=0x111827@0.94:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${headline}':fontcolor=white:fontsize=50:line_spacing=14:x=78:y=285:fix_bounds=true`
 ].join(',');
 return [
  `drawbox=x=0:y=0:w=1080:h=170:color=0x111827:t=fill`,
  `drawbox=x=50:y=58:w=235:h=72:color=0xb91c1c:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${label}':fontcolor=white:fontsize=40:x=75:y=72`,
  ...shared,
  `drawbox=x=55:y=250:w=970:h=330:color=0x0f172a@0.94:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${headline}':fontcolor=white:fontsize=48:line_spacing=12:x=85:y=300:fix_bounds=true`
 ].join(',');
}

export async function renderNewsVideo(opts:{audioPath:string;srtPath?:string;outputPath:string;duration?:number;headline?:string;source?:string;breaking?:boolean;imagePath?:string;template?:VideoTemplate}){
 await mkdir(dirname(opts.outputPath),{recursive:true});
 const duration=opts.duration??60,label=opts.breaking?'TIN NÓNG':'TIN MỚI',headline=wrapHeadline(opts.headline??'BIỂN & NỖI NHỚ'),source=esc(opts.source??''),template=opts.template??(opts.breaking?'breaking':'classic');
 const overlay=templateOverlay(template,label,headline,source,opts.srtPath);
 const mediaY=template==='breaking'?650:630,mediaH=template==='breaking'?740:760;
 if(opts.imagePath){
  const filter=`[1:v]scale=970:${mediaH}:force_original_aspect_ratio=increase,crop=970:${mediaH}[img];[0:v][img]overlay=55:${mediaY}[base];[base]${overlay}[v]`;
  await run('ffmpeg',['-y','-f','lavfi','-i',`color=c=0x07111f:s=1080x1920:r=30:d=${duration}`,'-loop','1','-i',opts.imagePath,'-i',opts.audioPath,'-filter_complex',filter,'-map','[v]','-map','2:a:0','-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',opts.outputPath]);
 }else{
  const filters=`drawbox=x=55:y=${mediaY}:w=970:h=${mediaH}:color=0x172033:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='ẢNH / VIDEO MINH HỌA':fontcolor=0x94a3b8:fontsize=38:x=(w-text_w)/2:y=990,${overlay}`;
  await run('ffmpeg',['-y','-f','lavfi','-i',`color=c=0x07111f:s=1080x1920:r=30:d=${duration}`,'-i',opts.audioPath,'-vf',filters,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',opts.outputPath]);
 }
 return opts.outputPath;
}
