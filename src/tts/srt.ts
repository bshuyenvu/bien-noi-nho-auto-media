import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import { generateSpeech, type VoiceId, type VoiceStyle } from './edge.js';
import { analyzeSrtTimeline } from './studio.js';
const execFileAsync=promisify(execFile);
async function audioDuration(path:string){const {stdout}=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path],{timeout:10000,maxBuffer:1024*1024});const x=Number(String(stdout).trim());if(!Number.isFinite(x))throw new Error('Không đo được audio TTS.');return x}
function tempoFilters(ratio:number){const parts:string[]=[];let r=ratio;while(r>2){parts.push('atempo=2');r/=2}if(r>1.015)parts.push(`atempo=${Math.min(2,r).toFixed(4)}`);return parts}
export async function synthesizeSrtTimeline(input:{srt:string;voice:VoiceId;style:VoiceStyle;rate:string}){
 const analysis=analyzeSrtTimeline(input.srt);if(analysis.total>50)throw new Error('Tạo audio timeline local hỗ trợ tối đa 50 cue/lần.');
 const id=`srtvoice-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,cueFiles:string[]=[],filters:string[]=[],inputs:string[]=[];
 try{
  for(let i=0;i<analysis.cues.length;i++){const cue=analysis.cues[i],path=`output/${id}-cue-${String(i+1).padStart(3,'0')}.mp3`;cueFiles.push(path);
   await generateSpeech({text:cue.text,audioPath:path,voice:input.voice,style:input.style,rate:input.rate});const actual=await audioDuration(path),slot=cue.durationMs/1000,ratio=actual/slot;
   if(ratio>2.4)throw new Error(`Cue ${cue.index} quá dài: cần tăng tốc ${ratio.toFixed(2)}x. Hãy rút gọn câu trước khi tạo giọng.`);
   inputs.push('-i',path);const chain=[...tempoFilters(Math.max(1,ratio)),`adelay=${cue.startMs}:all=1`].join(',');filters.push(`[${i}:a]${chain}[a${i}]`);
  }
  const out=`output/${id}.mp3`,labels=analysis.cues.map((_,i)=>`[a${i}]`).join(''),total=(analysis.durationSeconds+.25).toFixed(3);
  const complex=`${filters.join(';')};${labels}amix=inputs=${analysis.total}:duration=longest:normalize=0,apad,atrim=duration=${total}[mix]`;
  await execFileAsync('ffmpeg',['-y',...inputs,'-filter_complex',complex,'-map','[mix]','-c:a','libmp3lame','-b:a','160k',out],{timeout:15*60_000,maxBuffer:8*1024*1024});
  return{id,output:out,durationSeconds:analysis.durationSeconds,analysis};
 }finally{await Promise.allSettled(cueFiles.map(x=>rm(x,{force:true})))}
}
