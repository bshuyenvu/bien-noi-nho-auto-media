import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';

function packageVersion(){
  try{
    const raw=readFileSync(join(process.cwd(),'package.json'),'utf8');
    const parsed=JSON.parse(raw) as {version?:string};
    return String(parsed.version||'unknown');
  }catch{return 'unknown'}
}

export const APP_VERSION=String(process.env.APP_VERSION||packageVersion());
export const APP_REVISION=String(process.env.APP_REVISION||'unknown');
export const RELEASE_CHANNEL=String(process.env.RELEASE_CHANNEL||'stable');

// Compatibility bridge for the legacy unified server health route, which historically
// embedded a literal version. This module is loaded before server route registration.
// Only the health-shaped payload is rewritten; all other Express JSON responses are untouched.
const HEALTH_BRIDGE=Symbol.for('vietnewsflow.health-release-metadata');
function installLegacyHealthReleaseBridge(){
  const proto=express.response as any;
  if(proto[HEALTH_BRIDGE])return;
  const original=proto.json;
  proto.json=function(body:unknown){
    if(body&&typeof body==='object'&&(body as any).service==='vietnewsflow-ai'&&(body as any).productName==='VietNewsFlow AI'){
      body={...(body as Record<string,unknown>),version:APP_VERSION,revision:APP_REVISION,releaseChannel:RELEASE_CHANNEL};
    }
    return original.call(this,body);
  };
  proto[HEALTH_BRIDGE]=true;
}
installLegacyHealthReleaseBridge();

export function runtimeReleaseMetadata(){
  return{
    version:APP_VERSION,
    revision:APP_REVISION,
    channel:RELEASE_CHANNEL,
    node:process.version,
    environment:String(process.env.NODE_ENV||'development'),
  };
}
