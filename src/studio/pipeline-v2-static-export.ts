import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runFfmpeg } from '../video/ffmpeg.js';

function safeName(value:string){return value.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,120)||'artifact'}
function esc(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;')}
function wrap(text:string,max=34,maxLines=7){
  const words=text.replace(/\s+/g,' ').trim().split(' ').filter(Boolean),out:string[]=[];let line='';
  for(const word of words){const next=line?`${line} ${word}`:word;if(next.length<=max){line=next;continue}if(line)out.push(line);line=word;if(out.length>=maxLines-1)break}
  if(line&&out.length<maxLines)out.push(line);return out;
}
async function svgToPng(svgPath:string,pngPath:string){await runFfmpeg(['-y','-hide_banner','-loglevel','error','-i',svgPath,'-frames:v','1',pngPath]);return pngPath}
function textLines(lines:string[],x:number,y:number,step:number,className:string){return lines.map((line,index)=>`<text x="${x}" y="${y+index*step}" class="${className}">${esc(line)}</text>`).join('')}

export interface ComicSceneInput{index:number;beat:string;narration:string}
export interface StaticExportResult{outputPath:string;assets:string[];manifestPath?:string}

export async function exportComicPackage(input:{rootDir?:string;projectId:string;batchId:string;seriesName?:string;topic:string;scenes:ComicSceneInput[]}):Promise<StaticExportResult>{
  const dir=join(input.rootDir||'output','content-studio',safeName(input.projectId),safeName(input.batchId),'comic');await mkdir(dir,{recursive:true});const assets:string[]=[];
  for(const scene of input.scenes.slice(0,12)){
    const svgPath=join(dir,`panel-${String(scene.index+1).padStart(2,'0')}.svg`),pngPath=join(dir,`panel-${String(scene.index+1).padStart(2,'0')}.png`);
    const title=wrap(input.topic,28,2),body=wrap(scene.narration,32,7),series=esc((input.seriesName||'Content Studio').slice(0,80));
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071522"/><stop offset="1" stop-color="#123d50"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#bg)"/><circle cx="930" cy="140" r="210" fill="#22d3ee" opacity=".10"/><circle cx="120" cy="980" r="240" fill="#14b8a6" opacity=".10"/><rect x="54" y="54" width="972" height="972" rx="34" fill="none" stroke="#2dd4bf" stroke-width="3" opacity=".45"/><text x="80" y="110" class="series">${series}</text><text x="80" y="165" class="panel">PANEL ${scene.index+1} • ${esc(scene.beat.toUpperCase())}</text>${textLines(title,80,240,46,'title')}<rect x="80" y="340" width="920" height="2" fill="#2dd4bf" opacity=".65"/>${textLines(body,80,430,66,'body')}<text x="80" y="990" class="foot">MINH HỌA NGUYÊN BẢN • GENERATED • RIGHTS-SAFE</text><style>.series{fill:#8de8dd;font:700 28px 'DejaVu Sans'}.panel{fill:#94a3b8;font:700 22px 'DejaVu Sans'}.title{fill:white;font:700 36px 'DejaVu Sans'}.body{fill:white;font:600 42px 'DejaVu Sans'}.foot{fill:#9fc0d1;font:500 19px 'DejaVu Sans'}</style></svg>`;
    await writeFile(svgPath,svg,'utf8');await svgToPng(svgPath,pngPath);assets.push(pngPath);
  }
  const manifestPath=join(dir,'comic-manifest.json');await writeFile(manifestPath,JSON.stringify({schema:'content-studio.comic.v1',projectId:input.projectId,batchId:input.batchId,seriesName:input.seriesName,topic:input.topic,rights:'generated',generator:'local-deterministic-comic',panels:assets.map((path,index)=>({index,path,width:1080,height:1080})),createdAt:new Date().toISOString()},null,2),'utf8');
  return{outputPath:manifestPath,assets,manifestPath};
}

export async function exportThumbnail(input:{rootDir?:string;projectId:string;batchId:string;seriesName?:string;topic:string;episode?:number}):Promise<StaticExportResult>{
  const dir=join(input.rootDir||'output','content-studio',safeName(input.projectId),safeName(input.batchId),'thumbnail');await mkdir(dir,{recursive:true});
  const svgPath=join(dir,'cover.svg'),pngPath=join(dir,'cover.png'),topic=wrap(input.topic,34,3),series=esc((input.seriesName||'Content Studio').slice(0,80)),episode=input.episode?`TẬP ${input.episode}`:'CONTENT STUDIO';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#04111f"/><stop offset=".55" stop-color="#0b2d3b"/><stop offset="1" stop-color="#123d50"/></linearGradient></defs><rect width="1280" height="720" fill="url(#bg)"/><circle cx="1110" cy="90" r="270" fill="#22d3ee" opacity=".12"/><circle cx="1080" cy="650" r="310" fill="#14b8a6" opacity=".12"/><rect x="70" y="70" width="1140" height="580" rx="38" fill="#061a2b" opacity=".50" stroke="#2dd4bf" stroke-width="3"/><rect x="100" y="105" width="180" height="52" rx="26" fill="#0f766e"/><text x="133" y="141" class="episode">${esc(episode)}</text><text x="100" y="215" class="series">${series}</text>${textLines(topic,100,315,78,'title')}<rect x="100" y="595" width="130" height="8" rx="4" fill="#2dd4bf"/><text x="255" y="612" class="foot">COVER NGUYÊN BẢN • RIGHTS-SAFE</text><style>.episode{fill:white;font:700 22px 'DejaVu Sans'}.series{fill:#8de8dd;font:700 32px 'DejaVu Sans'}.title{fill:white;font:700 58px 'DejaVu Sans'}.foot{fill:#9fc0d1;font:500 21px 'DejaVu Sans'}</style></svg>`;
  await writeFile(svgPath,svg,'utf8');await svgToPng(svgPath,pngPath);return{outputPath:pngPath,assets:[pngPath]};
}