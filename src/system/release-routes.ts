import { Router } from 'express';
import { accessOf, requireAdmin } from '../auth/access.js';
import { auditActor, recordAuditEvent } from './audit.js';
import { releaseCandidateSnapshot } from './release-readiness.js';

export const releaseReadinessRouter=Router();

releaseReadinessRouter.get('/admin/release-readiness',requireAdmin,async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{return res.json(await releaseCandidateSnapshot(ownerId))}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

releaseReadinessRouter.post('/admin/release-readiness/run',requireAdmin,async(_req,res)=>{
  const ownerId=accessOf(res).accountId,access=accessOf(res);
  try{
    const snapshot=await releaseCandidateSnapshot(ownerId);
    recordAuditEvent({ownerId,actor:auditActor(access),action:'release.acceptance-run',targetType:'release-candidate',targetId:snapshot.release.revision,summary:`Production acceptance gate → ${snapshot.verdict}`,metadata:{version:snapshot.release.version,revision:snapshot.release.revision,candidateReady:snapshot.candidateReady,activationReady:snapshot.activationReady,liveOperational:snapshot.liveOperational,blockerCount:snapshot.blockers.length,warningCount:snapshot.warnings.length}});
    return res.json(snapshot);
  }catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});
