import { all } from '../storage/db.js';
import type { AccessContext,AccountPlan } from '../auth/access.js';

export const SUPPORT_ZALO='0917024015';
export const PLAN_DEFAULTS={free:{daily:null,total:3,label:'Free'},starter:{daily:10,total:null,label:'Starter'},pro:{daily:24,total:null,label:'Pro'}} as const;

function vietnamDayStart(){const now=new Date(),vn=new Date(now.getTime()+7*3600000);vn.setUTCHours(0,0,0,0);return new Date(vn.getTime()-7*3600000).toISOString()}
export function planUsage(access:AccessContext){
 const account=access.accountId==='legacy-admin'?undefined:all<any>('SELECT daily_limit,total_limit FROM accounts WHERE id=?',access.accountId)[0];
 const defaults=PLAN_DEFAULTS[access.plan as AccountPlan],isAdmin=access.role==='admin'||access.accountId==='legacy-admin';
 const dailyLimit=isAdmin?null:account?.daily_limit??defaults.daily,totalLimit=isAdmin?null:account?.total_limit??defaults.total;
 const total=Number(all<{n:number}>("SELECT COUNT(*) n FROM render_jobs WHERE owner_id=? AND status!='failed'",access.accountId)[0]?.n||0);
 const today=Number(all<{n:number}>("SELECT COUNT(*) n FROM render_jobs WHERE owner_id=? AND status!='failed' AND created_at>=?",access.accountId,vietnamDayStart())[0]?.n||0);
 const activeKeys=access.accountId==='legacy-admin'?1:Number(all<{n:number}>('SELECT COUNT(*) n FROM api_keys WHERE owner_id=? AND revoked_at IS NULL',access.accountId)[0]?.n||0);
 return{plan:access.plan,label:isAdmin?'Quản trị hệ thống':defaults.label,dailyLimit,totalLimit,today,total,remaining:totalLimit!=null?Math.max(0,totalLimit-total):dailyLimit!=null?Math.max(0,dailyLimit-today):null,unlimited:isAdmin,activeKeys,supportZalo:SUPPORT_ZALO};
}
export function assertRenderAllowed(access:AccessContext){const usage=planUsage(access);if(access.role==='admin'||access.accountId==='legacy-admin')return usage;if(access.plan!=='free'&&!usage.activeKeys)throw Object.assign(new Error(`Gói ${usage.label} chưa có API riêng được kích hoạt. Liên hệ quản trị viên qua Zalo ${SUPPORT_ZALO}.`),{code:'PLAN_API_REQUIRED'});if(usage.totalLimit!=null&&usage.total>=usage.totalLimit)throw Object.assign(new Error(`Gói Free đã dùng hết ${usage.totalLimit} video. Liên hệ nâng cấp qua Zalo ${SUPPORT_ZALO}.`),{code:'QUOTA_EXCEEDED'});if(usage.dailyLimit!=null&&usage.today>=usage.dailyLimit)throw Object.assign(new Error(`Gói ${usage.label} đã đủ ${usage.dailyLimit} video hôm nay. Hạn mức sẽ làm mới lúc 00:00 giờ Việt Nam hoặc liên hệ Zalo ${SUPPORT_ZALO}.`),{code:'QUOTA_EXCEEDED'});return usage}
