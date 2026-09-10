import { prepareAutoNews } from '../producer/auto.js';
import { sourceCoherenceScore } from '../import/url.js';
import { findForeignSources } from '../research/foreign.js';
import { medicalTopicEntityMatch, researchHealthTopic } from '../research/health.js';
import { auditHealthEditorial } from './safety.js';
import type { ScriptLength } from '../ai/editor.js';
import { assertOriginalEditorial } from '../compliance/copyright.js';
import { searchOpenMediaForScript } from '../media/open-media.js';
import type { SourceFact } from '../editorial/source-intelligence.js';
import { auditContentQuality } from '../studio/content-quality.js';

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
    {name:'CDC',title:'Signs and Symptoms of Stroke',titleVi:'Dấu hiệu và triệu chứng đột quỵ',url:'https://www.cdc.gov/stroke/signs-symptoms/index.html',summaryVi:'Đột quỵ thường khởi phát đột ngột. Các dấu hiệu cảnh báo có thể gồm yếu hoặc tê mặt, tay hay chân, đặc biệt ở một bên cơ thể; lú lẫn, khó nói hoặc khó hiểu lời nói; rối loạn thị giác; đi lại khó, chóng mặt hoặc mất thăng bằng; và đau đầu dữ dội không rõ nguyên nhân. Khi nghi ngờ đột quỵ, cần được đánh giá y tế khẩn cấp và ghi nhận thời điểm triệu chứng bắt đầu. Triệu chứng thoáng qua vẫn cần được đánh giá vì có thể là cơn thiếu máu não thoáng qua.'},
    {name:'NHS',title:'Symptoms of a stroke',titleVi:'Triệu chứng của đột quỵ',url:'https://www.nhs.uk/conditions/stroke/symptoms/',summaryVi:'Các triệu chứng chính của đột quỵ thường xuất hiện đột ngột, gồm yếu mặt, yếu hoặc tê một tay và khó nói. Những biểu hiện khác có thể gồm yếu hoặc tê một bên cơ thể, nhìn mờ hoặc mất thị lực, khó tìm từ, lú lẫn, chóng mặt, té ngã hoặc đau đầu dữ dội. Triệu chứng có thể thoáng qua nhưng vẫn cần được đánh giá y tế khẩn cấp.'},
  ]},
  {match:/\b(ha duong huyet|hypoglycemia)\b/i,sources:[
    {name:'NHS',title:'Low blood sugar (hypoglycaemia)',titleVi:'Dấu hiệu hạ đường huyết',url:'https://www.nhs.uk/conditions/low-blood-sugar-hypoglycaemia/',summaryVi:'Hạ đường huyết thường gặp ở người đái tháo đường dùng insulin hoặc một số thuốc điều trị. Dấu hiệu có thể gồm đói, chóng mặt, lo lắng hoặc cáu gắt, vã mồ hôi, run, tê môi, hồi hộp, mệt hoặc yếu, nhìn mờ và lú lẫn. Hạ đường huyết nặng có thể gây co giật hoặc mất ý thức. Khi có triệu chứng, người bệnh nên kiểm tra đường huyết nếu có thể và thực hiện kế hoạch xử trí đã được nhân viên y tế hướng dẫn; nếu không đáp ứng bình thường cần trợ giúp y tế khẩn cấp.'},
  ]},
  {match:/\b(tang huyet ap|cao huyet ap|hypertension)\b/i,sources:[
    {name:'WHO',title:'Hypertension',titleVi:'Tăng huyết áp và các dấu hiệu cần lưu ý',url:'https://www.who.int/news-room/fact-sheets/detail/hypertension',summaryVi:'Phần lớn người tăng huyết áp không cảm thấy triệu chứng, vì vậy đo huyết áp là cách quan trọng để phát hiện. Khi huyết áp rất cao, một số người có thể đau đầu dữ dội, đau ngực, chóng mặt, khó thở, buồn nôn, nhìn mờ, lo âu, lú lẫn hoặc rối loạn nhịp tim. Tăng huyết áp không kiểm soát làm tăng nguy cơ bệnh tim, đột quỵ và tổn thương thận. Các triệu chứng nặng kèm huyết áp rất cao cần được đánh giá y tế ngay.'},
  ]},
  {match:/\b(ha huyet ap|hypotension)\b/i,sources:[
    {name:'NHS',title:'Low blood pressure (hypotension)',titleVi:'Dấu hiệu hạ huyết áp',url:'https://www.nhs.uk/conditions/low-blood-pressure-hypotension/',summaryVi:'Hạ huyết áp không phải lúc nào cũng gây triệu chứng. Khi có biểu hiện, người bệnh có thể thấy choáng váng hoặc chóng mặt, buồn nôn, nhìn mờ, yếu, lú lẫn hoặc ngất. Triệu chứng xuất hiện khi đứng dậy hoặc thay đổi tư thế đột ngột có thể liên quan hạ huyết áp tư thế. Nếu các triệu chứng lặp lại hoặc đáng lo, nên được kiểm tra huyết áp và đánh giá y tế.'},
  ]},
  {match:/\b(nhoi mau co tim|dau tim|myocardial infarction)\b/i,sources:[
    {name:'NHS',title:'Heart attack',titleVi:'Dấu hiệu nhồi máu cơ tim',url:'https://www.nhs.uk/conditions/heart-attack/',summaryVi:'Nhồi máu cơ tim là tình trạng dòng máu đến tim bị tắc nghẽn và cần điều trị khẩn cấp. Dấu hiệu có thể gồm đau hoặc cảm giác đè ép ở ngực, đau lan lên tay, cổ hoặc hàm, khó thở, buồn nôn hoặc nôn, vã mồ hôi và cảm giác khó chịu giống đầy bụng. Đau ngực kiểu bóp nghẹt hoặc lan kèm khó thở nặng cần được trợ giúp y tế khẩn cấp.'},
  ]},
  {match:/\b(suy tim|heart failure)\b/i,sources:[
    {name:'NHS',title:'Heart failure',titleVi:'Dấu hiệu suy tim',url:'https://www.nhs.uk/conditions/heart-failure/',summaryVi:'Suy tim xảy ra khi tim không bơm máu hiệu quả như bình thường. Triệu chứng có thể gồm khó thở khi sinh hoạt hoặc khi nằm, mệt hoặc yếu, chóng mặt, phù chân hoặc bụng, tăng cân nhanh và ho về đêm. Các triệu chứng này có nhiều nguyên nhân khác nhau, vì vậy người có biểu hiện nghi ngờ cần được đánh giá y tế.'},
  ]},
  {match:/\b(viem phoi|pneumonia)\b/i,sources:[
    {name:'NHS',title:'Pneumonia',titleVi:'Triệu chứng viêm phổi',url:'https://www.nhs.uk/conditions/pneumonia/',summaryVi:'Viêm phổi là tình trạng viêm ở phổi, thường do nhiễm trùng. Triệu chứng có thể xuất hiện đột ngột hoặc tăng dần trong vài ngày, gồm ho, khó thở, sốt, đau ngực, đau mỏi cơ thể, rất mệt và giảm cảm giác ngon miệng. Người lớn tuổi có thể lú lẫn. Khó thở hoặc đau ngực đáng kể cần được đánh giá y tế sớm.'},
  ]},
  {match:/\b(mat nuoc|dehydration)\b/i,sources:[
    {name:'NHS',title:'Dehydration',titleVi:'Dấu hiệu mất nước',url:'https://www.nhs.uk/conditions/dehydration/',summaryVi:'Mất nước xảy ra khi cơ thể mất nhiều dịch hơn lượng được bổ sung. Dấu hiệu ở người lớn và trẻ em có thể gồm khát, đau đầu hoặc choáng váng, nước tiểu vàng sẫm và nặng mùi, tiểu ít hơn bình thường, mệt, khô miệng, môi và lưỡi. Trẻ nhỏ và người lớn tuổi có nguy cơ cao hơn. Mất nước nặng hoặc tình trạng ngày càng xấu cần được đánh giá y tế.'},
  ]},
  {match:/\b(tien san giat|preeclampsia)\b/i,sources:[
    {name:'NHS',title:'Pre-eclampsia',titleVi:'Dấu hiệu tiền sản giật',url:'https://www.nhs.uk/conditions/pre-eclampsia/',summaryVi:'Tiền sản giật là tình trạng liên quan thai kỳ gây tăng huyết áp và có thể gây biến chứng nghiêm trọng. Các dấu hiệu cảnh báo có thể gồm đau đầu dữ dội kéo dài, rối loạn thị giác, đau dưới bờ sườn, sưng đột ngột mặt, tay hoặc chân, cảm giác rất mệt hoặc nôn. Tình trạng thường xuất hiện từ sau 20 tuần nhưng cũng có thể xảy ra sau sinh. Người mang thai hoặc mới sinh có các triệu chứng nghi ngờ cần được đánh giá y tế khẩn.'},
  ]},
  {match:/\b(benh than man|suy than man|chronic kidney disease)\b/i,sources:[
    {name:'NHS',title:'Chronic kidney disease - Symptoms',titleVi:'Triệu chứng bệnh thận mạn',url:'https://www.nhs.uk/conditions/kidney-disease/symptoms/',summaryVi:'Bệnh thận mạn thường không gây triệu chứng ở giai đoạn sớm và đôi khi chỉ được phát hiện qua xét nghiệm máu hoặc nước tiểu. Ở giai đoạn tiến triển hơn, người bệnh có thể mệt, phù mắt cá chân hoặc bàn chân, khó thở, buồn nôn, tiểu nhiều về đêm, ngứa da hoặc chuột rút. Các triệu chứng kéo dài hoặc đáng lo nên được đánh giá y tế và làm xét nghiệm phù hợp.'},
  ]},
  {match:/\b(dai thao duong|tieu duong|diabetes)\b/i,sources:[
    {name:'WHO',title:'Diabetes',titleVi:'Triệu chứng đái tháo đường',url:'https://www.who.int/news-room/fact-sheets/detail/diabetes',summaryVi:'Triệu chứng đái tháo đường có thể gồm khát nhiều, tiểu nhiều hơn bình thường, nhìn mờ, mệt và sụt cân không chủ ý. Ở đái tháo đường type 2, triệu chứng có thể nhẹ và kéo dài nhiều năm trước khi được nhận ra. Bệnh có thể ảnh hưởng đến tim, mắt, thận và thần kinh nếu không được kiểm soát. Người có triệu chứng nghi ngờ cần được xét nghiệm đường huyết và đánh giá y tế.'},
  ]},
  {match:/\b(hen phe quan|hen suyen|asthma)\b/i,sources:[
    {name:'WHO',title:'Asthma',titleVi:'Triệu chứng hen phế quản',url:'https://www.who.int/news-room/fact-sheets/detail/asthma',summaryVi:'Hen là bệnh phổi mạn tính do viêm và co thắt đường thở. Triệu chứng thường gặp gồm ho, khò khè, khó thở và tức ngực; mức độ có thể nhẹ hoặc nặng và thay đổi theo thời gian. Một số người nặng hơn vào ban đêm, khi vận động hoặc khi gặp tác nhân kích thích. Người có triệu chứng gợi ý hen nên được nhân viên y tế đánh giá để xác định nguyên nhân và kế hoạch kiểm soát phù hợp.'},
  ]},
  {match:/\b(copd|benh phoi tac nghen man tinh)\b/i,sources:[
    {name:'WHO',title:'Chronic obstructive pulmonary disease (COPD)',titleVi:'Triệu chứng COPD',url:'https://www.who.int/news-room/fact-sheets/detail/chronic-obstructive-pulmonary-disease-(copd)',summaryVi:'COPD là bệnh phổi thường gặp gây hạn chế luồng khí và khó thở. Triệu chứng phổ biến gồm khó thở, ho kéo dài, đôi khi có đờm, khò khè và mệt. Triệu chứng có thể nặng lên nhanh trong các đợt cấp. Người có ho hoặc khó thở kéo dài nên được đánh giá y tế, đặc biệt khi có tiền sử hút thuốc hoặc tiếp xúc nhiều với khói và ô nhiễm không khí.'},
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
    prepared=await prepareAutoNews({ownerId:input.ownerId,url:primary.url,length,format,audience,editorialTitle:topic,userTopicHeadline:true,
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
    prepared.copyrightSafety.originality=assertOriginalEditorial(prepared.edited.headline,prepared.edited.script,[prepared.article.originalTitle,...prepared.research.sources.map(x=>x.title)],{allowGenericHeadline:true});
  }
  const contentQuality=auditContentQuality(prepared.edited.script);
  const healthSafety=auditHealthEditorial({
    title:prepared.edited.headline,script:prepared.edited.script,
    facts:prepared.intelligence.facts,audience,
  });
  const bodyTopicMatch=topic?sourceCoherenceScore(topic,prepared.edited.script):1;
  const entityMatch=topic?medicalTopicEntityMatch(topic,prepared.edited.script):true;
  const topicMatch=entityMatch?bodyTopicMatch:0;
  const topicGate=!entityMatch?'block':topicMatch>=.35?'pass':topicMatch>=.18?'review':'block';
  const localTranslationUsed=prepared.intelligence.warnings.some(x=>/Local Translation fallback:/i.test(x));
  const translationGate=localTranslationUsed?'review':'pass';
  const readyForDraft=healthSafety.status!=='block'&&contentQuality.status!=='block'&&topicGate!=='block'&&prepared.evidenceGate.status!=='block'&&prepared.copyrightSafety.originality.safe;
  const sourceName=prepared.article.sourceName||prepared.research.sources.map(x=>x.name).filter(Boolean).join(' • ').slice(0,120)||undefined;
  const openMedia=await searchOpenMediaForScript(topic||prepared.edited.headline,prepared.edited.script,6);
  const draftPayload=readyForDraft?{
    title:prepared.edited.headline,
    body:prepared.edited.script,
    sourceUrl:prepared.article.sourceUrl,
    sourceName,
    format,
    evidenceBundleId:prepared.evidenceBundleId,
    mediaProvenance:openMedia.candidates.map(x=>({url:x.url,sourceName:x.sourceName,sourceUrl:x.sourceUrl,kind:x.kind,rights:x.rights,creator:x.creator,licenseUrl:x.licenseUrl,rightsVerified:x.rightsVerified,sceneIndex:x.sceneIndex,sceneQuery:x.sceneQuery,sortOrder:x.sortOrder})),
  }:undefined;
  return{
    ...prepared,
    stage:readyForDraft?'draft-ready':'blocked',
    healthStudio:{version:'3.4.2',profile:'health',topic:topic||prepared.edited.headline,audience,topicMatch:Number(topicMatch.toFixed(3)),topicEntityMatch:entityMatch,topicGate,translationGate,localTranslationUsed,translationReviewRequired:localTranslationUsed,contentQuality,healthSafety,readyForDraft,medicalReviewRequired:true,visualPolicy:'original-cards-or-rights-verified-media',sourceAccess,researchDiscovery},
    openMedia,
    draftPayload,
  };
}
