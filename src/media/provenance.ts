import { db,all,run } from '../storage/db.js';
import type { MediaRights } from '../compliance/copyright.js';

export interface DraftMediaProvenance{
 url:string;sourceName?:string;sourceUrl?:string;kind:'image'|'video';
 rights?:MediaRights;creator?:string;licenseUrl?:string;rightsVerified?:boolean;
 sceneIndex?:number;sceneQuery?:string;sortOrder?:number;
}
type Row={draft_id:string;owner_id:string;url:string;source_name?:string;source_url?:string;media_kind:'image'|'video';created_at:string;rights?:MediaRights;creator?:string;license_url?:string;rights_verified?:number;scene_index?:number;scene_query?:string;sort_order?:number};
db.exec(`CREATE TABLE IF NOT EXISTS draft_media_provenance(
 draft_id TEXT NOT NULL, owner_id TEXT NOT NULL, url TEXT NOT NULL,
 source_name TEXT, source_url TEXT, media_kind TEXT NOT NULL DEFAULT 'image',
 created_at TEXT NOT NULL, rights TEXT, creator TEXT, license_url TEXT,
 rights_verified INTEGER NOT NULL DEFAULT 0, scene_index INTEGER, scene_query TEXT, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(draft_id,url)
);CREATE INDEX IF NOT EXISTS idx_draft_media_provenance_owner ON draft_media_provenance(owner_id,draft_id);`);
for(const sql of ['ALTER TABLE draft_media_provenance ADD COLUMN rights TEXT','ALTER TABLE draft_media_provenance ADD COLUMN creator TEXT','ALTER TABLE draft_media_provenance ADD COLUMN license_url TEXT','ALTER TABLE draft_media_provenance ADD COLUMN rights_verified INTEGER NOT NULL DEFAULT 0','ALTER TABLE draft_media_provenance ADD COLUMN scene_index INTEGER','ALTER TABLE draft_media_provenance ADD COLUMN scene_query TEXT','ALTER TABLE draft_media_provenance ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0'])try{db.exec(sql)}catch{}
function clean(v?:string,max=500){return String(v||'').replace(/\s+/g,' ').trim().slice(0,max)}
export function saveDraftMediaProvenance(draftId:string,ownerId:string,items:DraftMediaProvenance[]){
 const now=new Date().toISOString();run('DELETE FROM draft_media_provenance WHERE draft_id=? AND owner_id=?',draftId,ownerId);
 for(const [index,item] of items.slice(0,30).entries()){
  const url=clean(item.url,2000);if(!url)continue;
  run('INSERT OR REPLACE INTO draft_media_provenance(draft_id,owner_id,url,source_name,source_url,media_kind,created_at,rights,creator,license_url,rights_verified,scene_index,scene_query,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',draftId,ownerId,url,clean(item.sourceName,160)||null,clean(item.sourceUrl,2000)||null,item.kind==='video'?'video':'image',now,item.rights||'unverified',clean(item.creator,160)||null,clean(item.licenseUrl,2000)||null,item.rightsVerified===true?1:0,Number.isInteger(item.sceneIndex)?item.sceneIndex:null,clean(item.sceneQuery,240)||null,Number.isInteger(item.sortOrder)?item.sortOrder:index);
 }
 return getDraftMediaProvenance(draftId,ownerId)
}
export function getDraftMediaProvenance(draftId:string,ownerId:string):DraftMediaProvenance[]{return all<Row>('SELECT * FROM draft_media_provenance WHERE draft_id=? AND owner_id=? ORDER BY sort_order,created_at,url',draftId,ownerId).map(x=>({url:x.url,sourceName:x.source_name||undefined,sourceUrl:x.source_url||undefined,kind:x.media_kind==='video'?'video':'image',rights:x.rights||'unverified',creator:x.creator||undefined,licenseUrl:x.license_url||undefined,rightsVerified:x.rights_verified===1,sceneIndex:Number.isInteger(x.scene_index)?x.scene_index:undefined,sceneQuery:x.scene_query||undefined,sortOrder:Number.isInteger(x.sort_order)?x.sort_order:undefined}))}
export function mediaCredit(item?:DraftMediaProvenance){
 if(!item)return'';const who=clean(item.creator||item.sourceName,80);const rights=item.rights&&item.rights!=='owned'&&item.rights!=='generated'&&item.rights!=='unverified'?` • ${item.rights.toUpperCase()}`:'';
 return who?`${item.kind==='video'?'Video':'Ảnh'}: ${who}${rights}`:'';
}
