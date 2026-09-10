import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=await mkdtemp(join(tmpdir(),'render-history-'));
process.chdir(root);
process.env.DB_PATH=join(root,'history.sqlite');
await mkdir('output',{recursive:true});

const {run,all}=await import('../src/storage/db.js');
const {deleteRenderJob}=await import('../src/video/job.js');
const idA='history-a-'+crypto.randomUUID(),idB='history-b-'+crypto.randomUUID(),now=new Date().toISOString();
run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',idA,'draft-a','owner-a','ready',100,`output/${idA}.mp4`,now,now);
run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,output,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',idB,'draft-b','owner-b','failed',0,null,now,now);
await writeFile(`output/${idA}.mp4`,'smoke');

if(!await deleteRenderJob(idA))throw new Error('deleteRenderJob returned false');
if(all('SELECT id FROM render_jobs WHERE id=?',idA).length)throw new Error('render row was not deleted');
if(!all('SELECT id FROM render_jobs WHERE id=?',idB).length)throw new Error('unrelated tenant render was deleted');
try{await readFile(`output/${idA}.mp4`);throw new Error('render artifact was not deleted')}catch(e:any){if(e?.message==='render artifact was not deleted')throw e}
await rm(root,{recursive:true,force:true});
console.log('Render History delete/artifact isolation smoke OK');