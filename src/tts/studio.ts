import { VOICE_CATALOG, isVoiceId, type VoiceId, type VoiceStyle } from './edge.js';

export type VoiceLanguage='vi'|'en'|'multilingual';
export type VoiceRegion='standard'|'north'|'south'|'central'|'international'|'personal';
export type VoiceGender='male'|'female';
export type VoiceCategory='viral'|'podcast'|'review'|'news'|'advertising'|'story'|'voiceover';
export interface StudioVoice{ id:VoiceId;name:string;provider:'edge'|'vieneu'|'personal';voiceId:VoiceId;language:VoiceLanguage;region:VoiceRegion;gender:VoiceGender;categories:VoiceCategory[];description:string;available:boolean;recommended?:boolean;tier:string; }
export function voiceStudioCatalog(personalConfigured=false):StudioVoice[]{
 return VOICE_CATALOG.map(v=>({id:v.id,name:v.name,provider:v.provider,voiceId:v.id,language:v.languageCode as VoiceLanguage,region:v.region as VoiceRegion,gender:v.genderCode as VoiceGender,categories:[...v.categories] as VoiceCategory[],description:v.description,available:v.provider!=='personal'||personalConfigured,recommended:v.recommended,tier:v.tier}));
}
export function voiceStudioStatus(personalConfigured=false){const open=VOICE_CATALOG.filter(v=>v.provider==='vieneu').length,cloud=VOICE_CATALOG.filter(v=>v.provider==='edge').length;return{enabled:true,version:'3.3',openSourceVoices:open,cloudFallbackVoices:cloud,personalClone:{supported:process.env.VIENEU_TTS_ENABLED==='true',configured:personalConfigured,provider:'vieneu-v3-onnx'},modes:['text','srt','dub'],maxDubSeconds:300,maxSrtCues:80};}
export interface SrtCue{index:number;time:string;startMs:number;endMs:number;durationMs:number;text:string;syllables:number;recommendedMin:number;recommendedMax:number;status:'ok'|'short'|'long'};
function stampMs(v:string){const m=v.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/);if(!m)throw new Error('Timestamp SRT không hợp lệ: '+v);return((+m[1]*3600+ +m[2]*60+ +m[3])*1000)+ +m[4]}
function rangeFor(ms:number){const s=ms/1000;if(s<2.5)return[5,8];if(s<4)return[8,13];if(s<7)return[13,18];if(s<12)return[18,25];return[25,36]}
function countSyllables(text:string){return text.replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean).length}
export function analyzeSrtTimeline(raw:string){
 const blocks=String(raw||'').replace(/\r/g,'').trim().split(/\n{2,}/).filter(Boolean);if(!blocks.length)throw new Error('SRT trống.');
 if(blocks.length>80)throw new Error('SRT vượt 80 cue cho một lần xử lý.');
 const cues:SrtCue[]=blocks.map((block,i)=>{const lines=block.split('\n'),idx=Number(lines[0]),time=lines[1]||'',parts=time.split('-->').map(x=>x.trim());
  if(!Number.isInteger(idx)||parts.length!==2)throw new Error(`Cue ${i+1} không đúng cấu trúc SRT.`);const startMs=stampMs(parts[0]),endMs=stampMs(parts[1]);
  if(endMs<=startMs)throw new Error(`Cue ${idx} có thời gian kết thúc không hợp lệ.`);const text=lines.slice(2).join(' ').replace(/\s+/g,' ').trim();if(!text)throw new Error(`Cue ${idx} không có nội dung.`);
  const durationMs=endMs-startMs,syllables=countSyllables(text),[recommendedMin,recommendedMax]=rangeFor(durationMs),status:SrtCue['status']=syllables>recommendedMax?'long':syllables<recommendedMin?'short':'ok';
  return{index:idx,time,startMs,endMs,durationMs,text,syllables,recommendedMin,recommendedMax,status};});
 const long=cues.filter(x=>x.status==='long'),short=cues.filter(x=>x.status==='short'),ok=cues.length-long.length-short.length,totalMs=Math.max(...cues.map(x=>x.endMs));
 return{cues,total:cues.length,durationSeconds:Number((totalMs/1000).toFixed(2)),summary:{ok,long:long.length,short:short.length,score:Math.round(ok/Math.max(1,cues.length)*100)},
  warnings:[...(long.length?[`${long.length} cue quá dài so với timeline; nên rút gọn trước TTS.`]:[]),...(short.length?[`${short.length} cue ngắn hơn vùng tối ưu; có thể thêm nhịp nghỉ thay vì nhồi chữ.`]:[])]};
}
export function voiceChoiceAllowed(id:string){return isVoiceId(id)}
export function localVoiceChoice(id:string){return isVoiceId(id)?id:undefined}
export type StudioVoiceStyle=VoiceStyle;
