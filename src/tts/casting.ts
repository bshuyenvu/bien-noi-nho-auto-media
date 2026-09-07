import type { VoiceId, VoiceStyle } from './edge.js';
export type CastMode='auto'|'manual';
export type ContentKind='breaking'|'latest'|'standard'|'story'|'podcast';
export interface VoiceCast{voice:VoiceId;style:VoiceStyle;reason:string;confidence:number}
const STORY=/\b(câu chuyện|kể lại|tâm sự|hồi ức|cuộc đời|gia đình|người mẹ|người cha)\b/i;
const PODCAST=/\b(podcast|trò chuyện|chia sẻ|góc nhìn|chuyện sức khỏe)\b/i;
const URGENT=/\b(khẩn|khẩn cấp|tin nóng|vừa xảy ra|cảnh báo|bão|động đất|cháy|lũ|sạt lở)\b/i;
export function castVietnameseVoice(input:{title:string;text:string;format?:'breaking'|'latest'|'standard'}):VoiceCast{
 const sample=`${input.title} ${input.text}`.slice(0,6000);
 if(input.format==='breaking'||URGENT.test(sample))return{voice:'vi-male',style:'breaking',reason:'Nội dung có tính thời sự/khẩn cấp: ưu tiên giọng nam Việt rõ, chắc và phong cách tin nóng.',confidence:.94};
 if(PODCAST.test(sample))return{voice:'vi-female',style:'podcast',reason:'Nội dung thiên về trò chuyện/podcast: ưu tiên giọng nữ Việt mềm và tự nhiên.',confidence:.88};
 if(STORY.test(sample))return{voice:'vi-female',style:'story',reason:'Nội dung có tính kể chuyện: ưu tiên giọng nữ Việt và nhịp kể chậm hơn.',confidence:.86};
 return{voice:'vi-male',style:'news',reason:'Bản tin thông thường: ưu tiên giọng nam Việt rõ chữ và phong cách bản tin chuyên nghiệp.',confidence:.82};
}
