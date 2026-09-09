import { spawn } from 'node:child_process';
import { mkdtemp,rm,mkdir,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const dir=await mkdtemp(join(tmpdir(),'auto-media-prod-smoke-'));
const output=join(dir,'output');
await mkdir(output,{recursive:true});
const pkg=JSON.parse(await readFile('package.json','utf8'));
const port=18000+(process.pid%1000),revision='smoke-production-revision';
let logs='';
const child=spawn(process.execPath,['dist/server.js'],{
  env:{
    ...process.env,
    PORT:String(port),
    DB_PATH:join(dir,'smoke.sqlite'),
    RENDER_OUTPUT_DIR:output,
    RENDER_API_KEY:'smoke-auth-required',
    APP_REVISION:revision,
    RELEASE_CHANNEL:'stable',
    AUTOPILOT_ENABLED:'false',
    RENDER_QUEUE_PAUSED:'true',
    PUBLISH_LIVE_ENABLED:'false',
    PUBLISH_STARTUP_DIAGNOSTICS:'false',
    OLLAMA_ENABLED:'false',
    VIENEU_TTS_ENABLED:'false',
  },
  stdio:['ignore','pipe','pipe'],
});
child.stdout.on('data',d=>{logs=(logs+String(d)).slice(-8000)});
child.stderr.on('data',d=>{logs=(logs+String(d)).slice(-8000)});

try{
  let health;
  for(let i=0;i<80;i++){
    if(child.exitCode!==null)throw new Error(`server exited early with ${child.exitCode}: ${logs}`);
    try{
      const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(500)});
      if(r.ok){health=await r.json();break}
    }catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  if(!health?.ok)throw new Error(`compiled server did not become healthy: ${logs}`);
  if(health.storage!=='sqlite')throw new Error(`unexpected health storage: ${JSON.stringify(health)}`);
  if(health.version!==pkg.version)throw new Error(`health version drift: expected ${pkg.version}, got ${health.version}`);
  if(health.revision!==revision)throw new Error(`health revision drift: expected ${revision}, got ${health.revision}`);
  if(health.releaseChannel!=='stable')throw new Error(`health release channel drift: ${health.releaseChannel}`);
  const callback=await fetch(`http://127.0.0.1:${port}/api/publish-oauth/youtube/callback`,{redirect:'manual'});
  if(callback.status!==400)throw new Error(`YouTube OAuth callback must bypass login and validate signed callback data; got HTTP ${callback.status}`);
  const callbackText=await callback.text();
  if(!callbackText.includes('Thiếu dữ liệu OAuth'))throw new Error(`unexpected public OAuth callback response: ${callbackText.slice(0,200)}`);
  console.log(`compiled production server smoke OK • health v${health.version} • ${health.revision} • OAuth callback public/signed`);
}finally{
  if(child.exitCode===null){
    child.kill('SIGTERM');
    const force=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL')},3000);
    force.unref();
    await once(child,'exit').catch(()=>{});
    clearTimeout(force);
  }
  await rm(dir,{recursive:true,force:true});
}
