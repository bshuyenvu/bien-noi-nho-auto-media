import type { StoryBlueprint } from './newsroom.js';

export interface EditorialQualityReport{score:number;ready:boolean;claimCoverage:number;missingMandatory:string[];redundancyScore:number;endingComplete:boolean;spokenVietnameseScore:number;specificityScore:number;coherenceScore:number;naturalnessScore:number;issues:string[];recommendations:string[]}
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const norm=(s:string)=>clean(s).toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9\s]/g,' ');
const STOP=new Set(['nhung','cac','mot','so','dang','duoc','dieu','thong','tin','nay','do','la','co','the','ve','voi','trong','khi']);
const tokens=(s:string)=>new Set(norm(s).split(/\s+/).filter(x=>x.length>3&&!STOP.has(x)));
function overlap(a:string,b:string){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let same=0;for(const x of A)if(B.has(x))same++;return same/Math.min(A.size,B.size)}
function scriptSentences(s:string){return clean(s).split(/(?<=[.!?])\s+/).map(clean).filter(x=>x.length>8)}
function redundancy(sentences:string[]){let max=0;for(let i=0;i<sentences.length;i++)for(let j=i+1;j<sentences.length;j++)max=Math.max(max,overlap(sentences[i],sentences[j]));return max}
function endingComplete(script:string){const s=clean(script);return Boolean(s)&&/[.!?]$/.test(s)&&!/(?:và|nhưng|vì|do|khi|nếu|trong khi|theo|với|của)\s*[.!?]?$/i.test(s)&&!s.endsWith('…')}
function spokenScore(script:string){const ss=scriptSentences(script);if(!ss.length)return 0;let score=100;for(const s of ss){const n=s.split(/\s+/).length;if(n>30)score-=Math.min(14,n-30);if((s.match(/,/g)||[]).length>4)score-=5;if(/\b[A-Z]{5,}\b/.test(s))score-=3}return Math.max(0,Math.round(score))}
const GENERIC=/(?:con số nào cho thấy quy mô|diễn biến này|sự việc này|chuyện này đang|thông tin tiếp theo cần được đối chiếu|theo dõi .* để cập nhật|điều đáng chú ý|một tín hiệu mới)/i;
function specificityScore(script:string,b:StoryBlueprint){const first=scriptSentences(script)[0]||'',topic=tokens(b.topic);if(!topic.size)return 75;const all=tokens(script),lead=tokens(first);let allHits=0,leadHits=0;for(const t of topic){if(all.has(t))allHits++;if(lead.has(t))leadHits++}let score=45+Math.min(30,allHits*12)+Math.min(25,leadHits*15);if(GENERIC.test(first)&&leadHits===0)score-=35;return Math.max(0,Math.min(100,score))}
function coherenceScore(script:string){
 const ss=scriptSentences(script);if(ss.length<2)return 45;
 const connectors=/^(?:tuy nhien|trong khi do|vi vay|do do|thuc te|quan trong hon|mat khac|dong thoi|doi lai|ve |o |theo |dang luu y|rieng |con |nhung |ly do |he qua )/;
 let linked=0;for(const s of ss.slice(1))if(connectors.test(norm(s).trim()))linked++;
 let score=74+Math.min(18,linked*6);
 const starts=ss.map(x=>norm(x).split(' ').slice(0,2).join(' ')),unique=new Set(starts);
 if(ss.length>=5&&unique.size<=Math.ceil(ss.length/2))score-=12;
 if(ss.length>=5&&linked===0)score-=12;
 return Math.max(0,Math.min(100,Math.round(score)))
}
function naturalnessScore(script:string){
 const ss=scriptSentences(script);let score=100;
 if(GENERIC.test(script))score-=24;
 const listStarts=ss.filter(x=>/^(?:một số|nhiều|chỉ khoảng|tuổi cao|quan niệm|theo nguồn|thông tin)/i.test(x)).length;
 if(ss.length>=5&&listStarts/ss.length>.55)score-=18;
 if((script.match(/\bMột số\b/gi)||[]).length>=3)score-=12;
 if(/DỮ KIỆN ĐÃ KHÓA|LƯU Ý BIÊN TẬP|claim/i.test(script))score-=30;
 return Math.max(0,Math.min(100,score))
}
export function evaluateEditorialQuality(script:string,b:StoryBlueprint):EditorialQualityReport{
 const issues:string[]=[],recommendations:string[]=[],mandatory=b.rankedClaims.filter(x=>b.requiredClaimIds.includes(x.claimId));
 const covered=mandatory.filter(x=>overlap(script,x.fact.text)>=.4),missingMandatory=mandatory.filter(x=>!covered.includes(x)).map(x=>x.claimId);
 const claimCoverage=mandatory.length?Math.round(covered.length/mandatory.length*100):100,ss=scriptSentences(script),redundancyScore=Math.round(redundancy(ss)*100),ending=endingComplete(script),spokenVietnameseScore=spokenScore(script),specificity=specificityScore(script,b),coherence=coherenceScore(script),naturalness=naturalnessScore(script);
 if(missingMandatory.length){issues.push(`Thiếu ${missingMandatory.length} claim bắt buộc`);recommendations.push('Bổ sung claim bắt buộc trước khi finalize.')}
 if(redundancyScore>=72){issues.push('Lặp ý/cấu trúc cao');recommendations.push('Gộp hoặc viết lại các câu có nghĩa gần nhau.')}
 if(!ending){issues.push('Kết thúc chưa trọn nghĩa');recommendations.push('Thay câu cuối bằng một câu hoàn chỉnh, không cắt cơ học.')}
 if(spokenVietnameseScore<82){issues.push('Câu đọc thành tiếng còn nặng');recommendations.push('Tách câu dài, giảm chuỗi mệnh đề và acronym.')}
 if(specificity<65){issues.push('Hook/mở bài còn chung chung');recommendations.push('Đưa chủ thể hoặc vấn đề cụ thể vào ngay câu mở đầu.')}
 if(coherence<65){issues.push('Mạch kể còn giống danh sách dữ kiện');recommendations.push('Sắp lại theo quan hệ vấn đề → giải thích → hệ quả → khuyến cáo.')}
 if(naturalness<70){issues.push('Văn phong còn máy móc');recommendations.push('Loại câu khung chung chung và viết lại chuyển ý tự nhiên.')}
 const score=Math.max(0,Math.round(claimCoverage*.30+(100-redundancyScore)*.08+(ending?100:45)*.10+spokenVietnameseScore*.14+specificity*.14+coherence*.12+naturalness*.12));
 const ready=missingMandatory.length===0&&ending&&redundancyScore<78&&specificity>=65&&coherence>=65&&naturalness>=70&&score>=82;
 return{score,ready,claimCoverage,missingMandatory,redundancyScore,endingComplete:ending,spokenVietnameseScore,specificityScore:specificity,coherenceScore:coherence,naturalnessScore:naturalness,issues,recommendations}
}
export function editorialCritic(script:string,b:StoryBlueprint){const q=evaluateEditorialQuality(script,b),notes=[...q.issues];if(b.angle==='direct'&&scriptSentences(script).length<3)notes.push('Bản tin quá mỏng so với góc direct news.');if(b.complexity==='high'&&script.split(/\s+/).length<140)notes.push('Nguồn phức tạp nhưng kịch bản quá ngắn; nên dùng 90–120 giây.');return{...q,criticNotes:notes}}
