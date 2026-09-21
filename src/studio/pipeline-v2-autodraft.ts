import { editNews, type EditedNews } from '../ai/editor.js';
import { findForeignSources } from '../research/foreign.js';
import { researchHealthTopic } from '../research/health.js';
import { likelyMedicalTopic, type PipelineTemplateId } from './pipeline-v2.js';

export interface ContentStudioAutodraftInput{
  ownerId:string;
  templateId:PipelineTemplateId;
  topic:string;
  seriesName?:string;
}
export interface ContentStudioAutodraftResult{
  topic:string;
  script:string;
  headline:string;
  hook:string;
  sourceUrls:string[];
  sources:Array<{name:string;title:string;url:string;summary:string;authority?:number;kind?:string}>;
  researchMode:'medical'|'general';
  warnings:string[];
  medicalSensitive:boolean;
  editor:{mode:string;provider:string;estimatedSeconds:number};
}

function clean(v:unknown,max=4000){return String(v??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function targetLength(templateId:PipelineTemplateId):'60'|'90'|'120'{
  if(templateId==='health-story'||templateId==='podcast-story')return'120';
  if(templateId==='topic-explainer')return'90';
  return'60';
}
function sourceBrief(sources:Array<{name:string;title:string;summary:string}>){
  return sources.map((s,i)=>[
    `Nguồn ${i+1}: ${clean(s.name,120)}`,
    `Tiêu đề: ${clean(s.title,500)}`,
    `Tóm tắt dữ kiện: ${clean(s.summary,2200)}`,
  ].join('\n')).join('\n\n');
}
function templateInstruction(templateId:PipelineTemplateId,topic:string){
  switch(templateId){
    case'health-story':
      return `Viết như một câu chuyện sức khỏe đời thường Việt Nam về "${topic}". Có nhân vật hư cấu trưởng thành, tình huống gần gũi, diễn tiến rõ, nút thắt hợp lý; cuối bài có 3 điều cần nhớ. Không chẩn đoán thay bác sĩ, không thêm dữ kiện ngoài nguồn.`;
    case'health-short':
      return `Viết video sức khỏe ngắn về "${topic}": hook ngắn, dấu hiệu/ý nghĩa chính, khi nào cần tìm trợ giúp y tế, 3 điều cần nhớ. Chỉ dùng dữ kiện có nguồn.`;
    case'knowledge-compare':
      return `Viết kịch bản so sánh "${topic}": điểm giống, khác biệt cốt lõi, khi nào dùng/quan tâm từng bên, takeaway rõ. Không tự tuyên bố bên nào tốt hơn nếu nguồn không hỗ trợ.`;
    case'topic-explainer':
      return `Viết video giải thích "${topic}" theo cấu trúc hook → bối cảnh → giải thích dễ hiểu → ví dụ/ý nghĩa → takeaway → CTA nhẹ.`;
    case'url-story':
      return `Viết video tóm lược và giải thích chủ đề "${topic}" từ các nguồn đã thu thập, không sao chép nguyên văn.`;
    default:
      return `Viết kịch bản video/podcast tự nhiên về "${topic}", có hook, diễn tiến mạch lạc và takeaway.`;
  }
}

export async function generateContentStudioAutodraft(input:ContentStudioAutodraftInput):Promise<ContentStudioAutodraftResult>{
  const topic=clean(input.topic,180);
  if(topic.length<3)throw new Error('Chủ đề quá ngắn.');
  const medicalSensitive=input.templateId==='health-story'||input.templateId==='health-short'||likelyMedicalTopic(topic);
  const warnings:string[]=[];
  let sources:Array<{name:string;title:string;url:string;summary:string;authority?:number;kind?:string}>=[];
  if(medicalSensitive){
    const pack=await researchHealthTopic(topic,6,[]);
    warnings.push(...pack.warnings);
    sources=pack.sources.map(s=>({name:s.name,title:s.title,url:s.url,summary:s.summary,authority:s.authority,kind:s.kind}));
  }else{
    const pack=await findForeignSources(topic,5);
    sources=pack.sources.map(s=>({name:s.name,title:s.title,url:s.url,summary:s.summary}));
    if(!sources.length)warnings.push('Chưa tìm được nguồn ngoài phù hợp; kịch bản sẽ cần người dùng bổ sung nguồn hoặc tự kiểm tra trước khi phát hành.');
  }
  if(medicalSensitive){
    const authoritative=sources.filter(s=>(s.authority||0)>=90).length;
    if(sources.length<2||authoritative<1)throw new Error('Chưa tìm đủ Evidence Pack y khoa để tự tạo kịch bản an toàn. Hãy bổ sung nguồn hoặc thử lại chủ đề cụ thể hơn.');
  }
  const brief=[
    templateInstruction(input.templateId,topic),
    'YÊU CẦU BẮT BUỘC: viết lại nguyên bản bằng tiếng Việt; không chép câu từ nguồn; không ghi tên publisher trong lời đọc; không bịa thêm số liệu, chẩn đoán, liều thuốc hoặc khuyến cáo.',
    sourceBrief(sources),
  ].join('\n\n');
  const edited:EditedNews=await editNews({
    title:topic,
    body:brief,
    sourceName:'Content Studio Research Pack',
    length:targetLength(input.templateId),
    ownerId:input.ownerId,
    audience:medicalSensitive?'medical':'social',
  });
  const script=clean(edited.script,20000);
  if(script.length<20)throw new Error('Không tạo được kịch bản đủ nội dung từ chủ đề này.');
  return{
    topic:clean(edited.headline||topic,180),
    headline:clean(edited.headline||topic,180),
    hook:clean(edited.hook,500),
    script,
    sourceUrls:[...new Set(sources.map(s=>s.url).filter(Boolean))].slice(0,20),
    sources:sources.slice(0,8),
    researchMode:medicalSensitive?'medical':'general',
    warnings,
    medicalSensitive,
    editor:{mode:edited.mode,provider:edited.provider,estimatedSeconds:edited.estimatedSeconds},
  };
}
