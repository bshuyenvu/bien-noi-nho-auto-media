import { pathToFileURL } from 'node:url';

const base=String(process.env.CUTOVER_API_BASE||'http://127.0.0.1:8787').replace(/\/$/,'');
const apiKey=String(process.env.RENDER_API_KEY||'').trim();
const timeoutMs=Math.max(1000,Number(process.env.CUTOVER_API_TIMEOUT_MS||10000));

async function request(path,{method='GET',body,auth=true}={}){
  const headers={accept:'application/json'};
  if(auth){if(!apiKey)throw new Error('RENDER_API_KEY is required for cutover API operations');headers.authorization=`Bearer ${apiKey}`}
  if(body!==undefined)headers['content-type']='application/json';
  const res=await fetch(`${base}${path}`,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});
  const text=await res.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!res.ok){const error=String(data.error||data.raw||`HTTP ${res.status}`).slice(0,1000);throw new Error(`${path} -> HTTP ${res.status}: ${error}`)}
  return data;
}
function scalar(value){process.stdout.write(String(value??''))}
function jobsArray(x){return Array.isArray(x)?x:Array.isArray(x?.items)?x.items:[]}
function unusableYoutubeRenderIds(publish){return new Set(jobsArray(publish).filter(x=>x.platform==='youtube'&&!['failed','cancelled'].includes(String(x.status))).map(x=>String(x.renderJobId||'')))}
function selectCandidate(renders,publish,excluded=[]){const blocked=unusableYoutubeRenderIds(publish),skip=new Set(excluded.filter(Boolean).map(String));return jobsArray(renders).filter(x=>x.status==='ready'&&x.output&&!blocked.has(String(x.id))&&!skip.has(String(x.id))).sort((a,b)=>Date.parse(String(b.updatedAt||b.createdAt||0))-Date.parse(String(a.updatedAt||a.createdAt||0)))[0]}
function findJob(list,id){return jobsArray(list).find(x=>String(x.id)===String(id))}
function latestCanary(list){return jobsArray(list).filter(x=>x.platform==='youtube'&&String(x.title||'').startsWith('UNLISTED CANARY •')).sort((a,b)=>Date.parse(String(b.createdAt||0))-Date.parse(String(a.createdAt||0)))[0]}
function safeJob(j){if(!j)return undefined;return{id:j.id,renderJobId:j.renderJobId,draftId:j.draftId,platform:j.platform,status:j.status,title:j.title,publishedAt:j.publishedAt,remoteId:j.remoteId,remoteUrl:j.remoteUrl,error:j.error,attempts:j.attempts,maxAttempts:j.maxAttempts,deploymentTest:Boolean(j.deploymentTest)}}

export {request,selectCandidate};

async function command(argv=process.argv.slice(2)){
  const [op,...args]=argv;
  if(!op)throw new Error('Missing cutover-client operation');
  if(op==='oauth-test'){const x=await request('/api/publish-oauth/youtube/test',{method:'POST'});scalar(x.channelTitle||x.channelId||'OK');return}
  if(op==='release-verdict'){const x=await request('/api/admin/release-readiness');scalar(x.verdict||'UNKNOWN');return}
  if(op==='wizard-json'){console.log(JSON.stringify(await request('/api/admin/activation-wizard')));return}
  if(op==='wizard-privacy'){const x=await request('/api/admin/activation-wizard');scalar(x.privacy||'');return}
  if(op==='wizard-armed'){const x=await request('/api/admin/activation-wizard');scalar(Boolean(x.state?.armed));return}
  if(op==='wizard-max-privacy'){const x=await request('/api/admin/activation-wizard');scalar(x.state?.maxPrivacy||'private');return}
  if(op==='wizard-unlisted-verified'){const x=await request('/api/admin/activation-wizard');scalar(Boolean(x.state?.unlistedVerifiedAt));return}
  if(op==='wizard-public-approved'){const x=await request('/api/admin/activation-wizard');scalar(Boolean(x.state?.publicApprovedAt));return}
  if(op==='kill-switch-engaged'){const x=await request('/api/admin/activation-wizard');scalar(Boolean(x.killSwitch?.engaged));return}
  if(op==='private-test-passed'){const x=await request('/api/admin/activation-wizard');scalar(Boolean(x.release?.deployment?.privateTest?.passed));return}
  if(op==='backup-confirm'){await request('/api/admin/activation-wizard/backup-confirm',{method:'POST',body:{note:String(args[0]||'Production cutover backup')}});scalar('OK');return}
  if(op==='arm'){await request('/api/admin/activation-wizard/arm',{method:'POST',body:{confirmation:'ARM LIVE'}});scalar('OK');return}
  if(op==='authorize-unlisted'){await request('/api/admin/activation-wizard/authorize-unlisted',{method:'POST',body:{confirmation:'AUTHORIZE UNLISTED'}});scalar('OK');return}
  if(op==='verify-unlisted'){const remoteId=String(args[0]||'').trim();if(!remoteId)throw new Error('verify-unlisted requires remoteId');await request('/api/admin/activation-wizard/verify-unlisted',{method:'POST',body:{confirmation:'UNLISTED VERIFIED',remoteId}});scalar('OK');return}
  if(op==='kill-switch'){const reason=String(args.join(' ')||'Production cutover safety stop');await request('/api/admin/activation-wizard/kill-switch',{method:'POST',body:{reason}});scalar('ENGAGED');return}
  if(op==='candidate'){
    const [renders,publish]=await Promise.all([request('/api/render-jobs'),request('/api/publish-jobs')]);const chosen=selectCandidate(renders,publish,args);scalar(chosen?.id||'');return
  }
  if(op==='latest-canary-job-id'){const list=await request('/api/publish-jobs');scalar(latestCanary(list)?.id||'');return}
  if(op==='private-test'){
    const renderJobId=String(args[0]||'').trim();if(!renderJobId)throw new Error('private-test requires renderJobId');const x=await request('/api/publish-deployment/youtube/private-test',{method:'POST',body:{renderJobId}});scalar(x.id||'');return
  }
  if(op==='create-canary'){
    const renderJobId=String(args[0]||'').trim();if(!renderJobId)throw new Error('create-canary requires renderJobId');const stamp=new Date().toISOString();const x=await request('/api/publish-jobs',{method:'POST',body:{renderJobId,platform:'youtube',dryRun:false,title:`UNLISTED CANARY • ${stamp}`,description:'VietNewsFlow AI production cutover canary. Verify this Unlisted video before any manual PUBLIC approval.'}});scalar(x.id||'');return
  }
  if(op==='worker-run'){await request('/api/publish-worker/run',{method:'POST'});scalar('OK');return}
  if(op.startsWith('job-')){
    const id=String(args[0]||'').trim();if(!id)throw new Error(`${op} requires jobId`);const list=await request('/api/publish-jobs'),job=findJob(list,id);if(!job)throw new Error(`Publish job not found: ${id}`);
    if(op==='job-status')return scalar(job.status);
    if(op==='job-remote-id')return scalar(job.remoteId||'');
    if(op==='job-remote-url')return scalar(job.remoteUrl||'');
    if(op==='job-error')return scalar(job.error||'');
  }
  if(op==='report-json'||op==='report-md'){
    const privateJobId=String(args[0]||''),canaryJobId=String(args[1]||''),backupRef=String(args[2]||'');
    const [health,release,wizard,publish]=await Promise.all([request('/health',{auth:false}),request('/api/admin/release-readiness'),request('/api/admin/activation-wizard'),request('/api/publish-jobs')]);
    const privateJob=safeJob(findJob(publish,privateJobId)),canaryJob=safeJob(findJob(publish,canaryJobId)||latestCanary(publish)),privateEvidence=wizard.release?.deployment?.privateTest||{};
    const report={generatedAt:new Date().toISOString(),cutoverStatus:canaryJob?.status==='published'&&Boolean(wizard.state?.unlistedVerifiedAt)?'CANARY_VERIFIED':'INCOMPLETE',release:{version:release.release?.version,revision:release.release?.revision,channel:release.release?.channel,verdict:release.verdict,candidateReady:Boolean(release.candidateReady)},service:{healthOk:Boolean(health.ok),service:health.service,storage:health.storage},backupRef,activation:{status:wizard.state?.status,armed:Boolean(wizard.state?.armed),maxPrivacy:wizard.state?.maxPrivacy,environmentPrivacy:wizard.privacy,killSwitchEngaged:Boolean(wizard.killSwitch?.engaged),unlistedVerifiedAt:wizard.state?.unlistedVerifiedAt,unlistedTestVideoId:wizard.state?.unlistedTestVideoId,publicApprovedAt:wizard.state?.publicApprovedAt},privateTest:{passed:Boolean(privateEvidence.passed),passedAt:privateEvidence.passedAt,videoId:privateEvidence.videoId,job:privateJob},unlistedCanary:canaryJob,nextAction:'PUBLIC is NOT automatic. Review the Unlisted canary and approve PUBLIC manually in Production Activation Wizard only if acceptable.'};
    if(op==='report-json'){console.log(JSON.stringify(report,null,2));return}
    console.log(`# Production Cutover Report\n\n- Generated: ${report.generatedAt}\n- Status: **${report.cutoverStatus}**\n- Release: v${report.release.version||'?'} • ${String(report.release.revision||'unknown').slice(0,12)} • ${report.release.verdict||'UNKNOWN'}\n- Backup: \`${backupRef||'unknown'}\`\n- Activation: ${report.activation.armed?'ARMED':'DISARMED'} • max ${String(report.activation.maxPrivacy||'?').toUpperCase()} • env ${String(report.activation.environmentPrivacy||'?').toUpperCase()}\n- Kill Switch: ${report.activation.killSwitchEngaged?'ENGAGED':'OFF'}\n- Private Test: ${report.privateTest.passed?'PASS':'NO'}${report.privateTest.videoId?` • ${report.privateTest.videoId}`:''}\n- Unlisted Canary: ${canaryJob?.status||'not-run'}${canaryJob?.remoteId?` • ${canaryJob.remoteId}`:''}\n- Unlisted verified: ${report.activation.unlistedVerifiedAt||'NO'}\n- PUBLIC approved: ${report.activation.publicApprovedAt||'NO'}\n\n## Next action\n\n${report.nextAction}\n`);return
  }
  throw new Error(`Unknown cutover-client operation: ${op}`);
}

const isMain=Boolean(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href);
if(isMain)command().catch(e=>{console.error(`[cutover-api] ${e instanceof Error?e.message:String(e)}`);process.exit(1)});
