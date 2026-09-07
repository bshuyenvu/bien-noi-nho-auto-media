import { EdgeTTS, createSRT } from 'edge-tts-universal';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type VietnameseVoice = 'female' | 'male';

const voices: Record<VietnameseVoice, string> = {
  female: 'vi-VN-HoaiMyNeural',
  male: 'vi-VN-NamMinhNeural',
};

export async function generateVietnameseSpeech(options: {
  text: string;
  audioPath: string;
  srtPath?: string;
  voice?: VietnameseVoice;
  rate?: string;
}) {
  const { text, audioPath, srtPath, voice = 'male', rate = '+0%' } = options;
  await mkdir(dirname(audioPath), { recursive: true });
  if (srtPath) await mkdir(dirname(srtPath), { recursive: true });

  const tts = new EdgeTTS(text, voices[voice], {
    rate,
    pitch: '+0Hz',
    volume: '+0%',
  });
  const result = await tts.synthesize();
  const audio = Buffer.from(await result.audio.arrayBuffer());
  if (!audio.length) throw new Error('TTS returned empty audio');
  await writeFile(audioPath, audio);

  if (srtPath && result.subtitle?.length) {
    await writeFile(srtPath, createSRT(result.subtitle), 'utf8');
  }
  return { audioPath, srtPath, voice: voices[voice] };
}
