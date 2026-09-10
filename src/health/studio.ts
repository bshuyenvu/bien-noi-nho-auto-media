import { prepareAutoNews } from '../producer/auto.js';
import { sourceCoherenceScore } from '../import/url.js';
import { findForeignSources } from '../research/foreign.js';
import { researchHealthTopic } from '../research/health.js';
import { auditHealthEditorial } from './safety.js';
import type { ScriptLength } from '../ai/editor.js';
import { assertOriginalEditorial } from '../compliance/copyright.js';
import { searchOpenMedia } from '../media/open-media.js';
import type { SourceFact } from '../editorial/source-intelligence.js';

export interface HealthStudioInput{
  ownerId:string;
  primaryUrl?:string;
  topic?:string;
  length?:ScriptLength;
  format?:'latest'|'standard';
  audience?:'general'|'medical'|'patient'|'social';
}

function fold(v:string){return v.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d')}
const CURATED_MEDICAL_SOURCES=[
  {match:/\b(dot quy|stroke)\b/i,sources:[
    {name:'CDC',title:'Signs and Symptoms of Stroke',titleVi:'Dấu hiệu và triệu chứng đột quỵ',url:'https://www.cdc.gov/stroke/signs-symptoms/index.html',summaryVi:'Đột quỵ thường khởi phát đột ngột. Các dấu hiệu cảnh báo có thể gồm yếu hoặc tê mặt, tay hay chân, đặc biệt ở một bên cơ thể; lú lẫn, khó nói hoặc khó hiểu lời nói; rối loạn thị giác; đi lại khó, chóng mặt hoặc mất thăng bằng; và đau đầu dữ dội không rõ nguyên nhân. Có thể dùng quy tắc BE FAST để ghi nhớ các dấu hiệu quan trọng. Khi nghi ngờ đột quỵ, cần gọi cấp cứu ngay và ghi nhận thời điểm triệu chứng bắt đầu. Nếu triệu chứng tự hết sau vài phút vẫn cần được đánh giá y tế khẩn cấp vì có thể là cơn thiếu máu não thoáng qua.'},
    {name:'NHS',title:'Symptoms of a stroke',titleVi:'Triệu chứng của đột quỵ',url:'https://www.nhs.uk/conditions/stroke/symptoms/',summaryVi:'Các triệu chứng chính của đột quỵ thường xuất hiện đột ngột, gồm yếu mặt, yếu hoặc tê một tay và khó nói. Quy tắc FAST giúp nhận biết nhanh các dấu hiệu này và nhấn mạnh cần gọi cấp cứu ngay. Những biểu hiện khác có thể gồm yếu hoặc tê một bên cơ thể, nhìn mờ hoặc mất thị lực, khó tìm từ, lú lẫn, chóng mặt, té ngã hoặc đau đầu dữ dội. Triệu chứng có thể thoáng qua nhưng vẫn cần được đánh giá y tế khẩn cấp.'},
  ]},
];
function curatedMedicalSources(topic:string){const q=fold(topic);return CURATED_MEDICAL_SOURCES.filter(x=>x.match.test(q)).flatMap(x=>x.sources)}


function healthRulesEditorial(topic:string,facts:SourceFact[],length:ScriptLength){
  const target:{[k:string]:number}={auto:145,'30':78,'45':108,'60':145,'90':215,'120':285},max=target[length]||145;
  const rank=(f:SourceFact)=>f.kind==='event'?0:f.kind==='context'?1:f.kind==='effect'||f.kind==='cause'?2:f.kind==='number'?3:f.kind==='advice'?5:4;
  const seen=new Set<string>(),ordered=[...facts].filter(x=>x.support!=='uncertain'&&x.text.trim()).sort((a,b)=>rank(a)-rank(b));
  const chosen:string[]=[];let words=0;
  for(const f of ordered){const text=f.text.trim().replace(/\s+/g,' '),key=fold(text).replace(/[^a-z0-9 ]/g,'').slice(0,120);if(!key||seen.has(key))continue;const n=text.split(/\s+/).length;if(chosen.length&&words+n>max)continue;seen.add(key);chosen.push(/[.!?]$/.test(text)?text:text+'.');words+=n;if(words>=max*.72)break}
  const hook=chosen[0]?.replace(/[.!?]$/,'')||topic;
  return{headline:topic,hook,script:chosen.join(' '),caption:topic,estimatedSeconds:Math.max(1,Math.round(words/2.35))};
}

function sourceAccessBlocked(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  return /Nguồn trả về HTTP (?:401|403|429|451)|chặn trình đọc|fetch failed|timed? out/i.test(message);
}

export async function prepareHealthStudio(input:HealthStudioInput){
  const length=input.length||'60',format=input.format||'standard',audience=input.audience||'general';
  const topic=(input.topic||'').trim(),primaryUrl=(input.primaryUrl||'').trim();
  if(!primaryUrl&&topic.length<3)throw new Error('Hãy nhập chủ đề sức khỏe hoặc URL nguồn y khoa chính.');
  let prepared:Awaited<ReturnType<typeof prepareAutoNews>>|undefined;
  let researchDiscovery:{mode:string;query?:string;count?:number;warnings?:string[]}|undefined;
  let curatedTopicBrief=false;
  let sourceAccess:{mode:'direct'|'topic-research'|'curated-medical'|'corroborated-fallback';requestedUrl:string;reason?:string;fallbackSource?:{name:string;url:string;title:string}}={mode:primaryUrl?'direct':'topic-research',requestedUrl:primaryUrl};

  if(!primaryUrl){
    const pack=await researchHealthTopic(topic,5),primary=pack.sources.find(x=>x.summary.trim().length>=180);
    if(!primary)throw new Error('Chưa tìm được nguồn y khoa đủ nội dung cho chủ đề này. Hãy bổ sung URL WHO/CDC/NIH/NHS/PubMed hoặc thử chủ đề cụ thể hơn.');
    const corroboration=pack.sources.filter(x=>x.url!==primary.url).map(x=>({name:x.name,url:x.url,title:x.title,summary:x.summary,imageUrls:[]}));
    const curatedVi=curatedMedicalSources(topic).find(x=>x.url===primary.url)||curatedMedicalSources(topic)[0];
    curatedTopicBrief=Boolean(curatedVi);
    prepared=await prepareAutoNews({ownerId:input.ownerId,url:primary.url,length,format,audience,editorialTitle:topic,
      fallback:curatedVi?{title:curatedVi.titleVi,summary:curatedVi.summaryVi,sourceName:primary.name,language:'vi',force:true}:{title:primary.title,summary:primary.summary,sourceName:primary.name,language:primary.language||'en',force:true},researchSources:corroboration});
    sourceAccess={mode:'topic-research',requestedUrl:'',reason:'Nguồn được tự động chọn từ Evidence Pack theo chủ đề.',fallbackSource:{name:primary.name,url:primary.url,title:primary.title}};
    researchDiscovery={mode:pack.mode,query:pack.query,count:pack.sources.length,warnings:pack.warnings};
  }else try{
    prepared=await prepareAutoNews({ownerId:input.ownerId,url:primaryUrl,length,format,audience});
  }catch(error){
    if(!sourceAccessBlocked(error)||topic.length<3)throw error;
    const reason=error instanceof Error?error.message:String(error);
    for(const fallback of curatedMedicalSources(topic)){
      try{
        prepared=await prepareAutoNews({ownerId:input.ownerId,url:fallback.url,length,format,audience,fallback:{title:fallback.titleVi,summary:fallback.summaryVi,sourceName:fallback.name,language:'vi',force:true}});
        sourceAccess={mode:'curated-medical',requestedUrl:primaryUrl,reason,fallbackSource:{name:fallback.name,url:fallback.url,title:fallback.title}};
        break;
      }catch{}
    }
    if(!prepared){
      const research=await findForeignSources(topic,5),fallback=research.sources.find(x=>x.summary.trim().length>=120);
      if(!fallback)throw new Error(`${reason}. Nguồn chính chặn truy cập tự động và chưa tìm được nguồn y khoa đối chiếu đủ nội dung. Hãy thử URL WHO/CDC/NIH/NHS hoặc một nguồn khác.`);
      prepared=await prepareAutoNews({ownerId:input.ownerId,url:fallback.url,length,format,audience,fallback:{title:fallback.title||topic,summary:fallback.summary,sourceName:fallback.name}});
      sourceAccess={mode:'corroborated-fallback',requestedUrl:primaryUrl,reason,fallbackSource:{name:fallback.name,url:fallback.url,title:fallback.title}};
    }
  }
  if(!prepared)throw new Error('Health Studio không chuẩn bị được nguồn bằng chứng an toàn.');
  if(curatedTopicBrief&&prepared.edited.provider==='rules'){
    const safe=healthRulesEditorial(topic,prepared.intelligence.facts,length);
    prepared.edited={...prepared.edited,...safe};
    prepared.copyrightSafety.originality=assertOriginalEditorial(prepared.edited.headline,prepared.edited.script,[prepared.article.originalTitle,...prepared.research.sources.map(x=>x.title)]);
  }
  const healthSafety=auditHealthEditorial({
    title:prepared.edited.headline,script:prepared.edited.script,
    facts:prepared.intelligence.facts,audience,
  });
  const topicMatch=topic?sourceCoherenceScore(topic,`${prepared.edited.headline} ${prepared.edited.script}`):1;
  const topicGate=topicMatch>=.35?'pass':topicMatch>=.18?'review':'block';
  const localTranslationUsed=prepared.intelligence.warnings.some(x=>/Local Translation fallback:/i.test(x));
  const translationGate=localTranslationUsed?'review':'pass';
  const readyForDraft=healthSafety.status!=='block'&&topicGate!=='block'&&prepared.evidenceGate.status!=='block'&&prepared.copyrightSafety.originality.safe;
  const sourceName=prepared.article.sourceName||prepared.research.sources.map(x=>x.name).filter(Boolean).join(' • ').slice(0,120)||undefined;
  const openMedia=await searchOpenMedia(topic||prepared.edited.headline,6);
  const draftPayload=readyForDraft?{
    title:prepared.edited.headline,
    body:prepared.edited.script,
    sourceUrl:prepared.article.sourceUrl,
    sourceName,
    format,
    evidenceBundleId:prepared.evidenceBundleId,
    mediaProvenance:openMedia.candidates.map(x=>({url:x.url,sourceName:x.sourceName,sourceUrl:x.sourceUrl,kind:x.kind,rights:x.rights,creator:x.creator,licenseUrl:x.licenseUrl,rightsVerified:x.rightsVerified})),
  }:undefined;
  return{
    ...prepared,
    stage:readyForDraft?'draft-ready':'blocked',
    healthStudio:{version:'3.1',profile:'health',topic:topic||prepared.edited.headline,audience,topicMatch:Number(topicMatch.toFixed(3)),topicGate,translationGate,localTranslationUsed,translationReviewRequired:localTranslationUsed,healthSafety,readyForDraft,medicalReviewRequired:true,visualPolicy:'original-cards-or-rights-verified-media',sourceAccess,researchDiscovery},
    openMedia,
    draftPayload,
  };
}
