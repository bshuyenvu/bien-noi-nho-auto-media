import { execFile } from 'node:child_process';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);
const enabled=()=>process.env.VIENEU_TTS_ENABLED==='true';

function stamp(seconds:number){const ms=Math.max(0,Math.round(seconds*1000));const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),x=ms%1000;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(x).padStart(3,'0')}`}
function subtitle(text:string,duration:number){const sentences=text.match(/[^.!?]+[.!?]?/g)?.map(x=>x.trim()).filter(Boolean)||[text];let cursor=0;return sentences.map((line,index)=>{const share=Math.max(0.9,duration*(line.length/Math.max(1,text.length))),start=cursor;cursor=Math.min(duration,cursor+share);return`${index+1}\n${stamp(start)} --> ${stamp(cursor)}\n${line}\n`}).join('\n')}

export async function generateVieNeuSpeech(input:{text:string;audioPath:string;srtPath?:string;voiceId:string;voiceName:string}){
 if(!enabled())return undefined;
 const base=(process.env.VIENEU_TTS_URL||'http://vieneu-tts:7861').replace(/\/$/,'');
 const voice=input.voiceName;
 const response=await fetch(`${base}/synthesize`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:input.text,voice}),signal:AbortSignal.timeout(Number(process.env.VIENEU_TTS_TIMEOUT_MS||240000))});
 if(!response.ok)throw new Error(`VieNeu HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
 const wav=`${input.audioPath}.vieneu.wav`;
 await mkdir(dirname(input.audioPath),{recursive:true});
 await writeFile(wav,Buffer.from(await response.arrayBuffer()));
 await execFileAsync('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',wav,'-codec:a','libmp3lame','-b:a','128k',input.audioPath]);
 await unlink(wav).catch(()=>{});
 const {stdout}=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',input.audioPath]);
 const duration=Number(stdout.trim())||Math.max(1,input.text.length/13);
 if(input.srtPath)await writeFile(input.srtPath,subtitle(input.text,duration),'utf8');
 return{audioPath:input.audioPath,srtPath:input.srtPath,voice:`VieNeu v3 • ${voice}`,voiceId:input.voiceId,locale:'vi-VN',rate:'+0%',tier:'local-open-source',style:'natural',fallbackUsed:false,attempt:1};
}
