import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile),seen=[];
const server=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString('utf8');let body={};try{body=raw?JSON.parse(raw):{}}catch{}
  seen.push({method:req.method,url:req.url,body,auth:req.headers.authorization});
  res.setHeader('content-type','application/json');
  if(req.headers.authorization!=='Bearer smoke-key'){res.statusCode=401;return res.end(JSON.stringify({error:'bad auth'}))}
  if(req.method==='GET'&&req.url==='/api/render-jobs')return res.end(JSON.stringify([
    {id:'render-used',status:'ready',output:'output/used.mp4',createdAt:'2026-09-08T10:00:00Z'},
    {id:'render-canary',status:'ready',output:'output/canary.mp4',createdAt:'2026-09-08T12:00:00Z'},
    {id:'render-third',status:'ready',output:'output/third.mp4',createdAt:'2026-09-08T11:00:00Z'}
  ]));
  if(req.method==='GET'&&req.url==='/api/publish-jobs')return res.end(JSON.stringify({items:[{id:'old',renderJobId:'render-used',platform:'youtube',status:'published',title:'old'}]}));
  if(req.method==='POST'&&req.url==='/api/publish-jobs'){
    if(body.renderJobId!=='render-canary'||body.platform!=='youtube'||body.dryRun!==false||!String(body.title||'').startsWith('UNLISTED CANARY •')){res.statusCode=400;return res.end(JSON.stringify({error:'bad canary body'}))}
    return res.end(JSON.stringify({id:'canary-job'}));
  }
  if(req.method==='POST'&&req.url==='/api/admin/activation-wizard/verify-unlisted'){
    if(body.confirmation!=='UNLISTED VERIFIED'||body.remoteId!=='remote-123'){res.statusCode=400;return res.end(JSON.stringify({error:'bad verify body'}))}
    return res.end(JSON.stringify({ok:true}));
  }
  if(req.method==='POST'&&req.url==='/api/admin/activation-wizard/kill-switch')return res.end(JSON.stringify({ok:true}));
  res.statusCode=404;res.end(JSON.stringify({error:'not found'}));
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const addr=server.address();if(!addr||typeof addr==='string')throw new Error('mock server address unavailable');
const env={...process.env,CUTOVER_API_BASE:`http://127.0.0.1:${addr.port}`,RENDER_API_KEY:'smoke-key',CUTOVER_API_TIMEOUT_MS:'3000'};
async function run(...args){const {stdout}=await execFileAsync(process.execPath,['scripts/cutover-client.mjs',...args],{env,cwd:process.cwd()});return stdout.trim()}
try{
  if(await run('candidate')!=='render-canary')throw new Error('candidate selection did not skip previously published render');
  if(await run('candidate','render-canary')!=='render-third')throw new Error('candidate exclusion failed');
  if(await run('create-canary','render-canary')!=='canary-job')throw new Error('canary enqueue failed');
  if(await run('verify-unlisted','remote-123')!=='OK')throw new Error('unlisted verify failed');
  if(await run('kill-switch','smoke safety')!=='ENGAGED')throw new Error('kill switch command failed');
  if(seen.some(x=>String(x.url).includes('approve-public')))throw new Error('cutover client must never call approve-public');
  console.log('production cutover client mock API smoke OK');
}finally{server.close()}
