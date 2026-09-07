import type { VoiceId, VoiceStyle } from './edge.js';
export type CastMode='auto'|'manual';
export type ContentKind='breaking'|'latest'|'standard'|'story'|'podcast';
export interface VoiceCast{voice:VoiceId;style:VoiceStyle;reason:string;confidence:number}
const STORY=/\b(câu chuyện|kể lại|tâm sự|hồi ức|cuộc đời|gia đình|người mẹ|người cha)\b/i;
const PODCAST=/\b(podcast|trò chuyện|chia sẻ|góc nhìn|chuyện sức khỏe)\b/i;
const URGENT=/\b(khẩn|khẩn cấp|tin nóng|vừa xảy ra|cảnh báo|bão|động đất|cháy|lũ|sạt lở)\b/i;
const ENGAGING=/\b(đáng chú ý|bất ngờ|mới nhất|lần đầu|kỷ lục|thay đổi|đề xuất|tăng|giảm|giá vàng|usd|bhyt|chính sách|ai bị ảnh hưởng|vì sao)\b/i;
const SENSITIVE=/\b(tử vong|thiệt mạng|thương vong|nạn nhân|trẻ em|ung thư|thảm họa|chiến tranh)\b/i;
export function castVietnameseVoice(input:{title:string;text:string;format?:'breaking'|'latest'|'standard'}):VoiceCast{
 const sample=`${input.title} ${input.text}`.slice(0,6000);
 if(input.format==='breaking'||URGENT.test(sample))return{voice:'vi-male',style:'breaking',reason:'Tin nóng/khẩn: ưu tiên giọng nam Việt chắc, nhịp nhanh vừa phải và nhấn rõ từ khóa.',confidence:.95};
 if(PODCAST.test(sample))return{voice:'vi-female',style:'podcast',reason:'Nội dung thiên về trò chuyện/podcast: ưu tiên giọng nữ Việt mềm và tự nhiên.',confidence:.88};
 if(STORY.test(sample))return{voice:'vi-female',style:'story',reason:'Nội dung có tính kể chuyện: ưu tiên giọng nữ Việt và nhịp kể chậm hơn.',confidence:.86};
 if(!SENSITIVE.test(sample)&&ENGAGING.test(sample))return{voice:'vi-male',style:'viral',reason:'Bản tin có yếu tố thay đổi/tò mò: dùng phong cách retention, mở đầu nhanh hơn và nhấn rõ câu hook.',confidence:.91};
 return{voice:'vi-male',style:'news',reason:SENSITIVE.test(sample)?'Nội dung nhạy cảm: giữ giọng bản tin rõ, tiết chế và tôn trọng.':'Bản tin thông thường: ưu tiên giọng nam Việt rõ chữ và chuyên nghiệp.',confidence:.84};
}
