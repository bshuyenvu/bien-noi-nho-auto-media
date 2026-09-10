import { writeFile } from 'node:fs/promises';

function esc(v:string){return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function lines(text:string,max=34,maxLines=4){
 const words=text.replace(/\s+/g,' ').trim().split(' ').filter(Boolean),out:string[]=[];let line='';
 for(const w of words){const next=line?`${line} ${w}`:w;if(next.length<=max){line=next;continue}if(line)out.push(line);line=w;if(out.length>=maxLines-1)break}
 if(line&&out.length<maxLines)out.push(line);return out;
}
export async function createSceneVisualCard(base:string,index:number,text:string,headline:string){
 const path=`${base}-scene-card-${index+1}.svg`,title=lines(text||headline,32,4),topic=lines(headline,38,2);
 const titleSvg=title.map((x,i)=>`<text x="66" y="${350+i*66}" class="scene">${esc(x)}</text>`).join('');
 const topicSvg=topic.map((x,i)=>`<text x="66" y="${125+i*43}" class="topic">${esc(x)}</text>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="970" height="760"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b1d32"/><stop offset="1" stop-color="#123d50"/></linearGradient></defs><rect width="970" height="760" rx="28" fill="url(#g)"/><circle cx="820" cy="130" r="150" fill="#14b8a6" opacity=".18"/><circle cx="730" cy="650" r="210" fill="#38bdf8" opacity=".10"/><rect x="55" y="62" width="145" height="46" rx="23" fill="#0f766e"/><text x="83" y="94" fill="white" font-family="DejaVu Sans" font-size="22" font-weight="700">SCENE ${index+1}</text><style>.topic{fill:#8de8dd;font:700 28px 'DejaVu Sans'}.scene{fill:white;font:700 43px 'DejaVu Sans'}</style>${topicSvg}<rect x="66" y="276" width="92" height="7" rx="4" fill="#2dd4bf"/>${titleSvg}<text x="66" y="700" fill="#9fc0d1" font-family="DejaVu Sans" font-size="20">MINH HỌA NGUYÊN BẢN • RIGHTS-SAFE</text></svg>`;
 await writeFile(path,svg,'utf8');return path;
}
