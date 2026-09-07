import { generateVietnameseSpeech } from './tts/edge.js';
import { renderNewsVideo } from './video/ffmpeg.js';

const text = process.argv.slice(2).join(' ') || 'Tin mới. Đây là video thử nghiệm đầu tiên của hệ thống Biển và Nỗi Nhớ Auto Media.';

await generateVietnameseSpeech({
  text,
  voice: 'male',
  audioPath: 'output/demo.mp3',
  srtPath: 'output/demo.srt',
});

const output = await renderNewsVideo({
  audioPath: 'output/demo.mp3',
  srtPath: 'output/demo.srt',
  outputPath: 'output/demo.mp4',
});

console.log(`Video ready: ${output}`);
