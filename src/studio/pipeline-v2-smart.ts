export type SmartSceneIntent='hook'|'story'|'compare'|'stat'|'quote'|'list'|'process'|'evidence'|'takeaway'|'cta';
export type SmartSceneRenderer='ffmpeg'|'hyperframes';
export type SmartSceneLayout='cinematic'|'split-comparison'|'stat-callout'|'quote-card'|'feature-list'|'flow'|'evidence-card'|'title-card';

export interface SmartScenePlan{
  intent:SmartSceneIntent;
  renderer:SmartSceneRenderer;
  layout:SmartSceneLayout;
  estimatedDurationSec:number;
  subtitleChunks:string[];
  reason:string;
}

function clean(v:string){return String(v||'').replace(/\s+/g,' ').trim()}
function words(v:string){return clean(v).split(/\s+/).filter(Boolean)}
function subtitleChunks(text:string,maxWords=6){
  const tokens=words(text),out:string[]=[];let buf:string[]=[];
  for(const token of tokens){
    buf.push(token);
    const punctuation=/[,:;.!?…]$/.test(token);
    if(buf.length>=maxWords|| (punctuation&&buf.length>=3)){out.push(buf.join(' '));buf=[]}
  }
  if(buf.length)out.push(buf.join(' '));
  return out;
}
function estimateDuration(text:string){
  const count=words(text).length;
  return Math.max(1.8,Math.min(18,Number((count/2.65+.45).toFixed(2))));
}
function hasComparison(text:string,topic:string){
  return /\b(?:vs\.?|versus|so sánh|khác nhau|khác biệt|một bên|bên còn lại)\b/i.test(text+' '+topic);
}
function hasStat(text:string){
  return /\b\d+(?:[.,]\d+)?\s*(?:%|mg|g|kg|ml|l|mmhg|mmol|cm|mm|x|lần|triệu|tỷ)?\b/i.test(text);
}
function hasList(text:string){
  return /(?:^|\s)(?:1[.)]|2[.)]|3[.)]|thứ nhất|thứ hai|thứ ba|ba điều|\d+ điều)/i.test(text);
}
function hasProcess(text:string){
  return /\bquy trình\b/i.test(text)
    || /\bbước\s*(?:\d+|một|hai|ba|đầu tiên|tiếp theo|cuối cùng)\b/i.test(text)
    || /\b(?:đầu tiên|tiếp theo|sau đó|cuối cùng)\b/i.test(text)
    || text.includes('→');
}
function hasQuote(text:string){
  return /[“”"]/.test(text)&&text.length<260;
}

export function smartScenePlan(input:{
  beat:string;
  narration:string;
  topic:string;
  templateId:string;
  evidenceRequired?:boolean;
}):SmartScenePlan{
  const text=clean(input.narration),beat=input.beat;
  let intent:SmartSceneIntent='story',renderer:SmartSceneRenderer='ffmpeg',layout:SmartSceneLayout='cinematic',reason='Cảnh kể chuyện ưu tiên visual/media + FFmpeg.';
  if(beat==='hook'){intent='hook';layout='title-card';renderer=input.templateId==='topic-explainer'?'hyperframes':'ffmpeg';reason='Hook ngắn phù hợp title motion; fallback FFmpeg luôn sẵn sàng.'}
  if(hasComparison(text,input.topic)||input.templateId==='knowledge-compare'){intent='compare';renderer='hyperframes';layout='split-comparison';reason='Nội dung so sánh phù hợp split comparison motion graphics.'}
  else if(hasStat(text)){intent='stat';renderer='hyperframes';layout='stat-callout';reason='Có số liệu nổi bật; motion card giúp đọc nhanh trên mobile.'}
  else if(hasList(text)){intent='list';renderer='hyperframes';layout='feature-list';reason='Danh sách ngắn phù hợp feature-list motion graphics.'}
  else if(hasProcess(text)){intent='process';renderer='hyperframes';layout='flow';reason='Quy trình tuần tự phù hợp flow animation.'}
  else if(hasQuote(text)){intent='quote';renderer='hyperframes';layout='quote-card';reason='Trích dẫn ngắn phù hợp quote-card.'}
  if(input.evidenceRequired){intent='evidence';layout='evidence-card';renderer='hyperframes';reason='Claim cần bằng chứng; dùng evidence card nguyên bản, không tự chèn nội dung nguồn có bản quyền.'}
  if(beat==='takeaway'){intent='takeaway';layout='title-card';renderer='hyperframes';reason='Takeaway cần chữ lớn, ngắn, dễ ghi nhớ.'}
  if(beat==='cta'){intent='cta';layout='title-card';renderer='hyperframes';reason='CTA dùng motion title card, không cần media ngoài.'}
  return{
    intent,renderer,layout,
    estimatedDurationSec:estimateDuration(text),
    subtitleChunks:subtitleChunks(text),
    reason,
  };
}

export function rendererSummary(plans:SmartScenePlan[]){
  const hyperframes=plans.filter(x=>x.renderer==='hyperframes').length;
  const ffmpeg=plans.length-hyperframes;
  return{hyperframes,ffmpeg,total:plans.length,hybrid:hyperframes>0&&ffmpeg>0};
}
