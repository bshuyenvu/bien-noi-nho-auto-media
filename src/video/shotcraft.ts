import { directScenes, type ScenePlan } from './scenes.js';
import { matchImagesToScenes, type SceneImage } from './matching.js';

export type ShotRecipe='still-hold'|'slow-push'|'slow-pull'|'pan-left'|'pan-right'|'drift-up'|'drift-down'|'diagonal-drift';
export type ShotTransition='cut'|'soft-dip';
export type MotionCharacter='professional-trust'|'calm-care'|'friendly'|'energetic';
export type StoryBeat='hook'|'setup'|'evidence'|'explanation'|'human'|'caution'|'takeaway'|'close';
export type PaceStyle='brisk'|'steady'|'deliberate';

export interface ShotCraftScene extends ScenePlan{
  shotRecipe:ShotRecipe;
  transition:ShotTransition;
  holdRatio:number;
  energy:number;
  motionCharacter:MotionCharacter;
  storyBeat:StoryBeat;
  pace:PaceStyle;
  timingMultiplier:number;
  reason:string;
  matchScore?:number;
}
export interface ShotCraftOptions{
  text:string;
  imageCount:number;
  images?:SceneImage[];
  smartMatch?:boolean;
  format?:'breaking'|'latest'|'standard';
  audience?:'general'|'medical'|'investor'|'patient'|'social';
  durationSeconds?:number;
  maxScenes?:number;
}
export interface ShotCraftQa{
  score:number;
  warnings:string[];
  averageShotSeconds?:number;
  recipeDiversity:number;
  restBudgetRatio:number;
  maxHighEnergyStreak:number;
  softDipCount:number;
  semanticTiming:boolean;
}
export interface ShotCraftPlan{
  version:'shotcraft-lite-v2';
  motionCharacter:MotionCharacter;
  scenes:ShotCraftScene[];
  qa:ShotCraftQa;
  principles:string[];
}

const NUMBER=/\d{1,3}(?:[.,]\d+)?\s*(?:%|triệu|tỷ|nghìn|ca|người|giờ|ngày|tháng|năm|mm|mg|ml|kg|km|độ|lần)(?=$|[\s,.;:!?])/iu;
const RISK_TERMS=['cảnh báo','nguy cơ','rủi ro','tử vong','nguy hiểm','bùng phát','khẩn cấp','suy','ung thư','đột quỵ','tai nạn','biến chứng'];
const EXPLAIN_TERMS=['vì sao','tại sao','cách','làm gì','nên','giúp','cơ chế','nguyên nhân','điều gì','do đó','bởi vì'];
const HUMAN_TERMS=['bác sĩ','chuyên gia','người bệnh','bệnh nhân','trẻ em','phụ nữ','nam giới','gia đình','người dân','cộng đồng'];
const CARE_TERMS=['sức khỏe','y tế','bệnh','điều trị','dinh dưỡng','thuốc','vaccine','vắc xin','phòng ngừa','chăm sóc'];
const TAKEAWAY_TERMS=['cần nhớ','điều quan trọng','khuyến cáo','khuyến nghị','hãy','tóm lại','cuối cùng','lưu ý','nên nhớ'];

function clamp(n:number,min:number,max:number){return Math.max(min,Math.min(max,n))}
function hash(text:string){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function fold(text:string){return text.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9%]+/g,' ').trim()}
function hasAny(text:string,terms:string[]){const hay=` ${fold(text)} `;return terms.some(term=>hay.includes(` ${fold(term)} `))}
function motionCharacter(text:string,format:ShotCraftOptions['format'],audience:ShotCraftOptions['audience']):MotionCharacter{
  if(audience==='medical'||audience==='patient'||hasAny(text,CARE_TERMS))return'calm-care';
  if(format==='breaking')return'energetic';
  if(audience==='social')return'friendly';
  return'professional-trust';
}
function storyBeat(scene:ScenePlan,index:number,total:number):StoryBeat{
  if(index===0)return'hook';
  if(index===total-1)return hasAny(scene.text,TAKEAWAY_TERMS)?'takeaway':'close';
  if(NUMBER.test(scene.text))return'evidence';
  if(hasAny(scene.text,RISK_TERMS))return'caution';
  if(hasAny(scene.text,TAKEAWAY_TERMS))return'takeaway';
  if(hasAny(scene.text,EXPLAIN_TERMS))return'explanation';
  if(hasAny(scene.text,HUMAN_TERMS))return'human';
  return'setup';
}
function timingMultiplier(beat:StoryBeat,character:MotionCharacter){
  const base:Record<StoryBeat,number>={hook:.96,setup:1,evidence:1.18,explanation:1.08,human:1.04,caution:1.16,takeaway:1.16,close:1.2};
  const modifier=character==='energetic'&&beat==='hook'?.94:character==='calm-care'&&(beat==='caution'||beat==='takeaway')?1.06:1;
  return Number(clamp(base[beat]*modifier,.88,1.28).toFixed(2));
}
function retime(base:ScenePlan[],character:MotionCharacter){
  const annotated=base.map((scene,index)=>{const beat=storyBeat(scene,index,base.length);return{scene,beat,multiplier:timingMultiplier(beat,character)}});
  const raw=annotated.map(x=>Math.max(.001,x.scene.weight*x.multiplier));
  const sum=raw.reduce((a,b)=>a+b,0)||1;
  let cursor=0;
  return annotated.map((x,index)=>{
    const weight=raw[index]/sum,startRatio=cursor;cursor+=weight;
    return{...x.scene,weight:Number(weight.toFixed(4)),startRatio:Number(startRatio.toFixed(4)),endRatio:index===annotated.length-1?1:Number(cursor.toFixed(4)),storyBeat:x.beat,timingMultiplier:x.multiplier};
  });
}
function candidates(text:string,character:MotionCharacter,beat:StoryBeat):ShotRecipe[]{
  if(beat==='evidence'||NUMBER.test(text))return['still-hold','slow-push','slow-pull'];
  if(beat==='caution'||hasAny(text,RISK_TERMS))return character==='calm-care'?['slow-push','still-hold','drift-up']:['slow-push','pan-left','still-hold'];
  if(beat==='takeaway'||beat==='close')return['still-hold','slow-pull','slow-push'];
  if(beat==='explanation'||hasAny(text,EXPLAIN_TERMS))return['pan-right','slow-push','diagonal-drift'];
  if(beat==='human'||hasAny(text,HUMAN_TERMS))return['drift-up','slow-push','pan-left'];
  if(character==='calm-care')return['slow-push','pan-right','drift-up','slow-pull'];
  if(character==='energetic')return['pan-left','pan-right','slow-push','diagonal-drift'];
  if(character==='friendly')return['drift-up','pan-right','slow-pull','diagonal-drift'];
  return['slow-push','slow-pull','pan-left','pan-right','still-hold'];
}
function chooseRecipe(scene:ScenePlan,beat:StoryBeat,index:number,total:number,character:MotionCharacter,previous?:ShotRecipe):ShotRecipe{
  const c=candidates(scene.text,character,beat);
  const opening=index===0?'slow-push':undefined;
  const closing=index===total-1?'still-hold':undefined;
  const preferred=opening||closing||c[hash(scene.text+beat+index)%c.length];
  if(preferred!==previous)return preferred;
  return c.find(x=>x!==previous)||'still-hold';
}
function holdFor(recipe:ShotRecipe,beat:StoryBeat){
  if(recipe==='still-hold'||beat==='close')return.3;
  if(beat==='evidence')return.24;
  if(beat==='caution'||beat==='takeaway')return.23;
  if(beat==='explanation')return.16;
  return.14;
}
function transitionFor(index:number,beat:StoryBeat,previousBeat:StoryBeat|undefined,character:MotionCharacter):ShotTransition{
  if(index===0)return'cut';
  const structural=beat==='caution'||beat==='takeaway'||beat==='close';
  if(!structural||beat===previousBeat)return'cut';
  if(character==='energetic'&&beat!=='close')return'cut';
  return'soft-dip';
}
function paceFor(scene:ScenePlan,beat:StoryBeat,durationSeconds?:number):PaceStyle{
  const seconds=durationSeconds?durationSeconds*Math.max(.001,scene.endRatio-scene.startRatio):undefined;
  if(seconds!==undefined)return seconds<4.2?'brisk':seconds>8?'deliberate':'steady';
  if(beat==='hook')return'brisk';
  if(beat==='evidence'||beat==='caution'||beat==='takeaway'||beat==='close')return'deliberate';
  return'steady';
}
function reasonFor(recipe:ShotRecipe,beat:StoryBeat){
  const why:Record<StoryBeat,string>={hook:'mở cảnh có hướng nhìn rõ',setup:'duy trì mạch kể',evidence:'giữ số liệu đủ lâu để đọc',explanation:'dẫn mắt theo mạch giải thích',human:'ưu tiên góc nhìn con người',caution:'nhấn cảnh báo nhưng giữ camera ổn định',takeaway:'tạo khoảng thở cho thông điệp cần nhớ',close:'hạ năng lượng và giữ khung kết'};
  return`${recipe}: ${why[beat]}`;
}
function decorate(base:ReturnType<typeof retime>,character:MotionCharacter,durationSeconds?:number):ShotCraftScene[]{
  let previous:ShotRecipe|undefined,previousBeat:StoryBeat|undefined;
  return base.map((scene,index)=>{
    const beat=scene.storyBeat;
    const recipe=chooseRecipe(scene,beat,index,base.length,character,previous);previous=recipe;
    const position=base.length<=1?0:index/(base.length-1),arc=Math.sin(position*Math.PI);
    let energy=(character==='energetic'?0.54:character==='calm-care'?0.28:0.38)+arc*.28;
    if(beat==='evidence')energy-=.08;if(beat==='caution'&&character==='calm-care')energy-=.05;if(beat==='close'||beat==='takeaway')energy-=.08;
    const transition=transitionFor(index,beat,previousBeat,character);previousBeat=beat;
    return{...scene,shotRecipe:recipe,transition,holdRatio:Number(clamp(holdFor(recipe,beat),.12,.32).toFixed(2)),energy:Number(clamp(energy,.2,.82).toFixed(2)),motionCharacter:character,pace:paceFor(scene,beat,durationSeconds),reason:reasonFor(recipe,beat)};
  });
}
function qa(scenes:ShotCraftScene[],durationSeconds?:number):ShotCraftQa{
  const warnings:string[]=[];let repeats=0,maxHighEnergyStreak=0,streak=0;
  for(let i=0;i<scenes.length;i++){
    if(i>0&&scenes[i].shotRecipe===scenes[i-1].shotRecipe)repeats++;
    if(scenes[i].energy>=.68){streak++;maxHighEnergyStreak=Math.max(maxHighEnergyStreak,streak)}else streak=0;
  }
  if(repeats)warnings.push(`${repeats} cặp cảnh lặp chuyển động liên tiếp`);
  const unique=new Set(scenes.map(x=>x.shotRecipe)).size,recipeDiversity=scenes.length?Number((unique/scenes.length).toFixed(2)):0;
  if(scenes.length>=4&&recipeDiversity<.45)warnings.push('Độ đa dạng chuyển động thấp');
  if(scenes.some(x=>x.holdRatio<.12))warnings.push('Có cảnh thiếu khoảng thở');
  const averageShotSeconds=durationSeconds&&scenes.length?Number((durationSeconds/scenes.length).toFixed(1)):undefined;
  if(averageShotSeconds&&averageShotSeconds<3.2)warnings.push('Nhịp cảnh quá nhanh; nên giảm số cảnh hoặc tăng thời lượng');
  if(averageShotSeconds&&averageShotSeconds>14)warnings.push('Một số cảnh có thể quá dài; cân nhắc thêm ảnh minh họa');
  const restBudgetRatio=Number(scenes.reduce((sum,x)=>sum+(x.endRatio-x.startRatio)*x.holdRatio,0).toFixed(3));
  if(restBudgetRatio<.12&&scenes.length>2)warnings.push('Tổng khoảng thở của timeline còn thấp');
  if(maxHighEnergyStreak>2)warnings.push('Năng lượng cao kéo dài quá nhiều cảnh liên tiếp');
  const softDipCount=scenes.filter(x=>x.transition==='soft-dip').length;
  if(softDipCount>Math.ceil(scenes.length/3))warnings.push('Soft-dip đang được dùng quá thường xuyên');
  const semanticTiming=scenes.every(x=>Boolean(x.storyBeat)&&x.timingMultiplier>0);
  if(!semanticTiming)warnings.push('Semantic timing chưa hoàn chỉnh');
  return{score:clamp(100-warnings.length*8-repeats*6,0,100),warnings,averageShotSeconds,recipeDiversity,restBudgetRatio,maxHighEnergyStreak,softDipCount,semanticTiming};
}
export function craftShotPlan(options:ShotCraftOptions):ShotCraftPlan{
  const imageCount=Math.max(0,options.imageCount),character=motionCharacter(options.text,options.format,options.audience);
  if(!imageCount)return{version:'shotcraft-lite-v2',motionCharacter:character,scenes:[],qa:{score:0,warnings:['Không có media'],recipeDiversity:0,restBudgetRatio:0,maxHighEnergyStreak:0,softDipCount:0,semanticTiming:false},principles:[]};
  let base=directScenes(options.text,imageCount,options.maxScenes??10);
  if(options.smartMatch!==false&&options.images?.length)base=matchImagesToScenes(base,options.images);
  const scenes=decorate(retime(base,character),character,options.durationSeconds);
  return{version:'shotcraft-lite-v2',motionCharacter:character,scenes,qa:qa(scenes,options.durationSeconds),principles:['mỗi cảnh một động tác chính','semantic timing: số liệu/cảnh báo/kết luận được giữ lâu hơn','story-beat transition: soft-dip chỉ ở chuyển đoạn có ý nghĩa','không lặp recipe liên tiếp','giữ khoảng thở sau thông tin chính','camera ổn định, không rung toàn khung','ưu tiên cut; soft-dip dùng tiết chế']};
}
