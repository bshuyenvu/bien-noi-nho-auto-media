import { Router } from 'express';
import { accessOf } from '../auth/access.js';
import { sendExternalAlertTest } from './alerts.js';
import { monitorIncidents, productionMonitorSnapshot, runProductionMonitorCycle, startProductionMonitor } from './monitor.js';

export const productionMonitorRouter=Router();
queueMicrotask(startProductionMonitor);

productionMonitorRouter.get('/admin/monitoring',async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{return res.json({snapshot:await productionMonitorSnapshot(ownerId),incidents:monitorIncidents(ownerId,60)})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.post('/admin/monitoring/run',async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{const snapshot=await runProductionMonitorCycle(ownerId);return res.json({ok:true,snapshot,incidents:monitorIncidents(ownerId,60)})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});

productionMonitorRouter.post('/admin/monitoring/alerts/test',async(_req,res)=>{
  const ownerId=accessOf(res).accountId;
  try{const result=await sendExternalAlertTest(ownerId);if(!result.results.length)return res.status(409).json({error:'Chưa cấu hình Webhook, Telegram hoặc Email cảnh báo'});return res.json({ok:result.results.some(x=>x.sent),results:result.results})}
  catch(e){return res.status(500).json({error:e instanceof Error?e.message:String(e)})}
});
