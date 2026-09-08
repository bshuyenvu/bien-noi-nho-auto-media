import { Router } from 'express';
import { accessOf } from '../auth/access.js';
import { monitorIncidents, productionMonitorSnapshot, runProductionMonitorCycle, startProductionMonitor } from './monitor.js';

export const productionMonitorRouter=Router();
startProductionMonitor();

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
