import { getPipelineProject,listPipelineProjects } from './pipeline-v2.js';
import { getPipelineRuntime,listPipelineReviewEvents,preparePipelineProject } from './pipeline-v2-runtime.js';
import { enqueuePipelineGeneration,listGenerationBatches,listStudioArtifacts } from './pipeline-v2-generation.js';
import { createSceneMediaJobs,listSceneMediaJobs,readySceneMediaForRender,retrySceneMediaJob,runSceneMediaJob,type SceneMediaJob } from './pipeline-v2-media-router.js';

export type ContentStudioDashboardAction='prepare'|'generate-keyframes'|'run-scene-media'|'retry-scene-media'|'render';

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
    return{sceneIndex:scene.index,beat:scene.beat,narration:scene.narration,image:imageSummary,video:videoSummary,preferredMedia};
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


function assertDashboardActionAllowed(current:ContentStudioNextAction,requested:ContentStudioDashboardAction){
  if(current!==requested)throw new Error(`Workflow đã thay đổi: action hiện tại là ${current}, không phải ${requested}. Hãy làm mới dashboard.`);
}

export async function runContentStudioDashboardAction(input:{
  ownerId:string;
  projectId:string;
  action:ContentStudioDashboardAction;
}){
  const before=contentStudioProjectDashboard(input.ownerId,input.projectId);
  assertDashboardActionAllowed(before.nextAction.id,input.action);
  let result:Record<string,unknown>={};

  if(input.action==='prepare'){
    const runtime=await preparePipelineProject(input.ownerId,input.projectId);
    result={runtimeStatus:runtime.status,currentStage:runtime.currentStage,research:runtime.research.status,generationAllowed:runtime.generationAllowed};
  }else if(input.action==='generate-keyframes'){
    const missing=before.scenes.items
      .filter(scene=>scene.preferredMedia==='fallback'&&!scene.image&&!scene.video)
      .map(scene=>scene.sceneIndex);
    if(!missing.length)throw new Error('Không còn scene trống để tạo keyframe local.');
    const jobs=createSceneMediaJobs({
      ownerId:input.ownerId,
      projectId:input.projectId,
      kind:'image',
      providerId:'local-original-card',
      sceneIndices:missing,
    });
    result={created:jobs.length,jobIds:jobs.map(job=>job.id),providerId:'local-original-card'};
  }else if(input.action==='run-scene-media'){
    const queued=listSceneMediaJobs(input.ownerId,input.projectId)
      .filter(job=>job.status==='queued'&&job.providerId==='local-original-card')
      .slice(0,12);
    if(!queued.length)throw new Error('Không có local scene-media job đang chờ. Remote job phải được chạy bằng workflow có xác nhận riêng.');
    const completed=[] as Array<{id:string;status:string;sceneIndex:number;outputPath?:string;error?:string}>;
    for(const job of queued){
      try{
        const next=await runSceneMediaJob(input.ownerId,job.id);
        completed.push({id:next.id,status:next.status,sceneIndex:next.sceneIndex,outputPath:next.outputPath});
      }catch(error){
        completed.push({id:job.id,status:'failed',sceneIndex:job.sceneIndex,error:error instanceof Error?error.message:String(error)});
      }
    }
    result={processed:completed.length,jobs:completed};
  }else if(input.action==='retry-scene-media'){
    const failed=listSceneMediaJobs(input.ownerId,input.projectId)
      .filter(job=>job.status==='failed'&&job.providerId==='local-original-card')
      .slice(0,12);
    if(!failed.length)throw new Error('Không có local scene-media job failed để retry. Remote job phải retry bằng workflow có xác nhận riêng.');
    const retried=[] as Array<{id:string;status:string;sceneIndex:number;outputPath?:string;error?:string}>;
    for(const job of failed){
      try{
        const next=await retrySceneMediaJob(input.ownerId,job.id);
        retried.push({id:next.id,status:next.status,sceneIndex:next.sceneIndex,outputPath:next.outputPath});
      }catch(error){
        retried.push({id:job.id,status:'failed',sceneIndex:job.sceneIndex,error:error instanceof Error?error.message:String(error)});
      }
    }
    result={processed:retried.length,jobs:retried};
  }else if(input.action==='render'){
    const localMedia=readySceneMediaForRender(input.ownerId,input.projectId);
    const batch=await enqueuePipelineGeneration({ownerId:input.ownerId,projectId:input.projectId,localMedia});
    result={batchId:batch.id,status:batch.status,primaryOutputId:batch.primaryOutputId,outputs:batch.outputs.map(output=>({outputId:output.outputId,status:output.status,renderJobId:output.renderJobId}))};
  }

  return{
    ok:true,
    action:input.action,
    result,
    dashboard:contentStudioProjectDashboard(input.ownerId,input.projectId),
  };
}
