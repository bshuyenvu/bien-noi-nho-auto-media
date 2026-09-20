import { contentStudioProjectDashboard } from './pipeline-v2-dashboard.js';
import { preparePipelineProject } from './pipeline-v2-runtime.js';
import { createSceneMediaJobs,listSceneMediaJobs,readySceneMediaForRender,retrySceneMediaJob,runQueuedSceneMediaJobs } from './pipeline-v2-media-router.js';
import { enqueuePipelineGeneration } from './pipeline-v2-generation.js';
import { retryRenderJob } from '../video/job.js';

export interface DashboardActionResult{
  action:string;
  performed:boolean;
  requiresHumanReview:boolean;
  message:string;
  detail?:unknown;
  dashboard:ReturnType<typeof contentStudioProjectDashboard>;
}

export async function runContentStudioDashboardAction(input:{
  ownerId:string;
  projectId:string;
  skipExternalPrepare?:boolean;
}):Promise<DashboardActionResult>{
  const before=contentStudioProjectDashboard(input.ownerId,input.projectId);
  const action=before.nextAction.id;
  let performed=true,requiresHumanReview=false,message='',detail:unknown;

  if(action==='prepare'){
    detail=await preparePipelineProject(input.ownerId,input.projectId,{skipExternal:Boolean(input.skipExternalPrepare)});
    message='Đã chuẩn bị Research / Runtime.';
  }else if(action==='generate-keyframes'){
    const missing=before.scenes.items.filter(scene=>scene.preferredMedia==='fallback').map(scene=>scene.sceneIndex);
    detail=createSceneMediaJobs({ownerId:input.ownerId,projectId:input.projectId,kind:'image',providerId:'local-original-card',sceneIndices:missing});
    message=`Đã tạo ${Array.isArray(detail)?detail.length:0} keyframe job rights-safe.`;
  }else if(action==='run-scene-media'){
    detail=await runQueuedSceneMediaJobs(input.ownerId,input.projectId,4);
    message='Đã chạy các scene media job đang chờ.';
  }else if(action==='retry-scene-media'){
    const failed=listSceneMediaJobs(input.ownerId,input.projectId).filter(job=>job.status==='failed').slice(0,4);
    const results=[];for(const job of failed){try{results.push(await retrySceneMediaJob(input.ownerId,job.id))}catch(e){results.push({id:job.id,error:e instanceof Error?e.message:String(e)})}}
    detail=results;message=`Đã xử lý retry ${failed.length} scene media job.`;
  }else if(action==='render'){
    const localMedia=readySceneMediaForRender(input.ownerId,input.projectId);
    detail=await enqueuePipelineGeneration({ownerId:input.ownerId,projectId:input.projectId,localMedia});
    message='Đã tạo generation batch từ media đã duyệt/sẵn sàng.';
  }else if(action==='retry-render'){
    const failed=(before.generation.latestBatch?.outputs||[]).filter(output=>output.status==='failed'&&output.renderJobId);
    const results=[];for(const output of failed){try{results.push(await retryRenderJob(output.renderJobId!))}catch(e){results.push({id:output.renderJobId,error:e instanceof Error?e.message:String(e)})}}
    detail=results;message=`Đã xử lý retry ${failed.length} render job.`;
  }else if(action==='render-running'){
    performed=false;message='Render đang chạy; dashboard chỉ làm mới trạng thái.';
  }else if(action==='medical-review'||action==='copyright-review'||action==='final-review'||action==='research-review'||action==='fix-research'){
    performed=false;requiresHumanReview=true;
    message=action==='medical-review'
      ? 'Medical Review cần quyết định người duyệt.'
      : action==='copyright-review'
        ? 'Copyright Review cần người duyệt kiểm tra artifact/provenance.'
        : action==='final-review'
          ? 'Final Review cần xác nhận người duyệt sau Copyright Review.'
          : 'Research/Evidence cần người duyệt hoặc bổ sung nguồn; dashboard không tự PASS gate.';
  }else if(action==='ready'){
    performed=false;message='Pipeline đã qua các gate hiện có; không tự publish từ dashboard action.';
  }else{
    performed=false;message='Không có action tự động phù hợp.';
  }

  return{action,performed,requiresHumanReview,message,detail,dashboard:contentStudioProjectDashboard(input.ownerId,input.projectId)};
}


export interface DashboardAutoAdvanceResult{
  performedSteps:number;
  stoppedOn:string;
  requiresHumanReview:boolean;
  trace:Array<{action:string;performed:boolean;message:string}>;
  dashboard:ReturnType<typeof contentStudioProjectDashboard>;
}

export async function runContentStudioUntilGate(input:{
  ownerId:string;
  projectId:string;
  skipExternalPrepare?:boolean;
  maxSteps?:number;
}):Promise<DashboardAutoAdvanceResult>{
  const maxSteps=Math.max(1,Math.min(12,Number(input.maxSteps||8)));
  const trace:Array<{action:string;performed:boolean;message:string}>=[];
  let performedSteps=0;
  let requiresHumanReview=false;
  for(let i=0;i<maxSteps;i++){
    const before=contentStudioProjectDashboard(input.ownerId,input.projectId);
    const action=before.nextAction.id;
    if(['medical-review','copyright-review','final-review','research-review','fix-research'].includes(action)){
      requiresHumanReview=true;
      trace.push({action,performed:false,message:'Dừng tại human review/research gate.'});
      break;
    }
    if(action==='ready'||action==='render-running'){
      trace.push({action,performed:false,message:action==='ready'?'Pipeline đã qua các gate hiện có.':'Render đang chạy; chờ worker hoàn tất.'});
      break;
    }
    const result=await runContentStudioDashboardAction({
      ownerId:input.ownerId,
      projectId:input.projectId,
      skipExternalPrepare:input.skipExternalPrepare,
    });
    trace.push({action:result.action,performed:result.performed,message:result.message});
    if(result.performed)performedSteps++;
    if(!result.performed||result.requiresHumanReview)break;
  }
  const dashboard=contentStudioProjectDashboard(input.ownerId,input.projectId);
  return{
    performedSteps,
    stoppedOn:dashboard.nextAction.id,
    requiresHumanReview:requiresHumanReview||dashboard.nextAction.hardBlocked||['medical-review','copyright-review','final-review','research-review','fix-research'].includes(dashboard.nextAction.id),
    trace,
    dashboard,
  };
}
