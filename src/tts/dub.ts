import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import { downloadRemoteVideo } from '../media/download.js';
import { generateSpeech, type VoiceId, type VoiceStyle } from './edge.js';
const execFileAsync=promisify(execFile);
async function duration(path:string){const {stdout}=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path],{timeout:15000,maxBuffer:1024*1024});const value=Number(String(stdout).trim());if(!Number.isFinite(value)||value<=0)throw new Error('Không đọc được thời lượng video.');return value}
export async function dubVideoFile(input:{videoPath:string;text:string;voice:VoiceId;style:VoiceStyle;rate:string;outputPath:string}){
 const seconds=await duration(input.videoPath);if(seconds>300)throw new Error('Video vượt 5 phút.');const audioPath=input.outputPath.replace(/\.mp4$/i,'')+'-voice.mp3',srtPath=input.outputPath.replace(/\.mp4$/i,'')+'-voice.srt';
 try{await generateSpeech({text:input.text,audioPath,srtPath,voice:input.voice,style:input.style,rate:input.rate});await execFileAsync('ffmpeg',['-y','-i',input.videoPath,'-i',audioPath,'-filter_complex','[1:a]apad[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','160k','-shortest',input.outputPath],{timeout:12*60_000,maxBuffer:4*1024*1024});return{output:input.outputPath,durationSeconds:Number(seconds.toFixed(2)),voice:input.voice,style:input.style}}finally{await Promise.allSettled([audioPath,srtPath].map(x=>rm(x,{force:true})))}}
export async function dubDirectVideo(input:{url:string;text:string;voice:VoiceId;style:VoiceStyle;rate:string;rightsConfirmed:boolean}){
 if(!input.rightsConfirmed)throw new Error('Cần xác nhận quyền sử dụng video trước khi lồng tiếng.');const id=`dub-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,base=`output/${id}`;let videoPath='';
 try{videoPath=await downloadRemoteVideo(input.url,`${base}-source`);return{id,...await dubVideoFile({videoPath,text:input.text,voice:input.voice,style:input.style,rate:input.rate,outputPath:`${base}.mp4`})}}finally{if(videoPath)await rm(videoPath,{force:true}).catch(()=>undefined)}}
