import { randomUUID } from 'node:crypto';
import { enrollPersonalVoice } from './personal.js';

export type PersonalVoiceEnrollState='idle'|'queued'|'processing'|'ready'|'failed';
export interface PersonalVoiceEnrollJob{ id:string;status:PersonalVoiceEnrollState;progress:number;message:string;createdAt:string;updatedAt:string;error?:string;result?:unknown }
type InternalJob=PersonalVoiceEnrollJob&{ownerId:string};
const jobs=new Map<string,InternalJob>();
let queue:Promise<void>=Promise.resolve();
const publicJob=(j?:InternalJob):PersonalVoiceEnrollJob=>j?{id:j.id,status:j.status,progress:j.progress,message:j.message,createdAt:j.createdAt,updatedAt:j.updatedAt,error:j.error,result:j.result}:{id:'',status:'idle',progress:0,message:'Chưa có tác vụ clone giọng.',createdAt:'',updatedAt:''};
function update(j:InternalJob,patch:Partial<InternalJob>){Object.assign(j,patch,{updatedAt:new Date().toISOString()})}
export function personalVoiceEnrollStatus(ownerId:string){return publicJob(jobs.get(ownerId))}
export function startPersonalVoiceEnroll(input:{ownerId:string;audio:Buffer}){
  if(!input.audio.length||input.audio.length>12_000_000)throw new Error('Mẫu giọng không hợp lệ hoặc vượt 12 MB.');
  const existing=jobs.get(input.ownerId);if(existing&&(existing.status==='queued'||existing.status==='processing'))return publicJob(existing);
  const now=new Date().toISOString(),job:InternalJob={id:randomUUID(),ownerId:input.ownerId,status:'queued',progress:5,message:'Đã nhận mẫu giọng • đang chờ xử lý.',createdAt:now,updatedAt:now};
  jobs.set(input.ownerId,job);const audio=Buffer.from(input.audio);
  queue=queue.catch(()=>undefined).then(async()=>{try{update(job,{status:'processing',progress:25,message:'Đang chuẩn hóa mẫu và tạo embedding giọng…'});const result=await enrollPersonalVoice({ownerId:job.ownerId,audio});update(job,{status:'ready',progress:100,message:'Giọng của tôi đã sẵn sàng.',result,error:undefined})}catch(e){update(job,{status:'failed',progress:100,message:'Không thể tạo giọng.',error:e instanceof Error?e.message:String(e)})}});
  return publicJob(job);
}
