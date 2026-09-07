export interface ScenePlan{index:number;text:string;weight:number;startRatio:number;endRatio:number;imageIndex:number}
function splitSentences(text:string){return text.replace(/\s+/g,' ').trim().split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean)}
export function directScenes(text:string,imageCount:number,maxScenes=10):ScenePlan[]{
 const sentences=splitSentences(text);if(!sentences.length||imageCount<1)return[];
 const target=Math.max(1,Math.min(maxScenes,imageCount,sentences.length));const totalChars=sentences.reduce((n,s)=>n+s.length,0);const ideal=Math.max(1,totalChars/target);const chunks:string[]=[];let current='';
 for(const sentence of sentences){const next=current?`${current} ${sentence}`:sentence;if(current&&next.length>ideal*1.25&&chunks.length<target-1){chunks.push(current);current=sentence}else current=next}if(current)chunks.push(current);
 while(chunks.length>target){const tail=chunks.pop()!;chunks[chunks.length-1]+=' '+tail}
 const weights=chunks.map(x=>Math.max(1,x.length));const sum=weights.reduce((a,b)=>a+b,0);let cursor=0;
 return chunks.map((text,index)=>{const weight=weights[index]/sum,startRatio=cursor;cursor+=weight;return{index,text,weight:Number(weight.toFixed(4)),startRatio:Number(startRatio.toFixed(4)),endRatio:index===chunks.length-1?1:Number(cursor.toFixed(4)),imageIndex:index%imageCount}})
}
