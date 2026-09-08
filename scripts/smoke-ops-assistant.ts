import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'auto-media-ops-'));
process.env.DB_PATH=join(dir,'ops.sqlite');
process.env.RENDER_OUTPUT_DIR=join(dir,'output');
process.env.OPS_ASSISTANT_LLM_ENABLED='false';
process.env.PUBLISH_LIVE_ENABLED='false';
mkdirSync(process.env.RENDER_OUTPUT_DIR,{recursive:true});

try{
  const {run,all,db}=await import('../src/storage/db.js');
  const now=new Date().toISOString(),owner='ops-owner';
  run('INSERT INTO render_jobs(id,draft_id,owner_id,status,progress,error,created_at,updated_at,attempts,max_attempts) VALUES(?,?,?,?,?,?,?,?,?,?)','r-failed','d1',owner,'failed',0,'ffmpeg failed',now,now,1,3);
  run('INSERT INTO publish_jobs(id,owner_id,render_job_id,draft_id,platform,status,title,attempts,max_attempts,dry_run,deployment_test,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)','p-failed',owner,'r-failed','d1','youtube','failed','Smoke',1,3,1,0,now,now);
  const before={renders:Number(all<{n:number}>('SELECT COUNT(*) AS n FROM render_jobs WHERE owner_id=?',owner)[0]?.n||0),publishes:Number(all<{n:number}>('SELECT COUNT(*) AS n FROM publish_jobs WHERE owner_id=?',owner)[0]?.n||0)};
  const {answerOpsQuestion,opsAssistantStatus}=await import('../src/system/ops-assistant.js');
  const status=opsAssistantStatus();
  if(!status.readOnly||!status.noSideEffects||status.defaultMode!=='rules')throw new Error('ops assistant safety status mismatch');
  const stuck=await answerOpsQuestion(owner,'Có job nào đang kẹt hoặc failed không?');
  if(!stuck.readOnly||stuck.mode!=='rules'||stuck.intent!=='stuck-jobs')throw new Error('stuck job classification mismatch');
  if(!stuck.findings.some(x=>/failed/i.test(x)))throw new Error('failed jobs missing from answer');
  const youtube=await answerOpsQuestion(owner,'YouTube đã sẵn sàng LIVE chưa?');
  if(youtube.intent!=='youtube-live'||!youtube.readOnly)throw new Error('youtube readiness answer mismatch');
  const after={renders:Number(all<{n:number}>('SELECT COUNT(*) AS n FROM render_jobs WHERE owner_id=?',owner)[0]?.n||0),publishes:Number(all<{n:number}>('SELECT COUNT(*) AS n FROM publish_jobs WHERE owner_id=?',owner)[0]?.n||0)};
  if(before.renders!==after.renders||before.publishes!==after.publishes)throw new Error('ops assistant mutated queue state');
  let rejected=false;try{await answerOpsQuestion(owner,'x'.repeat(601))}catch{rejected=true}if(!rejected)throw new Error('question length guard failed');
  db.close();
  console.log('AI operations assistant read-only smoke OK');
}finally{rmSync(dir,{recursive:true,force:true})}
