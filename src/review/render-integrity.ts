import { all } from '../storage/db.js';
import { bindReviewRenderProfile,invalidateReview } from './store.js';

type StoredRenderRow={id:string;draft_id:string;owner_id:string;payload_json?:string};
type DraftRow={id:string;owner_id:string;title:string;body:string;source_url?:string;source_name?:string;image_url?:string};

export function canonicalReviewRenderProfile(input:any){
  const breaking=Boolean(input?.breaking);
  return{
    voice:String(input?.voice||'vi-male'),
    voiceRate:String(input?.voiceRate||'+0%'),
    voiceStyle:String(input?.voiceStyle||(breaking?'breaking':'news')),
    imageUrl:input?.imageUrl||null,
    imageUrls:Array.isArray(input?.imageUrls)?input.imageUrls.map(String):[],
    autoCollectImages:input?.autoCollectImages!==false,
    smartScenes:input?.smartScenes!==false,
    scenes:Array.isArray(input?.scenes)?input.scenes:[],
    template:input?.template||(breaking?'breaking':'classic'),
    motion:input?.motion||'light',
    tickerMode:input?.tickerMode||'headline',
    tickerText:input?.tickerText?String(input.tickerText):null,
    tickerSpeed:Number.isFinite(Number(input?.tickerSpeed))?Number(input.tickerSpeed):85,
    channelName:input?.channelName?String(input.channelName):null,
    breaking,
  };
}

export function bindCanonicalReviewRenderProfile(draftId:string,ownerId:string,input:any,actor='system:render'){
  return bindReviewRenderProfile(draftId,ownerId,canonicalReviewRenderProfile(input),actor);
}

function nullable(v:unknown){return v==null||v===''?null:String(v)}
export function assertStoredRenderReview(jobId:string,ownerId:string,actor='system:render-retry'){
  const job=all<StoredRenderRow>('SELECT id,draft_id,owner_id,payload_json FROM render_jobs WHERE id=? AND owner_id=? LIMIT 1',jobId,ownerId)[0];if(!job)throw new Error('Render job not found');
  const draft=all<DraftRow>('SELECT id,owner_id,title,body,source_url,source_name,image_url FROM drafts WHERE id=? AND owner_id=? LIMIT 1',job.draft_id,ownerId)[0];if(!draft)throw new Error('Draft not found for stored render');
  let payload:any;try{payload=job.payload_json?JSON.parse(job.payload_json):undefined}catch{}if(!payload)throw new Error('Render payload cũ không còn khả dụng; hãy render lại từ draft');
  const contentMatches=String(payload.text||'')===draft.body&&String(payload.headline||'')===draft.title&&nullable(payload.sourceUrl)===nullable(draft.source_url)&&nullable(payload.source)===nullable(draft.source_name)&&nullable(payload.imageUrl)===nullable(draft.image_url);
  if(!contentMatches){invalidateReview(draft.id,ownerId,'stored_render_payload_no_longer_matches_draft',actor);throw new Error('Render retry bị chặn: payload cũ không còn khớp phiên bản draft đã duyệt; cần Review lại và tạo render mới')}
  return bindCanonicalReviewRenderProfile(draft.id,ownerId,payload,actor);
}
