import { all, db, run } from '../storage/db.js';

export type UploadSessionState='active'|'completed'|'failed'|'needs_reconcile';

export interface YouTubeUploadSession{
  publishJobId:string;
  ownerId:string;
  sessionUri:string;
  filePath:string;
  fileSize:number;
  nextOffset:number;
  chunkSize:number;
  state:UploadSessionState;
  retryCount:number;
  lastHttpStatus?:number;
  lastAttemptAt?:string;
  remoteId?:string;
  remoteUrl?:string;
  createdAt:string;
  updatedAt:string;
}

type Row={publish_job_id:string;owner_id:string;session_uri:string;file_path:string;file_size:number;next_offset:number;chunk_size:number;state:UploadSessionState;retry_count:number;last_http_status?:number;last_attempt_at?:string;remote_id?:string;remote_url?:string;created_at:string;updated_at:string};

db.exec(`
CREATE TABLE IF NOT EXISTS youtube_upload_sessions (
  publish_job_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  session_uri TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  next_offset INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_http_status INTEGER,
  last_attempt_at TEXT,
  remote_id TEXT,
  remote_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_youtube_upload_sessions_owner_state ON youtube_upload_sessions(owner_id,state,updated_at DESC);
`);

function fromRow(r:Row):YouTubeUploadSession{return{
  publishJobId:r.publish_job_id,ownerId:r.owner_id,sessionUri:r.session_uri,filePath:r.file_path,fileSize:Number(r.file_size),nextOffset:Number(r.next_offset||0),chunkSize:Number(r.chunk_size),state:r.state,retryCount:Number(r.retry_count||0),lastHttpStatus:r.last_http_status==null?undefined:Number(r.last_http_status),lastAttemptAt:r.last_attempt_at||undefined,remoteId:r.remote_id||undefined,remoteUrl:r.remote_url||undefined,createdAt:r.created_at,updatedAt:r.updated_at,
}}

export function getYouTubeUploadSession(publishJobId:string,ownerId:string){const row=all<Row>('SELECT * FROM youtube_upload_sessions WHERE publish_job_id=? AND owner_id=? LIMIT 1',publishJobId,ownerId)[0];return row?fromRow(row):undefined}
export function listActiveYouTubeUploadSessions(){return all<Row>("SELECT * FROM youtube_upload_sessions WHERE state='active' ORDER BY updated_at ASC").map(fromRow)}

export function createYouTubeUploadSession(input:{publishJobId:string;ownerId:string;sessionUri:string;filePath:string;fileSize:number;chunkSize:number}){
  const now=new Date().toISOString();
  run(`INSERT INTO youtube_upload_sessions(publish_job_id,owner_id,session_uri,file_path,file_size,next_offset,chunk_size,state,retry_count,created_at,updated_at)
       VALUES(?,?,?,?,?,0,?,'active',0,?,?)
       ON CONFLICT(publish_job_id) DO UPDATE SET owner_id=excluded.owner_id,session_uri=excluded.session_uri,file_path=excluded.file_path,file_size=excluded.file_size,next_offset=0,chunk_size=excluded.chunk_size,state='active',retry_count=0,last_http_status=NULL,last_attempt_at=NULL,remote_id=NULL,remote_url=NULL,updated_at=excluded.updated_at`,input.publishJobId,input.ownerId,input.sessionUri,input.filePath,input.fileSize,input.chunkSize,now,now);
  return getYouTubeUploadSession(input.publishJobId,input.ownerId)!;
}

export function markYouTubeUploadAttempt(publishJobId:string,ownerId:string,httpStatus?:number){const now=new Date().toISOString();run('UPDATE youtube_upload_sessions SET last_attempt_at=?,last_http_status=COALESCE(?,last_http_status),updated_at=? WHERE publish_job_id=? AND owner_id=?',now,httpStatus??null,now,publishJobId,ownerId)}
export function updateYouTubeUploadProgress(publishJobId:string,ownerId:string,nextOffset:number,httpStatus?:number){const now=new Date().toISOString();run('UPDATE youtube_upload_sessions SET next_offset=?,last_http_status=?,updated_at=? WHERE publish_job_id=? AND owner_id=?',Math.max(0,Math.trunc(nextOffset)),httpStatus??null,now,publishJobId,ownerId);return getYouTubeUploadSession(publishJobId,ownerId)}
export function bumpYouTubeUploadRetry(publishJobId:string,ownerId:string,httpStatus?:number){const now=new Date().toISOString();run('UPDATE youtube_upload_sessions SET retry_count=retry_count+1,last_http_status=COALESCE(?,last_http_status),updated_at=? WHERE publish_job_id=? AND owner_id=?',httpStatus??null,now,publishJobId,ownerId);return getYouTubeUploadSession(publishJobId,ownerId)}
export function markYouTubeUploadCompleted(publishJobId:string,ownerId:string,remoteId:string,remoteUrl?:string){const now=new Date().toISOString();run("UPDATE youtube_upload_sessions SET state='completed',next_offset=file_size,remote_id=?,remote_url=?,last_http_status=201,updated_at=? WHERE publish_job_id=? AND owner_id=?",remoteId,remoteUrl||null,now,publishJobId,ownerId);return getYouTubeUploadSession(publishJobId,ownerId)}
export function markYouTubeUploadFailed(publishJobId:string,ownerId:string,httpStatus?:number){const now=new Date().toISOString();run("UPDATE youtube_upload_sessions SET state='failed',last_http_status=COALESCE(?,last_http_status),updated_at=? WHERE publish_job_id=? AND owner_id=?",httpStatus??null,now,publishJobId,ownerId);return getYouTubeUploadSession(publishJobId,ownerId)}
export function markYouTubeUploadNeedsReconcile(publishJobId:string,ownerId:string,httpStatus?:number){const now=new Date().toISOString();run("UPDATE youtube_upload_sessions SET state='needs_reconcile',last_http_status=COALESCE(?,last_http_status),updated_at=? WHERE publish_job_id=? AND owner_id=?",httpStatus??null,now,publishJobId,ownerId);return getYouTubeUploadSession(publishJobId,ownerId)}
export function resetYouTubeUploadSession(publishJobId:string,ownerId:string){return run('DELETE FROM youtube_upload_sessions WHERE publish_job_id=? AND owner_id=?',publishJobId,ownerId)}
