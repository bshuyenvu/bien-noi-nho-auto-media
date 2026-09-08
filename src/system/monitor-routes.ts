import { Router } from 'express';
import { accessOf, requireAdmin } from '../auth/access.js';
import { sendExternalAlertTest } from './alerts.js';
import { acknowledgeIncident, endMaintenance, maintenanceStatus, silenceIncident, startMaintenance, unsilenceIncident } from './maintenance.js';
import { monitorIncidents, productionMonitorSnapshot, runProductionMonitorCycle, startProductionMonitor } from './monitor.js';

export const productionMonitorRouter=Router();
queueMicrotask(startProductionMonitor);
function actorOf(res:any){return accessOf(res).accountId}
function minutesOf(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>0?Math.round(n):undefined}

productionMonitorRouter.get('/admin/monitoring',async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{return res.json({snapshot:await productionMonitorSnapshot(ownerId),incidents:monitorIncidents(ownerId,60),maintenance:maintenanceStatus(),operator:accessOf(res).role==='admin'})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.post('/admin/monitoring/run',requireAdmin,async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{const snapshot=await runProductionMonitorCycle(ownerId);return res.json({ok:true,snapshot,incidents:monitorIncidents(ownerId,60),maintenance:maintenanceStatus()})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.post('/admin/monitoring/alerts/test',requireAdmin,async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{const result=await sendExternalAlertTest(ownerId);if(!result.results.length)return res.status(409).json({error:'Chưa cấu hình Webhook, Telegram hoặc Email cảnh báo'});return res.json({ok:result.results.some(x=>x.sent),results:result.results})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.get('/admin/monitoring/maintenance',(_req,res)=>res.json(maintenanceStatus()));
productionMonitorRouter.post('/admin/monitoring/maintenance',requireAdmin,(req,res)=>{try{return res.status(201).json(startMaintenance(actorOf(res),minutesOf(req.body?.minutes),req.body?.reason?String(req.body.reason):undefined))}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});
productionMonitorRouter.delete('/admin/monitoring/maintenance',requireAdmin,(_req,res)=>{try{return res.json(endMaintenance(actorOf(res)))}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}});

productionMonitorRouter.post('/admin/monitoring/incidents/:id/ack',requireAdmin,(req,res)=>{const ownerId=accessOf(res).accountId,id=String(req.params.id);try{return res.json(acknowledgeIncident(id,ownerId,ownerId,req.body?.note?String(req.body.note):undefined))}catch(e){return res.status(404).json({error:e instanceof Error?e.message:String(e)})}});
productionMonitorRouter.post('/admin/monitoring/incidents/:id/silence',requireAdmin,(req,res)=>{const ownerId=accessOf(res).accountId,id=String(req.params.id);try{return res.json(silenceIncident(id,ownerId,ownerId,minutesOf(req.body?.minutes),req.body?.reason?String(req.body.reason):undefined))}catch(e){return res.status(404).json({error:e instanceof Error?e.message:String(e)})}});
productionMonitorRouter.delete('/admin/monitoring/incidents/:id/silence',requireAdmin,(req,res)=>{const ownerId=accessOf(res).accountId,id=String(req.params.id);try{return res.json(unsilenceIncident(id,ownerId))}catch(e){return res.status(404).json({error:e instanceof Error?e.message:String(e)})}});
