export type ScriptLength='30'|'60'|'90';
export interface EditedNews{headline:string;hook:string;script:string;caption:string;hashtags:string[];estimatedSeconds:number;mode:'local'|'llm';completeness:{complete:boolean;included:string[];missing:string[]};removedIllustrationText:number}

const targetWords:Record<ScriptLength,number>={30:78,60:145,90:215};
const HIGH=/\b(cảnh báo|khẩn|tin nóng|bất ngờ|đáng chú ý|mới nhất|nguy cơ|bão|lũ|cháy|tai nạn|sức khỏe|giá vàng|usd|chính sách|bhyt)\b/i;
const SENSITIVE=/\b(tử vong|thiệt mạng|thương vong|nạn nhân|trẻ em|ung thư|tự tử|thảm họa|chiến tranh)\b/i;
const IMAGE_LINE=/^(?:(?:ảnh|hình|video|clip)(?:\s+(?:minh\s*họa|tư\s*liệu|đính\s*kèm|chụp\s*màn\s*hình))?|minh\s*họa|nguồn\s*ảnh|photo|image|illustration|caption|credit|thumbnail)\s*(?::|[-–—]|\||©)/i;
const IMAGE_FILE=/\b[^\s/\\]+\.(?:jpe?g|png|webp|gif|bmp|svg|avif|heic)(?:\?[^\s]*)?\b/ig;
const CREDIT=/\((?:ảnh|hình|video|nguồn ảnh|photo|image|credit)\s*:[^)]+\)/ig;
function clean(s:string){return s.replace(/\s+/g,' ').trim()}
function words(s:string){return clean(s).split(/\s+/).filter(Boolean)}
function shorten(s:string,max:number){const w=words(s);return w.length<=max?clean(s):w.slice(0,max).join(' ').replace(/[,;:]$/,'')+'…'}
function sentences(s:string){return s.replace(/\n+/g,' ').split(/(?<=[.!?…])\s+/).map(clean).filter(x=>x.length>12)}
function norm(s:string){return clean(s).toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d')}
export function stripIllustrationText(value:string){let removed=0;const text=value.split(/\r?\n/).map(line=>{const t=line.trim();if(!t)return'';if(IMAGE_LINE.test(t)){removed++;return''}const f=t.match(IMAGE_FILE),c=t.match(CREDIT);removed+=(f?.length||0)+(c?.length||0);return t.replace(IMAGE_FILE,' ').replace(CREDIT,' ').replace(/\s{2,}/g,' ').trim()}).filter(Boolean).join('\n');return{text:text.trim(),removed}}

type Fact={key:string;label:string;text:string;priority:number};
const RULES:Array<[string,string,RegExp,number]>=[
 ['event','sự việc chính',/\b(xảy ra|cho biết|thông báo|công bố|quyết định|ghi nhận|phát hiện|đề xuất|ban hành|tăng|giảm|bắt giữ|cảnh báo|thiệt hại|tử vong)\b/i,10],
 ['result','kết quả/hệ quả',/\b(kết quả|hậu quả|khiến|dẫn đến|do đó|vì vậy|ảnh hưởng|thiệt hại|đã cứu|đang điều trị|xử lý)\b/i,9],
 ['time','thời gian',/\b(hôm nay|hôm qua|sáng|trưa|chiều|tối|đêm|ngày|tháng|năm|lúc)\b|\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/i,8],
 ['place','địa điểm',/\b(tại|ở|thuộc|khu vực|tỉnh|thành phố|huyện|xã|phường|quốc gia|bệnh viện)\b/i,8],
 ['people','người/tổ chức liên quan',/\b(ông|bà|anh|chị|người|cơ quan|bộ|sở|công an|chính phủ|bệnh viện|công ty|đội|lực lượng)\b/i,7],
 ['number','số liệu quan trọng',/\b\d+(?:[.,]\d+)?\s*(?:%|triệu|tỷ|nghìn|người|ca|đồng|usd|km|giờ|phút)?\b/i,7],
 ['advice','khuyến cáo/cập nhật',/\b(khuyến cáo|cảnh báo|lưu ý|không nên|nên|tiếp tục|đang điều tra|đang xác minh|sẽ cập nhật)\b/i,6]
];
function facts(title:string,body:string){const ss=sentences(body),out:Fact[]=[];for(const[key,label,re,priority]of RULES){const text=ss.find(s=>re.test(s));if(text)out.push({key,label,text,priority})}if(!out.some(x=>x.key==='event'))out.unshift({key:'event',label:'sự việc chính',text:ss[0]||title,priority:10});return out.sort((a,b)=>b.priority-a.priority)}
function headline(title:string,body:string){const t=shorten(clean(title).replace(/^[\-–—:]+|[\-–—:]+$/g,''),16).slice(0,125);if(SENSITIVE.test(title+' '+body)||/^(tin nóng|cảnh báo|đáng chú ý)[:：]/i.test(t))return t;return HIGH.test(title+' '+body)?('Đáng chú ý: '+t).slice(0,125):t}
function hook(title:string,body:string){const h=headline(title,body),s=title+' '+body;if(SENSITIVE.test(s))return'Thông tin đang được nhiều người quan tâm: '+h+'.';if(/\b(cảnh báo|nguy cơ|bão|lũ|cháy)\b/i.test(s))return'Cảnh báo đáng chú ý: '+h+'.';return h+'. Đây là những điểm người xem cần biết.'}
function compact(open:string,fs:Fact[],max:number,source?:string){const parts:string[]=[],seen=new Set<string>();let used=words(open).length;for(const f of fs){if(seen.has(f.text))continue;seen.add(f.text);const left=max-used;if(left<8)break;const p=shorten(f.text,Math.min(words(f.text).length,left));parts.push(p);used+=words(p).length}const tail=source?' Theo '+clean(source)+'.':'';return shorten(clean(open+' '+parts.join(' ')+tail),max)}
function audit(script:string,fs:Fact[]){const n=norm(script),included=fs.filter(f=>norm(f.text).split(/\s+/).filter(x=>x.length>4).slice(0,6).some(x=>n.includes(x))).map(f=>f.label),required=[...new Set(fs.filter(f=>f.priority>=8).map(f=>f.label))],missing=required.filter(x=>!included.includes(x));return{complete:missing.length===0,included:[...new Set(included)],missing}}
function localEdit(input:{title:string;body:string;sourceName?:string;length:ScriptLength}):EditedNews{const t=stripIllustrationText(input.title),b=stripIllustrationText(input.body),title=t.text||'Bản tin mới',body=b.text,fs=facts(title,body),h=headline(title,body),hk=hook(title,body),script=compact(hk,fs,targetWords[input.length],input.sourceName),source=input.sourceName?' Nguồn: '+clean(input.sourceName)+'.':'';return{headline:h,hook:hk,script,caption:shorten(h+'.'+source+' Theo dõi Biển & Nỗi Nhớ để cập nhật diễn biến mới.',50),hashtags:['#BienVaNoiNho',HIGH.test(title+' '+body)?'#TinDangChuY':'#TinMoi','#CapNhat'],estimatedSeconds:Number(input.length),mode:'local',completeness:audit(script,fs),removedIllustrationText:t.removed+b.removed}}

async function llmEdit(input:{title:string;body:string;sourceName?:string;length:ScriptLength}):Promise<EditedNews|null>{
 const base=process.env.AI_API_URL?.replace(/\/$/,''),key=process.env.AI_API_KEY,model=process.env.AI_MODEL;if(!base||!key||!model)return null;
 const t=stripIllustrationText(input.title),b=stripIllustrationText(input.body),fs=facts(t.text,b.text),check=fs.map(x=>'- '+x.label+': '+x.text).join('\n');
 const prompt=`Bạn là biên tập viên video tin ngắn tiếng Việt. Viết kịch bản khoảng ${input.length} giây, hấp dẫn nhưng chính xác.\nPhải bảo toàn mọi dữ kiện cốt lõi có trong nguồn: sự việc, người/tổ chức, thời gian, địa điểm, diễn biến, số liệu, kết quả/hệ quả và khuyến cáo. Rút gọn bằng cách gộp câu và bỏ từ thừa, không được bỏ dữ kiện.\nKhông thêm hoặc suy diễn thông tin. Không đưa tên file ảnh, chú thích/credit ảnh, “ảnh minh họa”, “hình minh họa”, “nguồn ảnh” vào bất kỳ trường nào. Tin nhạy cảm phải tôn trọng, không giật gân. Hook mạnh nhưng có căn cứ. Headline 8-16 từ. Kết thúc bằng kết quả, cảnh báo hoặc trạng thái cập nhật nếu nguồn có.\nTrả JSON thuần: headline, hook, script, caption, hashtags (3-5 phần tử).\nDỮ KIỆN PHẢI GIỮ:\n${check}\nTIÊU ĐỀ: ${t.text}\nNGUỒN: ${input.sourceName||''}\nNỘI DUNG:\n${b.text.slice(0,9000)}`;
 const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+key},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],temperature:.25,response_format:{type:'json_object'}}),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('AI HTTP '+r.status);const data:any=await r.json(),raw=data?.choices?.[0]?.message?.content;if(!raw)return null;const x=JSON.parse(raw);
 const eh=stripIllustrationText(String(x.headline||'')),ek=stripIllustrationText(String(x.hook||'')),es=stripIllustrationText(String(x.script||'')),ec=stripIllustrationText(String(x.caption||''));let script=shorten(es.text,targetWords[input.length]),completeness=audit(script,fs);if(!completeness.complete){script=compact(ek.text||hook(t.text,b.text),fs,targetWords[input.length],input.sourceName);completeness=audit(script,fs)}
 return{headline:clean(eh.text||headline(t.text,b.text)).slice(0,125),hook:clean(ek.text||hook(t.text,b.text)),script,caption:clean(ec.text),hashtags:Array.isArray(x.hashtags)?x.hashtags.map((v:any)=>clean(String(v))).filter(Boolean).slice(0,5):['#BienVaNoiNho','#TinDangChuY','#CapNhat'],estimatedSeconds:Number(input.length),mode:'llm',completeness,removedIllustrationText:t.removed+b.removed+eh.removed+ek.removed+es.removed+ec.removed}
}
export async function editNews(input:{title:string;body:string;sourceName?:string;length:ScriptLength}){try{return await llmEdit(input)??localEdit(input)}catch(e){console.warn('AI editor fallback to local:',e);return localEdit(input)}}
