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
assert.equal(plan.version,'shotcraft-lite-v1');
assert.equal(plan.motionCharacter,'calm-care');
assert.ok(plan.scenes.length>=3);
assert.equal(plan.scenes[0].shotRecipe,'slow-push');
assert.equal(plan.scenes.at(-1)?.shotRecipe,'still-hold');
for(let i=1;i<plan.scenes.length;i++)assert.notEqual(plan.scenes[i].shotRecipe,plan.scenes[i-1].shotRecipe,'adjacent shots must not repeat the same motion recipe');
assert.ok(plan.scenes.every(x=>x.holdRatio>=0.12));
assert.ok(plan.scenes.every(x=>x.energy<=0.82));
assert.ok(plan.qa.score>=90,JSON.stringify(plan.qa));
assert.ok(!plan.scenes.find(x=>x.text.includes('Omega-3'))?.reason.includes('số liệu'),'Omega-3 must not be treated as a numeric news statistic');
const breaking=craftShotPlan({text:'Cảnh báo mưa lớn đang ảnh hưởng nhiều khu vực. Người dân cần theo dõi hướng dẫn an toàn. Lượng mưa 120 mm được ghi nhận trong 6 giờ.',imageCount:3,format:'breaking',audience:'general',durationSeconds:45});
assert.equal(breaking.motionCharacter,'energetic');
assert.ok(breaking.scenes.some(x=>x.shotRecipe==='still-hold'||x.shotRecipe==='slow-push'));
console.log('ShotCraft Lite planning smoke OK',JSON.stringify({character:plan.motionCharacter,scenes:plan.scenes.map(x=>x.shotRecipe),qa:plan.qa}));
