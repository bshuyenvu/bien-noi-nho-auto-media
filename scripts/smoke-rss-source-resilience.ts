import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir=mkdtempSync(join(tmpdir(),'vnf-rss-resilience-'));
process.env.DB_PATH=join(dir,'test.sqlite');
try{
 const manager=await import('../src/rss/manager.js');
 const curator=await import('../src/rss/curator.js');
 const ownerId='rss-smoke-owner';
 manager.addRssSource({ownerId,name:'BMJ Recent',url:'https://www.bmj.com/rss/recent.xml',managed:true});
 manager.addRssSource({ownerId,name:'NIH News Releases',url:'https://www.nih.gov/news-events/news-releases/rss.xml',managed:true});
 const migration=curator.migrateGoogleNewsRss();
 const sources=manager.rssSources.filter(x=>x.ownerId===ownerId);
 const urls=new Set(sources.map(x=>x.url));
 assert.equal(migration.owners,1);
 assert.equal(sources.length,15);
 assert(!urls.has('https://www.bmj.com/rss/recent.xml'));
 assert(!urls.has('https://www.nih.gov/news-events/news-releases/rss.xml'));
 assert(urls.has('https://www.nature.com/nm.rss'));
 assert(urls.has('https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed'));
 assert(urls.has('https://www.ema.europa.eu/en/news.xml'));
 assert.match(manager.rssResponseProblem(403,'text/html','<title>Just a moment...</title> Cloudflare'),/BLOCKED_BY_WAF/);
 assert.match(manager.rssResponseProblem(202,'text/html',''),/EMPTY_RESPONSE/);
 assert.equal(manager.rssResponseProblem(200,'application/rss+xml','<?xml version="1.0"?><rss><channel></channel></rss>'),'');
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>Namespace test</title><link>https://example.org/story</link><content:encoded><![CDATA[Detailed foreign source summary]]></content:encoded><media:thumbnail url="https://example.org/image.jpg"/><pubDate>Tue, 09 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>`,{status:200,headers:{'content-type':'application/rss+xml'}});
 try{
  const mock=manager.addRssSource({ownerId,name:'Namespace Feed',url:'https://1.1.1.1/feed',managed:false});
  const scanned=await manager.scanRssSource(mock);
  assert.equal(scanned.total,1);
  const item=manager.rssItems.find(x=>x.sourceId===mock.id);
  assert.equal(item?.summary,'Detailed foreign source summary');
  assert.equal(item?.imageUrl,'https://example.org/image.jpg');
 }finally{globalThis.fetch=originalFetch;}
 console.log('RSS source resilience smoke OK',JSON.stringify({sources:sources.length,replacements:['Nature Medicine','ECDC News','EMA News'],namespaceXml:true}));
}finally{rmSync(dir,{recursive:true,force:true});}
