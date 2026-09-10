process.env.DB_PATH=`/tmp/multi-content-smoke-${process.pid}.sqlite`;
process.env.OPEN_MEDIA_ENABLED='false';
process.env.GEMINI_API_KEY='';
process.env.AI_API_KEY='';

const {prepareMultiContentStudio}=await import('../src/studio/multi.js');
const tips=await prepareMultiContentStudio({ownerId:'smoke',profile:'life_tips',topic:'Cách giữ bàn làm việc gọn gàng',length:'60',audience:'general'});
if(tips.stage!=='draft-ready'||tips.healthStudio.healthSafety.status!=='pass')throw new Error('Life tips safe fallback failed');
const podcast=await prepareMultiContentStudio({ownerId:'smoke',profile:'life_truth',topic:'Bình tĩnh trước điều không thể kiểm soát',length:'60',audience:'general'});
if(podcast.stage!=='draft-ready'||podcast.healthStudio.healthSafety.status!=='pass')throw new Error('Life truth podcast fallback failed');
const dangerous=await prepareMultiContentStudio({ownerId:'smoke',profile:'life_tips',topic:'Pha thuốc tẩy bleach với ammonia để làm sạch',length:'60',audience:'general'});
if(dangerous.stage!=='blocked')throw new Error('Dangerous life tip must be blocked');
console.log('Multi-Content Studio profiles smoke OK',JSON.stringify({tips:tips.stage,podcast:podcast.stage,dangerous:dangerous.stage}));
