import * as cheerio from 'cheerio';
import { importArticleFromUrl } from '../import/url.js';
export interface ForeignSource{name:string;url:string;title:string;summary:string;imageUrls:string[]}
const TRUSTED=/\b(Reuters|Associated Press|AP News|BBC|DW|Deutsche Welle|France 24|AFP|The Guardian|NPR|CNN|Al Jazeera|WHO|World Health Organization|CDC|Centers for Disease Control|FDA|U.S. Food and Drug Administration|NIH|National Institutes of Health|NHS|ECDC|European Centre for Disease Prevention|The Lancet|NEJM|BMJ|Mayo Clinic|NASA|United Nations|UN News|White House|Federal Reserve|European Commission)\b/i;
const STOP=new Set(['đáng','chú','tin','mới','nhất','cảnh','báo','tổng','thống','cho','với','của','trong','trên','được','theo','những','một','này','that','this','with','from','into','about']);
function clean(s:string){return s.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()}
function query(title:string){return clean(title).split(/\s+/).filter(x=>x.length>3&&!STOP.has(x.toLocaleLowerCase('vi-VN'))).slice(0,10).join(' ')}
export async function findForeignSources(title:string,max=3):Promise<{sources:ForeignSource[];imageUrls:string[]}>{
 const q=query(title);if(!q)return{sources:[],imageUrls:[]};const url='https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=en-US&gl=US&ceid=US:en';
 try{const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; BienNoiNhoResearch/3.8)'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Foreign search HTTP '+r.status);const xml=await r.text(),$=cheerio.load(xml,{xmlMode:true}),items=$('item').toArray().map(n=>({title:clean($(n).find('title').first().text()),url:clean($(n).find('link').first().text()),name:clean($(n).find('source').first().text()),snippet:clean($(n).find('description').first().text())})).filter(x=>x.url&&TRUSTED.test(x.name)).slice(0,max*2),sources:ForeignSource[]=[];
  for(const item of items){if(sources.length>=max||sources.some(x=>x.name===item.name))continue;try{const a=await importArticleFromUrl(item.url);sources.push({name:item.name||a.sourceName||'Nguồn quốc tế',url:a.sourceUrl,title:a.title,summary:clean(a.body).slice(0,900),imageUrls:a.imageUrls.slice(0,3)})}catch{if(item.snippet.length>=60)sources.push({name:item.name||'Nguồn quốc tế',url:item.url,title:item.title,summary:item.snippet.slice(0,900),imageUrls:[]})}}
  return{sources,imageUrls:[...new Set(sources.flatMap(x=>x.imageUrls))].slice(0,8)}
 }catch(e){console.warn('Foreign source enrichment skipped:',e);return{sources:[],imageUrls:[]}}
}
