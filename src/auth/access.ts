import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { all, run } from '../storage/db.js';

export type AccountRole='admin'|'member';
export type AccountPlan='free'|'starter'|'pro';
export interface AccessContext{accountId:string;clerkUserId?:string;role:AccountRole;plan:AccountPlan;authType:'clerk'|'api_key'|'legacy'}

const clerkEnabled=Boolean(process.env.CLERK_PUBLISHABLE_KEY&&process.env.CLERK_SECRET_KEY);
const adminUserIds=new Set((process.env.ADMIN_CLERK_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean));
const legacyKey=process.env.RENDER_API_KEY||'';
const clerkGuard=clerkEnabled?clerkMiddleware():(_q:Request,_r:Response,next:NextFunction)=>next();

function digest(value:string){return createHash('sha256').update(value).digest('hex')}
function safeEqual(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)}
function ensureAccount(clerkUserId:string){
 const found=all<any>('SELECT * FROM accounts WHERE clerk_user_id=? LIMIT 1',clerkUserId)[0];
 if(found)return found;
 const id=randomUUID(),role:AccountRole=adminUserIds.has(clerkUserId)?'admin':'member',now=new Date().toISOString();
 run('INSERT INTO accounts(id,clerk_user_id,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,clerkUserId,role,'free','active',now,now);
 run('INSERT INTO channels(id,owner_id,name,is_default,created_at,updated_at) VALUES(?,?,?,?,?,?)',randomUUID(),id,role==='admin'?'Biển & Nỗi Nhớ':'Kênh của tôi',1,now,now);
 return all<any>('SELECT * FROM accounts WHERE id=?',id)[0];
}
function apiKeyAccount(token:string){
 if(!token.startsWith('vnf_live_'))return undefined;
 const row=all<any>('SELECT k.*,a.role,a.plan,a.status FROM api_keys k JOIN accounts a ON a.id=k.owner_id WHERE k.key_hash=? AND k.revoked_at IS NULL LIMIT 1',digest(token))[0];
 if(!row||row.status!=='active')return undefined;
 run('UPDATE api_keys SET last_used_at=? WHERE id=?',new Date().toISOString(),row.id);
 return row;
}
export function authMiddleware(req:Request,res:Response,next:NextFunction){return clerkGuard(req,res,next)}
export function requireAccess(req:Request,res:Response,next:NextFunction){
 const token=req.header('authorization')?.replace(/^Bearer\s+/i,'')||'';
 if(legacyKey&&safeEqual(token,legacyKey)){res.locals.access={accountId:'legacy-admin',role:'admin',plan:'pro',authType:'legacy'} satisfies AccessContext;return next()}
 const keyed=apiKeyAccount(token);
 if(keyed){res.locals.access={accountId:keyed.owner_id,role:keyed.role,plan:keyed.plan,authType:'api_key'} satisfies AccessContext;return next()}
 if(clerkEnabled){const auth=getAuth(req);if(auth.userId){const account=ensureAccount(auth.userId);res.locals.access={accountId:account.id,clerkUserId:auth.userId,role:account.role,plan:account.plan,authType:'clerk'} satisfies AccessContext;return next()}}
 if(!clerkEnabled&&!legacyKey){res.locals.access={accountId:'legacy-admin',role:'admin',plan:'pro',authType:'legacy'} satisfies AccessContext;return next()}
 return res.status(401).json({error:'Vui lòng đăng nhập hoặc cung cấp API key hợp lệ',code:'AUTH_REQUIRED'});
}
export function requireAdmin(_req:Request,res:Response,next:NextFunction){const a=res.locals.access as AccessContext|undefined;return a?.role==='admin'?next():res.status(403).json({error:'Chỉ quản trị viên được thực hiện thao tác này',code:'ADMIN_REQUIRED'})}
export function accessOf(res:Response){return res.locals.access as AccessContext}
export function defaultChannelName(accountId?:string){
 if(accountId&&accountId!=='legacy-admin'){const c=all<any>('SELECT name FROM channels WHERE owner_id=? ORDER BY is_default DESC,created_at LIMIT 1',accountId)[0];if(c?.name)return c.name}
 const c=all<any>("SELECT c.name FROM channels c JOIN accounts a ON a.id=c.owner_id WHERE a.role='admin' ORDER BY c.is_default DESC,c.created_at LIMIT 1")[0];
 return c?.name||process.env.DEFAULT_CHANNEL_NAME||'Biển & Nỗi Nhớ';
}
export function createPersonalApiKey(ownerId:string,name='Khóa mặc định'){
 const secret='vnf_live_'+randomBytes(24).toString('base64url'),now=new Date().toISOString(),id=randomUUID(),prefix=secret.slice(0,16);
 run('INSERT INTO api_keys(id,owner_id,name,key_prefix,key_hash,created_at) VALUES(?,?,?,?,?,?)',id,ownerId,name,prefix,digest(secret),now);
 return{id,name,key:secret,prefix,createdAt:now};
}
export const authStatus={clerkEnabled};
