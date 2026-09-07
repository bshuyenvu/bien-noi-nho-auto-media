import { rm } from 'node:fs/promises';
import { downloadRemoteImage } from './download.js';
import { selectBestMedia, type MediaCandidate } from './select.js';
import { understandImage, type VisionResult } from './vision.js';
import { importArticleFromUrl } from '../import/url.js';
export interface StudioCandidate extends MediaCandidate{id:string;selected:boolean;source:'manual'|'article';metadata:VisionResult}
export async function analyzeMediaStudio(input:{sourceUrl?:string;imageUrl?:string;imageUrls?:string[]}){
 let discovered:string[]=[];
 if(input.sourceUrl){try{discovered=(await importArticleFromUrl(input.sourceUrl)).imageUrls||[]}catch(e){console.warn('Studio article discovery skipped:',e)}}
 const manual=[input.imageUrl,...(input.imageUrls||[])].filter((x):x is string=>Boolean(x));
 const urls=[...manual,...discovered].filter((x,i,a)=>a.indexOf(x)===i).slice(0,20);
 const downloaded:{path:string;url:string;manual:boolean}[]=[];const errors:{url:string;reason:string}[]=[];const token=`studio-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
 for(let i=0;i<urls.length;i++){try{const path=await downloadRemoteImage(urls[i],`output/${token}-${i+1}`);downloaded.push({path,url:urls[i],manual:manual.includes(urls[i])})}catch(e){errors.push({url:urls[i],reason:e instanceof Error?e.message:String(e)})}}
 const result=await selectBestMedia(downloaded,10);const selected=new Set(result.selected.map(x=>x.path));
 const ordered=result.all.sort((a,b)=>b.score-a.score);const candidates:StudioCandidate[]=[];
 for(let i=0;i<ordered.length;i++){const x=ordered[i],metadata=await understandImage({url:x.url||'',width:x.width,height:x.height});candidates.push({...x,id:`media-${i+1}`,selected:selected.has(x.path),source:x.manual?'manual':'article',metadata})}
 await Promise.allSettled(downloaded.map(x=>rm(x.path,{force:true})));
 const remoteVision=candidates.filter(x=>x.metadata.provider==='remote').length;
 return{candidates,errors,summary:{found:urls.length,downloaded:downloaded.length,accepted:result.selected.length,rejected:result.rejected.length,metadata:true,vision:true,remoteVision,localFallback:candidates.length-remoteVision}};
}
