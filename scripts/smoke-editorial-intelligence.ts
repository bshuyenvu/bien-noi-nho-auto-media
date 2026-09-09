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
assert.ok(blueprint.requiredClaimIds.length>=3,'newsworthiness must identify a focused mandatory claim set');
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
const meta:any=edited.editorial;assert.equal(meta.phase,'7.7-professional');assert.match(String(meta.storyId||''),/^[0-9a-f-]{36}$/i);assert.ok(meta.blueprint);assert.ok(meta.hookStudio?.candidates?.length>=4);assert.equal(meta.quality.missingMandatory.length,0);assert.equal(meta.quality.ready,true);assert.ok(meta.quality.specificityScore>=65);assert.ok(meta.quality.coherenceScore>=65);assert.ok(meta.quality.naturalnessScore>=70);assert.ok(meta.platformConsistency.ok);assert.match(edited.script,/[.!?]$/);assert.ok(!edited.script.endsWith('…'));assert.ok(edited.estimatedSeconds>=30);

const {analyzeSourceIntelligence}=await import('../src/editorial/source-intelligence.js');
const medicalBody='Quan niệm ung thư luôn có triệu chứng rõ ràng, đau đớn hoặc chỉ xuất hiện ở người lớn tuổi khiến các dấu hiệu bất thường dễ bị xem nhẹ. Theo nguồn y khoa, ung thư không phải lúc nào cũng gây đau. Một số bệnh có thể phát triển ở giai đoạn đầu với triệu chứng nhẹ hoặc không rõ ràng. Người bệnh không nên chỉ dựa vào cảm giác đau để đánh giá nguy cơ ung thư. Khi xuất hiện thay đổi kéo dài, người bệnh cần đi khám để được đánh giá. Tuổi cao làm tăng nguy cơ ung thư, nhưng bệnh vẫn có thể xuất hiện ở người trẻ trong độ tuổi 20, 30 hoặc 40. Những dấu hiệu bất thường không đồng nghĩa với ung thư vì nhiều triệu chứng cũng có thể do tình trạng lành tính.';
const medIntel=await analyzeSourceIntelligence({ownerId:'medical-fixture',sourceUrl:'https://example.org/cancer-myths',sourceName:'Medical fixture',title:'Những hiểu lầm về ung thư dễ bỏ qua dấu hiệu cảnh báo',body:medicalBody,force:true});
assert.ok(medIntel.facts.some(x=>x.kind==='advice'),'rules fact engine must detect advice');
assert.ok(medIntel.facts.some(x=>x.kind==='effect'),'rules fact engine must detect effects');
assert.ok(medIntel.facts.filter(x=>x.kind==='number').every(x=>/\d|%/.test(x.text)),'number facts must contain actual numeric evidence');
const medEdited=await editNews({title:medIntel.vietnameseTitle,body:medIntel.vietnameseBrief,sourceName:'Medical fixture',length:'auto',ownerId:'medical-fixture',facts:medIntel.facts,sourceScore:80,audience:'general',factProvider:'rules'});
const medMeta:any=medEdited.editorial;
assert.equal(medMeta.blueprint.topic,'ung thư');
assert.equal(medMeta.blueprint.angle,'explainer');
assert.match(medEdited.hook,/ung thư/i);
assert.ok(medMeta.hookStudio.selected.specificity>=65,'medical hook must be topic-specific');
assert.doesNotMatch(medEdited.hook,/^(?:Con số nào|Diễn biến này|Sự việc này|Chuyện này)/i);
assert.equal(medMeta.quality.ready,true,'medical rules fallback must remain editorially ready');
assert.equal(medMeta.generation.degradedSafe,true);

const nutritionBody='Cá béo, thịt nạc, bông cải xanh, rau xanh cung cấp chất béo, tinh bột, vitamin và khoáng chất có thể giúp trẻ tăng cường hệ miễn dịch để phòng chống bệnh. Cá hồi, cá thu, cá trích, cá mòi giàu omega-3 có tác dụng tăng cường hệ miễn dịch, điều hòa phản ứng viêm và hỗ trợ cơ thể trẻ nhỏ chống lại các tác nhân gây bệnh nhiễm trùng. Bên cạnh khả năng cung cấp chất xơ, giúp kích thích hệ tiêu hóa, rau có lá sẫm màu như cải bó xôi, cải xoăn còn chứa nhiều vitamin C, beta-carotene và omega-3. Bác sĩ cho biết trẻ mẫu giáo hoặc những năm đầu tiểu học có sức đề kháng chưa phát triển hoàn thiện. Ưu tiên hấp, luộc hoặc nấu canh để tận dụng tối đa dưỡng chất.';
const nutritionIntel=await analyzeSourceIntelligence({ownerId:'nutrition-fixture',sourceUrl:'https://vnexpress.net/nutrition-fixture',sourceName:'VnExpress',title:'Ăn gì giúp trẻ tăng sức đề kháng dịp tựu trường? - Báo VnExpress',body:nutritionBody,force:true});
assert.equal(nutritionIntel.facts.some(x=>x.kind==='number'),false,'omega-3 must not create a number fact');
assert.equal(nutritionIntel.facts.some(x=>x.kind==='time'),false,'school-age wording must not create a timeline fact');
const nutritionEdited=await editNews({title:nutritionIntel.vietnameseTitle,body:nutritionIntel.vietnameseBrief,sourceName:'VnExpress',length:'60',ownerId:'nutrition-fixture',facts:nutritionIntel.facts,sourceScore:80,audience:'general',factProvider:'rules'});
const nutritionMeta:any=nutritionEdited.editorial;
assert.equal(nutritionMeta.blueprint.angle,'explainer');
assert.notEqual(nutritionMeta.blueprint.angle,'timeline');assert.notEqual(nutritionMeta.blueprint.angle,'number');
assert.match(nutritionEdited.hook,/trẻ|sức đề kháng|miễn dịch|ăn/i);
assert.doesNotMatch(nutritionEdited.headline+nutritionEdited.hook+nutritionEdited.script+nutritionEdited.caption,/VnExpress|Nguồn:/i,'publisher credit must stay out of editorial content');
assert.equal(nutritionMeta.quality.ready,true);
console.log('Phase 7 Editorial Intelligence OS smoke OK',JSON.stringify({angle:meta.blueprint.angle,hook:meta.hookStudio.selected.strategy,recommended:meta.duration.recommended,selected:meta.duration.selected,quality:meta.quality.score,storyId:Boolean(meta.storyId),learningSamples:profile.samples}));
rmSync(dir,{recursive:true,force:true});
