import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir=await mkdtemp(join(tmpdir(),'vnf-multilingual-'));
process.env.DB_PATH=join(dir,'smoke.sqlite');
process.env.GEMINI_API_KEY='test-key';
process.env.GEMINI_MODEL='gemini-3.6-flash';
let aiCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input:any)=>{
  const url=String(input);
  if(!url.includes(':generateContent'))throw new Error('unexpected fetch '+url);
  aiCalls++;
  const payload={
    detectedLanguage:'en',
    vietnameseTitle:'Fed giữ lập trường thận trọng khi lạm phát còn cao',
    vietnameseBrief:'Cục Dự trữ Liên bang Mỹ cho biết áp lực lạm phát vẫn cao hơn kỳ vọng. Cơ quan này tiếp tục theo dõi dữ liệu trước khi điều chỉnh chính sách. Các số liệu trong nguồn gốc được giữ nguyên và chưa có quyết định mới ngoài nội dung đã công bố.',
    facts:[
      {kind:'event',text:'Fed tiếp tục giữ lập trường thận trọng.',sourceExcerpt:'The Federal Reserve remained cautious.',confidence:.96,corroboratedBy:1,support:'corroborated'},
      {kind:'number',text:'Lạm phát vẫn cao hơn mức kỳ vọng nêu trong nguồn.',sourceExcerpt:'inflation remains elevated',confidence:.9,corroboratedBy:0,support:'primary'}
    ],uncertainties:['Chưa có dữ kiện trong nguồn để khẳng định thời điểm thay đổi lãi suất.'],warnings:[]
  };
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
};

try{
  const {detectLanguage}=await import('../src/editorial/language.js');
  assert.equal(detectLanguage('Bộ Y tế cho biết hôm nay có thông tin mới về sức khỏe cộng đồng.').code,'vi');
  assert.equal(detectLanguage('The Federal Reserve said inflation remains elevated and officials will review the data.').code,'en');
  assert.equal(detectLanguage('日本政府は新しい方針を発表しました。').code,'ja');
  assert.equal(detectLanguage('韩国政府今天公布了新的经济数据。').code,'zh');
  const {analyzeSourceIntelligence,sourceIntelligenceForUrl,sourceIntelligenceStats,sourceAuthorityScore}=await import('../src/editorial/source-intelligence.js');
  assert.equal(sourceAuthorityScore('https://www.reuters.com/world/example','Reuters'),95);
  const english=await analyzeSourceIntelligence({ownerId:'owner-a',sourceUrl:'https://www.reuters.com/world/example',sourceName:'Reuters',title:'Fed signals inflation remains elevated',body:'The Federal Reserve remained cautious. Officials said inflation remains elevated and they will review incoming data before changing policy.',publishedAt:new Date().toISOString(),corroboration:[{name:'AP News',title:'Fed remains cautious',summary:'AP also reported that officials are reviewing incoming inflation data.'}]});
  assert.equal(english.language.code,'en');assert.equal(english.translationStatus,'translated');assert.equal(english.readyForEditorial,true);assert.equal(english.provider,'gemini');assert.ok(english.vietnameseBrief.includes('Cục Dự trữ'));assert.ok(english.sourceScore>=80);assert.equal(english.facts[0]?.support,'corroborated');
  const cached=await analyzeSourceIntelligence({ownerId:'owner-a',sourceUrl:'https://www.reuters.com/world/example',sourceName:'Reuters',title:'Fed signals inflation remains elevated',body:'The Federal Reserve remained cautious. Officials said inflation remains elevated and they will review incoming data before changing policy.',publishedAt:new Date().toISOString()});
  assert.equal(cached.cached,true);assert.equal(aiCalls,1);assert.equal(sourceIntelligenceForUrl('owner-a','https://www.reuters.com/world/example')?.readyForEditorial,true);
  const stats=sourceIntelligenceStats('owner-a');assert.equal(stats.total,1);assert.equal(stats.ready,1);assert.equal(stats.translated,1);
  process.env.GEMINI_API_KEY='';
  const vietnamese=await analyzeSourceIntelligence({ownerId:'owner-b',sourceUrl:'https://moh.gov.vn/tin-y-te',sourceName:'Bộ Y tế',title:'Bộ Y tế công bố hướng dẫn mới',body:'Bộ Y tế cho biết hướng dẫn mới có hiệu lực từ ngày 10 tháng 9. Các cơ sở y tế cần cập nhật quy trình và tiếp tục theo dõi thông tin chính thức.',force:true});
  assert.equal(vietnamese.language.code,'vi');assert.equal(vietnamese.translationStatus,'not_needed');assert.equal(vietnamese.readyForEditorial,true);assert.equal(vietnamese.provider,'rules');
  const foreignBlocked=await analyzeSourceIntelligence({ownerId:'owner-b',sourceUrl:'https://example.com/en',title:'Officials announce a new policy',body:'Officials announced a new policy today. The measure will take effect next month and agencies are preparing implementation guidance.',force:true});
  assert.equal(foreignBlocked.language.code,'en');assert.equal(foreignBlocked.translationStatus,'pending');assert.equal(foreignBlocked.readyForEditorial,false);assert.ok(foreignBlocked.warnings.some(x=>x.includes('chặn Editorial')));
  console.log(`Multilingual Source + Fact Engine smoke OK • AI ${aiCalls} • cache PASS • foreign gate PASS`);
}finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true})}
