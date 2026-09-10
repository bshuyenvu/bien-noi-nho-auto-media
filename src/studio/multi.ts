import { prepareHealthStudio, type HealthStudioInput } from '../health/studio.js';
import { findForeignSources } from '../research/foreign.js';
import { prepareAutoNews } from '../producer/auto.js';
import { providerCandidates, completeWithProvider } from '../ai/runtime.js';
import { assertOriginalEditorial } from '../compliance/copyright.js';
import { searchOpenMedia } from '../media/open-media.js';
import type { ScriptLength } from '../ai/editor.js';

export type ContentProfile='health'|'life_tips'|'life_truth'|'event_commentary';
export interface MultiStudioInput extends Omit<HealthStudioInput,'format'>{
 profile?:ContentProfile;format?:'latest'|'standard';
}
const clean=(v:unknown,max=10000)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const seconds=(length:ScriptLength)=>length==='auto'?60:Number(length)||60;
const wordsFor=(length:ScriptLength)=>Math.max(70,Math.round(seconds(length)*2.25));
const BLOCK_DANGEROUS=/(trộn|pha).{0,35}(thuốc tẩy|javel|bleach).{0,35}(amoniac|ammonia|axit|acid)|chọc.{0,20}(ổ điện|ổ cắm)|đốt.{0,20}(xăng|cồn)|uống.{0,20}(hóa chất|nước tẩy)/i;
function parseJson(raw:string){
 const s=String(raw).replace(/^```(?:json)?\s*|\s*```$/gi,'').trim(),a=s.indexOf('{'),b=s.lastIndexOf('}');
 return JSON.parse(a>=0&&b>a?s.slice(a,b+1):s);
}
async function originalScript(input:MultiStudioInput,profile:'life_tips'|'life_truth'){
 const topic=clean(input.topic,180),length=input.length||'60',target=wordsFor(length);
 const podcast=profile==='life_truth';
 const rules=podcast
  ?`Viết một podcast chiêm nghiệm đời sống HOÀN TOÀN NGUYÊN BẢN, khoảng ${target} từ. Không trích dẫn câu nói nổi tiếng, sách, bài thơ hay lời bài hát. Không gán câu nói cho danh nhân. Giọng bình tĩnh, gần gũi, có một tình huống đời thường, một góc nhìn và một câu kết đáng nhớ. Không đưa lời khuyên y khoa/tài chính/pháp lý.`
  :`Viết kịch bản mẹo vặt đời sống HOÀN TOÀN NGUYÊN BẢN, khoảng ${target} từ. Chỉ đưa mẹo rủi ro thấp, dễ làm. Cấm trộn hóa chất tẩy rửa, sửa điện, dùng lửa/chất cháy, uống/ăn hóa chất, tự điều trị bệnh, hoặc hướng dẫn có thể gây chấn thương. Nếu chủ đề có rủi ro thì đổi sang phương án an toàn.`;
 const prompt=`${rules}\nCHỦ ĐỀ: ${topic}\nTrả JSON thuần: {"headline":"...","hook":"...","script":"...","caption":"...","hashtags":["..."]}. Toàn bộ bằng tiếng Việt.`;
 for(const p of providerCandidates(input.ownerId))try{
  const x=parseJson(await completeWithProvider(p,prompt,1800,.35));
  const headline=clean(x.headline||topic,140),hook=clean(x.hook,180),script=clean(x.script,9000),caption=clean(x.caption||headline,500);
  if(script.length<80)continue;if(BLOCK_DANGEROUS.test(script))throw new Error('Safety Gate chặn mẹo có rủi ro');
  return{headline,hook,script,caption,hashtags:Array.isArray(x.hashtags)?x.hashtags.map((v:unknown)=>clean(v,50)).slice(0,5):[],provider:p.id};
 }catch(e){console.warn(`Multi Studio ${profile} provider ${p.id} fallback:`,e)}
 const headline=topic|| (podcast?'Một phút nhìn lại điều thật sự quan trọng':'Một mẹo nhỏ cho ngày dễ chịu hơn');
 const hook=podcast?'Có những điều chỉ khi chậm lại, ta mới nhìn thấy.':'Bắt đầu từ cách đơn giản nhất, thường đã đủ hiệu quả.';
 const script=podcast?`${hook} ${headline} không nhất thiết cần một câu trả lời lớn. Hãy nhìn vào một việc rất nhỏ trong ngày: cách ta lắng nghe, cách ta giữ lời, hay cách ta dành thời gian cho người bên cạnh. Khi bớt chạy theo việc phải chứng minh mình đúng, ta có thêm chỗ cho sự bình tĩnh và tử tế. Điều đáng giữ lại không phải một khẩu hiệu, mà là một lựa chọn có thể làm ngay hôm nay.`:`${hook} Với ${headline.toLocaleLowerCase('vi-VN')}, hãy ưu tiên cách ít dụng cụ, ít hóa chất và dễ kiểm soát. Thử trên một vùng nhỏ trước, giữ bề mặt khô sạch và dừng lại nếu cách làm có nguy cơ làm hỏng đồ vật hoặc gây mất an toàn. Một mẹo tốt là mẹo giúp tiết kiệm thời gian mà không đổi lấy rủi ro.`;
 return{headline,hook,script,caption:headline,hashtags:podcast?['#Podcast','#ChuyenSong','#SongCham']:['#MeoVat','#CuocSongHangNgay','#DonGian'],provider:'rules'};
}
async function prepareOriginal(input:MultiStudioInput,profile:'life_tips'|'life_truth'){
 const length=input.length||'60',edited=await originalScript(input,profile),topic=clean(input.topic||edited.headline,180);
 const originality=assertOriginalEditorial(edited.headline,edited.script,[]),openMedia=await searchOpenMedia(topic,6);
 const safe=!BLOCK_DANGEROUS.test(`${edited.headline} ${edited.script}`);
 const safety={status:safe?'pass':'block',score:safe?100:0,reasons:safe?[]:['Phát hiện hướng dẫn có rủi ro trong nội dung mẹo vặt.'],warnings:[]};
 const readyForDraft=safe&&originality.safe;
 return{stage:readyForDraft?'draft-ready':'blocked',profile,article:{sourceName:'Nội dung nguyên bản',sourceUrl:undefined,originalTitle:topic,language:'vi'},
  research:{sources:[],count:0},evidenceGate:{status:'pass',score:100,reasons:['Nội dung nguyên bản; không gắn nhãn là bằng chứng y khoa.'],supportedClaimCount:0,claimCount:0},
  intelligence:{sourceScore:100,authorityScore:100,warnings:[],facts:[],provider:edited.provider},edited:{...edited,estimatedSeconds:seconds(length),mode:edited.provider==='rules'?'local':'llm'},
  copyrightSafety:{mode:'strict',originality,externalMediaAutoUse:'rights-verified-only'},openMedia,
  healthStudio:{version:'3.1',profile,topic,audience:input.audience||'general',topicMatch:1,topicGate:'pass',translationGate:'pass',localTranslationUsed:false,healthSafety:safety,readyForDraft,medicalReviewRequired:false,visualPolicy:'open-license-or-original'},
  draftPayload:readyForDraft?{title:edited.headline,body:edited.script,sourceName:'Multi-Content Studio • Original',format:'standard',mediaProvenance:openMedia.candidates.map(x=>({url:x.url,sourceName:x.sourceName,sourceUrl:x.sourceUrl,kind:x.kind,rights:x.rights,creator:x.creator,licenseUrl:x.licenseUrl,rightsVerified:x.rightsVerified}))}:undefined};
}

async function prepareEventCommentary(input:MultiStudioInput){
 const topic=clean(input.topic,180);if(topic.length<3)throw new Error('Hãy nhập sự kiện cần bình luận.');
 const found=await findForeignSources(topic,5),primary=found.sources.find(x=>x.summary.length>=100);
 if(!primary)throw new Error('Chưa tìm được nguồn tin đủ tin cậy để bình luận sự kiện. Hãy nhập chủ đề cụ thể hơn hoặc URL nguồn.');
 const rest=found.sources.filter(x=>x.url!==primary.url);
 const prepared=await prepareAutoNews({ownerId:input.ownerId,url:primary.url,length:input.length||'60',format:'latest',audience:'general',editorialTitle:topic,
  fallback:{title:primary.title,summary:primary.summary,sourceName:primary.name,language:'en',force:true},researchSources:rest});
 const openMedia=await searchOpenMedia(topic,6),readyForDraft=prepared.evidenceGate.status!=='block'&&prepared.copyrightSafety.originality.safe;
 return{...prepared,stage:readyForDraft?'draft-ready':'blocked',profile:'event_commentary',openMedia,
  healthStudio:{version:'3.1',profile:'event_commentary',topic,audience:input.audience||'general',topicMatch:1,topicGate:'pass',translationGate:'pass',localTranslationUsed:false,healthSafety:{status:'pass',score:100,reasons:[],warnings:['Bình luận phải tách rõ dữ kiện đã xác minh và nhận định.']},readyForDraft,medicalReviewRequired:false,visualPolicy:'open-license-or-original'},
  draftPayload:readyForDraft?{title:prepared.edited.headline,body:prepared.edited.script,sourceUrl:prepared.article.sourceUrl,sourceName:primary.name,format:'latest',evidenceBundleId:prepared.evidenceBundleId,
   mediaProvenance:openMedia.candidates.map(x=>({url:x.url,sourceName:x.sourceName,sourceUrl:x.sourceUrl,kind:x.kind,rights:x.rights,creator:x.creator,licenseUrl:x.licenseUrl,rightsVerified:x.rightsVerified}))}:undefined};
}
export async function prepareMultiContentStudio(input:MultiStudioInput){
 const profile=input.profile||'health';
 if(profile==='health')return{...(await prepareHealthStudio(input)),profile};
 if(profile==='event_commentary')return prepareEventCommentary(input);
 if(profile==='life_truth')return prepareOriginal(input,'life_truth');
 return prepareOriginal(input,'life_tips');
}
