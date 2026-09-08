import { Router } from 'express';
import { z } from 'zod';
import { accessOf,requireAdmin } from '../auth/access.js';
import { auditActor,recordAuditEvent } from '../system/audit.js';
import {
  activationWizardSnapshot,
  approvePublicActivation,
  armProductionActivation,
  abortActivationWizard,
  authorizeUnlistedTest,
  clearActivationKillSwitch,
  confirmActivationBackup,
  engageActivationKillSwitch,
  verifyUnlistedTest,
} from './activation-wizard.js';

export const activationWizardRouter=Router();
activationWizardRouter.use('/admin/activation-wizard',requireAdmin);
function owner(res:any){return accessOf(res).accountId}
function actor(res:any){return auditActor(accessOf(res))}
function audit(res:any,action:string,summary:string,metadata?:unknown){const a=actor(res);recordAuditEvent({ownerId:owner(res),actor:a,action,targetType:'production-activation',targetId:owner(res),summary,metadata})}
const Confirm=z.object({confirmation:z.string().max(80)});

activationWizardRouter.get('/admin/activation-wizard',async(_req,res)=>{try{return res.json(await activationWizardSnapshot(owner(res)))}catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}});
activationWizardRouter.post('/admin/activation-wizard/backup-confirm',async(req,res)=>{try{const x=await confirmActivationBackup(owner(res),actor(res).id,req.body?.note?String(req.body.note):undefined);audit(res,'activation.backup-confirm','Xác nhận backup SQLite trước Production Activation',{backupConfirmedAt:x.state.backupConfirmedAt,noteLength:String(req.body?.note||'').length});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
activationWizardRouter.post('/admin/activation-wizard/arm',async(req,res)=>{const p=Confirm.safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Cần confirmation'});try{const x=await armProductionActivation(owner(res),actor(res).id,p.data.confirmation);audit(res,'activation.arm','ARM Production Activation ở mức PRIVATE',{sessionId:x.state.sessionId,maxPrivacy:x.state.maxPrivacy});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
activationWizardRouter.post('/admin/activation-wizard/authorize-unlisted',async(req,res)=>{const p=Confirm.safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Cần confirmation'});try{const x=await authorizeUnlistedTest(owner(res),actor(res).id,p.data.confirmation);audit(res,'activation.unlisted-authorize','Cho phép thử nghiệm YouTube UNLISTED',{maxPrivacy:x.state.maxPrivacy});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
activationWizardRouter.post('/admin/activation-wizard/verify-unlisted',async(req,res)=>{const p=z.object({confirmation:z.string().max(80),remoteId:z.string().min(1).max(300)}).safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Cần confirmation và remoteId'});try{const x=await verifyUnlistedTest(owner(res),actor(res).id,p.data);audit(res,'activation.unlisted-verify','Xác minh video YouTube UNLISTED',{remoteId:p.data.remoteId});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
activationWizardRouter.post('/admin/activation-wizard/approve-public',async(req,res)=>{const p=Confirm.safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Cần confirmation'});try{const x=await approvePublicActivation(owner(res),actor(res).id,p.data.confirmation);audit(res,'activation.public-approve','Phê duyệt mức YouTube PUBLIC',{maxPrivacy:x.state.maxPrivacy,unlistedTestVideoId:x.state.unlistedTestVideoId});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
activationWizardRouter.post('/admin/activation-wizard/abort',async(_req,res)=>{try{const x=await abortActivationWizard(owner(res),actor(res).id);audit(res,'activation.abort','ABORT Production Activation',{status:x.state.status});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
activationWizardRouter.post('/admin/activation-wizard/kill-switch',async(req,res)=>{try{const reason=String(req.body?.reason||'Emergency operator kill switch').slice(0,300),x=await engageActivationKillSwitch(owner(res),actor(res).id,reason);audit(res,'activation.kill-switch','Bật Production Kill Switch',{reason});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
activationWizardRouter.post('/admin/activation-wizard/kill-switch/clear',async(req,res)=>{const p=Confirm.safeParse(req.body||{});if(!p.success)return res.status(400).json({error:'Cần confirmation'});try{const x=await clearActivationKillSwitch(owner(res),actor(res).id,p.data.confirmation);audit(res,'activation.kill-switch-clear','Clear Production Kill Switch',{releaseVerdict:x.release.verdict});return res.json(x)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
