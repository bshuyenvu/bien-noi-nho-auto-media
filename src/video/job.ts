import { generateSpeech, type VoiceId } from '../tts/edge.js';
import { downloadRemoteImage } from '../media/download.js';
import { all, run } from '../storage/db.js';
import { renderNewsVideo, type VideoTemplate } from './ffmpeg.js';
export type RenderStatus='queued'|'rendering'|'ready'|'failed';
export interface RenderJob{id:string;draftId:string;status:RenderStatus;progress:number;output?:string;error?:string;createdAt:string}
type JobRow={id:string;draft_id:string;status:RenderStatus;progress:number;output?:string;error?:string;created_at:string};
export const renderJobs:RenderJob[]=all<JobRow>('SELECT * FROM render_jobs ORDER BY created_at DESC LIMIT 100').map(r=>({id:r.id,draftId:r.draft_id,status:r.status==='rendering'||r.status==='queued'?'failed':r.status,progress:r.progress,output:r.output||undefined,error:r.status==='rendering'||r.status==='queued'?'Server restarted before render completed':r.error||undefined,createdAt:r.created_at}));
for(const j of renderJobs)if(j.status==='failed'&&j.error==='Server restarted before render completed')run('UPDATE render_jobs SET status=?,error=? WHERE id=?','failed',j.error,j.id);
function save(job:RenderJob){run('INSERT INTO render_jobs(id,draft_id,status,progress,output,error,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,progress=excluded.progress,output=excluded.output,error=excluded.error',job.id,job.draftId,job.status,job.progress,job.output||null,job.error||null,job.createdAt);}
export function enqueueRender(input:{draftId:string;text:string;headline:string;source?:string;breaking?:boolean;voice?:VoiceId;voiceRate?:string;imageUrl?:string;template?:VideoTemplate}){
 const job:RenderJob={id:crypto.randomUUID(),draftId:input.draftId,status:'queued',progress:0,createdAt:new Date().toISOString()};renderJobs.unshift(job);save(job);
 void(async()=>{try{job.status='rendering';job.progress=10;save(job);const base=`output/${job.id}`;let imagePath:string|undefined;if(input.imageUrl){try{imagePath=await downloadRemoteImage(input.imageUrl,`${base}-image`);job.progress=25;save(job)}catch(e){console.warn('Image download skipped:',e)}}await generateSpeech({text:input.text,voice:input.voice??'vi-male',rate:input.voiceRate??'+0%',audioPath:`${base}.mp3`,srtPath:`${base}.srt`});job.progress=60;save(job);job.output=await renderNewsVideo({audioPath:`${base}.mp3`,srtPath:`${base}.srt`,outputPath:`${base}.mp4`,headline:input.headline,source:input.source,breaking:input.breaking,imagePath,template:input.template});job.progress=100;job.status='ready';save(job)}catch(e){job.status='failed';job.error=e instanceof Error?e.message:String(e);save(job)}})();return job;
}
