import assert from 'node:assert/strict';

process.env.AI_EDITOR_PROVIDER='rules';
process.env.GEMINI_API_KEY='';
process.env.OPENAI_API_KEY='';

const realFetch=globalThis.fetch;
globalThis.fetch=async(input:any)=>{
  const url=String(typeof input==='string'?input:input?.url||input);
  if(url.includes('europepmc/webservices/rest/search')){
    return new Response(JSON.stringify({
      resultList:{result:[
        {
          title:'Heart attack symptoms and emergency recognition',
          abstractText:'Myocardial infarction may present with chest discomfort, shortness of breath, sweating, nausea, or pain spreading to the arm, back, neck or jaw. Early emergency assessment is important.',
          pmid:'12345678',journalTitle:'Example Medical Journal',firstPublicationDate:'2025-01-10',
          pubTypeList:{pubType:['Review']}
        },
        {
          title:'Recognition of acute myocardial infarction warning signs',
          abstractText:'Heart attack warning signs can begin gradually. Chest discomfort and associated symptoms should be assessed promptly, especially when symptoms are new or concerning.',
          pmid:'23456789',journalTitle:'Example Cardiology Review',firstPublicationDate:'2024-04-15',
          pubTypeList:{pubType:['Systematic Review']}
        }
      ]}
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.includes('nhs.uk/conditions/heart-attack')||url.includes('nhlbi.nih.gov/health/heart-attack')){
    const site=url.includes('nhlbi')?'NHLBI':'NHS';
    const html=`<!doctype html><html lang="en"><head><title>Heart attack symptoms and treatment</title><meta property="og:site_name" content="${site}"></head><body><main><article>
    <h1>Heart attack symptoms and treatment</h1>
    <p>A heart attack, also called myocardial infarction, happens when blood flow to part of the heart is blocked.</p>
    <p>Warning signs can include chest discomfort, shortness of breath, sweating, nausea, dizziness, and discomfort spreading to an arm, back, neck or jaw.</p>
    <p>Symptoms may start gradually. People with possible heart attack symptoms should seek urgent medical assessment because early treatment can reduce harm.</p>
    </article></main></body></html>`;
    return new Response(html,{status:200,headers:{'content-type':'text/html'}});
  }
  return realFetch(input as any);
};

try{
  const { generateContentStudioAutodraft }=await import('../src/studio/pipeline-v2-autodraft.js');
  const result=await generateContentStudioAutodraft({
    ownerId:'phase7b-smoke',
    templateId:'health-story',
    topic:'Đau ngực nhẹ nhưng không được chủ quan – dấu hiệu nhồi máu cơ tim',
    seriesName:'Chuyện Sức Khỏe Quanh Ta',
  });
  assert.equal(result.medicalSensitive,true);
  assert.equal(result.researchMode,'medical');
  assert.ok(result.script.length>=20);
  assert.ok(result.sourceUrls.length>=2);
  assert.ok(result.sources.filter(x=>Number(x.authority||0)>=90).length>=1);
  assert.ok(result.sourceUrls.every(x=>!/[?&]utm_/i.test(x)));
  assert.ok(result.sources.some(x=>/NHS|NHLBI/i.test(x.name)));
  console.log(JSON.stringify({
    ok:true,
    medicalSensitive:result.medicalSensitive,
    sourceCount:result.sources.length,
    authorityCount:result.sources.filter(x=>Number(x.authority||0)>=90).length,
    scriptLength:result.script.length,
    editor:result.editor,
  },null,2));
}finally{
  globalThis.fetch=realFetch;
}
