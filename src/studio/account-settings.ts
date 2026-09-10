import { all,db,run } from '../storage/db.js';

export type StudioTemplate='classic'|'breaking'|'clean';
export type StudioMotion='off'|'light'|'medium'|'strong';
export interface StudioAccountSettings{
 ownerId:string;defaultTemplate:StudioTemplate;defaultMotion:StudioMotion;
 defaultTicker:'off'|'headline'|'custom';autoDuration:boolean;autoScenes:boolean;
 shotCraft:boolean;autoVoice:boolean;allowVideoScenes:boolean;updatedAt:string;
}

db.exec(`CREATE TABLE IF NOT EXISTS studio_account_settings(
 owner_id TEXT PRIMARY KEY,default_template TEXT NOT NULL DEFAULT 'clean',
 default_motion TEXT NOT NULL DEFAULT 'light',default_ticker TEXT NOT NULL DEFAULT 'headline',
 auto_duration INTEGER NOT NULL DEFAULT 1,auto_scenes INTEGER NOT NULL DEFAULT 1,
 shotcraft INTEGER NOT NULL DEFAULT 1,auto_voice INTEGER NOT NULL DEFAULT 1,
 allow_video_scenes INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL)`);
const defaults=(ownerId:string):StudioAccountSettings=>({ownerId,defaultTemplate:'clean',defaultMotion:'light',defaultTicker:'headline',autoDuration:true,autoScenes:true,shotCraft:true,autoVoice:true,allowVideoScenes:true,updatedAt:new Date().toISOString()});
export function studioAccountSettings(ownerId:string){
 const row=all<any>('SELECT * FROM studio_account_settings WHERE owner_id=? LIMIT 1',ownerId)[0];if(!row)return defaults(ownerId);
 return{ownerId,defaultTemplate:row.default_template,defaultMotion:row.default_motion,defaultTicker:row.default_ticker,autoDuration:Boolean(row.auto_duration),autoScenes:Boolean(row.auto_scenes),shotCraft:Boolean(row.shotcraft),autoVoice:Boolean(row.auto_voice),allowVideoScenes:Boolean(row.allow_video_scenes),updatedAt:row.updated_at} as StudioAccountSettings;
}
export function saveStudioAccountSettings(ownerId:string,input:Partial<Omit<StudioAccountSettings,'ownerId'|'updatedAt'>>){
 const old=studioAccountSettings(ownerId),x={...old,...input,ownerId,updatedAt:new Date().toISOString()};
 run(`INSERT INTO studio_account_settings(owner_id,default_template,default_motion,default_ticker,auto_duration,auto_scenes,shotcraft,auto_voice,allow_video_scenes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(owner_id) DO UPDATE SET default_template=excluded.default_template,default_motion=excluded.default_motion,default_ticker=excluded.default_ticker,auto_duration=excluded.auto_duration,auto_scenes=excluded.auto_scenes,shotcraft=excluded.shotcraft,auto_voice=excluded.auto_voice,allow_video_scenes=excluded.allow_video_scenes,updated_at=excluded.updated_at`,ownerId,x.defaultTemplate,x.defaultMotion,x.defaultTicker,x.autoDuration?1:0,x.autoScenes?1:0,x.shotCraft?1:0,x.autoVoice?1:0,x.allowVideoScenes?1:0,x.updatedAt);
 return x;
}
