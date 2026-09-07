import { EdgeTTS, createSRT } from 'edge-tts-universal';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const VOICE_CATALOG = [
  { id: 'vi-male', name: 'Nam Minh', language: 'Tiếng Việt', locale: 'vi-VN', gender: 'Nam', edgeVoice: 'vi-VN-NamMinhNeural' },
  { id: 'vi-female', name: 'Hoài My', language: 'Tiếng Việt', locale: 'vi-VN', gender: 'Nữ', edgeVoice: 'vi-VN-HoaiMyNeural' },
  { id: 'en-us-male', name: 'Guy', language: 'English (US)', locale: 'en-US', gender: 'Nam', edgeVoice: 'en-US-GuyNeural' },
  { id: 'en-us-female', name: 'Jenny', language: 'English (US)', locale: 'en-US', gender: 'Nữ', edgeVoice: 'en-US-JennyNeural' },
  { id: 'en-gb-male', name: 'Ryan', language: 'English (UK)', locale: 'en-GB', gender: 'Nam', edgeVoice: 'en-GB-RyanNeural' },
  { id: 'en-gb-female', name: 'Sonia', language: 'English (UK)', locale: 'en-GB', gender: 'Nữ', edgeVoice: 'en-GB-SoniaNeural' },
  { id: 'fr-male', name: 'Henri', language: 'Français', locale: 'fr-FR', gender: 'Nam', edgeVoice: 'fr-FR-HenriNeural' },
  { id: 'fr-female', name: 'Denise', language: 'Français', locale: 'fr-FR', gender: 'Nữ', edgeVoice: 'fr-FR-DeniseNeural' },
  { id: 'de-male', name: 'Conrad', language: 'Deutsch', locale: 'de-DE', gender: 'Nam', edgeVoice: 'de-DE-ConradNeural' },
  { id: 'de-female', name: 'Katja', language: 'Deutsch', locale: 'de-DE', gender: 'Nữ', edgeVoice: 'de-DE-KatjaNeural' },
  { id: 'ja-male', name: 'Keita', language: '日本語', locale: 'ja-JP', gender: 'Nam', edgeVoice: 'ja-JP-KeitaNeural' },
  { id: 'ja-female', name: 'Nanami', language: '日本語', locale: 'ja-JP', gender: 'Nữ', edgeVoice: 'ja-JP-NanamiNeural' },
  { id: 'ko-male', name: 'InJoon', language: '한국어', locale: 'ko-KR', gender: 'Nam', edgeVoice: 'ko-KR-InJoonNeural' },
  { id: 'ko-female', name: 'SunHi', language: '한국어', locale: 'ko-KR', gender: 'Nữ', edgeVoice: 'ko-KR-SunHiNeural' },
  { id: 'zh-male', name: 'Yunxi', language: '中文', locale: 'zh-CN', gender: 'Nam', edgeVoice: 'zh-CN-YunxiNeural' },
  { id: 'zh-female', name: 'Xiaoxiao', language: '中文', locale: 'zh-CN', gender: 'Nữ', edgeVoice: 'zh-CN-XiaoxiaoNeural' },
  { id: 'th-male', name: 'Niwat', language: 'ไทย', locale: 'th-TH', gender: 'Nam', edgeVoice: 'th-TH-NiwatNeural' },
  { id: 'th-female', name: 'Premwadee', language: 'ไทย', locale: 'th-TH', gender: 'Nữ', edgeVoice: 'th-TH-PremwadeeNeural' },
  { id: 'id-male', name: 'Ardi', language: 'Bahasa Indonesia', locale: 'id-ID', gender: 'Nam', edgeVoice: 'id-ID-ArdiNeural' },
  { id: 'id-female', name: 'Gadis', language: 'Bahasa Indonesia', locale: 'id-ID', gender: 'Nữ', edgeVoice: 'id-ID-GadisNeural' },
  { id: 'ru-male', name: 'Dmitry', language: 'Русский', locale: 'ru-RU', gender: 'Nam', edgeVoice: 'ru-RU-DmitryNeural' },
  { id: 'ru-female', name: 'Svetlana', language: 'Русский', locale: 'ru-RU', gender: 'Nữ', edgeVoice: 'ru-RU-SvetlanaNeural' },
] as const;

export type VoiceId = typeof VOICE_CATALOG[number]['id'];
export function isVoiceId(value:string): value is VoiceId { return VOICE_CATALOG.some(v=>v.id===value); }
export function getVoice(id:VoiceId){ return VOICE_CATALOG.find(v=>v.id===id)!; }

export async function generateSpeech(options: {
  text: string;
  audioPath: string;
  srtPath?: string;
  voice?: VoiceId;
  rate?: string;
}) {
  const { text, audioPath, srtPath, voice = 'vi-male', rate = '+0%' } = options;
  const selected=getVoice(voice);
  await mkdir(dirname(audioPath), { recursive: true });
  if (srtPath) await mkdir(dirname(srtPath), { recursive: true });

  const tts = new EdgeTTS(text, selected.edgeVoice, { rate, pitch: '+0Hz', volume: '+0%' });
  const result = await tts.synthesize();
  const audio = Buffer.from(await result.audio.arrayBuffer());
  if (!audio.length) throw new Error('TTS returned empty audio');
  await writeFile(audioPath, audio);

  if (srtPath && result.subtitle?.length) await writeFile(srtPath, createSRT(result.subtitle), 'utf8');
  return { audioPath, srtPath, voice: selected.edgeVoice, locale:selected.locale, rate };
}

// Backward-compatible alias for existing CLI code.
export const generateVietnameseSpeech = generateSpeech;
export type VietnameseVoice = VoiceId;
