import type { MediaRights } from '../compliance/copyright.js';
import type { DraftMediaProvenance } from './provenance.js';

export type OpenMediaProvider='openverse';
export interface OpenMediaCandidate extends DraftMediaProvenance{
  id:string;provider:OpenMediaProvider;title:string;thumbnail?:string;width?:number;height?:number;
}
export interface OpenMediaResult{query:string;provider:OpenMediaProvider;candidates:OpenMediaCandidate[];warnings:string[]}

type OvRow={id?:string;title?:string;creator?:string;creator_url?:string;license?:string;license_url?:string;foreign_landing_url?:string;url?:string;thumbnail?:string;width?:number;height?:number;source?:string;provider?:string};
const LICENSES:Record<string,MediaRights>={cc0:'cc0',pdm:'public-domain',by:'cc-by','by-sa':'cc-by-sa'};
const fold=(v:string)=>v.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const DICT:Array<[RegExp,string]>=[
 [/\b(dot quy|tai bien)\b/i,'stroke'],[/\b(tang huyet ap|cao huyet ap)\b/i,'high blood pressure'],
 [/\b(dai thao duong|tieu duong)\b/i,'diabetes'],[/\b(tim mach|trai tim)\b/i,'heart health'],
 [/\b(giac ngu|mat ngu)\b/i,'sleep'],[/\b(dinh duong|an uong)\b/i,'healthy food'],
 [/\b(nha bep|nau an)\b/i,'kitchen'],[/\b(ve sinh|lam sach)\b/i,'cleaning'],
];
export function openMediaQuery(topic:string){
 const f=fold(topic),hits=DICT.filter(([r])=>r.test(f)).map(([,q])=>q);
 return [...new Set(hits)].join(' ').trim()||topic.trim();
}
function mapRow(x:OvRow):OpenMediaCandidate|undefined{
 const rights=LICENSES[String(x.license||'').toLowerCase()],url=String(x.url||'').trim();
 if(!rights||!url||!/^https?:\/\//i.test(url))return;
 const creator=String(x.creator||'').trim()||undefined,licenseUrl=String(x.license_url||'').trim()||undefined;
 if((rights==='cc-by'||rights==='cc-by-sa')&&!creator&&!licenseUrl)return;
 return{id:String(x.id||crypto.randomUUID()),provider:'openverse',title:String(x.title||'Open media').trim(),url,
  thumbnail:String(x.thumbnail||'').trim()||undefined,sourceName:`Openverse${x.source?' • '+x.source:''}`,
  sourceUrl:String(x.foreign_landing_url||x.creator_url||'https://openverse.org').trim(),kind:'image',rights,creator,licenseUrl,
  rightsVerified:true,width:Number(x.width)||undefined,height:Number(x.height)||undefined};
}
export async function searchOpenMedia(topic:string,max=8):Promise<OpenMediaResult>{
 const query=openMediaQuery(topic),warnings:string[]=[];
 if(process.env.OPEN_MEDIA_ENABLED==='false')return{query,provider:'openverse',candidates:[],warnings:['Open Media đã tắt bằng cấu hình.']};
 try{
  const url=new URL(process.env.OPENVERSE_API_URL||'https://api.openverse.org/v1/images/');
  url.searchParams.set('q',query);url.searchParams.set('page_size',String(Math.max(1,Math.min(20,max*2))));
  url.searchParams.set('license','cc0,pdm,by,by-sa');
  const r=await fetch(url,{headers:{'user-agent':'HealthContentStudio/3.0 (+https://media.huyenvu.cloud)'},signal:AbortSignal.timeout(Number(process.env.OPEN_MEDIA_TIMEOUT_MS||12000))});
  if(!r.ok)throw new Error(`Openverse HTTP ${r.status}`);
  const data:any=await r.json(),rows:OvRow[]=Array.isArray(data?.results)?data.results as OvRow[]:[];
  const candidates=rows.map(mapRow).filter((x):x is OpenMediaCandidate=>Boolean(x))
   .filter((x:OpenMediaCandidate,i:number,a:OpenMediaCandidate[])=>a.findIndex((y:OpenMediaCandidate)=>y.url===x.url)===i).slice(0,max);
  if(!candidates.length)warnings.push('Không tìm thấy media giấy phép mở phù hợp; render sẽ dùng visual card nguyên bản.');
  return{query,provider:'openverse',candidates,warnings};
 }catch(e){warnings.push('Openverse: '+(e instanceof Error?e.message:String(e)));return{query,provider:'openverse',candidates:[],warnings}}
}
