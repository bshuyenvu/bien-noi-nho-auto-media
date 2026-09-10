import { analyzeSrtTimeline,voiceStudioCatalog,voiceStudioStatus } from '../src/tts/studio.js';
const voices=voiceStudioCatalog();
if(voices.filter(x=>x.provider==='local').length<6)throw new Error('Voice Studio phải giữ đủ voice local hiện có');
const adam=voices.find(x=>x.id==='revid-adam-9039');if(!adam||adam.externalVoiceId!==9039)throw new Error('Thiếu metadata Adam/Revid 9039');
const srt=`1\n00:00:00,000 --> 00:00:03,000\nĐây là câu ngắn dễ nghe.\n\n2\n00:00:03,000 --> 00:00:06,000\nCâu thứ hai có nhịp đọc rõ ràng.`;
const qa=analyzeSrtTimeline(srt);if(qa.total!==2||qa.durationSeconds!==6)throw new Error('SRT timeline parser sai');
let blocked=false;try{analyzeSrtTimeline('1\n00:00:04,000 --> 00:00:03,000\nSai thời gian')}catch{blocked=true}if(!blocked)throw new Error('SRT timeline phải chặn end <= start');
console.log('Voice Studio V3.1 smoke OK',JSON.stringify({voices:voices.length,adamConfigured:adam.available,srtScore:qa.summary.score,status:voiceStudioStatus()}));
