export type ScriptLength='30'|'60'|'90';
export interface EditedNews{headline:string;hook:string;script:string;caption:string;hashtags:string[];estimatedSeconds:number;mode:'local'|'llm'}

const targetWords:Record<ScriptLength,number>={30:75,60:135,90:195};
function clean(s:string){return s.replace(/\s+/g,' ').trim();}
function words(s:string){return clean(s).split(/\s+/).filter(Boolean);}
function sentences(s:string){return s.replace(/\n+/g,' ').split(/(?<=[.!?…])\s+/).map(clean).filter(x=>x.length>20);}
function shorten(s:string,max:number){const w=words(s);return w.length<=max?clean(s):w.slice(0,max).join(' ')+'…';}
function headline(title:string){const t=clean(title).replace(/^[\-–—:]+|[\-–—:]+$/g,'');return shorten(t,14).slice(0,120);}
function localEdit(input:{title:string;body:string;sourceName?:string;length:ScriptLength}):EditedNews{
 const max=targetWords[input.length];const ss=sentences(input.body);const chosen:string[]=[];let count=0;
 for(const s of ss){const n=words(s).length;if(count+n>max&&chosen.length>=2)break;chosen.push(s);count+=n;if(count>=max)break;}
 if(!chosen.length)chosen.push(shorten(input.body,max));
 const hook=`Đáng chú ý: ${headline(input.title)}.`;
 let script=clean(`${hook} ${chosen.join(' ')}`);script=shorten(script,max);
 const source=input.sourceName?` Nguồn: ${clean(input.sourceName)}.`:'';
 const caption=shorten(`${headline(input.title)}.${source} Theo dõi Biển & Nỗi Nhớ để cập nhật thêm.`,45);
 return {headline:headline(input.title),hook,script,caption,hashtags:['#BienVaNoiNho','#TinMoi','#CapNhat'],estimatedSeconds:Number(input.length),mode:'local'};
}

async function llmEdit(input:{title:string;body:string;sourceName?:string;length:ScriptLength}):Promise<EditedNews|null>{
 const base=process.env.AI_API_URL?.replace(/\/$/,'');const key=process.env.AI_API_KEY;const model=process.env.AI_MODEL;if(!base||!key||!model)return null;
 const prompt=`Bạn là biên tập viên video tin ngắn tiếng Việt. Hãy chuyển nội dung dưới đây thành kịch bản khoảng ${input.length} giây. Không thêm dữ kiện không có trong nguồn. Viết rõ ràng, trung tính, dễ đọc thành tiếng. Trả về JSON thuần với các khóa: headline, hook, script, caption, hashtags (mảng 3-5 phần tử).\n\nTIÊU ĐỀ: ${input.title}\nNGUỒN: ${input.sourceName||''}\nNỘI DUNG:\n${input.body.slice(0,9000)}`;
 const r=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],temperature:0.3,response_format:{type:'json_object'}}),signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw new Error(`AI HTTP ${r.status}`);const data:any=await r.json();const text=data?.choices?.[0]?.message?.content;if(!text)return null;const x=JSON.parse(text);
 return {headline:clean(String(x.headline||headline(input.title))).slice(0,120),hook:clean(String(x.hook||'')),script:clean(String(x.script||'')),caption:clean(String(x.caption||'')),hashtags:Array.isArray(x.hashtags)?x.hashtags.map((v:any)=>clean(String(v))).filter(Boolean).slice(0,5):['#BienVaNoiNho','#TinMoi'],estimatedSeconds:Number(input.length),mode:'llm'};
}

export async function editNews(input:{title:string;body:string;sourceName?:string;length:ScriptLength}){
 try{return await llmEdit(input)??localEdit(input);}catch(e){console.warn('AI editor fallback to local:',e);return localEdit(input);}
}
