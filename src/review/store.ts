import { createHash, randomUUID } from 'node:crypto';
import { all,run } from '../storage/db.js';

export type ReviewStatus='needs_review'|'needs_fix'|'approved'|'ready';
export interface ReviewLocks{script:boolean;media:boolean;voice:boolean;scenes:boolean}
export interface ReviewState{
  draftId:string;ownerId:string;status:ReviewStatus;locks:ReviewLocks;updatedAt:string;
  contentHash?:string;approvalHash?:string;approvalCurrent:boolean;approvedAt?:string;approvedBy?:string;
  renderProfileHash?:string;renderProfileBoundAt?:string;invalidatedAt?:string;invalidationReason?:string;
}
export interface ReviewEvent{id:string;draftId:string;ownerId:string;action:string;status:ReviewStatus;actor:string;reason?:string;contentHash?:string;approvalHash?:string;renderProfileHash?:string;locks:ReviewLocks;createdAt:string}

type DraftRow={id:string;owner_id?:string;title:string;body:string;source_url?:string;source_name?:string;image_url?:string;format:string;status:string};
type ReviewRow={draft_id:string;owner_id:string;status:ReviewStatus;script_locked:number;media_locked:number;voice_locked:number;scenes_locked:number;content_hash?:string;approval_hash?:string;approved_at?:string;approved_by?:string;render_profile_hash?:string;render_profile_bound_at?:string;invalidated_at?:string;invalidation_reason?:string;updated_at:string};
type EventRow={id:string;draft_id:string;owner_id:string;action:string;status:ReviewStatus;actor:string;reason?:string;content_hash?:string;approval_hash?:string;render_profile_hash?:string;locks_json:string;created_at:string};

for(const sql of[
`CREATE TABLE IF NOT EXISTS review_states (
  draft_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, status TEXT NOT NULL,
  script_locked INTEGER NOT NULL DEFAULT 0, media_locked INTEGER NOT NULL DEFAULT 0, voice_locked INTEGER NOT NULL DEFAULT 0, scenes_locked INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT, approval_hash TEXT, approved_at TEXT, approved_by TEXT,
  render_profile_hash TEXT, render_profile_bound_at TEXT, invalidated_at TEXT, invalidation_reason TEXT, updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, owner_id TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, actor TEXT NOT NULL,
  reason TEXT, content_hash TEXT, approval_hash TEXT, render_profile_hash TEXT, locks_json TEXT NOT NULL, created_at TEXT NOT NULL
)`,
'CREATE INDEX IF NOT EXISTS idx_review_states_owner ON review_states(owner_id,updated_at DESC)',
'CREATE INDEX IF NOT EXISTS idx_review_events_draft ON review_events(owner_id,draft_id,created_at DESC)'
]){try{run(sql)}catch{}}

const emptyLocks=():ReviewLocks=>({script:false,media:false,voice:false,scenes:false});
function sha(value:string){return createHash('sha256').update(value).digest('hex')}
function stable(value:unknown):string{if(value===undefined)return'null';if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`}
function draftRow(draftId:string,ownerId?:string){const sql='SELECT id,owner_id,title,body,source_url,source_name,image_url,format,status FROM drafts WHERE id=?'+(ownerId?' AND owner_id=?':'')+' LIMIT 1';return ownerId?all<DraftRow>(sql,draftId,ownerId)[0]:all<DraftRow>(sql,draftId)[0]}
function draftHash(row:DraftRow|undefined){return row?sha(stable({title:row.title,body:row.body,sourceUrl:row.source_url||null,sourceName:row.source_name||null,imageUrl:row.image_url||null,format:row.format})):undefined}
function locksFromRow(r:ReviewRow):ReviewLocks{return{script:Boolean(r.script_locked),media:Boolean(r.media_locked),voice:Boolean(r.voice_locked),scenes:Boolean(r.scenes_locked)}}
function stateFromRow(r:ReviewRow,currentHash?:string):ReviewState{const locks=locksFromRow(r),approvalCurrent=Boolean(r.approval_hash&&currentHash&&r.approval_hash===currentHash&&(r.status==='approved'||r.status==='ready')&&Object.values(locks).every(Boolean));return{draftId:r.draft_id,ownerId:r.owner_id,status:r.status,locks,updatedAt:r.updated_at,contentHash:currentHash||r.content_hash||undefined,approvalHash:r.approval_hash||undefined,approvalCurrent,approvedAt:r.approved_at||undefined,approvedBy:r.approved_by||undefined,renderProfileHash:r.render_profile_hash||undefined,renderProfileBoundAt:r.render_profile_bound_at||undefined,invalidatedAt:r.invalidated_at||undefined,invalidationReason:r.invalidation_reason||undefined}}
function writeEvent(input:{draftId:string;ownerId:string;action:string;status:ReviewStatus;actor:string;reason?:string;contentHash?:string;approvalHash?:string;renderProfileHash?:string;locks:ReviewLocks}){const now=new Date().toISOString();run('INSERT INTO review_events(id,draft_id,owner_id,action,status,actor,reason,content_hash,approval_hash,render_profile_hash,locks_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),input.draftId,input.ownerId,input.action,input.status,input.actor,input.reason||null,input.contentHash||null,input.approvalHash||null,input.renderProfileHash||null,JSON.stringify(input.locks),now)}
function currentRow(draftId:string,ownerId?:string){return ownerId?all<ReviewRow>('SELECT * FROM review_states WHERE draft_id=? AND owner_id=? LIMIT 1',draftId,ownerId)[0]:all<ReviewRow>('SELECT * FROM review_states WHERE draft_id=? LIMIT 1',draftId)[0]}
function createNeedsReviewState(draft:DraftRow,owner:string,currentHash:string|undefined,reason:string,actor:string){const now=new Date().toISOString(),locks=emptyLocks();run(`INSERT INTO review_states(draft_id,owner_id,status,script_locked,media_locked,voice_locked,scenes_locked,content_hash,approval_hash,approved_at,approved_by,render_profile_hash,render_profile_bound_at,invalidated_at,invalidation_reason,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(draft_id) DO UPDATE SET owner_id=excluded.owner_id,status='needs_review',script_locked=0,media_locked=0,voice_locked=0,scenes_locked=0,content_hash=excluded.content_hash,approval_hash=NULL,approved_at=NULL,approved_by=NULL,render_profile_hash=NULL,render_profile_bound_at=NULL,invalidated_at=excluded.invalidated_at,invalidation_reason=excluded.invalidation_reason,updated_at=excluded.updated_at`,draft.id,owner,'needs_review',0,0,0,0,currentHash||null,null,null,null,null,null,now,reason,now);writeEvent({draftId:draft.id,ownerId:owner,action:'legacy_recovery_blocked',status:'needs_review',actor,reason,contentHash:currentHash,locks});return getReview(draft.id,owner,{skipIntegrity:true})}

export function invalidateReview(draftId:string,ownerId?:string,reason='content_changed',actor='system:review-integrity'){
  const draft=draftRow(draftId,ownerId),owner=draft?.owner_id||ownerId||'legacy-admin',row=currentRow(draftId,owner);if(!row)return undefined;
  const now=new Date().toISOString(),currentHash=draftHash(draft),locks=emptyLocks();
  run("UPDATE review_states SET status='needs_review',script_locked=0,media_locked=0,voice_locked=0,scenes_locked=0,content_hash=?,approval_hash=NULL,approved_at=NULL,approved_by=NULL,render_profile_hash=NULL,render_profile_bound_at=NULL,invalidated_at=?,invalidation_reason=?,updated_at=? WHERE draft_id=? AND owner_id=?",currentHash||null,now,String(reason).slice(0,300),now,draftId,owner);
  writeEvent({draftId,ownerId:owner,action:'invalidated',status:'needs_review',actor,reason,contentHash:currentHash,locks});
  return getReview(draftId,owner,{skipIntegrity:true});
}

export function getReview(draftId:string,ownerId?:string,opts:{skipIntegrity?:boolean}={}):ReviewState{
  const draft=draftRow(draftId,ownerId),owner=draft?.owner_id||ownerId||'legacy-admin',currentHash=draftHash(draft),row=currentRow(draftId,owner);
  if(!row)return{draftId,ownerId:owner,status:'needs_review',locks:emptyLocks(),updatedAt:new Date().toISOString(),contentHash:currentHash,approvalCurrent:false};
  if(!opts.skipIntegrity&&(row.status==='approved'||row.status==='ready')&&(!row.approval_hash||!currentHash||row.approval_hash!==currentHash))return invalidateReview(draftId,owner,'draft_content_changed','system:review-integrity')||stateFromRow(row,currentHash);
  return stateFromRow(row,currentHash);
}

export function setReview(draftId:string,input:{status:ReviewStatus;locks:ReviewLocks},meta:{ownerId?:string;actor?:string;reason?:string}={}){
  const draft=draftRow(draftId,meta.ownerId);if(!draft)throw new Error('Draft not found for review');const owner=draft.owner_id||meta.ownerId||'legacy-admin',currentHash=draftHash(draft),existing=currentRow(draftId,owner),allLocked=Object.values(input.locks).every(Boolean),requestedApproved=(input.status==='approved'||input.status==='ready')&&allLocked;
  const looksLikeBootRecovery=!meta.actor&&requestedApproved&&(draft.status==='approved'||draft.status==='ready');
  if(looksLikeBootRecovery){
    if(existing?.approval_hash&&existing.approval_hash===currentHash&&(existing.status==='approved'||existing.status==='ready'))return getReview(draftId,owner,{skipIntegrity:true});
    if(existing)return invalidateReview(draftId,owner,'legacy_boot_recovery_without_matching_approval','system:review-integrity')||getReview(draftId,owner,{skipIntegrity:true});
    return createNeedsReviewState(draft,owner,currentHash,'legacy_boot_recovery_without_durable_approval','system:review-integrity');
  }
  const now=new Date().toISOString(),actor=String(meta.actor||owner).slice(0,200),approved=requestedApproved,status:ReviewStatus=(input.status==='approved'||input.status==='ready')&&!allLocked?'needs_review':input.status;
  const approvalHash=approved?currentHash:undefined,approvedAt=approved?now:undefined,approvedBy=approved?actor:undefined;
  run(`INSERT INTO review_states(draft_id,owner_id,status,script_locked,media_locked,voice_locked,scenes_locked,content_hash,approval_hash,approved_at,approved_by,render_profile_hash,render_profile_bound_at,invalidated_at,invalidation_reason,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(draft_id) DO UPDATE SET owner_id=excluded.owner_id,status=excluded.status,script_locked=excluded.script_locked,media_locked=excluded.media_locked,voice_locked=excluded.voice_locked,scenes_locked=excluded.scenes_locked,content_hash=excluded.content_hash,approval_hash=excluded.approval_hash,approved_at=excluded.approved_at,approved_by=excluded.approved_by,render_profile_hash=NULL,render_profile_bound_at=NULL,invalidated_at=NULL,invalidation_reason=NULL,updated_at=excluded.updated_at`,draftId,owner,status,input.locks.script?1:0,input.locks.media?1:0,input.locks.voice?1:0,input.locks.scenes?1:0,currentHash||null,approvalHash||null,approvedAt||null,approvedBy||null,null,null,null,null,now);
  writeEvent({draftId,ownerId:owner,action:approved?'approved':'review_updated',status,actor,reason:meta.reason,contentHash:currentHash,approvalHash,locks:input.locks});
  return getReview(draftId,owner,{skipIntegrity:true});
}

export function canRender(draftId:string,ownerId?:string){const x=getReview(draftId,ownerId);return Boolean(x.approvalCurrent&&(x.status==='approved'||x.status==='ready')&&Object.values(x.locks).every(Boolean))}

export function bindReviewRenderProfile(draftId:string,ownerId:string,profile:unknown,actor='system:render'){
  const review=getReview(draftId,ownerId);if(!review.approvalCurrent)throw new Error('Review approval không còn hợp lệ; cần duyệt lại trước khi render');
  const row=currentRow(draftId,ownerId);if(!row)throw new Error('Review state not found');const profileHash=sha(stable(profile));
  if(row.render_profile_hash&&row.render_profile_hash!==profileHash){invalidateReview(draftId,ownerId,'render_profile_changed',actor);throw new Error('Cấu hình render/media/voice/scene đã thay đổi sau approval; cần duyệt lại')}
  if(!row.render_profile_hash){const now=new Date().toISOString();run('UPDATE review_states SET render_profile_hash=?,render_profile_bound_at=?,updated_at=? WHERE draft_id=? AND owner_id=?',profileHash,now,now,draftId,ownerId);writeEvent({draftId,ownerId,action:'render_profile_bound',status:review.status,actor,contentHash:review.contentHash,approvalHash:review.approvalHash,renderProfileHash:profileHash,locks:review.locks})}
  return getReview(draftId,ownerId,{skipIntegrity:true});
}

export function listReviewEvents(draftId:string,ownerId:string,limit=20):ReviewEvent[]{return all<EventRow>('SELECT * FROM review_events WHERE draft_id=? AND owner_id=? ORDER BY created_at DESC LIMIT ?',draftId,ownerId,Math.max(1,Math.min(100,limit))).map(r=>{let locks=emptyLocks();try{locks={...locks,...JSON.parse(r.locks_json)}}catch{}return{id:r.id,draftId:r.draft_id,ownerId:r.owner_id,action:r.action,status:r.status,actor:r.actor,reason:r.reason||undefined,contentHash:r.content_hash||undefined,approvalHash:r.approval_hash||undefined,renderProfileHash:r.render_profile_hash||undefined,locks,createdAt:r.created_at}})}
export function deleteReview(draftId:string){run('DELETE FROM review_states WHERE draft_id=?',draftId);return true}
