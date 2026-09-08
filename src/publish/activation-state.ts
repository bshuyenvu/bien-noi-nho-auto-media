import { all,run } from '../storage/db.js';

export type ActivationPrivacy='private'|'unlisted'|'public';
export type ActivationStatus='idle'|'armed'|'aborted';
export interface ProductionActivationState{
  ownerId:string;
  sessionId?:string;
  status:ActivationStatus;
  armed:boolean;
  maxPrivacy:ActivationPrivacy;
  backupConfirmedAt?:string;
  backupNote?:string;
  armedAt?:string;
  unlistedAuthorizedAt?:string;
  unlistedVerifiedAt?:string;
  unlistedTestVideoId?:string;
  remoteCanaryVerifiedAt?:string;
  remoteCanaryVideoId?:string;
  remoteCanaryChannelId?:string;
  remoteCanaryTitle?:string;
  remoteCanaryPrivacyStatus?:string;
  remoteCanaryUploadStatus?:string;
  remoteCanaryProcessingStatus?:string;
  publicApprovedAt?:string;
  abortedAt?:string;
  updatedAt?:string;
  updatedBy?:string;
}
export interface KillSwitchState{engaged:boolean;engagedAt?:string;engagedBy?:string;reason?:string;clearedAt?:string;clearedBy?:string;updatedAt?:string}

type StateRow={value_json:string;updated_at:string};
const activationKey=(ownerId:string)=>`publish.activation:${ownerId}`;
const KILL_KEY='publish.kill-switch';
const rank:Record<ActivationPrivacy,number>={private:0,unlisted:1,public:2};
function parse<T>(raw:string|undefined,fallback:T):T{if(!raw)return fallback;try{return{...fallback,...JSON.parse(raw)}}catch{return fallback}}
function read<T>(key:string,fallback:T):T{const row=all<StateRow>('SELECT value_json,updated_at FROM system_runtime_state WHERE state_key=? LIMIT 1',key)[0];const value=parse(row?.value_json,fallback);return row?{...(value as any),updatedAt:row.updated_at}:value}
function write(key:string,value:unknown){const now=new Date().toISOString();run('INSERT INTO system_runtime_state(state_key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(state_key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at',key,JSON.stringify(value),now);return now}
export function envYouTubePrivacy():ActivationPrivacy{const v=String(process.env.YOUTUBE_PRIVACY_STATUS||'private');return v==='public'||v==='unlisted'?v:'private'}
export function productionActivationState(ownerId:string):ProductionActivationState{return read(activationKey(ownerId),{ownerId,status:'idle',armed:false,maxPrivacy:'private'} as ProductionActivationState)}
export function productionKillSwitch():KillSwitchState{return read(KILL_KEY,{engaged:false} as KillSwitchState)}
export function updateProductionActivation(ownerId:string,patch:Partial<ProductionActivationState>,actor:string){const current=productionActivationState(ownerId),next:ProductionActivationState={...current,...patch,ownerId,updatedBy:actor};const updatedAt=write(activationKey(ownerId),next);return{...next,updatedAt}}
export function engageProductionKillSwitch(actor:string,reason='Operator kill switch'){const now=new Date().toISOString(),next:KillSwitchState={engaged:true,engagedAt:now,engagedBy:actor,reason};write(KILL_KEY,next);return productionKillSwitch()}
export function clearProductionKillSwitch(actor:string){const current=productionKillSwitch(),now=new Date().toISOString(),next:KillSwitchState={...current,engaged:false,clearedAt:now,clearedBy:actor};write(KILL_KEY,next);return productionKillSwitch()}
export function abortProductionActivation(ownerId:string,actor:string){const now=new Date().toISOString();return updateProductionActivation(ownerId,{status:'aborted',armed:false,maxPrivacy:'private',abortedAt:now,sessionId:undefined,armedAt:undefined,unlistedAuthorizedAt:undefined,unlistedVerifiedAt:undefined,unlistedTestVideoId:undefined,remoteCanaryVerifiedAt:undefined,remoteCanaryVideoId:undefined,remoteCanaryChannelId:undefined,remoteCanaryTitle:undefined,remoteCanaryPrivacyStatus:undefined,remoteCanaryUploadStatus:undefined,remoteCanaryProcessingStatus:undefined,publicApprovedAt:undefined},actor)}
export function productionPublishGuard(ownerId:string,input:{deploymentTest?:boolean;privacy?:ActivationPrivacy}={}){
  const kill=productionKillSwitch(),state=productionActivationState(ownerId),privacy=input.privacy||envYouTubePrivacy();
  if(kill.engaged)return{allowed:false,reason:`Production Kill Switch đang bật${kill.reason?`: ${kill.reason}`:''}`,killSwitch:kill,state,privacy};
  if(input.deploymentTest)return{allowed:true,reason:'Private deployment test được phép trước khi ARM; Kill Switch vẫn có hiệu lực',killSwitch:kill,state,privacy};
  if(!state.armed||state.status!=='armed')return{allowed:false,reason:'Production Activation chưa được ARM trong wizard',killSwitch:kill,state,privacy};
  if(rank[privacy]>rank[state.maxPrivacy])return{allowed:false,reason:`Privacy ${privacy.toUpperCase()} vượt mức wizard đã phê duyệt (${state.maxPrivacy.toUpperCase()})`,killSwitch:kill,state,privacy};
  if(privacy==='public'&&!state.publicApprovedAt)return{allowed:false,reason:'PUBLIC chưa được phê duyệt trong Activation Wizard',killSwitch:kill,state,privacy};
  return{allowed:true,reason:`Activation armed • max ${state.maxPrivacy}`,killSwitch:kill,state,privacy};
}
