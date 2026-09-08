import { EdgeTTS, createSRT } from 'edge-tts-universal';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generateVieNeuSpeech } from './vieneu.js';

export const VOICE_CATALOG = [
  { id:'vi-male', name:'Nam Minh', language:'Tiếng Việt chuẩn', locale:'vi-VN', gender:'Nam', edgeVoice:'vi-VN-NamMinhNeural', tier:'native', recommended:true, description:'Nam Việt, rõ chữ; phù hợp bản tin.' },
  { id:'vi-female', name:'Hoài My', language:'Tiếng Việt chuẩn', locale:'vi-VN', gender:'Nữ', edgeVoice:'vi-VN-HoaiMyNeural', tier:'native', recommended:true, description:'Nữ Việt, tự nhiên; phù hợp bản tin và thuyết minh.' },
  { id:'multi-andrew', name:'Andrew', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nam', edgeVoice:'en-US-AndrewMultilingualNeural', tier:'multilingual', recommended:true, description:'Nam quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-brian', name:'Brian', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nam', edgeVoice:'en-US-BrianMultilingualNeural', tier:'multilingual', recommended:true, description:'Nam quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-ava', name:'Ava', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nữ', edgeVoice:'en-US-AvaMultilingualNeural', tier:'multilingual', recommended:true, description:'Nữ quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-emma', name:'Emma', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nữ', edgeVoice:'en-US-EmmaMultilingualNeural', tier:'multilingual', recommended:true, description:'Nữ quốc tế multilingual; hỗ trợ vi-VN.' },
] as const;
export type VoiceId=typeof VOICE_CATALOG[number]['id'];
export type VoiceStyle='news'|'breaking'|'viral'|'story'|'podcast';
export const VOICE_STYLES={
 news:{name:'Bản tin chuyên nghiệp',rate:'+0%',pitch:'+0Hz'},
 breaking:{name:'Tin nóng',rate:'+10%',pitch:'+2Hz'},
 viral:{name:'Tin thu hút / retention',rate:'+14%',pitch:'+3Hz'},
 story:{name:'Kể chuyện',rate:'-10%',pitch:'-1Hz'},
 podcast:{name:'Podcast tự nhiên',rate:'-5%',pitch:'-1Hz'}
} as const;
export function isVoiceId(value:string):value is VoiceId{return VOICE_CATALOG.some(v=>v.id===value)}
export function isVoiceStyle(value:string):value is VoiceStyle{return value in VOICE_STYLES}
export function getVoice(id:VoiceId){return VOICE_CATALOG.find(v=>v.id===id)!}
export const VIETNAMESE_VOICE_TEST='Xin chào quý vị. Đây là bản tin mới nhất từ Biển và Nỗi Nhớ. Thành phố Hồ Chí Minh hôm nay có nhiều thay đổi đáng chú ý.';
export function directVietnameseText(text:string,style:VoiceStyle='news'){
 let x=text.replace(/\s+/g,' ').trim().replace(/\s*([,.;:!?])\s*/g,'$1 ');
 x=x.replace(/([.!?])\s+(?=[A-ZÀ-ỸĐ])/g,'$1  ');
 if(style==='breaking'||style==='viral')x=x.replace(/([:;])/g,'$1 ').replace(/([!?])\s*/g,'$1  ');
 if(style==='viral')x=x.replace(/^(.*?[.!?])\s+/,'$1   ');
 if(style==='story'||style==='podcast')x=x.replace(/;\s*/g,'. ').replace(/:\s*/g,':  ');
 return x.trim();
}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function synthesize(text:string,voice:VoiceId,rate:string,style:VoiceStyle){const selected=getVoice(voice),preset=VOICE_STYLES[style];const tts=new EdgeTTS(text,selected.edgeVoice,{rate,pitch:preset.pitch,volume:'+0%'});const result=await tts.synthesize();const audio=Buffer.from(await result.audio.arrayBuffer());if(!audio.length)throw new Error('No audio was received.');return{selected,result,audio}}
export async function generateSpeech(options:{text:string;audioPath:string;srtPath?:string;voice?:VoiceId;rate?:string;style?:VoiceStyle}){
 const {text,audioPath,srtPath,voice='vi-male',style='news'}=options,preset=VOICE_STYLES[style];const rate=options.rate&&options.rate!=='+0%'?options.rate:preset.rate;
 await mkdir(dirname(audioPath),{recursive:true});if(srtPath)await mkdir(dirname(srtPath),{recursive:true});const directed=directVietnameseText(text,style);
 if(process.env.VIENEU_TTS_ENABLED==='true'){try{const local=await generateVieNeuSpeech({text:directed,audioPath,srtPath,voiceId:voice});if(local)return local}catch(e){console.warn('VieNeu unavailable; falling back to Edge TTS:',e)}}
 const fallbackOrder:VoiceId[]=[voice,...(['vi-male','vi-female','multi-andrew','multi-ava'] as VoiceId[]).filter(v=>v!==voice)];let lastError:unknown;
 for(let i=0;i<fallbackOrder.length;i++){const candidate=fallbackOrder[i];for(let attempt=1;attempt<=2;attempt++){try{const {selected,result,audio}=await synthesize(directed,candidate,rate,style);await writeFile(audioPath,audio);if(srtPath&&result.subtitle?.length)await writeFile(srtPath,createSRT(result.subtitle),'utf8');return{audioPath,srtPath,voice:selected.edgeVoice,voiceId:candidate,locale:selected.locale,rate,tier:selected.tier,style,fallbackUsed:candidate!==voice,attempt}}catch(e){lastError=e;console.warn(`TTS attempt ${attempt} failed for ${candidate}:`,e);if(attempt<2)await sleep(900)}}}
 throw new Error(`TTS failed after retry/fallback: ${lastError instanceof Error?lastError.message:String(lastError)}`)
}
export const generateVietnameseSpeech=generateSpeech;export type VietnameseVoice=VoiceId;
