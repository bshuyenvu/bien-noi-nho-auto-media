import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);
const base=()=>String(process.env.VIENEU_TTS_URL||'http://vieneu-tts:7861').replace(/\/$/,'');
export function personalVoiceName(ownerId:string){return'user-'+createHash('sha256').update(ownerId).digest('hex').slice(0,24)}
async function jsonFetch(path:string,init?:RequestInit){const r=await fetch(base()+path,{...init,signal:AbortSignal.timeout(300000)});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`VieNeu HTTP ${r.status}`);return d}
export async function personalVoiceStatus(ownerId:string){
 if(process.env.VIENEU_TTS_ENABLED!=='true')return{configured:false,cloneSupported:false,provider:'vieneu'};
 try{const d=await jsonFetch('/voices/'+encodeURIComponent(personalVoiceName(ownerId)));return{configured:Boolean(d.exists),cloneSupported:Boolean(d.cloneSupported??true),provider:'vieneu'}}catch{return{configured:false,cloneSupported:false,provider:'vieneu'}}
}
async function probe(path:string){const{stdout}=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path],{timeout:15000});const n=Number(stdout.trim());if(!Number.isFinite(n))throw new Error('Không đọc được thời lượng mẫu giọng.');return n}
export async function enrollPersonalVoice(input:{ownerId:string;audio:Buffer}){
 if(process.env.VIENEU_TTS_ENABLED!=='true')throw new Error('VieNeu local chưa được bật.');
 if(!input.audio.length||input.audio.length>12_000_000)throw new Error('Mẫu giọng không hợp lệ hoặc vượt 12 MB.');
 const dir=await mkdtemp(join(tmpdir(),'personal-voice-')),src=join(dir,'source'),wav=join(dir,'reference.wav');
 try{
  await writeFile(src,input.audio);const duration=await probe(src);
  if(duration<3||duration>8)throw new Error(`Mẫu giọng cần dài 3–8 giây; hiện tại ${duration.toFixed(1)} giây.`);
  await execFileAsync('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',src,'-ac','1','-ar','24000','-c:a','pcm_s16le',wav],{timeout:60000,maxBuffer:2*1024*1024});
  const bytes=await readFile(wav),name=personalVoiceName(input.ownerId);
  const d=await jsonFetch('/enroll',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,audio_base64:bytes.toString('base64')})});
  return{configured:true,provider:'vieneu',durationSeconds:Number(duration.toFixed(2)),voiceId:'vi-personal',...d};
 }finally{await rm(dir,{recursive:true,force:true}).catch(()=>undefined)}
}
export async function deletePersonalVoice(ownerId:string){
 if(process.env.VIENEU_TTS_ENABLED!=='true')return{deleted:false};
 return jsonFetch('/voices/'+encodeURIComponent(personalVoiceName(ownerId)),{method:'DELETE'});
}
