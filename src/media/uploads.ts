import { createHash,randomUUID } from 'node:crypto';
import { mkdir,rm,writeFile } from 'node:fs/promises';
import { extname,join } from 'node:path';
import { all,db,run } from '../storage/db.js';

export type UploadedMediaKind='image'|'video';
export interface UploadedMedia{id:string;ownerId:string;kind:UploadedMediaKind;name:string;mime:string;path:string;size:number;rightsConfirmed:boolean;createdAt:string}

db.exec(`CREATE TABLE IF NOT EXISTS uploaded_media(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,
 path TEXT NOT NULL,size INTEGER NOT NULL,rights_confirmed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_uploaded_media_owner ON uploaded_media(owner_id,created_at DESC)`);

const root=process.env.UPLOAD_MEDIA_DIR||'data/uploads';
const safeOwner=(ownerId:string)=>createHash('sha256').update(ownerId).digest('hex').slice(0,20);
function extFor(mime:string,name:string){if(mime==='video/mp4')return'.mp4';if(mime==='video/webm')return'.webm';if(mime==='image/jpeg')return'.jpg';if(mime==='image/png')return'.png';if(mime==='image/webp')return'.webp';const ext=extname(name).toLowerCase();return['.mp4','.webm','.jpg','.jpeg','.png','.webp'].includes(ext)?ext:''}
function kindFor(mime:string):UploadedMediaKind|undefined{return mime.startsWith('video/')?'video':mime.startsWith('image/')?'image':undefined}
export function listUploadedMedia(ownerId:string){return all<any>('SELECT * FROM uploaded_media WHERE owner_id=? ORDER BY created_at DESC LIMIT 40',ownerId).map(row=>({id:row.id,ownerId:row.owner_id,kind:row.kind,name:row.name,mime:row.mime,path:row.path,size:Number(row.size),rightsConfirmed:Boolean(row.rights_confirmed),createdAt:row.created_at}) as UploadedMedia)}
export function getUploadedMedia(ownerId:string,id:string){return listUploadedMedia(ownerId).find(x=>x.id===id)}
export async function saveUploadedMedia(input:{ownerId:string;name:string;mime:string;bytes:Buffer;rightsConfirmed:boolean}){
 const kind=kindFor(input.mime),ext=extFor(input.mime,input.name);if(!kind||!ext)throw new Error('Chỉ hỗ trợ JPG/PNG/WebP hoặc MP4/WebM.');
 const max=kind==='video'?120_000_000:15_000_000;if(!input.bytes.length||input.bytes.length>max)throw new Error(kind==='video'?'Video tối đa 120 MB.':'Ảnh tối đa 15 MB.');
 if(!input.rightsConfirmed)throw new Error('Cần xác nhận quyền sử dụng media trước khi upload.');
 const id=randomUUID(),dir=join(root,safeOwner(input.ownerId));await mkdir(dir,{recursive:true});const path=join(dir,id+ext);await writeFile(path,input.bytes);const createdAt=new Date().toISOString();
 run('INSERT INTO uploaded_media(id,owner_id,kind,name,mime,path,size,rights_confirmed,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,input.ownerId,kind,input.name.slice(0,180),input.mime,path,input.bytes.length,1,createdAt);
 return{id,ownerId:input.ownerId,kind,name:input.name.slice(0,180),mime:input.mime,path,size:input.bytes.length,rightsConfirmed:true,createdAt} satisfies UploadedMedia;
}
export async function deleteUploadedMedia(ownerId:string,id:string){const item=getUploadedMedia(ownerId,id);if(!item)return false;await rm(item.path,{force:true}).catch(()=>undefined);run('DELETE FROM uploaded_media WHERE id=? AND owner_id=?',id,ownerId);return true}
export function resolveUploadedMedia(ownerId:string,ids:string[]){const wanted=new Set(ids),items=listUploadedMedia(ownerId).filter(x=>wanted.has(x.id)&&x.rightsConfirmed);return ids.map(id=>items.find(x=>x.id===id)).filter((x):x is UploadedMedia=>Boolean(x))}
