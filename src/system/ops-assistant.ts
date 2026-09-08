import { productionAnalyticsSnapshot } from '../analytics/production.js';
import { listPublishJobs } from '../publish/queue.js';
import { publisherDeploymentReadiness } from '../publish/deployment-readiness.js';
import { renderJobs } from '../video/job.js';
import { listAuditEvents } from './audit.js';
import { monitorIncidents, productionMonitorSnapshot } from './monitor.js';

export type OpsSeverity='green'|'yellow'|'red';
export type OpsIntent='overview'|'render-slow'|'stuck-jobs'|'publish'|'youtube-live'|'resources'|'incidents'|'activity';
export interface OpsAssistantAnswer{
  mode:'rules'|'llm';
  intent:OpsIntent;
  severity:OpsSeverity;
  summary:string;
  findings:string[];
  recommendations:string[];
  evidence:Array<{label:string;value:string}>;
  generatedAt:string;
  readOnly:true;
  provider?:string;
}

function n(v:unknown,fallback=0){const x=Number(v);return Number.isFinite(x)?x:fallback}
function pct(v:unknown){return v==null?'—':`${n(v).toFixed(1).replace('.0','')}%`}
function duration(ms:unknown){const x=n(ms,-1);if(x<0)return'—';if(x<1000)return`${Math.round(x)} ms`;if(x<60000)return`${Math.round(x/1000)} giây`;if(x<3600000)return`${Math.round(x/60000)} phút`;return`${Math.round(x/360000)/10} giờ`}
function classify(q:string):OpsIntent{
  const s=q.toLocaleLowerCase('vi-VN');
  if(/youtube|live|oauth|kênh/.test(s))return'youtube-live';
  if(/kẹt|treo|stuck|backlog|hàng đợi|queue/.test(s))return'stuck-jobs';
  if(/render.*(chậm|lâu)|chậm.*render|tốc độ render/.test(s))return'render-slow';
  if(/publish|đăng|xuất bản/.test(s))return'publish';
  if(/ram|cpu|disk|ổ đĩa|4\s*gb|wyse|tối ưu|tài nguyên/.test(s))return'resources';
  if(/incident|sự cố|cảnh báo|red|yellow/.test(s))return'incidents';
  if(/ai làm|ai đã|hoạt động|audit|timeline|gần đây/.test(s))return'activity';
  return'overview';
}
function worst(...xs:OpsSeverity[]):OpsSeverity{return xs.includes('red')?'red':xs.includes('yellow')?'yellow':'green'}
function uniq(xs:string[]){return[...new Set(xs.filter(Boolean))].slice(0,8)}
function safeQuestion(v:unknown){const q=String(v||'').replace(/\s+/g,' ').trim();if(q.length<3||q.length>600)throw new Error('Câu hỏi cần từ 3 đến 600 ký tự');return q}

export async function opsAssistantContext(ownerId:string){
  const [monitor]=await Promise.all([productionMonitorSnapshot(ownerId)]);
  const analytics7=productionAnalyticsSnapshot(ownerId,7),analytics30=productionAnalyticsSnapshot(ownerId,30);
  const incidents=monitorIncidents(ownerId,30),audit=listAuditEvents(ownerId,20);
  const renders=renderJobs.filter(x=>x.ownerId===ownerId).slice(0,30);
  const publishes=listPublishJobs(ownerId).slice(0,50),deployment=publisherDeploymentReadiness(ownerId);
  return{monitor,analytics7,analytics30,incidents,audit,renders,publishes,deployment};
}

function rulesAnswer(question:string,ctx:Awaited<ReturnType<typeof opsAssistantContext>>):OpsAssistantAnswer{
  const intent=classify(question),m=ctx.monitor.components,a7=ctx.analytics7,findings:string[]=[],recommendations:string[]=[],evidence:Array<{label:string;value:string}>=[];
  const activeIncidents=ctx.incidents.filter(x=>x.active),stuckPublish=ctx.publishes.filter(x=>x.status==='publishing'&&Date.now()-Date.parse(x.updatedAt)>n(ctx.monitor.components.publish.stuckMs,900000));
  let severity:OpsSeverity=ctx.monitor.overall;
  const renderQueue=n(m.render.pending),publishQueue=n(ctx.monitor.publishQueue?.queued),renderLatency=n(a7.kpis.avgRenderQueueMs,-1),renderProcessing=n(a7.kpis.avgRenderProcessingMs,-1),publishLatency=n(a7.kpis.avgPublishQueueMs,-1);

  const addResource=()=>{
    findings.push(`RAM khả dụng ${n(m.memory.availableMb)} MB${m.memory.cgroupMemoryUsagePct!=null?`, container dùng ${n(m.memory.cgroupMemoryUsagePct)}%`:''}.`);
    findings.push(`CPU load/core ${n(m.cpu.loadPerCpu).toFixed(2)}; disk còn ${n((m.disk as any).freeMb)} MB.`);
    evidence.push({label:'RAM',value:`${n(m.memory.availableMb)} MB`},{label:'CPU load/core',value:n(m.cpu.loadPerCpu).toFixed(2)},{label:'Disk free',value:`${n((m.disk as any).freeMb)} MB`});
  };

  if(intent==='render-slow'){
    severity=worst(m.memory.severity,m.cpu.severity,m.disk.severity,m.render.severity);
    findings.push(`Render queue hiện có ${renderQueue} job; queue latency TB 7 ngày ${duration(renderLatency)}; processing TB ${duration(renderProcessing)}.`);
    if(m.render.watchdog?.stalled)findings.push(`Render worker đang STALLED tại ${m.render.watchdog.stage}.`);
    if(m.render.paused)findings.push('Render Queue đang PAUSED.');
    addResource();
    if(m.memory.severity!=='green')recommendations.push('Ưu tiên giảm áp lực RAM; giữ single worker và tránh chạy VieNeu/local AI đồng thời với FFmpeg.');
    if(m.disk.severity!=='green')recommendations.push('Chạy cleanup output hoặc tăng dung lượng trống trước khi render tiếp.');
    if(m.cpu.severity!=='green')recommendations.push('Giảm motion/độ phân giải hoặc tránh chạy tác vụ CPU nặng song song.');
    if(renderQueue>=n(m.render.warnBacklog,5))recommendations.push('Giữ queue tuần tự; xử lý job failed/stale trước khi nạp thêm batch lớn.');
    if(!recommendations.length)recommendations.push('Tài nguyên hiện ổn; nếu vẫn chậm, so sánh processing time từng video và media download/TTS để tìm bottleneck nội dung.');
  }else if(intent==='stuck-jobs'){
    const renderStuck=Boolean(m.render.watchdog?.stalled),failedRenders=ctx.renders.filter(x=>x.status==='failed'),failedPublish=ctx.publishes.filter(x=>x.status==='failed');
    severity=renderStuck||stuckPublish.length?'red':failedRenders.length||failedPublish.length||renderQueue||publishQueue?'yellow':'green';
    findings.push(`Render: ${renderQueue} chờ, ${failedRenders.length} failed${renderStuck?`, STALLED tại ${m.render.watchdog?.stage}`:''}.`);
    findings.push(`Publish: ${publishQueue} chờ, ${failedPublish.length} failed, ${stuckPublish.length} publishing quá ngưỡng.`);
    evidence.push({label:'Render pending',value:String(renderQueue)},{label:'Render failed',value:String(failedRenders.length)},{label:'Publish pending',value:String(publishQueue)},{label:'Publish failed',value:String(failedPublish.length)});
    if(renderStuck)recommendations.push('Dùng Stable Control để kiểm tra/pause và retry có kiểm soát; không khởi chạy worker thứ hai.');
    if(stuckPublish.length)recommendations.push('Kiểm tra Publish Worker và YouTube readiness trước khi retry job publishing bị kẹt.');
    if(failedRenders.length)recommendations.push('Mở job failed gần nhất, đọc error/checkpoint rồi mới Retry.');
    if(failedPublish.length)recommendations.push('Đọc lỗi provider của publish job trước khi Retry; không retry hàng loạt.');
    if(!recommendations.length)recommendations.push('Không phát hiện job kẹt hoặc failed trong snapshot hiện tại.');
  }else if(intent==='youtube-live'){
    severity=ctx.deployment.youtubeLiveReady?'green':ctx.deployment.config.liveEnabled?'red':'yellow';
    findings.push(`YouTube configurationReady=${ctx.deployment.configurationReady?'YES':'NO'}, LIVE gate=${ctx.deployment.youtubeLiveReady?'READY':'LOCKED'}, privacy=${ctx.deployment.config.privacyStatus}.`);
    if(ctx.deployment.blockers.length)findings.push(`Blocker: ${ctx.deployment.blockers.join(' | ')}`);
    findings.push(`Private Test: ${ctx.deployment.privateTest.passed?'PASS':'CHƯA PASS'}.`);
    evidence.push({label:'YouTube LIVE',value:ctx.deployment.youtubeLiveReady?'READY':'LOCKED'},{label:'Private Test',value:ctx.deployment.privateTest.passed?'PASS':'NO'},{label:'Privacy',value:String(ctx.deployment.config.privacyStatus)});
    if(!ctx.deployment.configurationReady)recommendations.push('Hoàn tất OAuth/credential và TEST KẾT NỐI trước.');
    if(ctx.deployment.productionPrivacyNeedsPrivateTest&&!ctx.deployment.privateTest.passed)recommendations.push('Chạy Private Live Test thành công trước khi dùng Public/Unlisted.');
    if(ctx.deployment.youtubeLiveReady)recommendations.push('Gate đã sẵn sàng; vẫn nên đăng Unlisted trước Public trong lần kích hoạt production đầu tiên.');
  }else if(intent==='publish'){
    severity=m.publish.severity;
    findings.push(`Publish 7 ngày: ${a7.kpis.publishPublished} thành công / ${a7.kpis.publishFailed} failed, success ${pct(a7.kpis.publishSuccessRate)}.`);
    findings.push(`Queue latency TB ${duration(publishLatency)}; pending hiện tại ${publishQueue}; worker: ${m.publish.message}.`);
    evidence.push({label:'Publish success',value:pct(a7.kpis.publishSuccessRate)},{label:'Queue latency',value:duration(publishLatency)},{label:'Pending',value:String(publishQueue)});
    if(m.publish.severity!=='green')recommendations.push('Xử lý worker/backlog hoặc job publishing bị kẹt trước khi tạo thêm live jobs.');
    if(a7.kpis.publishSuccessRate!=null&&n(a7.kpis.publishSuccessRate)<95)recommendations.push('Xem nhóm lỗi publish trong Audit/Queue; ưu tiên lỗi OAuth, network và provider trước khi retry.');
    if(!recommendations.length)recommendations.push('Publish pipeline hiện ổn; tiếp tục theo dõi success rate và queue latency.');
  }else if(intent==='resources'){
    severity=worst(m.memory.severity,m.cpu.severity,m.disk.severity);
    addResource();
    findings.push(`Self-Heal: ${ctx.monitor.selfHealing.enabled?'ON':'OFF'}${ctx.monitor.selfHealing.autoPaused?' • AUTO-PAUSED':''}.`);
    recommendations.push('Giữ FFmpeg single worker, 720p mặc định và Node heap thấp như cấu hình Wyse hiện tại.');
    recommendations.push('Không chạy local LLM lớn hoặc Stable Diffusion cùng lúc với render trên máy 4 GB.');
    if(m.memory.severity!=='green')recommendations.push('Giảm dịch vụ chạy đồng thời hoặc tăng swap; để Self-Heal bảo vệ Render Queue.');
    if(m.disk.severity!=='green')recommendations.push('Dọn output cũ/backup theo retention trước khi tăng batch.');
  }else if(intent==='incidents'){
    const red=activeIncidents.filter(x=>x.severity==='red'),yellow=activeIncidents.filter(x=>x.severity==='yellow');severity=red.length?'red':yellow.length?'yellow':'green';
    findings.push(`Có ${activeIncidents.length} incident active: ${red.length} RED, ${yellow.length} YELLOW.`);
    for(const x of activeIncidents.slice(0,5))findings.push(`${x.component.toUpperCase()}: ${x.message}${x.acknowledged?' • ACK':''}${x.silenced?' • SILENCED':''}`);
    evidence.push({label:'Active incidents',value:String(activeIncidents.length)},{label:'RED',value:String(red.length)},{label:'YELLOW',value:String(yellow.length)});
    recommendations.push(activeIncidents.length?'ACK sau khi đã tiếp nhận; chỉ Silence khi có lý do vận hành rõ ràng.':'Không có incident active; tiếp tục monitor.');
  }else if(intent==='activity'){
    severity=ctx.monitor.overall;
    findings.push(`Có ${ctx.audit.length} sự kiện audit gần nhất trong snapshot.`);
    for(const x of ctx.audit.slice(0,6))findings.push(`${x.actor.label}: ${x.summary}`);
    recommendations.push('Dùng bộ lọc Hoạt động gần đây để đối chiếu thay đổi operator với thời điểm incident/KPI xấu đi.');
  }else{
    severity=ctx.monitor.overall;
    findings.push(`System Health hiện ${ctx.monitor.overall.toUpperCase()}; ${activeIncidents.length} incident active.`);
    findings.push(`7 ngày: render success ${pct(a7.kpis.renderSuccessRate)}, publish success ${pct(a7.kpis.publishSuccessRate)}.`);
    findings.push(`Queue hiện tại: render ${renderQueue}, publish ${publishQueue}.`);
    evidence.push({label:'System',value:ctx.monitor.overall.toUpperCase()},{label:'Render success',value:pct(a7.kpis.renderSuccessRate)},{label:'Publish success',value:pct(a7.kpis.publishSuccessRate)});
    if(activeIncidents.length)recommendations.push('Xử lý incident RED trước, sau đó YELLOW; tránh tăng tải khi health chưa GREEN.');
    if(!ctx.deployment.youtubeLiveReady)recommendations.push('YouTube LIVE vẫn khóa; giữ workflow Dry-run/Private cho đến khi readiness đạt.');
    if(!recommendations.length)recommendations.push('Hệ thống đang ổn; tiếp tục theo dõi KPI 7/30 ngày và Audit Timeline.');
  }
  return{mode:'rules',intent,severity,summary:findings[0]||'Không có dữ liệu đáng chú ý.',findings:uniq(findings),recommendations:uniq(recommendations),evidence:evidence.slice(0,8),generatedAt:new Date().toISOString(),readOnly:true};
}

function llmEnabled(){return process.env.OPS_ASSISTANT_LLM_ENABLED==='true'}
function llmProvider(){
  if(process.env.GEMINI_API_KEY?.trim())return{id:'gemini',url:`${(process.env.GEMINI_API_URL||'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/openai\/?$/,'')}/models/${encodeURIComponent(process.env.GEMINI_MODEL?.trim()||'gemini-2.5-flash')}:generateContent`,key:process.env.GEMINI_API_KEY.trim()};
  if(process.env.AI_API_URL?.trim()&&process.env.AI_API_KEY?.trim()&&process.env.AI_MODEL?.trim())return{id:'custom',url:`${process.env.AI_API_URL.trim().replace(/\/$/,'')}/chat/completions`,key:process.env.AI_API_KEY.trim(),model:process.env.AI_MODEL.trim()};
  return undefined;
}
async function enhanceWithLlm(question:string,base:OpsAssistantAnswer,ctx:Awaited<ReturnType<typeof opsAssistantContext>>):Promise<OpsAssistantAnswer>{
  const p=llmProvider();if(!llmEnabled()||!p)return base;
  const compact={question,base,monitor:{overall:ctx.monitor.overall,components:Object.fromEntries(Object.entries(ctx.monitor.components).map(([k,v]:any)=>[k,{severity:v.severity,message:v.message}]))},kpis:ctx.analytics7.kpis,activeIncidents:ctx.incidents.filter(x=>x.active).slice(0,8).map(x=>({component:x.component,severity:x.severity,message:x.message})),youtube:{ready:ctx.deployment.youtubeLiveReady,blockers:ctx.deployment.blockers}};
  const prompt='Bạn là trợ lý vận hành READ-ONLY cho hệ thống Auto Media trên Dell Wyse 4GB. Chỉ phân tích dữ liệu được cung cấp; không bịa, không yêu cầu/hiển thị secrets, không tuyên bố đã thực hiện hành động. Trả JSON đúng schema {summary:string,findings:string[],recommendations:string[]} bằng tiếng Việt. Giữ recommendations là đề xuất cần người vận hành xác nhận. DATA='+JSON.stringify(compact);
  try{
    let text='';
    if(p.id==='gemini'){
      const r=await fetch(p.url,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':p.key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.1,maxOutputTokens:500,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d:any=await r.json();text=d?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('')||'';
    }else{
      const r=await fetch(p.url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${p.key}`},body:JSON.stringify({model:p.model,messages:[{role:'user',content:prompt}],temperature:0.1,max_tokens:500,response_format:{type:'json_object'}}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d:any=await r.json();text=String(d?.choices?.[0]?.message?.content||'');
    }
    const parsed=JSON.parse(text);return{...base,mode:'llm',provider:p.id,summary:String(parsed.summary||base.summary).slice(0,700),findings:uniq(Array.isArray(parsed.findings)?parsed.findings.map(String):base.findings),recommendations:uniq(Array.isArray(parsed.recommendations)?parsed.recommendations.map(String):base.recommendations)};
  }catch{return base}
}

export async function answerOpsQuestion(ownerId:string,questionInput:unknown){const question=safeQuestion(questionInput),ctx=await opsAssistantContext(ownerId),base=rulesAnswer(question,ctx);return enhanceWithLlm(question,base,ctx)}
export function opsAssistantStatus(){const p=llmProvider();return{enabled:true,readOnly:true,defaultMode:'rules',llmEnabled:llmEnabled(),llmConfigured:Boolean(p),provider:p?.id||null,maxQuestionChars:600,noSideEffects:true}}
