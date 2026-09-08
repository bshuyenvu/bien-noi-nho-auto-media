import { Router } from 'express';
import { z } from 'zod';
import { all } from '../storage/db.js';
import { accessOf,requireAdmin } from '../auth/access.js';
import { auditActor,recordAuditEvent } from '../system/audit.js';
import { canRender } from '../review/store.js';
import { enqueuePublish } from './queue.js';
import { evaluatePublicRollout,markPublicCanaryQueued,publicRolloutSnapshot,resetPublicRollout,startPublicRolloutWatcher,verifyPublicCanaryAndStartWatch } from './public-rollout.js';

export const publicRolloutRouter=Router();
startPublicRolloutWatcher();
function owner(res:any){return accessOf(res).accountId}
function actor(res:any){return auditActor(accessOf(res))}
function audit(res:any,action:string,summary:string,metadata?:unknown){const a=actor(res);recordAuditEvent({ownerId:owner(res),actor:a,action,targetType:'public-rollout',targetId:owner(res),summary,metadata})}

type RenderRow={id:string;owner_id:string;draft_id:string;status:string;output?:string};
type DraftRow={id:string;title:string};
const Confirm=z.object({confirmation:z.string().max(80)});
publicRolloutRouter.use('/admin/public-rollout',requireAdmin);
publicRolloutRouter.get('/admin/public-rollout',async(_req,res)=>{try{return res.json(await publicRolloutSnapshot(owner(res)))}catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}});
publicRolloutRouter.post('/admin/public-rollout/canary',async(req,res)=>{
  const p=z.object({confirmation:z.string().max(80),renderJobId:z.string().min(1).max(200)}).safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Cần renderJobId và confirmation'});if(p.data.confirmation!=='START PUBLIC CANARY')return res.status(409).json({error:'Cần nhập chính xác: START PUBLIC CANARY'});
  try{
    const ownerId=owner(res),snapshot=await publicRolloutSnapshot(ownerId);if(!snapshot.canQueue)return res.status(409).json({error:'Chưa thể tạo Public Canary: cần operator đã APPROVE PUBLIC, runtime privacy=public, Release GO, Monitor không RED, Reconcile clear và Kill Switch OFF',snapshot});
    const render=all<RenderRow>('SELECT id,owner_id,draft_id,status,output FROM render_jobs WHERE id=? AND owner_id=? LIMIT 1',p.data.renderJobId,ownerId)[0];if(!render)return res.status(404).json({error:'Không tìm thấy render job'});if(render.status!=='ready'||!render.output)return res.status(409).json({error:'Public Canary cần render job READY có output'});if(!canRender(render.draft_id))return res.status(409).json({error:'Review Gate chưa được phê duyệt'});
    const draft=all<DraftRow>('SELECT id,title FROM drafts WHERE id=? AND owner_id=? LIMIT 1',render.draft_id,ownerId)[0];if(!draft)return res.status(404).json({error:'Không tìm thấy draft nguồn'});
    const job=enqueuePublish({ownerId,renderJobId:render.id,draftId:render.draft_id,platform:'youtube',title:`PUBLIC CANARY • ${draft.title}`,description:'VietNewsFlow AI controlled Public rollout canary. Normal PUBLIC publishing remains locked until post-publish watch completes.',dryRun:false,maxAttempts:1,publicCanary:true});
    const next=await markPublicCanaryQueued(ownerId,actor(res).id,job.id);audit(res,'public-rollout.canary-create','Tạo một Public Canary có kiểm soát',{jobId:job.id,renderJobId:render.id});return res.status(201).json({...next,job});
  }catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}
});
publicRolloutRouter.post('/admin/public-rollout/verify',async(req,res)=>{const p=Confirm.safeParse(req.body||{});if(!p.success||p.data.confirmation!=='VERIFY PUBLIC CANARY')return res.status(400).json({error:'Cần nhập chính xác: VERIFY PUBLIC CANARY'});try{const x=await verifyPublicCanaryAndStartWatch(owner(res),actor(res).id);audit(res,'public-rollout.remote-verify','Xác minh Public Canary trên YouTube và bắt đầu watch window',{videoId:x.state.publicCanaryVideoId,watchEndsAt:x.state.publicWatchEndsAt});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
publicRolloutRouter.post('/admin/public-rollout/check',async(_req,res)=>{try{const x=await evaluatePublicRollout(owner(res),actor(res).id);audit(res,'public-rollout.check','Kiểm tra thủ công Post-Publish Watch',{status:x.status});return res.json({result:x,snapshot:await publicRolloutSnapshot(owner(res))})}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
publicRolloutRouter.post('/admin/public-rollout/reset',async(req,res)=>{const p=Confirm.safeParse(req.body||{});if(!p.success||p.data.confirmation!=='RESET PUBLIC ROLLOUT')return res.status(400).json({error:'Cần nhập chính xác: RESET PUBLIC ROLLOUT'});try{const x=await resetPublicRollout(owner(res),actor(res).id);audit(res,'public-rollout.reset','Reset Public Rollout sau khi đã điều tra và clear Kill Switch');return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
