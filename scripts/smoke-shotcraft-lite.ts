import assert from 'node:assert/strict';
import { craftShotPlan } from '../src/video/shotcraft.js';

const text=[
  'Ăn gì giúp trẻ tăng sức đề kháng?',
  'Cá béo, thịt nạc và rau xanh cung cấp dưỡng chất hỗ trợ miễn dịch.',
  'Omega-3 có vai trò điều hòa phản ứng viêm và không phải là một mốc số liệu của bản tin.',
  'Bên cạnh dinh dưỡng, giấc ngủ và vận động cũng cần được duy trì đều đặn.',
  'Điều quan trọng là xây dựng thói quen phù hợp thay vì chạy theo một thực phẩm duy nhất.'
].join(' ');
const images=Array.from({length:5},(_,i)=>({url:`https://example.com/image-${i+1}.jpg`,label:`dinh duong tre em ${i+1}`,score:120-i}));
const plan=craftShotPlan({text,imageCount:images.length,images,smartMatch:true,format:'latest',audience:'patient',durationSeconds:60});
assert.equal(plan.version,'shotcraft-lite-v2');
assert.equal(plan.motionCharacter,'calm-care');
assert.ok(plan.scenes.length>=3);
assert.equal(plan.scenes[0].shotRecipe,'slow-push');
assert.equal(plan.scenes.at(-1)?.shotRecipe,'still-hold');
assert.equal(plan.scenes.at(-1)?.storyBeat,'takeaway');
for(let i=1;i<plan.scenes.length;i++){
  assert.notEqual(plan.scenes[i].shotRecipe,plan.scenes[i-1].shotRecipe,'adjacent shots must not repeat the same motion recipe');
  assert.ok(plan.scenes[i].startRatio>=plan.scenes[i-1].endRatio-.0002,'scene timing must stay monotonic');
}
assert.ok(plan.scenes.every(x=>x.holdRatio>=0.12));
assert.ok(plan.scenes.every(x=>x.energy<=0.82));
assert.equal(plan.qa.semanticTiming,true);
assert.ok(plan.qa.restBudgetRatio>=0.12,JSON.stringify(plan.qa));
assert.ok(plan.qa.score>=90,JSON.stringify(plan.qa));
assert.ok(!plan.scenes.find(x=>x.text.includes('Omega-3'))?.reason.includes('số liệu'),'Omega-3 must not be treated as a numeric news statistic');

const semantic=craftShotPlan({
  text:[
    'Bản tin sáng nay ghi nhận diễn biến mới tại khu vực.',
    'Trong 24 giờ, 120 người đã được hỗ trợ tại ba điểm tiếp nhận.',
    'Cảnh báo thời tiết xấu vẫn còn hiệu lực và người dân cần hạn chế đi qua vùng ngập.',
    'Vì sao tình trạng này kéo dài? Nguyên nhân chính là mưa lớn liên tục ở thượng nguồn.',
    'Điều quan trọng cần nhớ là theo dõi hướng dẫn chính thức và ưu tiên an toàn.'
  ].join(' '),
  imageCount:5,
  format:'latest',
  audience:'general',
  durationSeconds:45
});
const evidence=semantic.scenes.find(x=>x.storyBeat==='evidence');
const caution=semantic.scenes.find(x=>x.storyBeat==='caution');
const takeaway=semantic.scenes.find(x=>x.storyBeat==='takeaway');
assert.ok(evidence&&evidence.timingMultiplier>=1.18,'numeric evidence must receive extra timeline budget');
assert.ok(caution&&caution.timingMultiplier>=1.16,'caution beat must receive extra timeline budget');
assert.equal(caution?.transition,'soft-dip','structural caution beat should use a restrained soft dip');
assert.equal(takeaway?.transition,'soft-dip','takeaway beat should mark a structural transition');
assert.equal(semantic.scenes.at(-1)?.shotRecipe,'still-hold');
assert.equal(semantic.qa.semanticTiming,true);
assert.ok(semantic.qa.softDipCount<=Math.ceil(semantic.scenes.length/3));

const breaking=craftShotPlan({text:'Cảnh báo mưa lớn đang ảnh hưởng nhiều khu vực. Người dân cần theo dõi hướng dẫn an toàn. Lượng mưa 120 mm được ghi nhận trong 6 giờ.',imageCount:3,format:'breaking',audience:'general',durationSeconds:45});
assert.equal(breaking.motionCharacter,'energetic');
assert.ok(breaking.scenes.some(x=>x.shotRecipe==='still-hold'||x.shotRecipe==='slow-push'));
assert.ok(breaking.scenes.filter(x=>x.transition==='soft-dip').length<=1,'breaking news should stay cut-dominant');
console.log('ShotCraft Lite v2 semantic pacing smoke OK',JSON.stringify({character:plan.motionCharacter,beats:semantic.scenes.map(x=>`${x.storyBeat}:${x.shotRecipe}`),qa:semantic.qa}));
