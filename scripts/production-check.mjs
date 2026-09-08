const base=String(process.env.PROD_CHECK_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
const apiKey=String(process.env.RENDER_API_KEY||'').trim();
const strict=process.env.PROD_CHECK_STRICT==='true';
const timeoutMs=Math.max(1000,Number(process.env.PROD_CHECK_TIMEOUT_MS||5000));

async function request(path,authenticated=false){
  const headers={accept:'application/json'};
  if(authenticated&&apiKey)headers.authorization=`Bearer ${apiKey}`;
  const r=await fetch(`${base}${path}`,{headers,signal:AbortSignal.timeout(timeoutMs)});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
  if(!r.ok)throw new Error(`${path} -> HTTP ${r.status}: ${String(data.error||text||'unknown').slice(0,300)}`);return data;
}
function line(label,ok,detail=''){console.log(`${ok?'✓':'✗'} ${label}${detail?`: ${detail}`:''}`)}
try{
  const health=await request('/health');if(!health.ok)throw new Error('/health did not return ok=true');line('Service health',true,`${health.service||'auto-media'} / ${health.storage||'storage unknown'}`);
  if(!apiKey){line('Authenticated production checks',false,'skipped because RENDER_API_KEY is not set locally');if(strict)throw new Error('PROD_CHECK_STRICT=true requires RENDER_API_KEY');process.exit(0)}
  const monitoring=await request('/api/admin/monitoring',true),snapshot=monitoring.snapshot||{},overall=String(snapshot.overall||'unknown');line('Production monitor',overall!=='red',overall.toUpperCase());
  const components=snapshot.components||{};for(const name of ['memory','cpu','disk','render','publish','youtube']){const c=components[name];if(c?.severity&&c.severity!=='green')console.log(`  ${name}: ${String(c.severity).toUpperCase()} • ${c.message||''}`)}
  const activeIncidents=Array.isArray(monitoring.incidents)?monitoring.incidents.filter(x=>x.active):[];if(activeIncidents.length){const acked=activeIncidents.filter(x=>x.acknowledged).length,silenced=activeIncidents.filter(x=>x.silenced).length;console.log(`  Active incidents: ${activeIncidents.length} • ACK ${acked} • silenced ${silenced}`)}
  const maintenance=monitoring.maintenance||snapshot.maintenance||{};line('Maintenance window',true,maintenance.active?`ACTIVE until ${maintenance.endsAt||'?'} • ${maintenance.reason||'maintenance'}`:'OFF');
  const selfHeal=snapshot.selfHealing||{};line('Safe self-heal',selfHeal.enabled!==false,selfHeal.enabled===false?'OFF':selfHeal.autoPaused?`AUTO-PAUSED • green ${selfHeal.greenCycles||0}/${selfHeal.requiredGreen||3}`:'ON');
  const alerting=snapshot.alerting||{},channels=alerting.channels||{},enabledChannels=[channels.webhook?'webhook':'',channels.telegram?'telegram':'',channels.email?'email':''].filter(Boolean);line('External alerts',Boolean(alerting.enabled),alerting.enabled?`${enabledChannels.join(', ')} • min ${String(alerting.minSeverity||'red').toUpperCase()}${maintenance.active?' • MUTED BY MAINTENANCE':''}`:'not configured');
  const audit=await request('/api/admin/audit?limit=1',true);line('Operator audit trail',Boolean(audit.stats),audit.stats?`${audit.stats.total||0} events • retention ${audit.stats.retentionDays||90}d`:'unavailable');
  const analytics=await request('/api/admin/analytics?days=7',true),k=analytics.kpis||{};line('Production analytics',Boolean(analytics.period&&analytics.daily),analytics.period?`7d • render OK ${k.videosReady||0} • publish OK ${k.publishPublished||0}`:'unavailable');
  const ops=await request('/api/admin/ops-assistant/status',true);line('AI operations assistant',Boolean(ops.readOnly&&ops.noSideEffects),`${ops.defaultMode||'rules'} • read-only${ops.llmEnabled&&ops.llmConfigured?` • LLM ${ops.provider||'configured'}`:''}`);
  const deployment=await request('/api/publish-deployment-readiness',true);line('Publisher configuration',Boolean(deployment.configurationReady),deployment.configurationReady?'configured':'not complete');line('YouTube production gate',Boolean(deployment.youtubeLiveReady),deployment.youtubeLiveReady?'READY':'LOCKED');
  const blockers=Array.isArray(deployment.blockers)?deployment.blockers:[];if(blockers.length)console.log(`  Blockers: ${blockers.join(' | ')}`);const privacy=deployment.config?.privacyStatus;if(privacy)console.log(`  YouTube privacy: ${privacy}`);if(deployment.privateTest?.passed)console.log(`  Private test: PASS (${deployment.privateTest.videoId||'video id recorded'})`);
  if(strict){if(overall==='red')throw new Error('Production monitor reports RED');if(!ops.readOnly||!ops.noSideEffects)throw new Error('AI operations assistant safety contract is not read-only');if(!deployment.configurationReady)throw new Error('Publisher configuration is not ready');if(process.env.PUBLISH_LIVE_ENABLED==='true'&&!deployment.youtubeLiveReady)throw new Error('LIVE requested but YouTube production gate is locked')}
  console.log('Production check completed.');
}catch(e){console.error(`Production check failed: ${e instanceof Error?e.message:String(e)}`);process.exit(1)}
