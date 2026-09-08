import { Router } from 'express';
import { z } from 'zod';
import { deleteRssItem,deleteRssItems,deleteRssSource,rssItems,rssSources,setRssSourceLock,updateRssSource } from './manager.js';
import { all,run } from '../storage/db.js';
import { deleteRenderJob,deleteRenderJobs,deleteRenderJobsForDraft,renderJobs } from '../video/job.js';
import { deleteReview } from '../review/store.js';
import { deleteQueueItem } from '../queue/production.js';
import { curateTrustedRss,trustedRssCatalog } from './curator.js';
import { accessOf,requireAdmin } from '../auth/access.js';

export const rssAdminRouter=Router();

rssAdminRouter.put('/rss-sources/:id',(req,res)=>{
 const source=rssSources.find(x=>x.id===req.params.id&&x.ownerId===accessOf(res).accountId);
 if(!source)return res.status(404).json({error:'Không tìm thấy nguồn RSS'});
 const p=z.object({name:z.string().trim().min(1).max(120).optional(),url:z.string().url().optional()}).refine(x=>Boolean(x.name||x.url),{message:'Không có dữ liệu thay đổi'}).safeParse(req.body||{});
 if(!p.success)return res.status(400).json({error:'Tên hoặc RSS URL không hợp lệ'});
 try{return res.json(updateRssSource(source.id,p.data))}catch(e){return res.status(422).json({error:e instanceof Error?e.message:String(e)})}
});

rssAdminRouter.put('/rss-sources/:id/lock',(req,res)=>{const p=z.object({locked:z.boolean()}).safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Trạng thái khóa không hợp lệ'});if(!rssSources.some(x=>x.id===req.params.id&&x.ownerId===accessOf(res).accountId))return res.status(404).json({error:'Không tìm thấy nguồn RSS'});const source=setRssSourceLock(req.params.id,p.data.locked);if(!source)return res.status(404).json({error:'Không tìm thấy nguồn RSS'});return res.json(source)});
rssAdminRouter.post('/rss-sources/curate',requireAdmin,(_req,res)=>res.json({...curateTrustedRss(accessOf(res).accountId),catalog:trustedRssCatalog.length}));

rssAdminRouter.delete('/rss-sources/:id',(req,res)=>{
 const source=rssSources.find(x=>x.id===req.params.id&&x.ownerId===accessOf(res).accountId);if(!source)return res.status(404).json({error:'Không tìm thấy nguồn RSS'});
 const deleteItems=String(req.query.deleteItems??'true')!=='false';
 if(!deleteRssSource(req.params.id,deleteItems))return res.status(404).json({error:'Không tìm thấy nguồn RSS'});
 return res.json({ok:true,id:req.params.id,deleteItems});
});

rssAdminRouter.delete('/rss-items/:id',(req,res)=>{
 if(!rssItems.some(x=>x.id===req.params.id&&x.ownerId===accessOf(res).accountId))return res.status(404).json({error:'Không tìm thấy tin RSS'});
 if(!deleteRssItem(req.params.id))return res.status(404).json({error:'Không tìm thấy tin RSS'});
 return res.json({ok:true,id:req.params.id});
});

rssAdminRouter.post('/rss-items/delete',(req,res)=>{
 const p=z.object({ids:z.array(z.string().uuid()).max(300).optional(),sourceId:z.string().uuid().optional(),all:z.boolean().optional()}).safeParse(req.body||{});
 if(!p.success||(!p.data.all&&!p.data.sourceId&&!p.data.ids?.length))return res.status(400).json({error:'Chưa chọn tin RSS cần xóa'});
 const deleted=deleteRssItems({...p.data,ownerId:accessOf(res).accountId});
 return res.json({ok:true,deleted});
});

type DraftAdminRow={id:string;owner_id:string;title:string;body:string;source_url?:string;source_name?:string;image_url?:string;format:string;status:string;created_at:string};
rssAdminRouter.get('/content/drafts',(_req,res)=>{const rows=all<DraftAdminRow>('SELECT * FROM drafts WHERE owner_id=? ORDER BY created_at DESC',accessOf(res).accountId);return res.json(rows.map(r=>({id:r.id,title:r.title,body:r.body,sourceUrl:r.source_url||undefined,sourceName:r.source_name||undefined,imageUrl:r.image_url||undefined,format:r.format,status:r.status,createdAt:r.created_at})))});
rssAdminRouter.delete('/content/drafts/:id',async(req,res)=>{const ownerId=accessOf(res).accountId,found=all<{id:string}>('SELECT id FROM drafts WHERE id=? AND owner_id=?',req.params.id,ownerId)[0];if(!found)return res.status(404).json({error:'Không tìm thấy bản tin'});await deleteRenderJobsForDraft(req.params.id);run('DELETE FROM drafts WHERE id=? AND owner_id=?',req.params.id,ownerId);deleteReview(req.params.id);deleteQueueItem(req.params.id);return res.json({ok:true,id:req.params.id})});
rssAdminRouter.delete('/render-jobs/:id',async(req,res)=>{const ownerId=accessOf(res).accountId;if(!renderJobs.some(x=>x.id===req.params.id&&x.ownerId===ownerId)||!await deleteRenderJob(req.params.id))return res.status(404).json({error:'Không tìm thấy tác vụ render'});return res.json({ok:true,id:req.params.id})});
rssAdminRouter.post('/render-jobs/delete',async(req,res)=>{const p=z.object({ids:z.array(z.string().uuid()).max(200).optional(),status:z.enum(['failed','ready','all']).optional()}).safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Dữ liệu xóa render không hợp lệ'});const ownerId=accessOf(res).accountId;let ids=(p.data.ids||[]).filter(id=>renderJobs.some(j=>j.id===id&&j.ownerId===ownerId));if(p.data.status)ids=renderJobs.filter(j=>j.ownerId===ownerId&&(p.data.status==='all'||j.status===p.data.status)).map(j=>j.id);const deleted=ids.length?await deleteRenderJobs(ids):0;return res.json({ok:true,deleted})});
