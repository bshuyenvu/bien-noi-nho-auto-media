import { Router } from 'express';
import { accessOf, requireAdmin } from '../auth/access.js';
import { auditActor, auditStats, listAuditEvents, recordAuditEvent } from './audit.js';

export const auditRouter=Router();

function limitOf(value:unknown){const n=Number(value);return Number.isFinite(n)?Math.max(1,Math.min(200,Math.round(n))):80}

auditRouter.get('/admin/audit',requireAdmin,(req,res)=>{
  const access=accessOf(res),items=listAuditEvents(access.accountId,limitOf(req.query.limit));
  return res.json({items,stats:auditStats(access.accountId),operator:true});
});

auditRouter.post('/admin/audit/deploy',requireAdmin,(req,res)=>{
  const access=accessOf(res),revision=String(req.body?.revision||'').trim(),previousRevision=String(req.body?.previousRevision||'').trim(),status=String(req.body?.status||'success').trim();
  if(!revision)return res.status(400).json({error:'revision là bắt buộc'});
  const event=recordAuditEvent({ownerId:'system',actor:auditActor(access),action:status==='rollback'?'deploy.rollback':'deploy.success',targetType:'deployment',targetId:revision,summary:status==='rollback'?`Rollback production về ${revision.slice(0,12)}`:`Deploy production ${revision.slice(0,12)} thành công`,metadata:{revision,previousRevision:previousRevision||undefined,status}});
  return res.status(201).json({ok:true,...event});
});
