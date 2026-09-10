export type ContentQualityStatus='pass'|'review'|'block';
export interface ContentQualityResult{status:ContentQualityStatus;score:number;repeatedRun:number;sentenceCount:number;issues:string[]}
const clean=(v:string)=>String(v||'').replace(/\s+/g,' ').trim();
const norm=(v:string)=>clean(v).toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
export function auditContentQuality(script:string):ContentQualityResult{
 const text=clean(script),words=norm(text).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean),issues:string[]=[];
 let run=1,maxRun=words.length?1:0;for(let i=1;i<words.length;i++){run=words[i]===words[i-1]?run+1:1;maxRun=Math.max(maxRun,run)}
 const sentences=text.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>8);
 if(maxRun>=3)issues.push(`Phát hiện từ lặp liên tiếp ${maxRun} lần.`);
 if(text.length<80||sentences.length<2)issues.push('Kịch bản quá ngắn hoặc chưa đủ câu hoàn chỉnh.');
 if(/\b(?:và|nhưng|vì|do|khi|nếu|theo|với|của)\s*$/i.test(text))issues.push('Kịch bản kết thúc giữa ý.');
 const score=Math.max(0,100-(maxRun>=3?65:0)-(text.length<80||sentences.length<2?30:0)-(issues.some(x=>x.includes('giữa ý'))?25:0));
 const status:ContentQualityStatus=maxRun>=3?'block':score<70?'block':score<88?'review':'pass';return{status,score,repeatedRun:maxRun,sentenceCount:sentences.length,issues};
}
