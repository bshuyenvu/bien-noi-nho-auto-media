import { directScenes, type ScenePlan } from './scenes.js';
import { matchImagesToScenes, type SceneImage } from './matching.js';

export type ShotRecipe='still-hold'|'slow-push'|'slow-pull'|'pan-left'|'pan-right'|'drift-up'|'drift-down'|'diagonal-drift';
export type ShotTransition='cut'|'soft-dip';
export type MotionCharacter='professional-trust'|'calm-care'|'friendly'|'energetic';

export interface ShotCraftScene extends ScenePlan{
  shotRecipe:ShotRecipe;
  transition:ShotTransition;
  holdRatio:number;
  energy:number;
  motionCharacter:MotionCharacter;
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
export interface ShotCraftQa{score:number;warnings:string[];averageShotSeconds?:number;recipeDiversity:number}
export interface ShotCraftPlan{
  version:'shotcraft-lite-v1';
  motionCharacter:MotionCharacter;
  scenes:ShotCraftScene[];
  qa:ShotCraftQa;
  principles:string[];
}

const NUMBER=/(?:\b\d{1,3}(?:[.,]\d+)?\s*(?:%|triệu|tỷ|nghìn|ca|người|giờ|ngày|tháng|năm)\b)/iu;
const RISK=/\b(cảnh báo|nguy cơ|rủi ro|tử vong|nguy hiểm|bùng phát|khẩn cấp|suy|ung thư|đột quỵ)\b/iu;
const EXPLAIN=/\b(vì sao|tại sao|cách|làm gì|nên|giúp|cơ chế|nguyên nhân|điều gì)\b/iu;
const HUMAN=/\b(bác sĩ|chuyên gia|người bệnh|bệnh nhân|trẻ em|phụ nữ|nam giới|gia đình|người dân)\b/iu;
const CARE=/\b(sức khỏe|y tế|bệnh|điều trị|dinh dưỡng|thuốc|vaccine|vắc xin|phòng ngừa|chăm sóc)\b/iu;

function clamp(n:number,min:number,max:number){return Math.max(min,Math.min(max,n))}
function hash(text:string){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function motionCharacter(text:string,format:ShotCraftOptions['format'],audience:ShotCraftOptions['audience']):MotionCharacter{
  if(audience==='medical'||audience==='patient'||CARE.test(text))return'calm-care';
  if(format==='breaking')return'energetic';
  if(audience==='social')return'friendly';
  return'professional-trust';
}
function candidates(text:string,character:MotionCharacter):ShotRecipe[]{
  if(NUMBER.test(text))return['still-hold','slow-push','pan-right'];
  if(RISK.test(text))return character==='calm-care'?['slow-push','still-hold','drift-up']:['slow-push','pan-left','still-hold'];
  if(EXPLAIN.test(text))return['pan-right','slow-push','diagonal-drift'];
  if(HUMAN.test(text))return['drift-up','slow-push','pan-left'];
  if(character==='calm-care')return['slow-push','pan-right','drift-up','slow-pull'];
  if(character==='energetic')return['pan-left','pan-right','slow-push','diagonal-drift'];
  if(character==='friendly')return['drift-up','pan-right','slow-pull','diagonal-drift'];
  return['slow-push','slow-pull','pan-left','pan-right','still-hold'];
}
function chooseRecipe(scene:ScenePlan,index:number,total:number,character:MotionCharacter,previous?:ShotRecipe):ShotRecipe{
  const c=candidates(scene.text,character);
  const opening=index===0?(character==='calm-care'?'slow-push':'slow-push'):undefined;
  const closing=index===total-1?'still-hold':undefined;
  const preferred=opening||closing||c[hash(scene.text+index)%c.length];
  if(preferred!==previous)return preferred;
  return c.find(x=>x!==previous)||'still-hold';
}
function reasonFor(recipe:ShotRecipe,text:string){
  if(NUMBER.test(text))return`${recipe}: giữ số liệu dễ đọc, tránh chuyển động gây nhiễu`;
  if(RISK.test(text))return`${recipe}: nhấn trọng tâm nhưng giữ camera ổn định`;
  if(EXPLAIN.test(text))return`${recipe}: dẫn mắt theo mạch giải thích`;
  if(HUMAN.test(text))return`${recipe}: ưu tiên góc nhìn con người`;
  return`${recipe}: tạo chuyển động liên tục, không lặp slideshow`;
}
function decorate(base:ScenePlan[],character:MotionCharacter):ShotCraftScene[]{
  let previous:ShotRecipe|undefined;
  return base.map((scene,index)=>{
    const recipe=chooseRecipe(scene,index,base.length,character,previous);previous=recipe;
    const position=base.length<=1?0:index/(base.length-1);
    const arc=Math.sin(position*Math.PI);
    const energy=Number(clamp((character==='energetic'?0.54:character==='calm-care'?0.28:0.38)+arc*0.28,0.2,0.82).toFixed(2));
    const holdRatio=Number(clamp(recipe==='still-hold'?0.28:NUMBER.test(scene.text)?0.22:0.14,0.12,0.3).toFixed(2));
    const transition:ShotTransition=index>0&&index%4===0?'soft-dip':'cut';
    return{...scene,shotRecipe:recipe,transition,holdRatio,energy,motionCharacter:character,reason:reasonFor(recipe,scene.text)};
  });
}
function qa(scenes:ShotCraftScene[],durationSeconds?:number):ShotCraftQa{
  const warnings:string[]=[];
  let repeats=0;for(let i=1;i<scenes.length;i++)if(scenes[i].shotRecipe===scenes[i-1].shotRecipe)repeats++;
  if(repeats)warnings.push(`${repeats} cặp cảnh lặp chuyển động liên tiếp`);
  const unique=new Set(scenes.map(x=>x.shotRecipe)).size,recipeDiversity=scenes.length?Number((unique/scenes.length).toFixed(2)):0;
  if(scenes.length>=4&&recipeDiversity<0.45)warnings.push('Độ đa dạng chuyển động thấp');
  if(scenes.some(x=>x.holdRatio<0.12))warnings.push('Có cảnh thiếu khoảng thở');
  const averageShotSeconds=durationSeconds&&scenes.length?Number((durationSeconds/scenes.length).toFixed(1)):undefined;
  if(averageShotSeconds&&averageShotSeconds<3.2)warnings.push('Nhịp cảnh quá nhanh; nên giảm số cảnh hoặc tăng thời lượng');
  if(averageShotSeconds&&averageShotSeconds>14)warnings.push('Một số cảnh có thể quá dài; cân nhắc thêm ảnh minh họa');
  return{score:clamp(100-warnings.length*9-repeats*6,0,100),warnings,averageShotSeconds,recipeDiversity};
}
export function craftShotPlan(options:ShotCraftOptions):ShotCraftPlan{
  const imageCount=Math.max(0,options.imageCount);if(!imageCount)return{version:'shotcraft-lite-v1',motionCharacter:motionCharacter(options.text,options.format,options.audience),scenes:[],qa:{score:0,warnings:['Không có media'],recipeDiversity:0},principles:[]};
  const character=motionCharacter(options.text,options.format,options.audience);
  let base=directScenes(options.text,imageCount,options.maxScenes??10);
  if(options.smartMatch!==false&&options.images?.length)base=matchImagesToScenes(base,options.images);
  const scenes=decorate(base,character);
  return{version:'shotcraft-lite-v1',motionCharacter:character,scenes,qa:qa(scenes,options.durationSeconds),principles:['mỗi cảnh một động tác chính','không lặp recipe liên tiếp','giữ khoảng thở sau thông tin chính','camera ổn định, không rung toàn khung','ưu tiên cut; soft-dip dùng tiết chế']};
}
