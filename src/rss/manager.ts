import * as cheerio from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface RssSource { id:string; name:string; url:string; createdAt:string; lastScanAt?:string; lastError?:string; }
export interface RssItem { id:string; sourceId:string; sourceName:string; title:string; link:string; publishedAt?:string; discoveredAt:string; }

export const rssSources:RssSource[]=[];
export const rssItems:RssItem[]=[];
const seen=new Set<string>();

function privateIp(ip:string){
 if(ip.includes(':')) return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:');
 const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168);
}
async function assertPublicUrl(raw:string){
 const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw new Error('RSS chỉ hỗ trợ HTTP/HTTPS');
 if(isIP(u.hostname)){if(privateIp(u.hostname))throw new Error('RSS private/internal host bị chặn');}
 else {const rows=await lookup(u.hostname,{all:true});if(!rows.length||rows.some(x=>privateIp(x.address)))throw new Error('RSS private/internal host bị chặn');}
 return u;
}
function text($:cheerio.CheerioAPI,node:any,selector:string){return $(node).find(selector).first().text().replace(/\s+/g,' ').trim();}
function attr($:cheerio.CheerioAPI,node:any,selector:string,name:string){return $(node).find(selector).first().attr(name)?.trim()||'';}

export function addRssSource(input:{name?:string;url:string}){
 const existing=rssSources.find(s=>s.url===input.url);if(existing)return existing;
 const host=new URL(input.url).hostname.replace(/^www\./,'');
 const source:RssSource={id:crypto.randomUUID(),name:(input.name||host).slice(0,120),url:input.url,createdAt:new Date().toISOString()};rssSources.unshift(source);return source;
}

export async function scanRssSource(source:RssSource){
 await assertPublicUrl(source.url);
 try{
  const r=await fetch(source.url,{headers:{'user-agent':'Mozilla/5.0 (compatible; BienNoiNhoAutoMedia/1.2)'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`RSS HTTP ${r.status}`);
  const xml=await r.text();if(xml.length>5_000_000)throw new Error('RSS quá lớn');
  const $=cheerio.load(xml,{xmlMode:true});
  const nodes=$('item').length?$('item').toArray():$('entry').toArray();let added=0;
  for(const n of nodes.slice(0,50)){
   const title=text($,n,'title');
   let link=text($,n,'link')||attr($,n,'link','href');
   const guid=text($,n,'guid')||text($,n,'id');
   const publishedAt=text($,n,'pubDate')||text($,n,'published')||text($,n,'updated')||undefined;
   if(!title||!link)continue;
   try{link=new URL(link,source.url).toString();}catch{continue;}
   const key=guid||link;if(seen.has(key)||rssItems.some(i=>i.link===link))continue;seen.add(key);
   rssItems.unshift({id:crypto.randomUUID(),sourceId:source.id,sourceName:source.name,title:title.slice(0,180),link,publishedAt,discoveredAt:new Date().toISOString()});added++;
  }
  rssItems.splice(300);source.lastScanAt=new Date().toISOString();source.lastError=undefined;return {added,total:nodes.length};
 }catch(e){source.lastScanAt=new Date().toISOString();source.lastError=e instanceof Error?e.message:String(e);throw e;}
}

export async function scanAllRss(){let added=0;for(const s of rssSources){try{added+=(await scanRssSource(s)).added}catch{}}return {added,sources:rssSources.length,items:rssItems.length};}
