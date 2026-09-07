import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function run(command:string,args:string[]){return new Promise<void>((resolve,reject)=>{const c=spawn(command,args,{stdio:'inherit'});c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(new Error(`${command} exited with ${code}`)))});}
function esc(s:string){return s.replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/%/g,'\\%');}

export async function renderNewsVideo(opts:{audioPath:string;srtPath?:string;outputPath:string;duration?:number;headline?:string;source?:string;breaking?:boolean}){
 await mkdir(dirname(opts.outputPath),{recursive:true});
 const duration=opts.duration??60,label=opts.breaking?'TIN NÓNG':'TIN MỚI',headline=esc(opts.headline??'BIỂN & NỖI NHỚ'),source=esc(opts.source??'');
 const filters=[
  `drawbox=x=0:y=0:w=1080:h=170:color=0x111827:t=fill`,
  `drawbox=x=50:y=58:w=235:h=72:color=0xb91c1c:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${label}':fontcolor=white:fontsize=40:x=75:y=72`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='BIỂN & NỖI NHỚ':fontcolor=white:fontsize=34:x=320:y=76`,
  `drawbox=x=55:y=250:w=970:h=330:color=0x0f172a@0.94:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${headline}':fontcolor=white:fontsize=48:x=85:y=305:box=0:fix_bounds=true`,
  `drawbox=x=55:y=630:w=970:h=760:color=0x172033:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='ẢNH / VIDEO MINH HỌA':fontcolor=0x94a3b8:fontsize=38:x=(w-text_w)/2:y=990`,
  source?`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Nguồn: ${source}':fontcolor=0xcbd5e1:fontsize=27:x=65:y=1425`:'null',
  opts.srtPath?`subtitles=${opts.srtPath}:force_style='FontName=DejaVu Sans,FontSize=18,Alignment=2,MarginV=170,Outline=2,Shadow=1'`:'null'
 ].join(',');
 await run('ffmpeg',['-y','-f','lavfi','-i',`color=c=0x07111f:s=1080x1920:r=30:d=${duration}`,'-i',opts.audioPath,'-vf',filters,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',opts.outputPath]);
 return opts.outputPath;
}
