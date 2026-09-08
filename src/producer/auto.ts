import { importArticleFromUrl } from '../import/url.js';
import { editNews, type ScriptLength } from '../ai/editor.js';
import { analyzeMediaStudio } from '../media/studio.js';
import { directScenes } from '../video/scenes.js';
import { matchImagesToScenes } from '../video/matching.js';
import { castVietnameseVoice } from '../tts/casting.js';
import { findForeignSources } from '../research/foreign.js';
export async function prepareAutoNews(input:{url:string;length:ScriptLength;format:'breaking'|'latest'|'standard';fallback?:{title:string;summary?:string;sourceName?:string;imageUrl?:string}}){
 let article;
 try{article=await importArticleFromUrl(input.url)}catch(error){const summary=input.fallback?.summary?.trim()||'';if(summary.length<120)throw error;article={title:input.fallback!.title,body:summary,sourceName:input.fallback?.sourceName,sourceUrl:input.url,imageUrl:input.fallback?.imageUrl,imageUrls:input.fallback?.imageUrl?[input.fallback.imageUrl]:[]}}
 const research=await findForeignSources(article.title,3);
 const corroboration=research.sources.length?'\n\nTHÔNG TIN ĐỐI CHIẾU QUỐC TẾ (chỉ dùng dữ kiện phù hợp, ghi rõ nguồn):\n'+research.sources.map(x=>`[${x.name}] ${x.title}. ${x.summary}`).join('\n'):'';
 const edited=await editNews({title:article.title,body:article.body+corroboration,sourceName:[article.sourceName,...research.sources.map(x=>x.name)].filter(Boolean).join(' • ').slice(0,120),length:input.length});
 const studio=await analyzeMediaStudio({sourceUrl:article.sourceUrl,imageUrl:article.imageUrl,imageUrls:[...(article.imageUrls||[]),...research.imageUrls].slice(0,19)});
 const chosen=studio.candidates.filter(x=>x.selected&&x.url).slice(0,10);
 const images=chosen.map(x=>({url:x.url!,label:[x.metadata.caption,...(x.metadata.keywords||[])].join(' '),score:x.score}));
 let scenes=directScenes(`${edited.headline}. ${edited.script}`,Math.max(1,images.length));
 if(images.length)scenes=matchImagesToScenes(scenes,images);
 const voice=castVietnameseVoice({title:edited.headline,text:edited.script,format:input.format});
 return{stage:'review' as const,article:{sourceUrl:article.sourceUrl,sourceName:article.sourceName},research:{sources:research.sources.map(x=>({name:x.name,url:x.url,title:x.title})),count:research.sources.length},edited,media:{images:chosen.map(x=>({url:x.url,score:x.score,width:x.width,height:x.height,metadata:x.metadata})),summary:studio.summary},scenes,voice,reviewRequired:true};
}
