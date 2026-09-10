import type { AudienceProfile } from '../editorial/newsroom.js';
import type { SourceFact } from '../editorial/source-intelligence.js';

export type HealthSafetyStatus='pass'|'review'|'block';
export interface HealthSafetyAudit{
  status:HealthSafetyStatus;
  score:number;
  reasons:string[];
  warnings:string[];
  medicationSpecific:boolean;
  emergencyActionPresent:boolean;
  medicalReviewRequired:boolean;
}

const MEDICAL=/(sức khỏe|y tế|bệnh|triệu chứng|điều trị|thuốc|vaccine|vắc xin|tiêm|tiêm chủng|chẩn đoán|dinh dưỡng|giấc ngủ|vận động|thể dục|thai kỳ|mang thai|sản khoa|trẻ em|sức khỏe tâm thần|trầm cảm|đái tháo đường|đường huyết|tim mạch|đột quỵ|ung thư|huyết áp|cholesterol|mỡ máu|gan|thận|phổi|sốt|viêm|nhiễm|bệnh viện|who|cdc|bộ y tế)/i;
const DOSAGE=/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|viên|ống|đơn vị)\b/i;
const TREATMENT_DIRECTIVE=/(?:hãy|nên|cần)\s+(?:uống|dùng|tiêm|ngừng|dừng|tăng|giảm)\s+(?:thuốc|liều|viên)/i;
const PERSONAL_DIAGNOSIS=/(?:bạn|anh|chị)\s+(?:chắc chắn|đang|đã)\s+(?:bị|mắc)/i;
const EMERGENCY_TOPIC=/(đột quỵ|nhồi máu cơ tim|phản vệ|ngừng tim|khó thở dữ dội|đau ngực dữ dội)/i;
const SYMPTOM_CONTEXT=/(dấu hiệu|triệu chứng|nhận biết|cảnh báo|khởi phát)/i;
const EMERGENCY_ACTION=/(cấp cứu|gọi\s*115|đến\s+(?:ngay\s+)?(?:cơ sở y tế|bệnh viện)|gọi\s+cấp cứu)/i;
function unsafeAbsoluteClaim(text:string){
  const sentences=text.split(/(?<=[.!?])\s+/);
  return sentences.some(s=>{
    if(/\b(không|không nên|không có|chưa có bằng chứng|không thể)\b/i.test(s))return false;
    return /\b(?:chữa khỏi|khỏi bệnh)\s*(?:100%|hoàn toàn)|\bthần dược\b|\bcam kết\s+(?:khỏi|chữa)|\btự ý\s+(?:ngừng|dừng|tăng|giảm)\s+(?:thuốc|liều)\b/i.test(s);
  });
}

export function auditHealthEditorial(input:{title:string;script:string;facts:SourceFact[];audience?:AudienceProfile}):HealthSafetyAudit{
  const text=`${input.title}. ${input.script}`.trim(),reasons:string[]=[],warnings:string[]=[];
  const medicationSpecific=DOSAGE.test(text)||TREATMENT_DIRECTIVE.test(text);
  const emergencyContext=EMERGENCY_TOPIC.test(text)&&SYMPTOM_CONTEXT.test(text);
  const emergencyActionPresent=!emergencyContext||EMERGENCY_ACTION.test(text);
  if(!MEDICAL.test(text))reasons.push('Nội dung chưa có tín hiệu y khoa đủ rõ cho Health Studio.');
  if(!input.facts.length)reasons.push('Không có fact y khoa đã khóa từ Evidence Engine.');
  if(unsafeAbsoluteClaim(text))reasons.push('Phát hiện tuyên bố tuyệt đối hoặc chỉ dẫn tự thay đổi điều trị không an toàn.');
  if(PERSONAL_DIAGNOSIS.test(text))reasons.push('Nội dung có dấu hiệu chẩn đoán cá nhân trực tiếp cho người xem.');
  if(medicationSpecific)warnings.push('Có liều thuốc hoặc chỉ dẫn điều trị cụ thể: bắt buộc bác sĩ kiểm tra thủ công trước khi phát hành.');
  if(!emergencyActionPresent)warnings.push('Nội dung nhận biết tình trạng cấp cứu nhưng chưa nêu hành động tìm trợ giúp y tế khẩn cấp.');
  if(input.facts.some(x=>x.support==='uncertain'||x.confidence<0.6))warnings.push('Có claim bất định/độ tin cậy thấp trong tập fact nguồn.');
  let status:HealthSafetyStatus='pass';
  if(reasons.length)status='block';
  else if(warnings.length)status='review';
  const penalty=reasons.length*35+warnings.length*12;
  const score=Math.max(0,Math.min(100,100-penalty));
  return{
    status,score,reasons,warnings,medicationSpecific,emergencyActionPresent,
    medicalReviewRequired:true,
  };
}
