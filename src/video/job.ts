import { generateVietnameseSpeech, type VietnameseVoice } from '../tts/edge.js';
import { renderNewsVideo } from './ffmpeg.js';
export type RenderStatus='queued'|'rendering'|'ready'|'failed';
export interface RenderJob{id:string;draftId:string;status:RenderStatus;progress:number;output?:string;error?:string;createdAt:string}
export const renderJobs:RenderJob[]=[];
export function enqueueRender(input:{draftId:string;text:string;headline:string;source?:string;breaking?:boolean;voice?:VietnameseVoice}){
 const job:RenderJob={id:crypto.randomUUID(),draftId:input.draftId,status:'queued',progress:0,createdAt:new Date().toISOString()};renderJobs.unshift(job);
 void(async()=>{try{job.status='rendering';job.progress=15;const base=`output/${job.id}`;await generateVietnameseSpeech({text:input.text,voice:input.voice??'male',audioPath:`${base}.mp3`,srtPath:`${base}.srt`});job.progress=55;job.output=await renderNewsVideo({audioPath:`${base}.mp3`,srtPath:`${base}.srt`,outputPath:`${base}.mp4`,headline:input.headline,source:input.source,breaking:input.breaking});job.progress=100;job.status='ready'}catch(e){job.status='failed';job.error=e instanceof Error?e.message:String(e)}})();return job;
}
