import { Router } from 'express';
import { z } from 'zod';
import { deleteRssItem,deleteRssItems,deleteRssSource,rssSources,updateRssSource } from './manager.js';

export const rssAdminRouter=Router();

rssAdminRouter.put('/rss-sources/:id',(req,res)=>{
 const source=rssSources.find(x=>x.id===req.params.id);
 if(!source)return res.status(404).json({error:'Không tìm thấy nguồn RSS'});
 const p=z.object({name:z.string().trim().min(1).max(120).optional(),url:z.string().url().optional()}).refine(x=>Boolean(x.name||x.url),{message:'Không có dữ liệu thay đổi'}).safeParse(req.body||{});
 if(!p.success)return res.status(400).json({error:'Tên hoặc RSS URL không hợp lệ'});
 try{return res.json(updateRssSource(source.id,p.data))}catch(e){return res.status(422).json({error:e instanceof Error?e.message:String(e)})}
});

rssAdminRouter.delete('/rss-sources/:id',(req,res)=>{
 const deleteItems=String(req.query.deleteItems??'true')!=='false';
 if(!deleteRssSource(req.params.id,deleteItems))return res.status(404).json({error:'Không tìm thấy nguồn RSS'});
 return res.json({ok:true,id:req.params.id,deleteItems});
});

rssAdminRouter.delete('/rss-items/:id',(req,res)=>{
 if(!deleteRssItem(req.params.id))return res.status(404).json({error:'Không tìm thấy tin RSS'});
 return res.json({ok:true,id:req.params.id});
});

rssAdminRouter.post('/rss-items/delete',(req,res)=>{
 const p=z.object({ids:z.array(z.string().uuid()).max(300).optional(),sourceId:z.string().uuid().optional(),all:z.boolean().optional()}).safeParse(req.body||{});
 if(!p.success||(!p.data.all&&!p.data.sourceId&&!p.data.ids?.length))return res.status(400).json({error:'Chưa chọn tin RSS cần xóa'});
 const deleted=deleteRssItems(p.data);
 return res.json({ok:true,deleted});
});
