import { generateSpeech } from './tts/edge.js';

const text = process.argv.slice(2).join(' ') || 'Xin chào. Đây là bản thử nghiệm hệ thống Biển và Nỗi Nhớ Auto Media.';

const result = await generateSpeech({
  text,
  voice: 'vi-male',
  audioPath: 'output/demo-voice.mp3',
  srtPath: 'output/demo-voice.srt',
});

console.log('Generated:', result);
