import {readFileSync} from 'node:fs';
import {voiceStudioCatalog,voiceStudioStatus,analyzeSrtTimeline} from '../src/tts/studio.js';
const voices=voiceStudioCatalog(false),status=voiceStudioStatus(false);
if(voices.some(v=>/adam|revid/i.test(v.name+v.id)))throw new Error('Adam/Revid must not exist in Voice Studio');
if(voices.filter(v=>v.provider==='vieneu').length<8)throw new Error('Thiếu thư viện VieNeu open-source');
const mine=voices.find(v=>v.id==='vi-personal');if(!mine||mine.available)throw new Error('Giọng cá nhân phải chờ enroll');
const srt='1\n00:00:00,000 --> 00:00:03,000\nXin chào mọi người.\n\n2\n00:00:03,000 --> 00:00:07,000\nĐây là kiểm tra timeline giọng đọc.';
const a=analyzeSrtTimeline(srt);if(a.total!==2)throw new Error('SRT parser failed');

const server=readFileSync('src/server.ts','utf8'),ui=readFileSync('public/index.html','utf8'),client=readFileSync('public/health-studio.js','utf8');
if(!server.includes("app.post('/api/voice-studio/preview'"))throw new Error('Thiếu Voice Studio preview API');
if(!server.includes("app.post('/api/voice-preview',handleVoicePreview)"))throw new Error('Thiếu alias preview cho client cache cũ');
if(!client.includes("/api/voice-studio/preview"))throw new Error('Frontend chưa dùng Voice Studio preview API chuẩn');
if(/voice-pane hidden/.test(ui))throw new Error('Các tác vụ Voice Studio không được ẩn sau tab');
if(!ui.includes('settings-panel" open')||!ui.includes('personal-voice" open'))throw new Error('Các cấu hình thao tác chính phải mở mặc định');
console.log('Voice Studio V3.3.1 smoke OK',JSON.stringify({voices:voices.length,openSource:status.openSourceVoices,personal:status.personalClone,srtScore:a.summary.score}));
