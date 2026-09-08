import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

export function runtimeReleaseMetadata(){
  return{
    version:APP_VERSION,
    revision:APP_REVISION,
    channel:RELEASE_CHANNEL,
    node:process.version,
    environment:String(process.env.NODE_ENV||'development'),
  };
}
