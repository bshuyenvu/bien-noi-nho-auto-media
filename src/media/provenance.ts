import { db,all,run } from '../storage/db.js';

export interface DraftMediaProvenance{url:string;sourceName?:string;sourceUrl?:string;kind:'image'|'video'}
type Row={draft_id:string;owner_id:string;url:string;source_name?:string;source_url?:string;media_kind:'image'|'video';created_at:string};
db.exec(`CREATE TABLE IF NOT EXISTS draft_media_provenance(
 draft_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 url TEXT NOT NULL,
 source_name TEXT,
 source_url TEXT,
 media_kind TEXT NOT NULL DEFAULT 'image',
 created_at TEXT NOT NULL,
 PRIMARY KEY(draft_id,url)
);CREATE INDEX IF NOT EXISTS idx_draft_media_provenance_owner ON draft_media_provenance(owner_id,draft_id);`);
function clean(v?:string,max=500){return String(v||'').replace(/\s+/g,' ').trim().slice(0,max)}
export function saveDraftMediaProvenance(draftId:string,ownerId:string,items:DraftMediaProvenance[]){
 const now=new Date().toISOString();run('DELETE FROM draft_media_provenance WHERE draft_id=? AND owner_id=?',draftId,ownerId);
 for(const item of items.slice(0,30)){const url=clean(item.url,2000);if(!url)continue;run('INSERT OR REPLACE INTO draft_media_provenance(draft_id,owner_id,url,source_name,source_url,media_kind,created_at) VALUES(?,?,?,?,?,?,?)',draftId,ownerId,url,clean(item.sourceName,160)||null,clean(item.sourceUrl,2000)||null,item.kind==='video'?'video':'image',now)}
 return getDraftMediaProvenance(draftId,ownerId)
}
export function getDraftMediaProvenance(draftId:string,ownerId:string):DraftMediaProvenance[]{return all<Row>('SELECT * FROM draft_media_provenance WHERE draft_id=? AND owner_id=? ORDER BY created_at,url',draftId,ownerId).map(x=>({url:x.url,sourceName:x.source_name||undefined,sourceUrl:x.source_url||undefined,kind:x.media_kind==='video'?'video':'image'}))}
export function mediaCredit(item?:DraftMediaProvenance){if(!item?.sourceName)return'';return`${item.kind==='video'?'Video':'Ảnh'}: ${clean(item.sourceName,80)}`}
