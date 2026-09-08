import { Router } from 'express';
import { z } from 'zod';
import { accessOf } from '../auth/access.js';
import { auditActor,recordAuditEvent } from '../system/audit.js';
import { getPublishJob,reconcilePublishJob } from './queue.js';

const ReconcilePayload=z.object({
  resolution:z.enum(['retry','cancel','published','failed']),
  note:z.string().max(700).optional(),
  remoteId:z.string().max(300).optional(),
  remoteUrl:z.string().url().max(2000).optional()
});

export const publishReconcileRouter=Router();
publishReconcileRouter.get('/publish-jobs/:id/reconcile',(req,res)=>{
  const ownerId=accessOf(res).accountId,id=String(req.params.id),job=getPublishJob(id,ownerId);
  if(!job)return res.status(404).json({error:'Không tìm thấy publish job'});
  return res.json({job,required:job.status==='needs_reconcile',warning:job.status==='needs_reconcile'?'Hãy kiểm tra nền tảng từ xa trước khi Retry. Upload có thể đã hoàn tất trước khi server dừng.':undefined});
});
publishReconcileRouter.post('/publish-jobs/:id/reconcile',(req,res)=>{
  const ownerId=accessOf(res).accountId,id=String(req.params.id),parsed=ReconcilePayload.safeParse(req.body||{});
  if(!parsed.success)return res.status(400).json({error:'Dữ liệu Reconcile không hợp lệ'});
  try{
    const access=accessOf(res),job=reconcilePublishJob(id,ownerId,parsed.data.resolution,{actor:access.accountId,note:parsed.data.note,remoteId:parsed.data.remoteId,remoteUrl:parsed.data.remoteUrl});
    if(!job)return res.status(404).json({error:'Không tìm thấy publish job'});
    recordAuditEvent({ownerId,actor:auditActor(access),action:`publish.reconcile.${parsed.data.resolution}`,targetType:'publish-job',targetId:id,summary:`Reconcile publish job → ${parsed.data.resolution}`,metadata:{platform:job.platform,status:job.status,renderJobId:job.renderJobId,remoteId:job.remoteId,noteLength:parsed.data.note?.length||0}});
    return res.json(job);
  }catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}
});
