import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=mkdtempSync(join(tmpdir(),'claim-source-smoke-'));
Object.assign(process.env,{DB_PATH:join(root,'claim-source.sqlite'),NODE_ENV:'test',CI:'true'});
try{
  const {run}=await import('../src/storage/db.js');
  const sourceIntel=await import('../src/editorial/source-intelligence.js');
  const {buildClaimSourceMatrix}=await import('../src/editorial/claim-source-matrix.js');
  const evidence=await import('../src/review/evidence-store.js');
  const now=new Date().toISOString(),owner='evidence-owner',draftId='draft-evidence';
  run('INSERT INTO accounts(id,clerk_user_id,email,role,plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,'clerk-evidence','evidence@example.test','admin','pro','active',now,now);
  run('INSERT INTO drafts(id,owner_id,title,body,source_url,source_name,format,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)',draftId,owner,'Bản tin có Evidence','Nội dung bản tin đủ dài để kiểm tra Claim to Source Matrix và Evidence Review Gate.','https://primary.example/news','Primary News','latest','draft',now);
  const persistedIntel=await sourceIntel.analyzeSourceIntelligence({ownerId:owner,sourceUrl:'https://primary.example/news',sourceName:'Primary News',title:'Bản tin nguồn chính thử nghiệm',body:'Đây là nội dung nguồn chính bằng tiếng Việt đủ dài để khởi tạo Source Intelligence cho bài kiểm thử evidence.',publishedAt:now,force:true});
  const intelligence:any={...persistedIntel,id:persistedIntel.id,ownerId:owner,sourceUrl:'https://primary.example/news',sourceName:'Primary News',originalTitle:'Primary story',bodyHash:'hash',language:{code:'en',name:'English',confidence:.99,script:'latin',isVietnamese:false},translationStatus:'translated',vietnameseTitle:'Tin thử nghiệm',vietnameseBrief:'Bản tóm tắt tiếng Việt.',facts:[
    {kind:'event',text:'Sự kiện A đã xảy ra.',sourceExcerpt:'Event A happened.',confidence:.94,corroboratedBy:2,corroboratingSourceIndexes:[1,2],support:'corroborated'},
    {kind:'number',text:'Số liệu B là 42.',sourceExcerpt:'The value was 42.',confidence:.9,corroboratedBy:1,support:'corroborated'},
    {kind:'context',text:'Bối cảnh C cần thận trọng.',confidence:.5,corroboratedBy:0,support:'uncertain'}
  ],uncertainties:['Bối cảnh C chưa xác minh.'],warnings:[],authorityScore:95,freshnessScore:90,sourceScore:91,corroborationCount:2,provider:'gemini',readyForEditorial:true,createdAt:now,updatedAt:now};
  const sources=[{name:'Reuters',title:'Reuters confirms A',url:'https://reuters.example/a'},{name:'AP',title:'AP confirms A',url:'https://ap.example/a'}];
  const matrix=buildClaimSourceMatrix(intelligence,sources);
  assert.equal(matrix.claimCount,3);assert.equal(matrix.mappedCorroboratedClaimCount,1);assert.equal(matrix.unmappedCorroboratedClaimCount,1);assert.equal(matrix.uncertainClaimCount,1);
  assert.deepEqual(matrix.entries[0].corroboratingSources.map(x=>x.sourceIndex),[1,2]);assert.equal(matrix.entries[0].mappingComplete,true);assert.equal(matrix.entries[1].mappingComplete,false);assert.equal(matrix.entries[1].requiresReview,true);
  const gate:any={status:'review',score:68,claimCount:3,supportedClaimCount:2,corroboratedClaimCount:2,uncertainClaimCount:1,effectiveCorroborationScore:70,reasons:['manual review']};
  const bundle=evidence.createPreparedEvidenceBundle(owner,{sourceIntelligenceId:intelligence.id,evidenceGate:gate,matrix});
  const stored=evidence.consumePreparedEvidenceBundle(bundle.id,draftId,owner,'operator:producer');
  assert.equal(stored.status,'pending');assert.equal(stored.approvalAllowed,false);assert.equal(evidence.evidenceApprovalAllowed(draftId,owner),false);let reuseBlocked=false;try{evidence.consumePreparedEvidenceBundle(bundle.id,draftId,owner,'operator:reuse')}catch{reuseBlocked=true}assert.equal(reuseBlocked,true);
  const accepted=evidence.setDraftEvidenceReview(draftId,owner,'accepted','operator:review','Đã kiểm tra claim chưa map trực tiếp bằng nguồn gốc.');
  assert.equal(accepted.status,'accepted');assert.equal(accepted.approvalAllowed,true);assert.equal(evidence.evidenceApprovalAllowed(draftId,owner),true);
  const matrix2={...matrix,entries:matrix.entries.map((x:any,i:number)=>i===1?{...x,corroboratingSources:[{role:'corroborating',sourceIndex:1,name:'Reuters',title:'Reuters confirms B',url:'https://reuters.example/b'}],mappingComplete:true,requiresReview:false}:x),mappedCorroboratedClaimCount:2,unmappedCorroboratedClaimCount:0,createdAt:new Date().toISOString()};
  const replaced=evidence.saveDraftEvidence(draftId,owner,{sourceIntelligenceId:intelligence.id,evidenceGate:{...gate,score:77,status:'pass'},matrix:matrix2},'operator:reanalyze');
  assert.equal(replaced.status,'pending');assert.equal(replaced.approvalAllowed,false);
  const events=evidence.listDraftEvidenceEvents(draftId,owner,20);for(const action of ['evidence_created','evidence_accepted','evidence_replaced'])assert.ok(events.some(x=>x.action===action),`missing ${action}`);
  console.log('Claim → Source Matrix + Evidence Review smoke OK',{claims:matrix.claimCount,mapped:matrix.mappedCorroboratedClaimCount,unmapped:matrix.unmappedCorroboratedClaimCount});
}finally{rmSync(root,{recursive:true,force:true})}
