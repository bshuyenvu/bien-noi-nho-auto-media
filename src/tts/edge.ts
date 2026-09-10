import { EdgeTTS, createSRT } from 'edge-tts-universal';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generateVieNeuSpeech } from './vieneu.js';
import { personalVoiceName } from './personal.js';

export const VOICE_CATALOG = [
 {id:'vieneu-minh-duc',name:'Minh Đức',provider:'vieneu',vieneuVoice:'Minh Đức',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nam',genderCode:'male',region:'north',tier:'open-source',recommended:true,categories:['news','review','voiceover'],description:'Nam miền Bắc • phong cách tin tức • VieNeu v3 Apache-2.0.'},
 {id:'vieneu-minh-triet',name:'Minh Triết',provider:'vieneu',vieneuVoice:'Minh Triết',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nam',genderCode:'male',region:'south',tier:'open-source',recommended:true,categories:['news','review','voiceover'],description:'Nam miền Nam • phong cách tin tức • VieNeu v3 Apache-2.0.'},
 {id:'vieneu-thuy-dung',name:'Thùy Dung',provider:'vieneu',vieneuVoice:'Thùy Dung',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nữ',genderCode:'female',region:'south',tier:'open-source',recommended:true,categories:['news','podcast','voiceover'],description:'Nữ miền Nam • phong cách tin tức • VieNeu v3 Apache-2.0.'},
 {id:'vieneu-mai-anh',name:'Mai Anh',provider:'vieneu',vieneuVoice:'Mai Anh',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nữ',genderCode:'female',region:'north',tier:'open-source',recommended:true,categories:['news','voiceover'],description:'Nữ miền Bắc • phong cách tin tức • VieNeu v3 Apache-2.0.'},
 {id:'vieneu-xuan-vinh',name:'Xuân Vĩnh',provider:'vieneu',vieneuVoice:'Xuân Vĩnh',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nam',genderCode:'male',region:'south',tier:'open-source',recommended:false,categories:['podcast','review','voiceover'],description:'Nam miền Nam • tự nhiên • phù hợp podcast và review.'},
 {id:'vieneu-quang-son',name:'Quang Sơn',provider:'vieneu',vieneuVoice:'Quang Sơn',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nam',genderCode:'male',region:'central',tier:'open-source',recommended:false,categories:['podcast','review','voiceover'],description:'Nam miền Trung • tự nhiên • phù hợp thuyết minh.'},
 {id:'vieneu-ngoc-tran',name:'Ngọc Trân',provider:'vieneu',vieneuVoice:'Ngọc Trân',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nữ',genderCode:'female',region:'central',tier:'open-source',recommended:false,categories:['podcast','story','voiceover'],description:'Nữ miền Trung • tự nhiên • phù hợp podcast và kể chuyện.'},
 {id:'vieneu-thai-son',name:'Thái Sơn',provider:'vieneu',vieneuVoice:'Thái Sơn',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nam',genderCode:'male',region:'south',tier:'open-source',recommended:false,categories:['story','podcast'],description:'Nam miền Nam • kể chuyện • VieNeu v3.'},
 {id:'vieneu-thuc-doan',name:'Thục Đoan',provider:'vieneu',vieneuVoice:'Thục Đoan',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nữ',genderCode:'female',region:'south',tier:'open-source',recommended:true,categories:['story','podcast'],description:'Nữ miền Nam • kể chuyện • phù hợp podcast chân lý sống.'},
 {id:'vieneu-truc-ly',name:'Trúc Ly',provider:'vieneu',vieneuVoice:'Trúc Ly',edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nữ',genderCode:'female',region:'north',tier:'open-source',recommended:false,categories:['podcast','story','voiceover'],description:'Nữ miền Bắc • tự nhiên • phù hợp kể chuyện.'},
 {id:'vi-personal',name:'Giọng của tôi',provider:'personal',vieneuVoice:null,edgeVoice:null,language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nam',genderCode:'male',region:'personal',tier:'personal',recommended:true,categories:['podcast','review','news','story','voiceover'],description:'Giọng cá nhân clone nội bộ từ mẫu 3–8 giây; chỉ dùng cho tài khoản sở hữu mẫu.'},
 {id:'vi-male',name:'Nam Minh',provider:'edge',vieneuVoice:null,edgeVoice:'vi-VN-NamMinhNeural',language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nam',genderCode:'male',region:'standard',tier:'cloud-fallback',recommended:false,categories:['news','review','voiceover'],description:'Giọng cloud fallback; dùng khi cần thay thế.'},
 {id:'vi-female',name:'Hoài My',provider:'edge',vieneuVoice:null,edgeVoice:'vi-VN-HoaiMyNeural',language:'Tiếng Việt',languageCode:'vi',locale:'vi-VN',gender:'Nữ',genderCode:'female',region:'standard',tier:'cloud-fallback',recommended:false,categories:['podcast','news','story','voiceover'],description:'Giọng cloud fallback; dùng khi cần thay thế.'},
 {id:'multi-andrew',name:'Andrew',provider:'edge',vieneuVoice:null,edgeVoice:'en-US-AndrewMultilingualNeural',language:'Đa ngôn ngữ',languageCode:'multilingual',locale:'en-US',gender:'Nam',genderCode:'male',region:'international',tier:'cloud-fallback',recommended:false,categories:['podcast','review','voiceover'],description:'Cloud multilingual fallback.'},
 {id:'multi-brian',name:'Brian',provider:'edge',vieneuVoice:null,edgeVoice:'en-US-BrianMultilingualNeural',language:'Đa ngôn ngữ',languageCode:'multilingual',locale:'en-US',gender:'Nam',genderCode:'male',region:'international',tier:'cloud-fallback',recommended:false,categories:['news','review','voiceover'],description:'Cloud multilingual fallback.'},
 {id:'multi-ava',name:'Ava',provider:'edge',vieneuVoice:null,edgeVoice:'en-US-AvaMultilingualNeural',language:'Đa ngôn ngữ',languageCode:'multilingual',locale:'en-US',gender:'Nữ',genderCode:'female',region:'international',tier:'cloud-fallback',recommended:false,categories:['podcast','voiceover'],description:'Cloud multilingual fallback.'},
 {id:'multi-emma',name:'Emma',provider:'edge',vieneuVoice:null,edgeVoice:'en-US-EmmaMultilingualNeural',language:'Đa ngôn ngữ',languageCode:'multilingual',locale:'en-US',gender:'Nữ',genderCode:'female',region:'international',tier:'cloud-fallback',recommended:false,categories:['story','podcast','voiceover'],description:'Cloud multilingual fallback.'},
] as const;
export type VoiceId=typeof VOICE_CATALOG[number]['id'];
export type VoiceStyle='news'|'breaking'|'viral'|'story'|'podcast';
export const VOICE_STYLES={news:{name:'Bản tin chuyên nghiệp',rate:'+0%',pitch:'+0Hz'},breaking:{name:'Tin nóng',rate:'+10%',pitch:'+2Hz'},viral:{name:'Tin thu hút / retention',rate:'+14%',pitch:'+3Hz'},story:{name:'Kể chuyện',rate:'-10%',pitch:'-1Hz'},podcast:{name:'Podcast tự nhiên',rate:'-5%',pitch:'-1Hz'}} as const;
export function isVoiceId(value:string):value is VoiceId{return VOICE_CATALOG.some(v=>v.id===value)}
export function isVoiceStyle(value:string):value is VoiceStyle{return value in VOICE_STYLES}
export function getVoice(id:VoiceId){return VOICE_CATALOG.find(v=>v.id===id)!}
export const VIETNAMESE_VOICE_TEST='Xin chào quý vị. Đây là phần nghe thử giọng đọc trong Multi-Content Studio.';
export function directVietnameseText(text:string,style:VoiceStyle='news'){
 let x=text.replace(/\s+/g,' ').trim().replace(/\s*([,.;:!?])\s*/g,'$1 ');x=x.replace(/([.!?])\s+(?=[A-ZÀ-ỸĐ])/g,'$1  ');
 if(style==='breaking'||style==='viral')x=x.replace(/([:;])/g,'$1 ').replace(/([!?])\s*/g,'$1  ');if(style==='viral')x=x.replace(/^(.*?[.!?])\s+/,'$1   ');
 if(style==='story'||style==='podcast')x=x.replace(/;\s*/g,'. ').replace(/:\s*/g,':  ');return x.trim();
}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function synthesizeEdge(text:string,voice:VoiceId,rate:string,style:VoiceStyle){const selected=getVoice(voice);if(selected.provider!=='edge'||!selected.edgeVoice)throw new Error('Không phải Edge voice');const preset=VOICE_STYLES[style],tts=new EdgeTTS(text,selected.edgeVoice,{rate,pitch:preset.pitch,volume:'+0%'}),result=await tts.synthesize(),audio=Buffer.from(await result.audio.arrayBuffer());if(!audio.length)throw new Error('No audio was received.');return{selected,result,audio}}
export async function generateSpeech(options:{text:string;audioPath:string;srtPath?:string;voice?:VoiceId;rate?:string;style?:VoiceStyle;ownerId?:string}){
 const {text,audioPath,srtPath,voice='vieneu-minh-duc',style='news'}=options,selected=getVoice(voice),preset=VOICE_STYLES[style],rate=options.rate&&options.rate!=='+0%'?options.rate:preset.rate;
 await mkdir(dirname(audioPath),{recursive:true});if(srtPath)await mkdir(dirname(srtPath),{recursive:true});const directed=directVietnameseText(text,style),maxLocalChars=Math.max(80,Number(process.env.VIENEU_MAX_DIRECT_CHARS||260));let lastError:unknown;
 if(selected.provider==='vieneu'){
  if(process.env.VIENEU_TTS_ENABLED==='true'&&directed.length<=maxLocalChars){try{return await generateVieNeuSpeech({text:directed,audioPath,srtPath,voiceId:voice,voiceName:selected.vieneuVoice})}catch(e){lastError=e;console.warn(`VieNeu ${voice} fallback to Edge:`,e instanceof Error?e.message:String(e))}}
  else if(directed.length>maxLocalChars)console.warn(`VieNeu ${voice} skipped for long render text (${directed.length} chars > ${maxLocalChars}); using fast Edge fallback.`);
 }
 if(selected.provider==='personal'){
  if(!options.ownerId)throw new Error('Giọng cá nhân cần tài khoản sở hữu mẫu.');if(process.env.VIENEU_TTS_ENABLED!=='true')throw new Error('VieNeu local chưa bật.');return generateVieNeuSpeech({text:directed,audioPath,srtPath,voiceId:voice,voiceName:personalVoiceName(options.ownerId)})
 }
 const genderFallback=selected.genderCode==='female'?'vi-female':'vi-male',edgeFallbacks=([genderFallback,'vi-male','vi-female','multi-andrew','multi-ava'] as VoiceId[]).filter((v,i,a)=>a.indexOf(v)===i&&getVoice(v).provider==='edge'),fallbackOrder:VoiceId[]=selected.provider==='edge'?[voice,...edgeFallbacks.filter(v=>v!==voice)]:edgeFallbacks;
 for(const candidate of fallbackOrder){if(getVoice(candidate).provider!=='edge')continue;for(let attempt=1;attempt<=2;attempt++){try{const{selected:edge,result,audio}=await synthesizeEdge(directed,candidate,rate,style);await writeFile(audioPath,audio);if(srtPath&&result.subtitle?.length)await writeFile(srtPath,createSRT(result.subtitle),'utf8');return{audioPath,srtPath,voice:edge.edgeVoice,voiceId:candidate,locale:edge.locale,rate,tier:edge.tier,style,fallbackUsed:candidate!==voice,attempt}}catch(e){lastError=e;if(attempt<2)await sleep(900)}}}
 throw new Error(`TTS failed after retry/fallback: ${lastError instanceof Error?lastError.message:String(lastError)}`)
}
export const generateVietnameseSpeech=generateSpeech;export type VietnameseVoice=VoiceId;
