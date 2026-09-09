import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { all,run } from '../storage/db.js';
import { getReview } from '../review/store.js';

export type ArtifactState='valid'|'quarantined';
export interface RenderArtifactManifest{
  renderJobId:string;ownerId:string;draftId:string;outputPath:string;payloadSha256:string;approvalSha256:string;renderProfileSha256:string;
  outputSha256:string;outputSize:number;state:ArtifactState;quarantineReason?:string;createdAt:string;verifiedAt:string;updatedAt:string;
}
export interface ArtifactVerification{ok:boolean;reason?:string;manifest?:RenderArtifactManifest;checkedAt:string}

type ArtifactRow={render_job_id:string;owner_id:string;draft_id:string;output_path:string;payload_sha256:string;approval_sha256:string;render_profile_sha256:string;output_sha256:string;output_size:number;state:ArtifactState;quarantine_reason?:string;created_at:string;verified_at:string;updated_at:string};
type RenderRow={id:string;owner_id:string;draft_id:string;output?:string;payload_json?:string;status:string};
type LinkRow={id:string;render_job_id:string;publish_job_id:string;owner_id:string;platform:string;remote_id?:string;remote_url?:string;artifact_sha256:string;published_at:string;created_at:string};

for(const sql of[
`CREATE TABLE IF NOT EXISTS render_artifacts (
 render_job_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, draft_id TEXT NOT NULL, output_path TEXT NOT NULL,
 payload_sha256 TEXT NOT NULL, approval_sha256 TEXT NOT NULL, render_profile_sha256 TEXT NOT NULL,
 output_sha256 TEXT NOT NULL, output_size INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'valid', quarantine_reason TEXT,
 created_at TEXT NOT NULL, verified_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS artifact_publish_links (
 id TEXT PRIMARY KEY, render_job_id TEXT NOT NULL, publish_job_id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, platform TEXT NOT NULL,
 remote_id TEXT, remote_url TEXT, artifact_sha256 TEXT NOT NULL, published_at TEXT NOT NULL, created_at TEXT NOT NULL
)`,
'CREATE INDEX IF NOT EXISTS idx_render_artifacts_owner ON render_artifacts(owner_id,updated_at DESC)',
'CREATE INDEX IF NOT EXISTS idx_artifact_links_render ON artifact_publish_links(owner_id,render_job_id,created_at DESC)'
]){try{run(sql)}catch{}}

function stable(value:unknown):string{
 if(value===undefined)return'null';
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;
 return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
}
function shaText(value:unknown){return createHash('sha256').update(stable(value)).digest('hex')}
async function shaFile(path:string){const hash=createHash('sha256');let size=0;for await(const chunk of createReadStream(path)){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as any);size+=b.length;hash.update(b)}return{sha256:hash.digest('hex'),size}}
function fromRow(r:ArtifactRow):RenderArtifactManifest{return{renderJobId:r.render_job_id,ownerId:r.owner_id,draftId:r.draft_id,outputPath:r.output_path,payloadSha256:r.payload_sha256,approvalSha256:r.approval_sha256,renderProfileSha256:r.render_profile_sha256,outputSha256:r.output_sha256,outputSize:Number(r.output_size),state:r.state,quarantineReason:r.quarantine_reason||undefined,createdAt:r.created_at,verifiedAt:r.verified_at,updatedAt:r.updated_at}}
function rowFor(renderJobId:string,ownerId:string){return all<ArtifactRow>('SELECT * FROM render_artifacts WHERE render_job_id=? AND owner_id=? LIMIT 1',renderJobId,ownerId)[0]}
function renderFor(renderJobId:string,ownerId:string){return all<RenderRow>('SELECT id,owner_id,draft_id,output,payload_json,status FROM render_jobs WHERE id=? AND owner_id=? LIMIT 1',renderJobId,ownerId)[0]}
function quarantine(renderJobId:string,ownerId:string,reason:string){const now=new Date().toISOString();run("UPDATE render_artifacts SET state='quarantined',quarantine_reason=?,updated_at=? WHERE render_job_id=? AND owner_id=?",String(reason).slice(0,700),now,renderJobId,ownerId)}

export async function recordRenderArtifact(input:{renderJobId:string;ownerId:string;draftId:string;outputPath:string;payload:unknown}){
 const review=getReview(input.draftId,input.ownerId);
 if(!review.approvalCurrent||!review.approvalHash||!review.renderProfileHash)throw new Error('Không thể tạo Render Manifest: Review approval/profile evidence không còn hợp lệ');
 const file=await shaFile(input.outputPath),payloadSha=shaText(input.payload),now=new Date().toISOString(),existing=rowFor(input.renderJobId,input.ownerId);
 run(`INSERT INTO render_artifacts(render_job_id,owner_id,draft_id,output_path,payload_sha256,approval_sha256,render_profile_sha256,output_sha256,output_size,state,quarantine_reason,created_at,verified_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,'valid',NULL,?,?,?) ON CONFLICT(render_job_id) DO UPDATE SET owner_id=excluded.owner_id,draft_id=excluded.draft_id,output_path=excluded.output_path,payload_sha256=excluded.payload_sha256,approval_sha256=excluded.approval_sha256,render_profile_sha256=excluded.render_profile_sha256,output_sha256=excluded.output_sha256,output_size=excluded.output_size,state='valid',quarantine_reason=NULL,verified_at=excluded.verified_at,updated_at=excluded.updated_at`,input.renderJobId,input.ownerId,input.draftId,input.outputPath,payloadSha,review.approvalHash,review.renderProfileHash,file.sha256,file.size,existing?.created_at||now,now,now);
 return fromRow(rowFor(input.renderJobId,input.ownerId));
}

export async function ensureRenderArtifact(renderJobId:string,ownerId:string){
 const existing=rowFor(renderJobId,ownerId);if(existing)return fromRow(existing);
 const render=renderFor(renderJobId,ownerId);if(!render||render.status!=='ready'||!render.output)throw new Error('Render chưa sẵn sàng để tạo Artifact Manifest');
 let payload:unknown;try{payload=render.payload_json?JSON.parse(render.payload_json):null}catch{throw new Error('Render payload không hợp lệ; không thể tạo Artifact Manifest')}
 return recordRenderArtifact({renderJobId,ownerId,draftId:render.draft_id,outputPath:render.output,payload});
}

export async function verifyRenderArtifact(renderJobId:string,ownerId:string):Promise<ArtifactVerification>{
 const checkedAt=new Date().toISOString(),render=renderFor(renderJobId,ownerId),row=rowFor(renderJobId,ownerId);
 const fail=(reason:string)=>{if(row)quarantine(renderJobId,ownerId,reason);return{ok:false,reason,manifest:row?fromRow(row):undefined,checkedAt} satisfies ArtifactVerification};
 if(!render)return fail('render_job_missing');
 if(!row)return fail('manifest_missing');
 if(render.status!=='ready')return fail(`render_not_ready:${render.status}`);
 if(!render.output||render.output!==row.output_path)return fail('output_path_mismatch');
 const review=getReview(render.draft_id,ownerId);
 if(!review.approvalCurrent||!review.approvalHash)return fail('approval_stale');
 if(review.approvalHash!==row.approval_sha256)return fail('approval_hash_mismatch');
 if(!review.renderProfileHash||review.renderProfileHash!==row.render_profile_sha256)return fail('render_profile_hash_mismatch');
 let payload:unknown;try{payload=render.payload_json?JSON.parse(render.payload_json):null}catch{return fail('payload_json_invalid')}
 if(shaText(payload)!==row.payload_sha256)return fail('payload_hash_mismatch');
 try{const file=await shaFile(render.output);if(file.sha256!==row.output_sha256||file.size!==Number(row.output_size))return fail('output_file_hash_mismatch')}
 catch{return fail('output_file_unreadable')}
 const now=new Date().toISOString();run("UPDATE render_artifacts SET state='valid',quarantine_reason=NULL,verified_at=?,updated_at=? WHERE render_job_id=? AND owner_id=?",now,now,renderJobId,ownerId);
 return{ok:true,manifest:fromRow(rowFor(renderJobId,ownerId)),checkedAt:now};
}

export async function ensureAndVerifyRenderArtifact(renderJobId:string,ownerId:string){try{await ensureRenderArtifact(renderJobId,ownerId)}catch(e){return{ok:false,reason:e instanceof Error?e.message:String(e),checkedAt:new Date().toISOString()} satisfies ArtifactVerification}return verifyRenderArtifact(renderJobId,ownerId)}

export function recordArtifactPublishLink(input:{renderJobId:string;publishJobId:string;ownerId:string;platform:string;remoteId?:string;remoteUrl?:string;publishedAt:string}){
 const manifest=rowFor(input.renderJobId,input.ownerId);if(!manifest)throw new Error('Render Manifest missing while linking published artifact');
 const now=new Date().toISOString();run(`INSERT INTO artifact_publish_links(id,render_job_id,publish_job_id,owner_id,platform,remote_id,remote_url,artifact_sha256,published_at,created_at)
 VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(publish_job_id) DO UPDATE SET remote_id=excluded.remote_id,remote_url=excluded.remote_url,artifact_sha256=excluded.artifact_sha256,published_at=excluded.published_at`,randomUUID(),input.renderJobId,input.publishJobId,input.ownerId,input.platform,input.remoteId||null,input.remoteUrl||null,manifest.output_sha256,input.publishedAt,now);
}

export function artifactProvenance(renderJobId:string,ownerId:string){
 const manifest=rowFor(renderJobId,ownerId),render=all<any>('SELECT id,draft_id,status,output,created_at,updated_at FROM render_jobs WHERE id=? AND owner_id=? LIMIT 1',renderJobId,ownerId)[0];if(!render)return undefined;
 const draft=all<any>('SELECT id,title,source_url,source_name,format,status,created_at FROM drafts WHERE id=? AND owner_id=? LIMIT 1',render.draft_id,ownerId)[0];
 const review=getReview(render.draft_id,ownerId),links=all<LinkRow>('SELECT * FROM artifact_publish_links WHERE render_job_id=? AND owner_id=? ORDER BY created_at DESC',renderJobId,ownerId).map(x=>({id:x.id,publishJobId:x.publish_job_id,platform:x.platform,remoteId:x.remote_id||undefined,remoteUrl:x.remote_url||undefined,artifactSha256:x.artifact_sha256,publishedAt:x.published_at,createdAt:x.created_at}));
 return{render:{id:render.id,draftId:render.draft_id,status:render.status,output:render.output,createdAt:render.created_at,updatedAt:render.updated_at},draft:draft?{id:draft.id,title:draft.title,sourceUrl:draft.source_url||undefined,sourceName:draft.source_name||undefined,format:draft.format,status:draft.status,createdAt:draft.created_at}:undefined,review:{approvalCurrent:review.approvalCurrent,approvalHash:review.approvalHash,approvedBy:review.approvedBy,approvedAt:review.approvedAt,renderProfileHash:review.renderProfileHash},manifest:manifest?fromRow(manifest):undefined,publishes:links};
}
export function listArtifactProvenance(ownerId:string,limit=30){return all<ArtifactRow>('SELECT * FROM render_artifacts WHERE owner_id=? ORDER BY updated_at DESC LIMIT ?',ownerId,Math.max(1,Math.min(100,limit))).map(r=>({manifest:fromRow(r),publishes:all<LinkRow>('SELECT * FROM artifact_publish_links WHERE render_job_id=? AND owner_id=? ORDER BY created_at DESC',r.render_job_id,ownerId).map(x=>({publishJobId:x.publish_job_id,platform:x.platform,remoteId:x.remote_id||undefined,publishedAt:x.published_at}))}))}
export function artifactIntegritySnapshot(ownerId:string){
 const manifests=Number(all<{n:number}>('SELECT COUNT(*) n FROM render_artifacts WHERE owner_id=?',ownerId)[0]?.n||0),quarantined=Number(all<{n:number}>("SELECT COUNT(*) n FROM render_artifacts WHERE owner_id=? AND state='quarantined'",ownerId)[0]?.n||0),graceMs=Math.max(0,Number(process.env.ARTIFACT_MANIFEST_GRACE_MS||15000)),cutoff=new Date(Date.now()-graceMs).toISOString();
 const activeLiveMissing=Number(all<{n:number}>(`SELECT COUNT(*) n FROM publish_jobs p LEFT JOIN render_artifacts a ON a.render_job_id=p.render_job_id AND a.owner_id=p.owner_id WHERE p.owner_id=? AND p.dry_run=0 AND p.status IN ('pending','scheduled','publishing','needs_reconcile') AND p.created_at<=? AND a.render_job_id IS NULL`,ownerId,cutoff)[0]?.n||0);
 const activeLiveQuarantined=Number(all<{n:number}>(`SELECT COUNT(*) n FROM publish_jobs p JOIN render_artifacts a ON a.render_job_id=p.render_job_id AND a.owner_id=p.owner_id WHERE p.owner_id=? AND p.dry_run=0 AND p.status IN ('pending','scheduled','publishing','needs_reconcile') AND a.state!='valid'`,ownerId)[0]?.n||0);
 return{enabled:true,algorithm:'sha256',streamingHash:true,autoCapture:true,verifyBeforeProvider:true,graceMs,manifests,quarantined,activeLiveMissing,activeLiveQuarantined,activeLiveInvalid:activeLiveMissing+activeLiveQuarantined};
}
export function deleteRenderArtifact(renderJobId:string,ownerId?:string){if(ownerId){run('DELETE FROM artifact_publish_links WHERE render_job_id=? AND owner_id=?',renderJobId,ownerId);run('DELETE FROM render_artifacts WHERE render_job_id=? AND owner_id=?',renderJobId,ownerId)}else{run('DELETE FROM artifact_publish_links WHERE render_job_id=?',renderJobId);run('DELETE FROM render_artifacts WHERE render_job_id=?',renderJobId)}}

let captureBusy=false;
export async function captureReadyArtifactsOnce(){if(captureBusy)return{captured:0};captureBusy=true;let captured=0;try{const rows=all<RenderRow>(`SELECT r.id,r.owner_id,r.draft_id,r.output,r.payload_json,r.status FROM render_jobs r LEFT JOIN render_artifacts a ON a.render_job_id=r.id AND a.owner_id=r.owner_id WHERE r.status='ready' AND r.output IS NOT NULL AND a.render_job_id IS NULL ORDER BY r.updated_at DESC LIMIT 3`);for(const r of rows){try{let payload:unknown;try{payload=r.payload_json?JSON.parse(r.payload_json):null}catch{continue}await recordRenderArtifact({renderJobId:r.id,ownerId:r.owner_id,draftId:r.draft_id,outputPath:String(r.output),payload});captured++}catch(e){console.warn(`[artifact] auto-capture skipped ${r.id}: ${e instanceof Error?e.message:String(e)}`)}}return{captured}}finally{captureBusy=false}}
const watcherMs=Math.max(3000,Number(process.env.ARTIFACT_MANIFEST_POLL_MS||5000));
if(process.env.ARTIFACT_MANIFEST_WATCHER!=='false'){const timer=setInterval(()=>void captureReadyArtifactsOnce(),watcherMs);timer.unref();queueMicrotask(()=>void captureReadyArtifactsOnce())}
