import { basename,resolve,sep } from 'node:path';
import { stat,writeFile } from 'node:fs/promises';
import type { PublishPlatform } from './queue.js';
import { publishCapability } from './capabilities.js';

export interface ExportHandoffInput{
  platform:PublishPlatform;renderOutput:string;renderJobId:string;draftId:string;
  title:string;caption?:string;sourceName?:string;sourceUrl?:string;
}

function safeStem(value:string){return value.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'export'}
export async function createExportHandoff(input:ExportHandoffInput){
  const capability=publishCapability(input.platform);
  const outputRoot=resolve('output'),videoPath=resolve(input.renderOutput);
  if(videoPath!==outputRoot&&!videoPath.startsWith(outputRoot+sep))throw new Error('Render output nằm ngoài thư mục output');
  const file=await stat(videoPath);if(!file.isFile())throw new Error('Render output không phải file');
  const videoName=basename(videoPath);
  const stem=`${safeStem(input.renderJobId)}-${input.platform}`;
  const caption=[input.caption?.trim()||input.title.trim(),input.sourceName?`Nguồn: ${input.sourceName}`:'',input.sourceUrl||''].filter(Boolean).join('\n');
  const manifest={
    schema:'vietnewsflow.export-handoff.v1',platform:input.platform,generatedAt:new Date().toISOString(),
    renderJobId:input.renderJobId,draftId:input.draftId,title:input.title,caption,
    videoFile:videoName,sourceName:input.sourceName||null,sourceUrl:input.sourceUrl||null,
    automatedLiveAllowed:Boolean(capability.liveImplemented&&capability.productionApproved),
    releaseMode:capability.releaseMode,operatorActionRequired:true,reason:capability.reason||null,
  };
  const manifestName=`${stem}.json`,captionName=`${stem}.txt`;
  await Promise.all([
    writeFile(`output/${manifestName}`,JSON.stringify(manifest,null,2),'utf8'),
    writeFile(`output/${captionName}`,caption+'\n','utf8'),
  ]);
  return{...manifest,videoUrl:`/output/${encodeURIComponent(videoName)}`,manifestUrl:`/output/${encodeURIComponent(manifestName)}`,captionUrl:`/output/${encodeURIComponent(captionName)}`};
}
