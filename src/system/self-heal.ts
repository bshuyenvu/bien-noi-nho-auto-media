import { all, run } from '../storage/db.js';
import { pauseRenderQueue, renderWorkerStatus, resumeRenderQueue } from '../video/job.js';

export type SelfHealSeverity='green'|'yellow'|'red';
type StateRow={value_json:string;updated_at:string};
export interface SelfHealInput {memory:SelfHealSeverity;disk:SelfHealSeverity;memoryMessage:string;diskMessage:string}
interface PersistedState {autoPaused:boolean;greenCycles:number;pausedAt?:string;reason?:string;lastActionAt?:string}
const STATE_KEY='self-heal.render';
function envNumber(name:string,fallback:number){const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?n:fallback}
function enabled(){return process.env.SELF_HEAL_ENABLED!=='false'}
function readState():PersistedState{const row=all<StateRow>('SELECT value_json,updated_at FROM system_runtime_state WHERE state_key=? LIMIT 1',STATE_KEY)[0];if(!row)return{autoPaused:false,greenCycles:0};try{return{autoPaused:false,greenCycles:0,...JSON.parse(row.value_json)}}catch{return{autoPaused:false,greenCycles:0}}}
function writeState(state:PersistedState){run('INSERT INTO system_runtime_state(state_key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(state_key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at',STATE_KEY,JSON.stringify(state),new Date().toISOString())}
function reasonOf(input:SelfHealInput){const reasons:string[]=[];if(input.memory==='red')reasons.push(input.memoryMessage);if(input.disk==='red')reasons.push(input.diskMessage);return reasons.join(' | ')||'resource pressure'}

export async function applySafeSelfHealing(input:SelfHealInput){
  let state=readState();let worker=await renderWorkerStatus();const requiredGreen=Math.max(2,Math.round(envNumber('SELF_HEAL_GREEN_CYCLES',3)));
  if(!enabled())return{enabled:false,autoPaused:state.autoPaused,greenCycles:state.greenCycles,requiredGreen,queuePaused:worker.paused,reason:state.reason,lastActionAt:state.lastActionAt};
  const critical=input.memory==='red'||input.disk==='red',stableGreen=input.memory==='green'&&input.disk==='green';
  if(critical){
    state.greenCycles=0;const reason=reasonOf(input);
    if(!worker.paused){pauseRenderQueue();state={autoPaused:true,greenCycles:0,pausedAt:new Date().toISOString(),reason,lastActionAt:new Date().toISOString()};console.warn(`[self-heal] Render Queue auto-paused: ${reason}`)}
    else if(state.autoPaused){state.reason=reason;state.pausedAt=state.pausedAt||new Date().toISOString()}
    else{state.reason=undefined;state.pausedAt=undefined}
    writeState(state);worker=await renderWorkerStatus();return{enabled:true,autoPaused:state.autoPaused,greenCycles:0,requiredGreen,queuePaused:worker.paused,reason:state.reason,lastActionAt:state.lastActionAt};
  }
  if(state.autoPaused){
    worker=await renderWorkerStatus();
    if(!worker.paused)state={autoPaused:false,greenCycles:0,lastActionAt:new Date().toISOString()};
    else if(stableGreen){state.greenCycles=(state.greenCycles||0)+1;if(state.greenCycles>=requiredGreen){resumeRenderQueue();console.info(`[self-heal] Render Queue auto-resumed after ${requiredGreen} green cycles`);state={autoPaused:false,greenCycles:0,lastActionAt:new Date().toISOString()}}}
    else state.greenCycles=0;
    writeState(state);
  }
  worker=await renderWorkerStatus();return{enabled:true,autoPaused:state.autoPaused,greenCycles:state.greenCycles||0,requiredGreen,queuePaused:worker.paused,reason:state.reason,lastActionAt:state.lastActionAt};
}
export async function selfHealingStatus(){const state=readState(),worker=await renderWorkerStatus();return{enabled:enabled(),autoPaused:state.autoPaused,greenCycles:state.greenCycles||0,requiredGreen:Math.max(2,Math.round(envNumber('SELF_HEAL_GREEN_CYCLES',3))),queuePaused:worker.paused,reason:state.reason,lastActionAt:state.lastActionAt}}
