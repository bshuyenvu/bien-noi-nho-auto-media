import { Router } from 'express';
import { z } from 'zod';
import { accessOf } from '../auth/access.js';
import { all } from '../storage/db.js';
import { contentSafetyStats,evaluateContentSafety } from './content-safety.js';

export const contentSafetyRouter=Router();
type RenderRow={id:string;draft_id:string;owner_id:string};
contentSafetyRouter.get('/admin/content-safety',(_req,res)=>{const ownerId=accessOf(res).accountId;return res.json(contentSafetyStats(ownerId))});
contentSafetyRouter.post('/admin/content-safety/preflight',(req,res)=>{
  const p=z.object({renderJobId:z.string().min(1).max(200),title:z.string().max(180).optional()}).safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Cần renderJobId hợp lệ'});
  const ownerId=accessOf(res).accountId,render=all<RenderRow>('SELECT id,draft_id,owner_id FROM render_jobs WHERE id=? AND owner_id=? LIMIT 1',p.data.renderJobId,ownerId)[0];if(!render)return res.status(404).json({error:'Không tìm thấy render job'});
  try{return res.json(evaluateContentSafety({ownerId,draftId:render.draft_id,renderJobId:render.id,publishTitle:p.data.title}))}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}
});
