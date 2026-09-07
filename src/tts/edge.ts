import { EdgeTTS, createSRT } from 'edge-tts-universal';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Curated voices for Vietnamese news narration.
 * Keep only native vi-VN voices and multilingual voices documented to support vi-VN.
 * Do not add ordinary monolingual foreign voices merely because they accept Unicode text.
 */
export const VOICE_CATALOG = [
  { id:'vi-male', name:'Nam Minh', language:'Tiếng Việt chuẩn', locale:'vi-VN', gender:'Nam', edgeVoice:'vi-VN-NamMinhNeural', tier:'native', recommended:true, description:'Nam Việt, rõ chữ; phù hợp bản tin.' },
  { id:'vi-female', name:'Hoài My', language:'Tiếng Việt chuẩn', locale:'vi-VN', gender:'Nữ', edgeVoice:'vi-VN-HoaiMyNeural', tier:'native', recommended:true, description:'Nữ Việt, tự nhiên; phù hợp bản tin và thuyết minh.' },
  { id:'multi-andrew', name:'Andrew', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nam', edgeVoice:'en-US-AndrewMultilingualNeural', tier:'multilingual', recommended:true, description:'Nam quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-brian', name:'Brian', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nam', edgeVoice:'en-US-BrianMultilingualNeural', tier:'multilingual', recommended:true, description:'Nam quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-ava', name:'Ava', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nữ', edgeVoice:'en-US-AvaMultilingualNeural', tier:'multilingual', recommended:true, description:'Nữ quốc tế multilingual; hỗ trợ vi-VN.' },
  { id:'multi-emma', name:'Emma', language:'Quốc tế • hỗ trợ tiếng Việt', locale:'en-US', gender:'Nữ', edgeVoice:'en-US-EmmaMultilingualNeural', tier:'multilingual', recommended:true, description:'Nữ quốc tế multilingual; hỗ trợ vi-VN.' },
] as const;

export type VoiceId = typeof VOICE_CATALOG[number]['id'];
export function isVoiceId(value:string): value is VoiceId { return VOICE_CATALOG.some(v=>v.id===value); }
export function getVoice(id:VoiceId){ return VOICE_CATALOG.find(v=>v.id===id)!; }

export const VIETNAMESE_VOICE_TEST='Xin chào quý vị. Đây là bản tin mới nhất từ Biển và Nỗi Nhớ. Thành phố Hồ Chí Minh hôm nay có nhiều thay đổi đáng chú ý.';

export async function generateSpeech(options:{text:string;audioPath:string;srtPath?:string;voice?:VoiceId;rate?:string}){
  const {text,audioPath,srtPath,voice='vi-male',rate='+0%'}=options;
  const selected=getVoice(voice);
  await mkdir(dirname(audioPath),{recursive:true});
  if(srtPath)await mkdir(dirname(srtPath),{recursive:true});
  const tts=new EdgeTTS(text,selected.edgeVoice,{rate,pitch:'+0Hz',volume:'+0%'});
  const result=await tts.synthesize();
  const audio=Buffer.from(await result.audio.arrayBuffer());
  if(!audio.length)throw new Error('TTS returned empty audio');
  await writeFile(audioPath,audio);
  if(srtPath&&result.subtitle?.length)await writeFile(srtPath,createSRT(result.subtitle),'utf8');
  return {audioPath,srtPath,voice:selected.edgeVoice,locale:selected.locale,rate,tier:selected.tier};
}

export const generateVietnameseSpeech=generateSpeech;
export type VietnameseVoice=VoiceId;
