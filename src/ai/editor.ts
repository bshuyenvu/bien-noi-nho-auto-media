export type ScriptLength='30'|'60'|'90';
export interface EditedNews{headline:string;hook:string;script:string;caption:string;hashtags:string[];estimatedSeconds:number;mode:'local'|'llm'}

const targetWords:Record<ScriptLength,number>={30:75,60:135,90:195};
const HIGH_ATTENTION=/\b(cảnh báo|khẩn|tin nóng|bất ngờ|hiếm gặp|gây chú ý|đáng chú ý|mới nhất|vừa xảy ra|lần đầu|kỷ lục|nguy cơ|bão|lũ|cháy|sạt lở|tai nạn|cứu hộ|sức khỏe|bệnh|giá vàng|usd|chính sách|bhyt)\b/i;
const SENSITIVE=/\b(tử vong|thiệt mạng|thương vong|nạn nhân|trẻ em|ung thư|tự tử|thảm họa|chiến tranh)\b/i;
function clean(s:string){return s.replace(/\s+/g,' ').trim();}
function words(s:string){return clean(s).split(/\s+/).filter(Boolean);}
function sentences(s:string){return s.replace(/\n+/g,' ').split(/(?<=[.!?…])\s+/).map(clean).filter(x=>x.length>20);}
function shorten(s:string,max:number){const w=words(s);return w.length<=max?clean(s):w.slice(0,max).join(' ')+'…';}
function baseHeadline(title:string){const t=clean(title).replace(/^[\-–—:]+|[\-–—:]+$/g,'');return shorten(t,16).slice(0,125);}
function engagingHeadline(title:string,body:string){const t=baseHeadline(title);if(SENSITIVE.test(`${title} ${body}`))return t;if(/^((tin nóng|cảnh báo|đáng chú ý)[:：])/i.test(t))return t;if(HIGH_ATTENTION.test(`${title} ${body}`))return `Đáng chú ý: ${t}`.slice(0,125);return t;}
function makeHook(title:string,body:string){const h=engagingHeadline(title,body);const sample=`${title} ${body}`;if(SENSITIVE.test(sample))return `Thông tin đang được nhiều người quan tâm: ${h}.`;
 if(/\b(cảnh báo|nguy cơ|bão|lũ|cháy|sạt lở)\b/i.test(sample))return `Cảnh báo đáng chú ý: ${h}. Những diễn biến chính là gì?`;
 if(/\b(chính sách|bhyt|giá|mức đóng|quy định)\b/i.test(sample))return `${h}. Điều gì thay đổi và ai sẽ bị ảnh hưởng?`;
 if(/\b(sức khỏe|bệnh|bác sĩ|dinh dưỡng)\b/i.test(sample))return `${h}. Chi tiết nào người xem cần biết ngay?`;
 return `${h}. Đây là những điểm đáng chú ý nhất.`;}
function localEdit(input:{title:string;body:string;sourceName?:string;length:ScriptLength}):EditedNews{
 const max=targetWords[input.length],ss=sentences(input.body),chosen:string[]=[];let count=0;
 for(const s of ss){const n=words(s).length;if(count+n>max&&chosen.length>=2)break;chosen.push(s);count+=n;if(count>=max)break;}
 if(!chosen.length)chosen.push(shorten(input.body,max));
 const headline=engagingHeadline(input.title,input.body),hook=makeHook(input.title,input.body);
 let script=clean(`${hook} ${chosen.join(' ')}`);script=shorten(script,max);
 const source=input.sourceName?` Nguồn: ${clean(input.sourceName)}.`:'';
 const caption=shorten(`${headline}.${source} Xem nhanh các điểm chính và theo dõi Biển & Nỗi Nhớ để cập nhật diễn biến mới.`,50);
 const tags=['#BienVaNoiNho',HIGH_ATTENTION.test(`${input.title} ${input.body}`)?'#TinDangChuY':'#TinMoi','#CapNhat'];
 return {headline,hook,script,caption,hashtags:tags,estimatedSeconds:Number(input.length),mode:'local'};
}

async function llmEdit(input:{title:string;body:string;sourceName?:string;length:ScriptLength}):Promise<EditedNews|null>{
 const base=process.env.AI_API_URL?.replace(/\/$/,'');const key=process.env.AI_API_KEY;const model=process.env.AI_MODEL;if(!base||!key||!model)return null;
 const prompt=`Bạn là biên tập viên video tin ngắn tiếng Việt chuyên tối ưu retention cho video dọc. Hãy chuyển nội dung dưới đây thành kịch bản khoảng ${input.length} giây.
Mục tiêu: tiêu đề thu hút, hook mạnh trong 2 câu đầu, câu ngắn, dễ đọc thành tiếng, tạo tò mò để người xem tiếp tục xem.
QUY TẮC BẮT BUỘC:
- Không thêm dữ kiện, con số, nguyên nhân, danh tính hay kết luận không có trong nguồn.
- Không bóp méo mức độ nghiêm trọng để câu view.
- Với tử vong, tai nạn, bệnh nặng, trẻ em hoặc thảm họa: dùng ngôn ngữ tôn trọng, không giật gân.
- Headline ưu tiên 8-16 từ, nêu xung đột/thay đổi/hệ quả rõ nhất khi nguồn có hỗ trợ.
- Hook nên trả lời một trong các kiểu: “Điều gì vừa thay đổi?”, “Ai bị ảnh hưởng?”, “Vì sao đáng chú ý?”, nhưng không được đặt câu hỏi mà nguồn không thể trả lời.
- Kịch bản: Hook → diễn biến chính → chi tiết quan trọng → ý nghĩa/hệ quả → nguồn/cập nhật nếu phù hợp.
Trả JSON thuần với: headline, hook, script, caption, hashtags (mảng 3-5 phần tử).
\nTIÊU ĐỀ GỐC: ${input.title}\nNGUỒN: ${input.sourceName||''}\nNỘI DUNG:\n${input.body.slice(0,9000)}`;
 const r=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],temperature:0.45,response_format:{type:'json_object'}}),signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw new Error(`AI HTTP ${r.status}`);const data:any=await r.json();const text=data?.choices?.[0]?.message?.content;if(!text)return null;const x=JSON.parse(text);
 const headline=clean(String(x.headline||engagingHeadline(input.title,input.body))).slice(0,125);
 return {headline,hook:clean(String(x.hook||makeHook(input.title,input.body))),script:clean(String(x.script||'')),caption:clean(String(x.caption||'')),hashtags:Array.isArray(x.hashtags)?x.hashtags.map((v:any)=>clean(String(v))).filter(Boolean).slice(0,5):['#BienVaNoiNho','#TinDangChuY','#CapNhat'],estimatedSeconds:Number(input.length),mode:'llm'};
}

export async function editNews(input:{title:string;body:string;sourceName?:string;length:ScriptLength}){
 try{return await llmEdit(input)??localEdit(input);}catch(e){console.warn('AI editor fallback to local:',e);return localEdit(input);}
}
