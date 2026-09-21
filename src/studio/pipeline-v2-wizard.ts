import { createPipelineProject,type CreatePipelineProjectInput } from './pipeline-v2.js';
import { runContentStudioUntilGate } from './pipeline-v2-actions.js';
import { contentStudioProjectDashboard } from './pipeline-v2-dashboard.js';
import { importArticleFromUrl } from '../import/url.js';

export interface ContentStudioWizardInput extends CreatePipelineProjectInput{
  autoAdvance?:boolean;
  maxSteps?:number;
  skipExternalPrepare?:boolean;
}

export async function createPipelineProjectAndStart(input:ContentStudioWizardInput){
  let topic=input.topic,script=input.script;
  const sourceUrls=input.sourceUrls||[];
  if(input.templateId==='url-story'&&String(script||'').trim().length<20){
    const url=sourceUrls[0];
    if(!url)throw new Error('URL → Video cần ít nhất một URL nguồn.');
    const article=await importArticleFromUrl(url);
    script=String(article.body||'').replace(/\s+/g,' ').trim().slice(0,20000);
    if(script.length<20)throw new Error('Không trích xuất đủ nội dung từ URL để tạo video.');
    if(String(topic||'').trim().length<3)topic=String(article.title||'Nội dung từ URL').slice(0,180);
  }
  const project=createPipelineProject({
    ownerId:input.ownerId,
    templateId:input.templateId,
    topic,
    script,
    seriesName:input.seriesName,
    episode:input.episode,
    sourceUrls,
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
