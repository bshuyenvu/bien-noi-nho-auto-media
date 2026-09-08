import { Router } from 'express';
import { accessOf, requireAdmin } from '../auth/access.js';
import { productionAnalyticsSnapshot } from '../analytics/production.js';
import { sendExternalAlertTest } from './alerts.js';
import { acknowledgeIncident, endMaintenance, maintenanceStatus, silenceIncident, startMaintenance, unsilenceIncident } from './maintenance.js';
import { monitorIncidents, productionMonitorSnapshot, runProductionMonitorCycle, startProductionMonitor } from './monitor.js';
import { auditActor, recordAuditEvent } from './audit.js';
import { answerOpsQuestion, opsAssistantStatus } from './ops-assistant.js';

export const productionMonitorRouter=Router();
queueMicrotask(startProductionMonitor);
function actorOf(res:any){return accessOf(res).accountId}
function minutesOf(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>0?Math.round(n):undefined}
function audit(res:any,ownerId:string,action:string,targetType:string,targetId:string|undefined,summary:string,metadata?:unknown){const access=accessOf(res);recordAuditEvent({ownerId,actor:auditActor(access),action,targetType,targetId,summary,metadata})}

productionMonitorRouter.get('/admin/analytics',(req,res)=>{
  const ownerId=accessOf(res).accountId,days=Number(String(req.query.days||'7'))===30?30:7;
  try{return res.json(productionAnalyticsSnapshot(ownerId,days))}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.get('/admin/ops-assistant/status',requireAdmin,(_req,res)=>res.json(opsAssistantStatus()));
productionMonitorRouter.post('/admin/ops-assistant/ask',requireAdmin,async(req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{
    const answer=await answerOpsQuestion(ownerId,req.body?.question);
    audit(res,ownerId,'ops.ask','ops-assistant',undefined,'Phân tích vận hành bằng AI Operations Assistant',{intent:answer.intent,severity:answer.severity,mode:answer.mode,provider:answer.provider||null,questionLength:String(req.body?.question||'').length});
    return res.json(answer);
  }catch(e){return res.status(400).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.get('/admin/monitoring',async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{return res.json({snapshot:await productionMonitorSnapshot(ownerId),incidents:monitorIncidents(ownerId,60),maintenance:maintenanceStatus(),operator:accessOf(res).role==='admin'})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.post('/admin/monitoring/run',requireAdmin,async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{const snapshot=await runProductionMonitorCycle(ownerId);audit(res,'system','monitor.run','production-monitor',undefined,'Chạy Production Monitor thủ công',{overall:snapshot.overall});return res.json({ok:true,snapshot,incidents:monitorIncidents(ownerId,60),maintenance:maintenanceStatus()})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.post('/admin/monitoring/alerts/test',requireAdmin,async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{const result=await sendExternalAlertTest(ownerId);if(!result.results.length)return res.status(409).json({error:'Chưa cấu hình Webhook, Telegram hoặc Email cảnh báo'});audit(res,ownerId,'alerts.test','alerting',result.event.incidentId,'Gửi cảnh báo kiểm tra',{channels:result.results.map(x=>({channel:x.channel,sent:x.sent}))});return res.json({ok:result.results.some(x=>x.sent),results:result.results})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.get('/admin/monitoring/maintenance',(_req,res)=>res.json(maintenanceStatus()));
productionMonitorRouter.post('/admin/monitoring/maintenance',requireAdmin,(req,res)=>{try{const result=startMaintenance(actorOf(res),minutesOf(req.body?.minutes),req.body?.reason?String(req.body.reason):undefined);if(result.active)audit(res,'system','maintenance.start','maintenance-window',result.id,'Bật Maintenance Mode',{endsAt:result.endsAt,reason:result.reason});return res.status(201).json(result)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
productionMonitorRouter.delete('/admin/monitoring/maintenance',requireAdmin,(_req,res)=>{try{const before=maintenanceStatus(),result=endMaintenance(actorOf(res));audit(res,'system','maintenance.end','maintenance-window',before.active?before.id:undefined,'Kết thúc Maintenance Mode',{previousEndsAt:before.active?before.endsAt:undefined});return res.json(result)}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});

productionMonitorRouter.post('/admin/monitoring/incidents/:id/ack',requireAdmin,(req,res)=>{const ownerId=accessOf(res).accountId,id=String(req.params.id);try{const result=acknowledgeIncident(id,ownerId,ownerId,req.body?.note?String(req.body.note):undefined);audit(res,ownerId,'incident.ack','incident',id,'Xác nhận đã tiếp nhận incident',{note:req.body?.note?String(req.body.note):undefined});return res.json(result)}catch(e){return res.status(404).json({error:e instanceof Error?e.message:String(e)})}});
productionMonitorRouter.post('/admin/monitoring/incidents/:id/silence',requireAdmin,(req,res)=>{const ownerId=accessOf(res).accountId,id=String(req.params.id);try{const result=silenceIncident(id,ownerId,ownerId,minutesOf(req.body?.minutes),req.body?.reason?String(req.body.reason):undefined);audit(res,ownerId,'incident.silence','incident',id,'Tạm im cảnh báo incident',{silencedUntil:result?.silencedUntil,reason:req.body?.reason?String(req.body.reason):undefined});return res.json(result)}catch(e){return res.status(404).json({error:e instanceof Error?e.message:String(e)})}});
productionMonitorRouter.delete('/admin/monitoring/incidents/:id/silence',requireAdmin,(req,res)=>{const ownerId=accessOf(res).accountId,id=String(req.params.id);try{const result=unsilenceIncident(id,ownerId);audit(res,ownerId,'incident.unsilence','incident',id,'Bật lại cảnh báo incident');return res.json(result)}catch(e){return res.status(404).json({error:e instanceof Error?e.message:String(e)})}});
