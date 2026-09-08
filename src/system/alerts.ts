import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { all, run } from '../storage/db.js';

export type AlertSeverity='green'|'yellow'|'red';
export type AlertKind='open'|'update'|'recovery'|'test';
export interface AlertEvent {
  incidentId:string;
  ownerId:string;
  kind:AlertKind;
  component:string;
  severity:AlertSeverity;
  message:string;
  occurredAt:string;
}
type AlertChannel='webhook'|'telegram'|'email';
type DeliveryRow={channel:AlertChannel;kind:AlertKind;severity:AlertSeverity;status:'sent'|'failed';error?:string;sent_at:string};

const rank:Record<AlertSeverity,number>={green:0,yellow:1,red:2};
let smtpTransport:ReturnType<typeof nodemailer.createTransport>|undefined;

function envNumber(name:string,fallback:number){const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?n:fallback}
function envBool(name:string,fallback=false){const raw=process.env[name];return raw==null?fallback:raw==='true'}
function minSeverity():AlertSeverity{const value=String(process.env.ALERT_MIN_SEVERITY||'red').toLowerCase();return value==='yellow'||value==='green'?value:'red'}
function configuredChannels():AlertChannel[]{const out:AlertChannel[]=[];if(process.env.ALERT_WEBHOOK_URL)out.push('webhook');if(process.env.ALERT_TELEGRAM_BOT_TOKEN&&process.env.ALERT_TELEGRAM_CHAT_ID)out.push('telegram');if(process.env.ALERT_SMTP_HOST&&process.env.ALERT_EMAIL_FROM&&process.env.ALERT_EMAIL_TO)out.push('email');return out}
function safeError(e:unknown){const raw=e instanceof Error?e.message:String(e);return raw.replace(/bot\d+:[A-Za-z0-9_-]+/g,'bot<redacted>').replace(/(password|pass|token|secret)=?[^\s,;]*/gi,'$1=<redacted>').slice(0,500)}
function messageText(event:AlertEvent){const state=event.kind==='recovery'?'PHỤC HỒI':event.kind==='test'?'KIỂM TRA':'CẢNH BÁO';return `[${state}] Auto Media\nIncident: ${event.incidentId}\nComponent: ${event.component}\nSeverity: ${event.severity.toUpperCase()}\n${event.message}\nTime: ${event.occurredAt}`}
function latestDelivery(event:AlertEvent,channel:AlertChannel){return all<DeliveryRow>("SELECT channel,kind,severity,status,error,sent_at FROM system_alert_deliveries WHERE incident_id=? AND channel=? ORDER BY sent_at DESC LIMIT 1",event.incidentId,channel)[0]}
function hadAlert(event:AlertEvent,channel:AlertChannel){return Boolean(all<{n:number}>("SELECT COUNT(*) AS n FROM system_alert_deliveries WHERE incident_id=? AND channel=? AND status='sent' AND kind!='recovery'",event.incidentId,channel)[0]?.n)}
function shouldDeliver(event:AlertEvent,channel:AlertChannel,force=false){
  if(force||event.kind==='test')return true;
  if(event.kind==='recovery')return envBool('ALERT_NOTIFY_RECOVERY',true)&&hadAlert(event,channel);
  if(rank[event.severity]<rank[minSeverity()])return false;
  const latest=latestDelivery(event,channel);if(!latest)return true;
  const age=Date.now()-Date.parse(latest.sent_at||'');
  if(latest.status==='failed')return !Number.isFinite(age)||age>=envNumber('ALERT_FAILURE_RETRY_MS',5*60_000);
  if(rank[event.severity]>rank[latest.severity])return true;
  return !Number.isFinite(age)||age>=envNumber('ALERT_COOLDOWN_MS',60*60_000);
}
function record(event:AlertEvent,channel:AlertChannel,status:'sent'|'failed',error?:string){run('INSERT INTO system_alert_deliveries(id,incident_id,owner_id,channel,kind,severity,status,error,sent_at) VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),event.incidentId,event.ownerId,channel,event.kind,event.severity,status,error||null,new Date().toISOString())}
function webhookUrl(){const raw=String(process.env.ALERT_WEBHOOK_URL||'').trim();if(!raw)return undefined;const url=new URL(raw);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&envBool('ALERT_WEBHOOK_ALLOW_HTTP',false)))throw new Error('Alert webhook phải dùng HTTPS');return url}
async function sendWebhook(event:AlertEvent){const url=webhookUrl();if(!url)throw new Error('Webhook chưa cấu hình');const headers:Record<string,string>={'content-type':'application/json','user-agent':'auto-media-monitor/1'};const bearer=String(process.env.ALERT_WEBHOOK_BEARER_TOKEN||'').trim();if(bearer)headers.authorization=`Bearer ${bearer}`;const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({service:'bien-noi-nho-auto-media',...event}),signal:AbortSignal.timeout(envNumber('ALERT_SEND_TIMEOUT_MS',7000))});if(!response.ok)throw new Error(`Webhook HTTP ${response.status}`)}
async function sendTelegram(event:AlertEvent){const token=String(process.env.ALERT_TELEGRAM_BOT_TOKEN||'').trim(),chatId=String(process.env.ALERT_TELEGRAM_CHAT_ID||'').trim();if(!token||!chatId)throw new Error('Telegram chưa cấu hình');const body:Record<string,unknown>={chat_id:chatId,text:messageText(event),disable_web_page_preview:true};const thread=Number(process.env.ALERT_TELEGRAM_THREAD_ID);if(Number.isInteger(thread)&&thread>0)body.message_thread_id=thread;const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(envNumber('ALERT_SEND_TIMEOUT_MS',7000))});let data:{ok?:boolean;description?:string}={};try{data=await response.json() as typeof data}catch{}if(!response.ok||data.ok===false)throw new Error(`Telegram sendMessage failed${response.status?` HTTP ${response.status}`:''}${data.description?`: ${data.description}`:''}`)}
function transporter(){if(smtpTransport)return smtpTransport;const host=String(process.env.ALERT_SMTP_HOST||'').trim(),port=Math.max(1,Number(process.env.ALERT_SMTP_PORT||587)),secure=envBool('ALERT_SMTP_SECURE',port===465),user=String(process.env.ALERT_SMTP_USER||'').trim(),pass=String(process.env.ALERT_SMTP_PASS||'');if(!host)throw new Error('SMTP chưa cấu hình');const timeout=envNumber('ALERT_SEND_TIMEOUT_MS',7000);smtpTransport=nodemailer.createTransport({host,port,secure,auth:user?{user,pass}:undefined,connectionTimeout:timeout,greetingTimeout:timeout,socketTimeout:timeout*2});return smtpTransport}
async function sendEmail(event:AlertEvent){const from=String(process.env.ALERT_EMAIL_FROM||'').trim(),to=String(process.env.ALERT_EMAIL_TO||'').trim();if(!from||!to)throw new Error('Email alert chưa cấu hình');await transporter().sendMail({from,to,subject:`[Auto Media ${event.kind==='recovery'?'RECOVERY':event.severity.toUpperCase()}] ${event.component}`,text:messageText(event)})}
async function sendChannel(event:AlertEvent,channel:AlertChannel){if(channel==='webhook')return sendWebhook(event);if(channel==='telegram')return sendTelegram(event);return sendEmail(event)}

export async function dispatchExternalAlert(event:AlertEvent,force=false){
  const results:{channel:AlertChannel;sent:boolean;error?:string}[]=[];
  for(const channel of configuredChannels()){
    if(!shouldDeliver(event,channel,force)){results.push({channel,sent:false});continue}
    try{await sendChannel(event,channel);record(event,channel,'sent');results.push({channel,sent:true})}
    catch(e){const error=safeError(e);record(event,channel,'failed',error);console.warn(`[alert-delivery] ${channel} failed: ${error}`);results.push({channel,sent:false,error})}
  }
  return results;
}
export async function sendExternalAlertTest(ownerId:string){const event:AlertEvent={incidentId:`test:${randomUUID()}`,ownerId,kind:'test',component:'alerting',severity:'red',message:'Đây là cảnh báo kiểm tra từ Production Monitor. Không có hành động production nào được thay đổi.',occurredAt:new Date().toISOString()};return{event,results:await dispatchExternalAlert(event,true)}}
export function alertingStatus(){const channels=configuredChannels(),rows=all<{status:string;sent_at:string}>('SELECT status,sent_at FROM system_alert_deliveries ORDER BY sent_at DESC LIMIT 100');return{enabled:channels.length>0,channels:{webhook:channels.includes('webhook'),telegram:channels.includes('telegram'),email:channels.includes('email')},minSeverity:minSeverity(),cooldownMs:envNumber('ALERT_COOLDOWN_MS',60*60_000),notifyRecovery:envBool('ALERT_NOTIFY_RECOVERY',true),lastDeliveryAt:rows[0]?.sent_at,failedRecent:rows.filter(x=>x.status==='failed').length}}
