import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile);

export async function mediaDurationSeconds(path:string){
 const {stdout}=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path],{timeout:15000,maxBuffer:1024*1024});
 const n=Number(String(stdout).trim());if(!Number.isFinite(n)||n<=0)throw new Error('Không đo được thời lượng media.');return n;
}
