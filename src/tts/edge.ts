import { EdgeTTS, createSRT } from 'edge-tts-universal';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const VOICE_CATALOG = [
  { id:'vi-male', name:'Nam Minh', language:'Tiếng Việt chuẩn', locale:'vi-VN', gender:'Nam', edgeVoice:'vi-VN-NamMinhNeural', tier:'native', recommended:true, description:'Nam Việt, rõ chữ; phù hợp bản tin.' },
  { id:'vi-female', name:'Hoài My', language:'Tiếng Việt chuẩn', locale:'vi-VN', gender:'Nữ', edgeVoice:'vi-VN-HoaiMyNeural', tier:'native', recommended:true, description:'Nữ Việt, tự nhiên; phù hợp bản tin và thuyết minh.' },
  { id:'multi-andrew', name:'Andrew', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nam', edgeVoice:'en-US-AndrewMultilingualNeural', tier:'multilingual', recommended:true, description:'Nam quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-brian', name:'Brian', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nam', edgeVoice:'en-US-BrianMultilingualNeural', tier:'multilingual', recommended:true, description:'Nam quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-ava', name:'Ava', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nữ', edgeVoice:'en-US-AvaMultilingualNeural', tier:'multilingual', recommended:true, description:'Nữ quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-emma', name:'Emma', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nữ', edgeVoice:'en-US-EmmaMultilingualNeural', tier:'multilingual', recommended:true, description:'Nữ quốc tế multilingual; hỗ trợ vi-VN.' },
] as const;
export type VoiceId=typeof VOICE_CATALOG[number]['id'];
export type VoiceStyle='news'|'breaking'|'story'|'podcast';
export const VOICE_STYLES={news:{name:'Bản tin chuyên nghiệp',rate:'+0%',pitch:'+0Hz'},breaking:{name:'Tin nóng',rate:'+10%',pitch:'+2Hz'},story:{name:'Kể chuyện',rate:'-10%',pitch:'-1Hz'},podcast:{name:'Podcast tự nhiên',rate:'-5%',pitch:'-1Hz'}} as const;
export function isVoiceId(value:string):value is VoiceId{return VOICE_CATALOG.some(v=>v.id===value)}
export function isVoiceStyle(value:string):value is VoiceStyle{return value in VOICE_STYLES}
export function getVoice(id:VoiceId){return VOICE_CATALOG.find(v=>v.id===id)!}
export const VIETNAMESE_VOICE_TEST='Xin chào quý vị. Đây là bản tin mới nhất từ Biển và Nỗi Nhớ. Thành phố Hồ Chí Minh hôm nay có nhiều thay đổi đáng chú ý.';

// Local Voice Director: improves pauses and sentence rhythm without rewriting facts.
export function directVietnameseText(text:string,style:VoiceStyle='news'){
 let x=text.replace(/\s+/g,' ').trim().replace(/\s*([,.;:!?])\s*/g,'$1 ');
 x=x.replace(/([.!?])\s+(?=[A-ZÀ-ỸĐ])/g,'$1  ');
 if(style==='breaking')x=x.replace(/([:;])/g,'$1 ');
 if(style==='story'||style==='podcast')x=x.replace(/;\s*/g,'. ').replace(/:\s*/g,':  ');
 return x.trim();
}
export async function generateSpeech(options:{text:string;audioPath:string;srtPath?:string;voice?:VoiceId;rate?:string;style?:VoiceStyle}){
 const {text,audioPath,srtPath,voice='vi-male',style='news'}=options;const selected=getVoice(voice),preset=VOICE_STYLES[style];
 const rate=options.rate&&options.rate!=='+0%'?options.rate:preset.rate;
 await mkdir(dirname(audioPath),{recursive:true});if(srtPath)await mkdir(dirname(srtPath),{recursive:true});
 const directed=directVietnameseText(text,style);const tts=new EdgeTTS(directed,selected.edgeVoice,{rate,pitch:preset.pitch,volume:'+0%'});const result=await tts.synthesize();
 const audio=Buffer.from(await result.audio.arrayBuffer());if(!audio.length)throw new Error('TTS returned empty audio');await writeFile(audioPath,audio);
 if(srtPath&&result.subtitle?.length)await writeFile(srtPath,createSRT(result.subtitle),'utf8');
 return {audioPath,srtPath,voice:selected.edgeVoice,locale:selected.locale,rate,tier:selected.tier,style};
}
export const generateVietnameseSpeech=generateSpeech;export type VietnameseVoice=VoiceId;
