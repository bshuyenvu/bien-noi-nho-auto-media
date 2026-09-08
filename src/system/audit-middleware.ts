import type { NextFunction, Request, Response } from 'express';
import { accessOf } from '../auth/access.js';
import { auditActor, recordAuditEvent } from './audit.js';

type Match={action:string;targetType:string;summary:(req:Request,body:any)=>string;targetId?:(req:Request,body:any)=>string|undefined;metadata?:(req:Request,body:any)=>unknown};

function match(req:Request):Match|undefined{
  const p=req.path,m=req.method.toUpperCase();
  if(m==='POST'&&p==='/admin/stable-control/pause')return{action:'render.pause',targetType:'render-queue',summary:()=>`Tạm dừng Render Queue`};
  if(m==='POST'&&p==='/admin/stable-control/resume')return{action:'render.resume',targetType:'render-queue',summary:()=>`Tiếp tục Render Queue`};
  if(m==='POST'&&p==='/admin/stable-control/cleanup')return{action:'render.cleanup',targetType:'render-output',summary:()=>`Dọn dẹp output render`};
  if(m==='POST'&&p==='/publish-deployment/youtube/private-test')return{action:'publish.private-test',targetType:'publish-job',targetId:(_q,b)=>b?.id,summary:()=>`Tạo YouTube Private Live Test`,metadata:(q,b)=>({renderJobId:q.body?.renderJobId,publishJobId:b?.id,forcedPrivacy:b?.forcedPrivacy})};
  if(m==='POST'&&p==='/publish-jobs')return{action:'publish.create',targetType:'publish-job',targetId:(_q,b)=>b?.id,summary:(q)=>`Tạo publish job ${String(q.body?.platform||'unknown')}${q.body?.dryRun===false?' LIVE':' dry-run'}`,metadata:(q,b)=>({publishJobId:b?.id,renderJobId:q.body?.renderJobId,platform:q.body?.platform,scheduledAt:q.body?.scheduledAt,dryRun:q.body?.dryRun!==false})};
  let x=p.match(/^\/publish-jobs\/([^/]+)\/retry$/);if(m==='POST'&&x)return{action:'publish.retry',targetType:'publish-job',targetId:()=>x![1],summary:()=>`Thử lại publish job ${x![1]}`};
  x=p.match(/^\/publish-jobs\/([^/]+)\/cancel$/);if(m==='POST'&&x)return{action:'publish.cancel',targetType:'publish-job',targetId:()=>x![1],summary:()=>`Hủy publish job ${x![1]}`};
  x=p.match(/^\/render-jobs\/([^/]+)\/retry$/);if(m==='POST'&&x)return{action:'render.retry',targetType:'render-job',targetId:()=>x![1],summary:()=>`Thử lại render job ${x![1]}`};
  return undefined;
}

export function auditMutationMiddleware(req:Request,res:Response,next:NextFunction){
  const spec=match(req);if(!spec)return next();
  let responseBody:any;
  const originalJson=res.json.bind(res);
  res.json=((body:any)=>{responseBody=body;return originalJson(body)}) as Response['json'];
  res.once('finish',()=>{
    if(res.statusCode<200||res.statusCode>=400)return;
    try{const access=accessOf(res);recordAuditEvent({ownerId:access.accountId,actor:auditActor(access),action:spec.action,targetType:spec.targetType,targetId:spec.targetId?.(req,responseBody),summary:spec.summary(req,responseBody),metadata:{httpStatus:res.statusCode,...((spec.metadata?.(req,responseBody) as Record<string,unknown>|undefined)||{})}})}catch(e){console.warn('[audit]',e instanceof Error?e.message:String(e))}
  });
  next();
}
