import * as cheerio from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface ImportedArticle {
  title: string;
  body: string;
  sourceName?: string;
  sourceUrl: string;
  imageUrl?: string;
  imageUrls: string[];
  publishedAt?: string;
}

function clean(text:string){return text.replace(/\s+/g,' ').trim();}
function privateIp(ip:string){if(ip.includes(':'))return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:');const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168);}
async function assertPublicUrl(raw:string){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw new Error('Chỉ hỗ trợ URL HTTP/HTTPS');if(u.hostname==='localhost'||u.hostname.endsWith('.local'))throw new Error('Địa chỉ nội bộ bị chặn');if(isIP(u.hostname)){if(privateIp(u.hostname))throw new Error('Địa chỉ nội bộ bị chặn');}else{const rows=await lookup(u.hostname,{all:true});if(!rows.length||rows.some(x=>privateIp(x.address)))throw new Error('Địa chỉ nội bộ bị chặn');}return u;}
function absoluteUrl(raw:string,base:string){try{const u=new URL(raw,base);if(!['http:','https:'].includes(u.protocol))return undefined;return u.toString();}catch{return undefined;}}
function looksLikeContentImage(url:string){const s=url.toLowerCase();return !/(logo|icon|avatar|sprite|emoji|tracking|pixel|banner-ad|advert|quangcao)/.test(s);}
function isoDate(raw?:string){if(!raw?.trim())return undefined;const d=new Date(raw.trim());return Number.isNaN(d.getTime())?undefined:d.toISOString();}

export async function importArticleFromUrl(url:string):Promise<ImportedArticle>{
  const parsed=await assertPublicUrl(url);
  const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; BienNoiNhoAutoMedia/3.3; +https://media.huyenvu.cloud)'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Nguồn trả về HTTP ${response.status}`);
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))throw new Error('URL không phải trang bài viết HTML');
  const html=await response.text();
  if(html.length>5_000_000)throw new Error('Bài viết quá lớn');
  const $=cheerio.load(html);
  const publishedAt=isoDate(
    $('meta[property="article:published_time"]').attr('content')||
    $('meta[name="article:published_time"]').attr('content')||
    $('meta[name="date"]').attr('content')||
    $('meta[name="pubdate"]').attr('content')||
    $('meta[itemprop="datePublished"]').attr('content')||
    $('time[datetime]').first().attr('datetime')
  );
  $('script,style,noscript,svg,form,nav,footer,aside').remove();
  const title=clean($('meta[property="og:title"]').attr('content')||$('meta[name="twitter:title"]').attr('content')||$('h1').first().text()||$('title').text());
  const sourceName=clean($('meta[property="og:site_name"]').attr('content')||parsed.hostname.replace(/^www\./,''));

  const rawImages:string[]=[];
  const push=(v?:string)=>{if(v?.trim())rawImages.push(v.trim())};
  push($('meta[property="og:image"]').attr('content'));
  push($('meta[property="og:image:secure_url"]').attr('content'));
  push($('meta[name="twitter:image"]').attr('content'));
  $('article img, main img, figure img, .article img, .article-content img, .post-content img, .entry-content img').each((_i,el)=>{
    const node=$(el);
    push(node.attr('data-src'));push(node.attr('data-original'));push(node.attr('data-lazy-src'));push(node.attr('src'));
    const srcset=node.attr('srcset')||node.attr('data-srcset');
    if(srcset){const best=srcset.split(',').map(x=>x.trim().split(/\s+/)[0]).filter(Boolean).pop();push(best);}
  });
  const imageUrls=[...new Set(rawImages.map(x=>absoluteUrl(x,url)).filter((x):x is string=>Boolean(x)).filter(looksLikeContentImage))].slice(0,10);

  const candidates:string[]=[];
  $('article p, main p, .article p, .article-content p, .post-content p, .entry-content p').each((_i,el)=>{const t=clean($(el).text());if(t.length>=40)candidates.push(t)});
  if(candidates.length<2){$('p').each((_i,el)=>{const t=clean($(el).text());if(t.length>=60)candidates.push(t)})}
  const unique=[...new Set(candidates)];
  const body=unique.join('\n\n').slice(0,10000).trim();
  if(!title||title.length<5)throw new Error('Không nhận diện được tiêu đề bài viết');
  if(body.length<20)throw new Error('Không trích xuất đủ nội dung bài viết');
  return {title:title.slice(0,180),body,sourceName:sourceName.slice(0,120)||undefined,sourceUrl:url,imageUrl:imageUrls[0],imageUrls,publishedAt};
}
