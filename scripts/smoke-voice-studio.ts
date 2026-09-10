import {voiceStudioCatalog,voiceStudioStatus,analyzeSrtTimeline} from '../src/tts/studio.js';
const voices=voiceStudioCatalog(false),status=voiceStudioStatus(false);
if(voices.some(v=>/adam|revid/i.test(v.name+v.id)))throw new Error('Adam/Revid must not exist in Voice Studio');
if(voices.filter(v=>v.provider==='vieneu').length<8)throw new Error('Thiếu thư viện VieNeu open-source');
const mine=voices.find(v=>v.id==='vi-personal');if(!mine||mine.available)throw new Error('Giọng cá nhân phải chờ enroll');
const srt='1\n00:00:00,000 --> 00:00:03,000\nXin chào mọi người.\n\n2\n00:00:03,000 --> 00:00:07,000\nĐây là kiểm tra timeline giọng đọc.';
const a=analyzeSrtTimeline(srt);if(a.total!==2)throw new Error('SRT parser failed');
console.log('Voice Studio V3.3 smoke OK',JSON.stringify({voices:voices.length,openSource:status.openSourceVoices,personal:status.personalClone,srtScore:a.summary.score}));
