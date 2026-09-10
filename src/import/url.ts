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
  language?: string;
  extractionMethod?: 'html'|'json-ld'|'amp'|'metadata';
}

function clean(text:string){return text.replace(/\s+/g,' ').trim();}
function privateIp(ip:string){if(ip.includes(':'))return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:');const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168);}
async function assertPublicUrl(raw:string){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw new Error('Chỉ hỗ trợ URL HTTP/HTTPS');if(u.hostname==='localhost'||u.hostname.endsWith('.local'))throw new Error('Địa chỉ nội bộ bị chặn');if(isIP(u.hostname)){if(privateIp(u.hostname))throw new Error('Địa chỉ nội bộ bị chặn');}else{const rows=await lookup(u.hostname,{all:true});if(!rows.length||rows.some(x=>privateIp(x.address)))throw new Error('Địa chỉ nội bộ bị chặn');}return u;}
function absoluteUrl(raw:string,base:string){try{const u=new URL(raw,base);if(!['http:','https:'].includes(u.protocol))return undefined;return u.toString();}catch{return undefined;}}
function looksLikeContentImage(url:string){const s=url.toLowerCase();return !/(logo|icon|avatar|sprite|emoji|tracking|pixel|banner-ad|advert|quangcao|google-news|news\.google|gnews)/.test(s);}
function isoDate(raw?:string){if(!raw?.trim())return undefined;const d=new Date(raw.trim());return Number.isNaN(d.getTime())?undefined:d.toISOString();}

const TOPIC_STOP=new Set(['sau','khi','mot','nhung','cac','cho','voi','cua','tai','theo','trong','va','ve','duoc','dang','se','bo','chi','dao','khan','tin','moi','nhat','nay','kia','do','vu','co','la','tu','y','te']);
function topicTokens(text:string){return [...new Set(clean(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(x=>x.length>=3&&!TOPIC_STOP.has(x)))];}
export function sourceCoherenceScore(title:string,body:string){const tt=topicTokens(title);if(tt.length<2)return 1;const bt=new Set(topicTokens(body));return tt.filter(x=>bt.has(x)).length/tt.length;}
function normalizedArticleUrl(raw?:string){if(!raw)return'';try{const u=new URL(raw);u.hash='';return u.toString().replace(/\/$/,'')}catch{return raw.replace(/\/$/,'')}}
function structuredArticleUrl(x:any){const raw=x?.url||x?.mainEntityOfPage||x?.['@id'];if(typeof raw==='string')return raw;if(raw&&typeof raw==='object')return String(raw['@id']||raw.url||'');return'';}

function jsonLdArticles($:cheerio.CheerioAPI){
 const rows:any[]=[];
 $('script[type="application/ld+json"]').each((_i,el)=>{try{const raw=$(el).text().trim();if(!raw)return;const value=JSON.parse(raw);const visit=(x:any)=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(visit);return}const type=Array.isArray(x['@type'])?x['@type'].join(' '):String(x['@type']||'');if(/Article|NewsArticle|ReportageNewsArticle|MedicalWebPage/i.test(type)||x.articleBody)rows.push(x);if(x['@graph'])visit(x['@graph'])};visit(value)}catch{}});
 return rows;
}

function articleText($:cheerio.CheerioAPI,pageUrl='',pageTitle=''){
 const structured=jsonLdArticles($).map(x=>{const body=clean(String(x.articleBody||''));if(body.length<120)return null;const candidateUrl=normalizedArticleUrl(structuredArticleUrl(x)),targetUrl=normalizedArticleUrl(pageUrl),headline=clean(String(x.headline||x.name||''));let score=Math.min(1,body.length/5000);if(candidateUrl&&targetUrl)score+=candidateUrl===targetUrl?5:-2;if(pageTitle&&headline)score+=sourceCoherenceScore(pageTitle,headline)*3;if(pageTitle)score+=sourceCoherenceScore(pageTitle,body)*4;return{body,score}}).filter((x):x is {body:string;score:number}=>Boolean(x)).sort((a,b)=>b.score-a.score)[0];
 if(structured?.body)return{body:structured.body,method:'json-ld' as const};
 const selectors=['article p','[itemprop="articleBody"] p','main article p','.maincontent p','.content-detail p','.detail-content p','.article-detail p','.fck_detail p','.article-body p','.article__body p','.article-content p','.post-content p','.entry-content p','.story-body p','.story-content p','.content-body p','main p'];
 let fallback='';
 for(const selector of selectors){const parts:string[]=[];$(selector).each((_i,el)=>{const t=clean($(el).text());if(t.length>=35&&!/^(đăng ký|đăng nhập|quảng cáo|advertisement|newsletter|cookie)/i.test(t))parts.push(t)});const body=[...new Set(parts)].join('\n\n');if(body.length>=220){if(!pageTitle||sourceCoherenceScore(pageTitle,body)>=.25)return{body,method:'html' as const};if(body.length>fallback.length)fallback=body}}
 const blocks:string[]=[];$('article,main,[role="main"],[itemprop="articleBody"],.article-body,.story-body,.content-body,.maincontent,.content-detail,.detail-content,.fck_detail').each((_i,el)=>{const t=clean($(el).text());if(t.length>=220)blocks.push(t)});const coherent=blocks.filter(x=>!pageTitle||sourceCoherenceScore(pageTitle,x)>=.25).sort((a,b)=>b.length-a.length)[0];const body=coherent||fallback||blocks.sort((a,b)=>b.length-a.length)[0]||'';return{body,method:'html' as const};
}

export function extractArticleText(html:string,pageUrl='',pageTitle=''){const $=cheerio.load(html);$('script:not([type="application/ld+json"]),style,noscript,svg,form,nav,footer,aside').remove();return articleText($,pageUrl,pageTitle);}


async function fetchPage(url:string){
 await assertPublicUrl(url);
 const response=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142 Safari/537.36','accept':'text/html,application/xhtml+xml','accept-language':'vi,en-US;q=0.9,en;q=0.8'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`Nguồn trả về HTTP ${response.status}`);const type=response.headers.get('content-type')||'';if(!type.includes('text/html')&&!type.includes('application/xhtml+xml'))throw new Error('URL không phải trang bài viết HTML');const html=await response.text();if(html.length>5_000_000)throw new Error('Bài viết quá lớn');return{html,url:response.url||url};
}

export async function importArticleFromUrl(url:string):Promise<ImportedArticle>{
  let page=await fetchPage(url),parsed=await assertPublicUrl(page.url);
  if(parsed.hostname==='news.google.com')throw new Error('Liên kết Google News chưa chuyển về bài gốc; hệ thống đã chặn để tránh lấy logo và nội dung rỗng.');
  let html=page.html;
  const $=cheerio.load(html);
  const publishedAt=isoDate(
    $('meta[property="article:published_time"]').attr('content')||
    $('meta[name="article:published_time"]').attr('content')||
    $('meta[name="date"]').attr('content')||
    $('meta[name="pubdate"]').attr('content')||
    $('meta[itemprop="datePublished"]').attr('content')||
    $('time[datetime]').first().attr('datetime')
  );
  const structured=jsonLdArticles($);
  $('script:not([type="application/ld+json"]),style,noscript,svg,form,nav,footer,aside').remove();
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
  const imageUrls=[...new Set(rawImages.map(x=>absoluteUrl(x,page.url)).filter((x):x is string=>Boolean(x)).filter(looksLikeContentImage))].slice(0,10);

  let extracted:{body:string;method:'html'|'json-ld'|'metadata'}=articleText($,page.url,title),method:ImportedArticle['extractionMethod']=extracted.method;
  if(extracted.body.length<220){const amp=absoluteUrl($('link[rel="amphtml"]').attr('href')||'',page.url);if(amp&&amp!==page.url){try{page=await fetchPage(amp);const amp$=cheerio.load(page.html);amp$('script:not([type="application/ld+json"]),style,noscript,svg,form,nav,footer,aside').remove();const candidate=articleText(amp$,page.url,title);if(candidate.body.length>extracted.body.length){extracted=candidate;method='amp'}}catch{}}}
  const metadataCandidates=[...structured.map(x=>clean(String(x.description||''))),clean($('meta[name="description"]').attr('content')||''),clean($('meta[property="og:description"]').attr('content')||'')].filter(x=>x.length>=80);
  const bestMetadata=metadataCandidates.sort((a,b)=>sourceCoherenceScore(title,b)-sourceCoherenceScore(title,a)||b.length-a.length)[0];
  if(extracted.body.length<120&&bestMetadata&&bestMetadata.length>extracted.body.length){extracted={body:bestMetadata,method:'metadata'};method='metadata'}
  let body=extracted.body.slice(0,30000).trim();
  if(!title||title.length<5)throw new Error('Không nhận diện được tiêu đề bài viết');
  if(body.length<80)throw new Error('Nguồn chỉ trả tiêu đề hoặc chặn trình đọc. Hãy dùng URL bài gốc thay cho liên kết Google News.');
  const anchors=topicTokens(title),coherence=sourceCoherenceScore(title,body);
  if(anchors.length>=3&&coherence<.25&&bestMetadata&&sourceCoherenceScore(title,bestMetadata)>coherence){body=bestMetadata.slice(0,30000);method='metadata'}
  if(anchors.length>=3&&sourceCoherenceScore(title,body)<.25)throw new Error('Nội dung trang không khớp tiêu đề bài viết; hệ thống đã chặn để tránh ghép nhầm bài liên quan.');
  const language=clean($('html').attr('lang')||$('meta[http-equiv="content-language"]').attr('content')||structured.map(x=>x.inLanguage).find(Boolean)||'');
  return {title:title.slice(0,180),body,sourceName:sourceName.slice(0,120)||undefined,sourceUrl:page.url,imageUrl:imageUrls[0],imageUrls,publishedAt,language:language||undefined,extractionMethod:method};
}
