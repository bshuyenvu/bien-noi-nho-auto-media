import { getPipelineProject,listPipelineProjects } from './pipeline-v2.js';
import { getPipelineRuntime,listPipelineReviewEvents } from './pipeline-v2-runtime.js';
import { listGenerationBatches,listStudioArtifacts } from './pipeline-v2-generation.js';
import { listSceneMediaJobs,type SceneMediaJob } from './pipeline-v2-media-router.js';

export type ContentStudioNextAction =
  | 'prepare'
  | 'fix-research'
  | 'research-review'
  | 'medical-review'
  | 'retry-scene-media'
  | 'run-scene-media'
  | 'generate-keyframes'
  | 'render'
  | 'render-running'
  | 'retry-render'
  | 'copyright-review'
  | 'final-review'
  | 'ready';

export interface ContentStudioDashboardScene {
  sceneIndex:number;
  beat:string;
  narration:string;
  image?:ReturnType<typeof summarizeMediaJob>;
  video?:ReturnType<typeof summarizeMediaJob>;
  preferredMedia?:'video'|'image'|'fallback';
  intent?:string;
  renderer?:string;
  layout?:string;
  estimatedDurationSec?:number;
  subtitleChunks?:string[];
}

function summarizeMediaJob(job:SceneMediaJob){
  return {
    id:job.id,
    status:job.status,
    providerId:job.providerId,
    model:job.model,
    attempts:job.attempts,
    maxAttempts:job.maxAttempts,
    outputPath:job.outputPath,
    costMicrousd:job.costMicrousd,
    error:job.error,
    updatedAt:job.updatedAt,
  };
}

function latestPerSceneKind(jobs:SceneMediaJob[]){
  const result=new Map<string,SceneMediaJob>();
  for(const job of jobs){
    const key=`${job.sceneIndex}:${job.kind}`,old=result.get(key);
    if(!old||Date.parse(job.updatedAt)>=Date.parse(old.updatedAt))result.set(key,job);
  }
  return result;
}

function countStatuses(items:Array<{status:string}>){
  const out:Record<string,number>={};
  for(const item of items)out[item.status]=(out[item.status]||0)+1;
  return out;
}

function artifactCounts(items:Array<{kind:string}>){
  const out:Record<string,number>={};
  for(const item of items)out[item.kind]=(out[item.kind]||0)+1;
  return out;
}

function actionLabel(action:ContentStudioNextAction){
  const labels:Record<ContentStudioNextAction,string>={
    prepare:'Chuẩn bị Research / Runtime',
    'fix-research':'Bổ sung hoặc sửa Evidence Pack',
    'research-review':'Kiểm tra Research Gate',
    'medical-review':'Thực hiện Medical Review',
    'retry-scene-media':'Retry scene media bị lỗi',
    'run-scene-media':'Chạy scene media đang chờ',
    'generate-keyframes':'Tạo keyframe cho các scene còn thiếu',
    render:'Tạo output / render',
    'render-running':'Theo dõi render đang chạy',
    'retry-render':'Retry output render bị lỗi',
    'copyright-review':'Thực hiện Copyright Review',
    'final-review':'Thực hiện Human Final Review',
    ready:'Sẵn sàng cho bước publish được cho phép',
  };
  return labels[action];
}

export function contentStudioProjectDashboard(ownerId:string,projectId:string){
  const project=getPipelineProject(ownerId,projectId);
  if(!project)throw new Error('Content Studio project not found');

  const runtime=getPipelineRuntime(ownerId,projectId);
  const mediaJobs=listSceneMediaJobs(ownerId,projectId);
  const latestMedia=latestPerSceneKind(mediaJobs);
  const batches=listGenerationBatches(ownerId,projectId);
  const latestBatch=batches[0];
  const artifacts=listStudioArtifacts(ownerId,projectId);
  const reviewEvents=listPipelineReviewEvents(ownerId,projectId,12);

  const scenes:ContentStudioDashboardScene[]=project.plan.scenes.map(scene=>{
    const image=latestMedia.get(`${scene.index}:image`);
    const video=latestMedia.get(`${scene.index}:video`);
    const imageSummary=image?summarizeMediaJob(image):undefined;
    const videoSummary=video?summarizeMediaJob(video):undefined;
    const preferredMedia=video?.status==='ready'?'video':image?.status==='ready'?'image':'fallback';
    const smart=runtime?.scenePrompts?.find(item=>item.sceneIndex===scene.index);
    return{
      sceneIndex:scene.index,beat:scene.beat,narration:scene.narration,image:imageSummary,video:videoSummary,preferredMedia,
      intent:smart?.intent,renderer:smart?.renderer,layout:smart?.layout,estimatedDurationSec:smart?.estimatedDurationSec,subtitleChunks:smart?.subtitleChunks,
    };
  });

  const visualOutputs=project.plan.outputs.filter(output=>output.kind==='video'||output.kind==='short');
  const readyVisualScenes=scenes.filter(scene=>scene.preferredMedia!=='fallback').length;
  const missingVisualScenes=Math.max(0,scenes.length-readyVisualScenes);
  const mediaStatus=countStatuses(mediaJobs);
  const failedMedia=mediaJobs.filter(job=>job.status==='failed').length;
  const activeMedia=mediaJobs.filter(job=>job.status==='queued'||job.status==='running').length;

  const outputStatus=latestBatch?countStatuses(latestBatch.outputs):{};
  const failedOutputs=latestBatch?.outputs.filter(output=>output.status==='failed').length||0;
  const activeOutputs=latestBatch?.outputs.filter(output=>output.status==='queued'||output.status==='rendering').length||0;
  const readyOutputs=latestBatch?.outputs.filter(output=>output.status==='ready').length||0;

  let nextAction:ContentStudioNextAction='prepare';
  let hardBlocked=false;
  if(!runtime){
    nextAction='prepare';
  }else if(runtime.research.status==='block'){
    nextAction='fix-research';hardBlocked=true;
  }else if(runtime.research.status==='review'){
    nextAction='research-review';hardBlocked=true;
  }else if(runtime.reviews.medical==='pending'||runtime.reviews.medical==='needs_fix'){
    nextAction='medical-review';hardBlocked=true;
  }else if(failedOutputs>0){
    nextAction='retry-render';
  }else if(activeOutputs>0){
    nextAction='render-running';
  }else if(latestBatch&&readyOutputs>0){
    if(runtime.reviews.copyright!=='accepted')nextAction='copyright-review';
    else if(runtime.reviews.final!=='accepted')nextAction='final-review';
    else nextAction='ready';
  }else if(failedMedia>0){
    nextAction='retry-scene-media';
  }else if(activeMedia>0){
    nextAction='run-scene-media';
  }else if(visualOutputs.length>0&&missingVisualScenes>0){
    nextAction='generate-keyframes';
  }else{
    nextAction='render';
  }

  const overallStatus=
    hardBlocked?'blocked':
    failedOutputs>0||failedMedia>0?'attention':
    nextAction==='ready'?'ready':
    activeOutputs>0||activeMedia>0?'running':
    'waiting';

  return{
    version:'content-studio-dashboard-v1',
    project:{
      id:project.id,
      templateId:project.templateId,
      templateName:project.plan.template.name,
      topic:project.topic,
      seriesName:project.seriesName,
      episode:project.episode,
      status:project.status,
      createdAt:project.createdAt,
      updatedAt:project.updatedAt,
    },
    overallStatus,
    nextAction:{id:nextAction,label:actionLabel(nextAction),hardBlocked},
    gates:{
      research:runtime?{
        status:runtime.research.status,
        sourceCount:runtime.research.sourceCount,
        authoritativeSourceCount:runtime.research.authoritativeSourceCount,
        topicEntityMatch:runtime.research.topicEntityMatch,
      }:{status:'not_prepared'},
      medical:runtime?.reviews.medical||'not_prepared',
      generationAllowed:runtime?.generationAllowed||false,
      copyright:runtime?.reviews.copyright||'not_prepared',
      final:runtime?.reviews.final||'not_prepared',
      publishAllowed:runtime?.publishAllowed||false,
    },
    scenes:{
      total:scenes.length,
      readyVisual:readyVisualScenes,
      missingVisual:missingVisualScenes,
      statusCounts:mediaStatus,
      items:scenes,
    },
    generation:{
      latestBatch:latestBatch?{
        id:latestBatch.id,
        status:latestBatch.status,
        primaryOutputId:latestBatch.primaryOutputId,
        createdAt:latestBatch.createdAt,
        updatedAt:latestBatch.updatedAt,
        outputs:latestBatch.outputs,
      }:null,
      statusCounts:outputStatus,
      batchCount:batches.length,
    },
    artifacts:{
      total:artifacts.length,
      counts:artifactCounts(artifacts),
      recent:artifacts.slice(0,12).map(item=>({
        id:item.id,outputId:item.outputId,kind:item.kind,path:item.path,rights:item.rights,generator:item.generator,createdAt:item.createdAt,
      })),
    },
    reviewEvents,
    runtime:runtime?{status:runtime.status,currentStage:runtime.currentStage,updatedAt:runtime.updatedAt}:null,
  };
}

export function listContentStudioDashboardProjects(ownerId:string,limit=20){
  return listPipelineProjects(ownerId,limit).map(project=>{
    const snapshot=contentStudioProjectDashboard(ownerId,project.id);
    return{
      project:snapshot.project,
      overallStatus:snapshot.overallStatus,
      nextAction:snapshot.nextAction,
      gates:snapshot.gates,
      sceneSummary:{total:snapshot.scenes.total,readyVisual:snapshot.scenes.readyVisual,missingVisual:snapshot.scenes.missingVisual},
      generationSummary:{
        status:snapshot.generation.latestBatch?.status||'not_started',
        readyOutputs:snapshot.generation.statusCounts.ready||0,
        failedOutputs:snapshot.generation.statusCounts.failed||0,
      },
      artifactCount:snapshot.artifacts.total,
    };
  });
}
