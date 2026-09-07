import { importArticleFromUrl } from '../import/url.js';
import { editNews, type ScriptLength } from '../ai/editor.js';
import { analyzeMediaStudio } from '../media/studio.js';
import { directScenes } from '../video/scenes.js';
import { matchImagesToScenes } from '../video/matching.js';
import { castVietnameseVoice } from '../tts/casting.js';
export async function prepareAutoNews(input:{url:string;length:ScriptLength;format:'breaking'|'latest'|'standard'}){
 const article=await importArticleFromUrl(input.url);
 const edited=await editNews({title:article.title,body:article.body,sourceName:article.sourceName,length:input.length});
 const studio=await analyzeMediaStudio({sourceUrl:input.url,imageUrl:article.imageUrl,imageUrls:(article.imageUrls||[]).slice(0,9)});
 const chosen=studio.candidates.filter(x=>x.selected&&x.url).slice(0,10);
 const images=chosen.map(x=>({url:x.url!,label:[x.metadata.caption,...(x.metadata.keywords||[])].join(' '),score:x.score}));
 let scenes=directScenes(`${edited.headline}. ${edited.script}`,Math.max(1,images.length));
 if(images.length)scenes=matchImagesToScenes(scenes,images);
 const voice=castVietnameseVoice({title:edited.headline,text:edited.script,format:input.format});
 return{stage:'review' as const,article:{sourceUrl:input.url,sourceName:article.sourceName},edited,media:{images:chosen.map(x=>({url:x.url,score:x.score,width:x.width,height:x.height,metadata:x.metadata})),summary:studio.summary},scenes,voice,reviewRequired:true};
}
