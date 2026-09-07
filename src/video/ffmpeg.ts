import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

export async function renderNewsVideo(opts: {
  audioPath: string;
  srtPath?: string;
  outputPath: string;
  duration?: number;
}) {
  await mkdir(dirname(opts.outputPath), { recursive: true });
  const duration = opts.duration ?? 60;
  const vf = opts.srtPath
    ? `subtitles=${opts.srtPath}:force_style='FontName=DejaVu Sans,FontSize=18,Alignment=2,MarginV=180,Outline=2'`
    : 'null';

  await run('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0b1220:s=1080x1920:r=30:d=${duration}`,
    '-i', opts.audioPath,
    '-vf', vf,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest', '-movflags', '+faststart',
    opts.outputPath,
  ]);

  return opts.outputPath;
}
