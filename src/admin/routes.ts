import { Router } from 'express';
import { readdir, rm } from 'node:fs/promises';
import { canRender, deleteReview } from '../review/store.js';
import { deleteQueueItem, ensureQueueItem, setQueueStatus, syncRenderJobs } from '../queue/production.js';
import { pauseRenderQueue, renderJobs, renderWorkerStatus, resumeRenderQueue, type RenderJob } from '../video/job.js';
import { run } from '../storage/db.js';
import { accessOf } from '../auth/access.js';

export interface AdminDraft {
  id:string;
  ownerId:string;
  title:string;
  status:'draft'|'approved'|'rendering'|'ready'|'failed';
}

function latestJob(draftId:string){return renderJobs.find(j=>j.draftId===draftId)}
function draftStatusFromJob(job?:RenderJob){if(!job)return undefined;if(job.status==='queued'||job.status==='rendering')return 'rendering' as const;if(job.status==='ready')return 'ready' as const;if(job.status==='failed')return 'failed' as const;}

export function syncDraftStatuses<T extends AdminDraft>(drafts:T[]){
  syncRenderJobs(renderJobs);
  for(const d of drafts){
    ensureQueueItem(d.id,d.title);
    const next=draftStatusFromJob(latestJob(d.id));
    if(next&&d.status!==next){d.status=next;run('UPDATE drafts SET status=? WHERE id=?',next,d.id)}
    if(d.status==='approved')setQueueStatus(d.id,'approved');
    else if(d.status==='rendering')setQueueStatus(d.id,'rendering');
    else if(d.status==='ready')setQueueStatus(d.id,'completed');
    else if(d.status==='failed')setQueueStatus(d.id,'failed',{error:latestJob(d.id)?.error});
  }
  return drafts;
}

async function cleanupJobFiles(jobId:string){
  try{const files=await readdir('output');await Promise.allSettled(files.filter(x=>x===jobId||x.startsWith(jobId+'.')||x.startsWith(jobId+'-')).map(x=>rm(`output/${x}`,{force:true,recursive:true})))}catch{}
}

function removeJob(job:RenderJob){const i=renderJobs.findIndex(x=>x.id===job.id);if(i>=0)renderJobs.splice(i,1);run('DELETE FROM render_jobs WHERE id=?',job.id)}

export function createAdminRouter<T extends AdminDraft>(drafts:T[]){
  const router=Router();

  router.get('/admin/state',(_req,res)=>{
    syncDraftStatuses(drafts);
    const ownerId=accessOf(res).accountId,ownDrafts=drafts.filter(x=>x.ownerId===ownerId),ownJobs=renderJobs.filter(x=>x.ownerId===ownerId),active=ownJobs.filter(x=>x.status==='queued'||x.status==='rendering').length;
    return res.json({drafts:ownDrafts.length,renders:ownJobs.length,active,ready:ownJobs.filter(x=>x.status==='ready').length,failed:ownJobs.filter(x=>x.status==='failed').length,stableControl:renderWorkerStatus()});
  });

  router.get('/admin/stable-control',(_req,res)=>res.json(renderWorkerStatus()));
  router.post('/admin/stable-control/pause',(_req,res)=>res.json({ok:true,...pauseRenderQueue()}));
  router.post('/admin/stable-control/resume',(_req,res)=>res.json({ok:true,...resumeRenderQueue()}));

  router.delete('/drafts/:id',async(req,res)=>{
    const ownerId=accessOf(res).accountId,i=drafts.findIndex(x=>x.id===req.params.id&&x.ownerId===ownerId);if(i<0)return res.status(404).json({error:'Không tìm thấy bản tin'});
    const related=renderJobs.filter(x=>x.draftId===req.params.id);
    if(related.some(x=>x.status==='queued'||x.status==='rendering'))return res.status(409).json({error:'Không thể xóa bản tin khi video đang được xử lý'});
    for(const j of related){removeJob(j);await cleanupJobFiles(j.id)}
    const [removed]=drafts.splice(i,1);run('DELETE FROM drafts WHERE id=?',removed.id);deleteReview(removed.id);deleteQueueItem(removed.id);
    return res.json({ok:true,id:removed.id,deletedRenderJobs:related.length});
  });

  router.delete('/render-jobs/:id',async(req,res)=>{
    const ownerId=accessOf(res).accountId,job=renderJobs.find(x=>x.id===req.params.id&&x.ownerId===ownerId);if(!job)return res.status(404).json({error:'Không tìm thấy tác vụ render'});
    if(job.status==='queued'||job.status==='rendering')return res.status(409).json({error:'Không thể xóa tác vụ đang xử lý'});
    removeJob(job);await cleanupJobFiles(job.id);
    const draft=drafts.find(x=>x.id===job.draftId);if(draft){const remain=latestJob(draft.id),next=draftStatusFromJob(remain)||(canRender(draft.id)?'approved':'draft');draft.status=next;run('UPDATE drafts SET status=? WHERE id=?',next,draft.id)}
    syncDraftStatuses(drafts);return res.json({ok:true,id:job.id});
  });

  router.post('/render-jobs/delete',async(req,res)=>{
    const ids=Array.isArray(req.body?.ids)?new Set(req.body.ids.map(String)):null,status=String(req.body?.status||'');
    const ownerId=accessOf(res).accountId,selected=renderJobs.filter(j=>j.ownerId===ownerId&&(ids?.has(j.id)||(!ids&&status&&j.status===status))&&j.status!=='queued'&&j.status!=='rendering');
    if(!ids&&!status)return res.status(400).json({error:'Chưa chọn tác vụ cần xóa'});
    for(const j of selected){removeJob(j);await cleanupJobFiles(j.id)}
    syncDraftStatuses(drafts);return res.json({ok:true,deleted:selected.length});
  });

  return router;
}
