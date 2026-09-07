import * as cheerio from 'cheerio';

export interface ImportedArticle {
  title: string;
  body: string;
  sourceName?: string;
  sourceUrl: string;
  imageUrl?: string;
}

function clean(text:string){return text.replace(/\s+/g,' ').trim();}

export async function importArticleFromUrl(url:string):Promise<ImportedArticle>{
  const parsed=new URL(url);
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('Only HTTP/HTTPS URLs are supported');
  const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; BienNoiNhoAutoMedia/1.0; +https://media.huyenvu.cloud)'}});
  if(!response.ok)throw new Error(`Source returned HTTP ${response.status}`);
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))throw new Error('URL does not appear to be an HTML article');
  const html=await response.text();
  if(html.length>5_000_000)throw new Error('Article is too large');
  const $=cheerio.load(html);
  $('script,style,noscript,svg,form,nav,footer,aside').remove();
  const title=clean($('meta[property="og:title"]').attr('content')||$('meta[name="twitter:title"]').attr('content')||$('h1').first().text()||$('title').text());
  const sourceName=clean($('meta[property="og:site_name"]').attr('content')||parsed.hostname.replace(/^www\./,''));
  const imageUrl=$('meta[property="og:image"]').attr('content')||$('meta[name="twitter:image"]').attr('content')||undefined;
  const candidates:string[]=[];
  $('article p, main p, .article p, .article-content p, .post-content p, .entry-content p').each((_i,el)=>{const t=clean($(el).text());if(t.length>=40)candidates.push(t)});
  if(candidates.length<2){$('p').each((_i,el)=>{const t=clean($(el).text());if(t.length>=60)candidates.push(t)})}
  const unique=[...new Set(candidates)];
  const body=unique.join('\n\n').slice(0,10000).trim();
  if(!title||title.length<5)throw new Error('Could not detect article title');
  if(body.length<20)throw new Error('Could not extract enough article text');
  return {title:title.slice(0,180),body,sourceName:sourceName.slice(0,120)||undefined,sourceUrl:url,imageUrl};
}
