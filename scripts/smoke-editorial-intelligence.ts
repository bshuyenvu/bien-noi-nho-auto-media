import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'editorial-v2-'));
process.env.DB_PATH=join(dir,'test.sqlite');
process.env.GEMINI_API_KEY='';process.env.AI_API_URL='';process.env.AI_API_KEY='';process.env.AI_MODEL='';process.env.OLLAMA_ENABLED='false';
const [{buildStoryBlueprint},{buildHookStudio,hookSimilarity},{composeMasterStory,chooseScriptVersion,semanticCompressClaim},{editorialCritic},{adaptEditorialPlatform,verifyPlatformClaimConsistency},learning,{editNews}]=await Promise.all([
 import('../src/editorial/newsroom.js'),import('../src/editorial/hook-studio.js'),import('../src/editorial/master-script.js'),import('../src/editorial/editorial-quality.js'),import('../src/editorial/platform-adapter.js'),import('../src/editorial/editorial-learning.js'),import('../src/ai/editor.js')
]);
const facts:any[]=[
 {kind:'event',text:'Bộ Y tế công bố chương trình giám sát mới nhằm phát hiện sớm các ca bệnh tại cộng đồng.',confidence:.98,corroboratedBy:2,support:'corroborated'},
 {kind:'number',text:'Chương trình được triển khai tại 18 tỉnh và thành phố trong giai đoạn đầu.',confidence:.97,corroboratedBy:1,support:'corroborated'},
 {kind:'effect',text:'Các cơ sở tham gia phải báo cáo trường hợp nghi ngờ trong vòng 24 giờ để rút ngắn thời gian đáp ứng.',confidence:.94,corroboratedBy:1,support:'corroborated'},
 {kind:'cause',text:'Kế hoạch được xây dựng sau khi hệ thống giám sát ghi nhận thời gian phát hiện giữa các địa phương còn chênh lệch.',confidence:.91,corroboratedBy:0,support:'primary'},
 {kind:'time',text:'Giai đoạn đầu bắt đầu từ tháng 10 năm 2026 và được đánh giá sau sáu tháng.',confidence:.95,corroboratedBy:1,support:'corroborated'},
 {kind:'place',text:'Các điểm giám sát gồm bệnh viện tuyến tỉnh, trung tâm kiểm soát bệnh tật và một số cơ sở y tế tuyến cơ sở.',confidence:.9,corroboratedBy:0,support:'primary'},
 {kind:'person',text:'Đại diện cơ quan chuyên môn cho biết nhân viên y tế sẽ được tập huấn thống nhất quy trình báo cáo.',confidence:.88,corroboratedBy:0,support:'primary'},
 {kind:'advice',text:'Người dân được khuyến cáo theo dõi thông tin từ cơ quan y tế và đến cơ sở khám chữa bệnh khi có dấu hiệu bất thường.',confidence:.96,corroboratedBy:1,support:'corroborated'},
 {kind:'context',text:'Dữ liệu của chương trình sẽ được dùng để đánh giá tốc độ phát hiện và khả năng đáp ứng của từng địa phương.',confidence:.86,corroboratedBy:0,support:'primary'}
];
const blueprint=buildStoryBlueprint({title:'Bộ Y tế triển khai chương trình giám sát mới',facts,sourceScore:94,audience:'general'});
assert.ok(blueprint.requiredClaimIds.length>=5,'newsworthiness must identify mandatory claims');
assert.ok(blueprint.recommendedSeconds>=60,'complex evidence should not be forced into a short clip');
const studio1=buildHookStudio({blueprint,recentHooks:[]});assert.ok(studio1.selected&&studio1.candidates.length>=4);
const studio2=buildHookStudio({blueprint,recentHooks:[{hook:studio1.selected!.text}]});assert.ok(studio2.selected);assert.ok(hookSimilarity(studio2.selected!.text,studio1.selected!.text)<.72||studio2.selected!.strategy!==studio1.selected!.strategy,'hook memory should penalize repetition');
const master=composeMasterStory({hook:studio2.selected!.text,blueprint});
for(const d of ['30','45','60','90','120']){const v=master.versions[d];assert.match(v.script,/[.!?]$/);assert.ok(!v.script.endsWith('…'),'script must never end by mechanical truncation')}
const selected=chooseScriptVersion(master,'auto');assert.ok(selected.seconds>=blueprint.recommendedSeconds||!selected.overflow);
const quality=editorialCritic(selected.script,blueprint);assert.equal(quality.missingMandatory.length,0);assert.equal(quality.endingComplete,true);assert.ok(quality.score>=80);
const outputs=['youtube','facebook','tiktok','zalo'].map((platform:any)=>adaptEditorialPlatform({platform,blueprint,master,version:selected}));
const platformCheck=verifyPlatformClaimConsistency(master.claimIds,outputs,blueprint.requiredClaimIds);assert.equal(platformCheck.ok,true,'platform variants must inherit master and mandatory claim IDs');
const compressed=semanticCompressClaim('Cơ quan hiện đang tiến hành giám sát tại 18 tỉnh nhằm mục đích phát hiện sớm trong vòng 24 giờ.');assert.ok(compressed.includes('18')&&compressed.includes('24'),'semantic compression must preserve numeric markers');assert.match(compressed,/[.!?]$/);
const registered=learning.registerEditorialStoryRun({ownerId:'owner-1',title:'Story learning smoke',angle:blueprint.angle,hookStrategy:studio2.selected!.strategy,hook:studio2.selected!.text,requestedDuration:'auto',selectedDuration:selected.seconds,qualityScore:quality.score});learning.rememberHook('owner-1',studio1.selected!.text,studio1.selected!.strategy,blueprint.angle,registered);
for(let i=0;i<3;i++)learning.recordEditorialPerformanceForStory({ownerId:'owner-1',storyId:registered,platform:'youtube',durationSeconds:selected.estimatedSeconds,impressions:1000,views:700,retention3s:.94,retention10s:.81,completionRate:.82,shareRate:.06,commentRate:.02});
let rejected=false;try{learning.recordEditorialPerformanceForStory({ownerId:'owner-2',storyId:registered,platform:'youtube',completionRate:.9})}catch{rejected=true}assert.equal(rejected,true,'learning must reject story IDs from another owner');
const profile=learning.editorialLearningProfile('owner-1');assert.equal(profile.samples,3);assert.ok(Object.prototype.hasOwnProperty.call(profile.strategyBoost,studio2.selected!.strategy));
const edited=await editNews({title:'Bộ Y tế triển khai chương trình giám sát mới',body:facts.map(x=>x.text).join(' '),sourceName:'Nguồn chính thức',length:'auto',ownerId:'owner-1',facts,sourceScore:94,audience:'general'});
const meta:any=edited.editorial;assert.equal(meta.phase,'7.6');assert.match(String(meta.storyId||''),/^[0-9a-f-]{36}$/i);assert.ok(meta.blueprint);assert.ok(meta.hookStudio?.candidates?.length>=4);assert.equal(meta.quality.missingMandatory.length,0);assert.ok(meta.platformConsistency.ok);assert.match(edited.script,/[.!?]$/);assert.ok(!edited.script.endsWith('…'));assert.ok(edited.estimatedSeconds>=30);
console.log('Phase 7 Editorial Intelligence OS smoke OK',JSON.stringify({angle:meta.blueprint.angle,hook:meta.hookStudio.selected.strategy,recommended:meta.duration.recommended,selected:meta.duration.selected,quality:meta.quality.score,storyId:Boolean(meta.storyId),learningSamples:profile.samples}));
rmSync(dir,{recursive:true,force:true});
