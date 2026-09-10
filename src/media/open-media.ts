import type { MediaRights } from '../compliance/copyright.js';
import type { DraftMediaProvenance } from './provenance.js';

export type OpenMediaProvider='openverse'|'wikimedia-commons';
export interface OpenMediaCandidate extends DraftMediaProvenance{
  id:string;provider:OpenMediaProvider;title:string;thumbnail?:string;width?:number;height?:number;
}
export interface OpenMediaResult{query:string;provider:'open-media';candidates:OpenMediaCandidate[];warnings:string[];sceneQueries?:string[]}

type OvRow={id?:string;title?:string;creator?:string;creator_url?:string;license?:string;license_url?:string;foreign_landing_url?:string;url?:string;thumbnail?:string;width?:number;height?:number;source?:string};
type CommonsInfo={url?:string;thumburl?:string;width?:number;height?:number;mime?:string;extmetadata?:Record<string,{value?:string}>};
type CommonsPage={pageid?:number;title?:string;imageinfo?:CommonsInfo[]};
const LICENSES:Record<string,MediaRights>={cc0:'cc0',pdm:'public-domain',by:'cc-by','by-sa':'cc-by-sa'};
const fold=(v:string)=>v.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const DICT:Array<[RegExp,string]>=[
 [/\b(dot quy|tai bien)\b/i,'stroke'],[/\b(tang huyet ap|cao huyet ap)\b/i,'high blood pressure'],
 [/\b(dai thao duong|tieu duong)\b/i,'diabetes'],[/\b(tim mach|trai tim)\b/i,'heart health'],
 [/\b(giac ngu|mat ngu)\b/i,'sleep'],[/\b(dinh duong|an uong)\b/i,'healthy food'],
 [/\b(nha bep|nau an)\b/i,'kitchen'],[/\b(ve sinh|lam sach)\b/i,'cleaning'],
];
const SCENE_DICT:Array<[RegExp,string]>=[
 [/\b(mat|mieng)\b/i,'face'],[/\b(tay|canh tay)\b/i,'arm'],[/\b(chan)\b/i,'leg'],[/\b(noi|loi noi|giao tiep)\b/i,'speech'],
 [/\b(chong mat|thang bang)\b/i,'dizziness balance'],[/\b(dau dau)\b/i,'headache'],[/\b(cap cuu|benh vien)\b/i,'emergency hospital'],
 [/\b(bac si|nhan vien y te)\b/i,'doctor medical'],[/\b(gia dinh)\b/i,'family'],[/\b(cong viec)\b/i,'work'],
 [/\b(binh tinh|thu gian)\b/i,'calm mindfulness'],[/\b(nha bep|nau an)\b/i,'cooking kitchen'],[/\b(ve sinh|lau don)\b/i,'cleaning home'],
];
export function openMediaQuery(topic:string){
 const f=fold(topic),hits=DICT.filter(([r])=>r.test(f)).map(([,q])=>q);
 return [...new Set(hits)].join(' ').trim()||topic.trim();
}
function sceneMediaQuery(topic:string,scene:string){
 const base=openMediaQuery(topic),f=fold(scene),extras=SCENE_DICT.filter(([r])=>r.test(f)).map(([,q])=>q);
 return [...new Set([base,...extras])].filter(Boolean).join(' ').trim().slice(0,180);
}
function sceneChunks(text:string,maxScenes=6){
 const sentences=text.replace(/\s+/g,' ').trim().split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
 if(!sentences.length)return[];const target=Math.max(1,Math.min(maxScenes,sentences.length,Math.ceil(text.length/180)));
 const total=Math.max(1,sentences.reduce((n,s)=>n+s.length,0)),ideal=total/target,chunks:string[]=[];let current='';
 for(const sentence of sentences){const next=current?`${current} ${sentence}`:sentence;if(current&&next.length>ideal*1.28&&chunks.length<target-1){chunks.push(current);current=sentence}else current=next}if(current)chunks.push(current);
 return chunks.slice(0,maxScenes);
}
function mapOpenverse(x:OvRow):OpenMediaCandidate|undefined{
 const rights=LICENSES[String(x.license||'').toLowerCase()],url=String(x.url||'').trim();if(!rights||!url||!/^https?:\/\//i.test(url))return;
 const creator=String(x.creator||'').trim()||undefined,licenseUrl=String(x.license_url||'').trim()||undefined;if((rights==='cc-by'||rights==='cc-by-sa')&&!creator&&!licenseUrl)return;
 return{id:String(x.id||crypto.randomUUID()),provider:'openverse',title:String(x.title||'Open media').trim(),url,thumbnail:String(x.thumbnail||'').trim()||undefined,sourceName:`Openverse${x.source?' • '+x.source:''}`,sourceUrl:String(x.foreign_landing_url||x.creator_url||'https://openverse.org').trim(),kind:'image',rights,creator,licenseUrl,rightsVerified:true,width:Number(x.width)||undefined,height:Number(x.height)||undefined};
}
function htmlText(v=''){return v.replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim()}
function commonsRights(meta:Record<string,{value?:string}>={}){
 const label=htmlText(meta.LicenseShortName?.value||meta.UsageTerms?.value||'').toLowerCase();
 if(/public domain/.test(label))return'public-domain' as MediaRights;if(/cc0/.test(label))return'cc0' as MediaRights;if(/cc by-sa/.test(label))return'cc-by-sa' as MediaRights;if(/cc by/.test(label))return'cc-by' as MediaRights;return undefined;
}
function mapCommons(page:CommonsPage):OpenMediaCandidate|undefined{
 const info=page.imageinfo?.[0],url=String(info?.url||'').trim(),mime=String(info?.mime||'').toLowerCase();if(!url||!['video/webm','video/mp4'].includes(mime))return;
 const meta=info?.extmetadata||{},rights=commonsRights(meta);if(!rights)return;const creator=htmlText(meta.Artist?.value||'')||undefined,licenseUrl=String(meta.LicenseUrl?.value||'').trim()||undefined;
 if((rights==='cc-by'||rights==='cc-by-sa')&&!creator&&!licenseUrl)return;
 return{id:`commons-${page.pageid||crypto.randomUUID()}`,provider:'wikimedia-commons',title:String(page.title||'Wikimedia Commons video').replace(/^File:/i,''),url,thumbnail:String(info?.thumburl||'').trim()||undefined,sourceName:'Wikimedia Commons',sourceUrl:page.pageid?`https://commons.wikimedia.org/?curid=${page.pageid}`:'https://commons.wikimedia.org',kind:'video',rights,creator,licenseUrl,rightsVerified:true,width:Number(info?.width)||undefined,height:Number(info?.height)||undefined};
}
async function searchOpenverseImages(query:string,max=8){
 const url=new URL(process.env.OPENVERSE_API_URL||'https://api.openverse.org/v1/images/');url.searchParams.set('q',query);url.searchParams.set('page_size',String(Math.max(1,Math.min(20,max*3))));url.searchParams.set('license','cc0,pdm,by,by-sa');
 const r=await fetch(url,{headers:{'user-agent':'MultiContentStudio/3.4 (+https://media.huyenvu.cloud)'},signal:AbortSignal.timeout(Number(process.env.OPEN_MEDIA_TIMEOUT_MS||12000))});if(!r.ok)throw new Error(`Openverse HTTP ${r.status}`);
 const data:any=await r.json(),rows:OvRow[]=Array.isArray(data?.results)?data.results as OvRow[]:[];return rows.map(mapOpenverse).filter((x):x is OpenMediaCandidate=>Boolean(x)).filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,max);
}
async function searchCommonsVideos(query:string,max=2){
 if(process.env.OPEN_MEDIA_VIDEO_ENABLED==='false')return[];const url=new URL('https://commons.wikimedia.org/w/api.php');url.searchParams.set('action','query');url.searchParams.set('generator','search');url.searchParams.set('gsrsearch',`${query} filetype:video`);url.searchParams.set('gsrnamespace','6');url.searchParams.set('gsrlimit',String(Math.max(3,Math.min(12,max*4))));url.searchParams.set('prop','imageinfo');url.searchParams.set('iiprop','url|mime|extmetadata|size');url.searchParams.set('iiurlwidth','640');url.searchParams.set('format','json');url.searchParams.set('origin','*');
 const r=await fetch(url,{headers:{'user-agent':'MultiContentStudio/3.4 (+https://media.huyenvu.cloud)'},signal:AbortSignal.timeout(Number(process.env.OPEN_MEDIA_TIMEOUT_MS||12000))});if(!r.ok)throw new Error(`Wikimedia Commons HTTP ${r.status}`);const data:any=await r.json(),pages:Object[]=Object.values(data?.query?.pages||{});return (pages as CommonsPage[]).map(mapCommons).filter((x):x is OpenMediaCandidate=>Boolean(x)).slice(0,max);
}
export async function searchOpenMedia(topic:string,max=8):Promise<OpenMediaResult>{
 const query=openMediaQuery(topic),warnings:string[]=[];if(process.env.OPEN_MEDIA_ENABLED==='false')return{query,provider:'open-media',candidates:[],warnings:['Open Media đã tắt bằng cấu hình.']};
 const [images,videos]=await Promise.all([searchOpenverseImages(query,max).catch(e=>{warnings.push('Openverse: '+(e instanceof Error?e.message:String(e)));return[]}),searchCommonsVideos(query,Math.min(2,max)).catch(e=>{warnings.push('Wikimedia Commons: '+(e instanceof Error?e.message:String(e)));return[]})]);
 const candidates=[...videos,...images].filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,max);if(!candidates.length)warnings.push('Không tìm thấy media giấy phép mở phù hợp; render sẽ dùng visual card nguyên bản.');return{query,provider:'open-media',candidates,warnings};
}
export async function searchOpenMediaForScript(topic:string,script:string,maxScenes=6):Promise<OpenMediaResult>{
 const chunks=sceneChunks(script,maxScenes),sceneQueries=chunks.map(x=>sceneMediaQuery(topic,x)),warnings:string[]=[];if(!chunks.length)return searchOpenMedia(topic,maxScenes);
 if(process.env.OPEN_MEDIA_ENABLED==='false')return{query:openMediaQuery(topic),provider:'open-media',candidates:[],warnings:['Open Media đã tắt bằng cấu hình.'],sceneQueries};
 const [imageSets,videos]=await Promise.all([Promise.all(sceneQueries.map(q=>searchOpenverseImages(q,4).catch(e=>{warnings.push(`Openverse (${q}): ${e instanceof Error?e.message:String(e)}`);return[]}))),searchCommonsVideos(openMediaQuery(topic),Math.min(2,maxScenes)).catch(e=>{warnings.push('Wikimedia Commons: '+(e instanceof Error?e.message:String(e)));return[]})]);
 const used=new Set<string>(),picked:OpenMediaCandidate[]=[];let vi=0;
 for(let i=0;i<chunks.length;i++){
  let choice:OpenMediaCandidate|undefined;if((i===1||i===3)&&vi<videos.length){choice=videos[vi++]}if(!choice)choice=imageSets[i].find(x=>!used.has(x.url));if(!choice)choice=imageSets.flat().find(x=>!used.has(x.url));if(!choice)continue;used.add(choice.url);picked.push({...choice,sceneIndex:i,sceneQuery:sceneQueries[i],sortOrder:i});
 }
 const missing=chunks.length-picked.length;if(missing)warnings.push(`${missing} scene chưa có media mở phù hợp; sẽ tự tạo visual card nguyên bản cho scene đó.`);
 return{query:openMediaQuery(topic),provider:'open-media',candidates:picked,warnings,sceneQueries};
}
