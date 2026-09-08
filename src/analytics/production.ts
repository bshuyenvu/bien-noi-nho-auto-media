import { all } from '../storage/db.js';

type RenderStatus='queued'|'rendering'|'ready'|'failed';
type RenderRow={id:string;status:RenderStatus;attempts:number;created_at:string;updated_at?:string;started_at?:string;completed_at?:string};
type PublishStatus='pending'|'scheduled'|'publishing'|'published'|'failed'|'cancelled';
type PublishRow={id:string;platform:string;status:PublishStatus;dry_run:number;deployment_test:number;created_at:string;updated_at:string;scheduled_at?:string;published_at?:string;started_at?:string;completed_at?:string};

const TZ='Asia/Ho_Chi_Minh';
function ms(value?:string){const n=value?Date.parse(value):NaN;return Number.isFinite(n)?n:undefined}
function avg(values:number[]){return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null}
function pct(ok:number,total:number){return total?Math.round(ok*1000/total)/10:null}
function localDay(value:string|number|Date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const v=(type:string)=>parts.find(x=>x.type===type)?.value||'';return `${v('year')}-${v('month')}-${v('day')}`}
function dayLabel(key:string){const [y,m,d]=key.split('-');return `${d}/${m}`}
function recentDays(days:number){const out:string[]=[];for(let i=days-1;i>=0;i--)out.push(localDay(Date.now()-i*86400000));return out}
function renderCompletedAt(r:RenderRow){return r.completed_at||(r.status==='ready'||r.status==='failed'?r.updated_at:undefined)}
function publishCompletedAt(r:PublishRow){return r.completed_at||(r.status==='published'||r.status==='failed'||r.status==='cancelled'?r.updated_at:undefined)}
function renderTiming(r:RenderRow){const created=ms(r.created_at),started=ms(r.started_at),completed=ms(renderCompletedAt(r));return{queueMs:created!=null&&started!=null?Math.max(0,started-created):undefined,processingMs:started!=null&&completed!=null?Math.max(0,completed-started):undefined,cycleMs:created!=null&&completed!=null?Math.max(0,completed-created):undefined,measured:started!=null&&completed!=null}}
function publishTiming(r:PublishRow){const created=ms(r.created_at),scheduled=ms(r.scheduled_at),due=created==null?undefined:scheduled!=null&&scheduled>created?scheduled:created,started=ms(r.started_at),completed=ms(publishCompletedAt(r));return{queueMs:due!=null&&started!=null?Math.max(0,started-due):undefined,processingMs:started!=null&&completed!=null?Math.max(0,completed-started):undefined,cycleMs:created!=null&&completed!=null?Math.max(0,completed-created):undefined,measured:started!=null&&completed!=null}}

export function productionAnalyticsSnapshot(ownerId:string,daysInput=7){
  const days=daysInput===30?30:7,cutoff=new Date(Date.now()-days*86400000).toISOString();
  const renders=all<RenderRow>('SELECT id,status,attempts,created_at,updated_at,started_at,completed_at FROM render_jobs WHERE owner_id=? AND (created_at>=? OR updated_at>=?)',ownerId,cutoff,cutoff);
  const publishes=all<PublishRow>('SELECT id,platform,status,dry_run,deployment_test,created_at,updated_at,scheduled_at,published_at,started_at,completed_at FROM publish_jobs WHERE owner_id=? AND (created_at>=? OR updated_at>=?)',ownerId,cutoff,cutoff);
  const renderTerminal=renders.filter(r=>{const t=renderCompletedAt(r);return Boolean(t&&t>=cutoff&&(r.status==='ready'||r.status==='failed'))});
  const publishTerminal=publishes.filter(r=>{const t=publishCompletedAt(r);return Boolean(t&&t>=cutoff&&(r.status==='published'||r.status==='failed'))});
  const renderReady=renderTerminal.filter(x=>x.status==='ready').length,renderFailed=renderTerminal.filter(x=>x.status==='failed').length;
  const publishPublished=publishTerminal.filter(x=>x.status==='published').length,publishFailed=publishTerminal.filter(x=>x.status==='failed').length;
  const renderTimings=renderTerminal.map(renderTiming),publishTimings=publishTerminal.map(publishTiming);
  const buckets=new Map(recentDays(days).map(day=>[day,{day,label:dayLabel(day),renderReady:0,renderFailed:0,publishPublished:0,publishFailed:0}]));
  for(const r of renderTerminal){const done=renderCompletedAt(r);if(!done)continue;const b=buckets.get(localDay(done));if(b)r.status==='ready'?b.renderReady++:b.renderFailed++}
  for(const p of publishTerminal){const done=publishCompletedAt(p);if(!done)continue;const b=buckets.get(localDay(done));if(b)p.status==='published'?b.publishPublished++:b.publishFailed++}
  const byPlatform=['youtube','facebook','tiktok'].map(platform=>{const rows=publishTerminal.filter(x=>x.platform===platform),ok=rows.filter(x=>x.status==='published').length,failed=rows.filter(x=>x.status==='failed').length;return{platform,published:ok,failed,successRate:pct(ok,ok+failed)}});
  return{
    generatedAt:new Date().toISOString(),timezone:TZ,period:{days,from:cutoff,to:new Date().toISOString()},
    kpis:{videosReady:renderReady,renderFailed,publishPublished,publishFailed,renderSuccessRate:pct(renderReady,renderReady+renderFailed),publishSuccessRate:pct(publishPublished,publishPublished+publishFailed),avgRenderQueueMs:avg(renderTimings.flatMap(x=>x.queueMs==null?[]:[x.queueMs])),avgRenderProcessingMs:avg(renderTimings.flatMap(x=>x.processingMs==null?[]:[x.processingMs])),avgPublishQueueMs:avg(publishTimings.flatMap(x=>x.queueMs==null?[]:[x.queueMs])),avgPublishProcessingMs:avg(publishTimings.flatMap(x=>x.processingMs==null?[]:[x.processingMs]))},
    render:{created:renders.filter(x=>x.created_at>=cutoff).length,terminal:renderTerminal.length,ready:renderReady,failed:renderFailed,active:renders.filter(x=>x.status==='queued'||x.status==='rendering').length,avgAttempts:renderTerminal.length?Math.round(renderTerminal.reduce((s,x)=>s+Number(x.attempts||0),0)*10/renderTerminal.length)/10:null,timingMeasured:renderTimings.filter(x=>x.measured).length,avgCycleMs:avg(renderTimings.flatMap(x=>x.cycleMs==null?[]:[x.cycleMs]))},
    publish:{created:publishes.filter(x=>x.created_at>=cutoff).length,terminal:publishTerminal.length,published:publishPublished,failed:publishFailed,pending:publishes.filter(x=>x.status==='pending'||x.status==='scheduled'||x.status==='publishing').length,dryRun:publishes.filter(x=>Boolean(x.dry_run)).length,live:publishes.filter(x=>!x.dry_run).length,deploymentTests:publishes.filter(x=>Boolean(x.deployment_test)).length,timingMeasured:publishTimings.filter(x=>x.measured).length,avgCycleMs:avg(publishTimings.flatMap(x=>x.cycleMs==null?[]:[x.cycleMs])),byPlatform},
    daily:[...buckets.values()],
    timing:{note:'Queue latency dùng started_at thực tế. Publish scheduled job tính từ thời điểm đến hạn, không tính thời gian chờ lịch. Job lịch sử thiếu started_at dùng được throughput/success nhưng không đưa vào latency.',measuredRenderJobs:renderTimings.filter(x=>x.measured).length,measuredPublishJobs:publishTimings.filter(x=>x.measured).length}
  };
}
