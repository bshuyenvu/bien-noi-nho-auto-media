import { createPipelineProject,type CreatePipelineProjectInput } from './pipeline-v2.js';
import { runContentStudioUntilGate } from './pipeline-v2-actions.js';
import { contentStudioProjectDashboard } from './pipeline-v2-dashboard.js';

export interface ContentStudioWizardInput extends CreatePipelineProjectInput{
  autoAdvance?:boolean;
  maxSteps?:number;
  skipExternalPrepare?:boolean;
}

export async function createPipelineProjectAndStart(input:ContentStudioWizardInput){
  const project=createPipelineProject({
    ownerId:input.ownerId,
    templateId:input.templateId,
    topic:input.topic,
    script:input.script,
    seriesName:input.seriesName,
    episode:input.episode,
    sourceUrls:input.sourceUrls,
    outputIds:input.outputIds,
  });
  if(input.autoAdvance===false){
    return{
      version:'content-studio-wizard-v1',
      project,
      autoAdvance:null,
      dashboard:contentStudioProjectDashboard(input.ownerId,project.id),
    };
  }
  try{
    const autoAdvance=await runContentStudioUntilGate({
      ownerId:input.ownerId,
      projectId:project.id,
      skipExternalPrepare:Boolean(input.skipExternalPrepare),
      maxSteps:input.maxSteps??8,
    });
    return{
      version:'content-studio-wizard-v1',
      project,
      autoAdvance,
      dashboard:autoAdvance.dashboard,
    };
  }catch(error){
    return{
      version:'content-studio-wizard-v1',
      project,
      autoAdvance:{
        performedSteps:0,
        stoppedOn:'wizard-error',
        requiresHumanReview:false,
        trace:[],
        error:error instanceof Error?error.message:String(error),
      },
      dashboard:contentStudioProjectDashboard(input.ownerId,project.id),
    };
  }
}
