from pathlib import Path


def rep(path, old, new, count=None):
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n < 1:
        raise SystemExit(f"missing pattern in {path}: {old[:100]}")
    if count is not None and n != count:
        raise SystemExit(f"expected {count}, found {n} in {path}: {old[:100]}")
    p.write_text(s.replace(old, new))


rep('src/producer/auto.ts', "import { directScenes } from '../video/scenes.js';\nimport { matchImagesToScenes } from '../video/matching.js';", "import { craftShotPlan } from '../video/shotcraft.js';", 1)
rep('src/producer/auto.ts', "  let scenes = directScenes(`${edited.headline}. ${edited.script}`, Math.max(1, images.length));\n  if (images.length) scenes = matchImagesToScenes(scenes, images);", "  const shotPlan = craftShotPlan({text:`${edited.headline}. ${edited.script}`,imageCount:Math.max(1,images.length),images,smartMatch:true,format:input.format,audience:input.audience,durationSeconds:input.length==='auto'?undefined:Number(input.length)});\n  const scenes = shotPlan.scenes;", 1)
rep('src/producer/auto.ts', "    scenes,\n    voice,", "    scenes,\n    shotCraft:{version:shotPlan.version,motionCharacter:shotPlan.motionCharacter,qa:shotPlan.qa},\n    voice,", 1)

rep('src/video/job.ts', "import { directScenes } from './scenes.js';", "import { directScenes } from './scenes.js';\nimport { craftShotPlan } from './shotcraft.js';", 1)
rep('src/video/job.ts', "  autoCollectImages?:boolean; smartScenes?:boolean; scenes?:VideoScene[]; template?:VideoTemplate; motion?:MotionLevel;", "  autoCollectImages?:boolean; smartScenes?:boolean; shotCraft?:boolean; scenes?:VideoScene[]; template?:VideoTemplate; motion?:MotionLevel;", 1)
rep('src/video/job.ts', "scenes=(valid.length?valid:directScenes(input.text,imagePaths.length)).map(s=>({...s,sourceCredit:mediaCredit(selected[s.imageIndex]?.url,input.mediaProvenance)}))", "scenes=(valid.length?valid:(input.shotCraft===false?directScenes(input.text,imagePaths.length):craftShotPlan({text:input.text,imageCount:imagePaths.length,format:input.breaking?'breaking':'latest'}).scenes)).map(s=>({...s,sourceCredit:mediaCredit(selected[s.imageIndex]?.url,input.mediaProvenance)}))", 1)

p = Path('src/video/ffmpeg.ts')
s = p.read_text()
old = "export interface VideoScene{imageIndex:number;startRatio:number;endRatio:number;sourceCredit?:string}"
new = "export interface VideoScene{imageIndex:number;startRatio:number;endRatio:number;sourceCredit?:string;shotRecipe?:'still-hold'|'slow-push'|'slow-pull'|'pan-left'|'pan-right'|'drift-up'|'drift-down'|'diagonal-drift';transition?:'cut'|'soft-dip';holdRatio?:number;energy?:number}"
if old not in s:
    raise SystemExit('VideoScene pattern missing')
s = s.replace(old, new)
a = s.index('function imageClip(')
b = s.index('\nexport async function renderNewsVideo', a)
fn = """function imageClip(inputIndex:number,outLabel:string,mediaH:number,level:MotionLevel,duration:number,start:number,recipe:VideoScene['shotRecipe']='slow-push',transition:VideoScene['transition']='cut',holdRatio=.14){
 const pts=`setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`,frames=Math.max(1,Math.round(duration*30)),motionFrames=Math.max(1,Math.round(frames*(1-Math.max(.08,Math.min(.35,holdRatio))))),normalize=`fps=30,setsar=1,format=yuv420p,trim=duration=${duration.toFixed(3)},${pts}`,fadeDur=Math.min(.16,Math.max(.06,duration*.08)),fade=transition==='soft-dip'?`fade=t=in:st=0:d=${fadeDur.toFixed(3)},fade=t=out:st=${Math.max(0,duration-fadeDur).toFixed(3)}:d=${fadeDur.toFixed(3)},`:'';
 if(level==='off'||recipe==='still-hold')return`[${inputIndex}:v]scale=970:${mediaH}:force_original_aspect_ratio=increase,crop=970:${mediaH},${fade}${normalize}[${outLabel}]`;
 const cfg={light:{cap:1.045},medium:{cap:1.075},strong:{cap:1.11}}[level],cap=cfg.cap,delta=(cap-1)/motionFrames,progress=`min(1,on/${motionFrames})`;let z=`min(${cap.toFixed(4)},1+on*${delta.toFixed(7)})`,x=`iw/2-(iw/zoom/2)`,y=`ih/2-(ih/zoom/2)`;
 if(recipe==='slow-pull')z=`max(1,${cap.toFixed(4)}-on*${delta.toFixed(7)})`;
 if(recipe==='pan-left'){z=cap.toFixed(4);x=`(iw-iw/zoom)*(1-${progress})`}
 if(recipe==='pan-right'){z=cap.toFixed(4);x=`(iw-iw/zoom)*${progress}`}
 if(recipe==='drift-up'){z=cap.toFixed(4);y=`(ih-ih/zoom)*(1-${progress})`}
 if(recipe==='drift-down'){z=cap.toFixed(4);y=`(ih-ih/zoom)*${progress}`}
 if(recipe==='diagonal-drift'){z=cap.toFixed(4);x=`(iw-iw/zoom)*${progress}`;y=`(ih-ih/zoom)*(1-${progress})`}
 return`[${inputIndex}:v]scale=1220:${mediaH+190}:force_original_aspect_ratio=increase,crop=1220:${mediaH+190},zoompan=z='${z}':x='${x}':y='${y}':d=1:s=970x${mediaH}:fps=30,${fade}${normalize}[${outLabel}]`
}"""
s = s[:a] + fn + s[b:]
oldcall = "return imageClip(s.imageIndex+1,`im${i}`,mediaH,motion,Math.max(.2,end-start),start)"
newcall = "return imageClip(s.imageIndex+1,`im${i}`,mediaH,motion,Math.max(.2,end-start),start,s.shotRecipe,s.transition,s.holdRatio)"
if oldcall not in s:
    raise SystemExit('imageClip call pattern missing')
p.write_text(s.replace(oldcall, newcall))

rep('src/server.ts', "import { matchImagesToScenes } from './video/matching.js';", "import { matchImagesToScenes } from './video/matching.js';\nimport { craftShotPlan } from './video/shotcraft.js';", 1)
rep('src/server.ts', "smartSceneMatching:true,visualMetadata:true", "smartSceneMatching:true,shotCraftLite:true,shotCraftRecipes:8,shotCraftFfmpeg:true,visualMetadata:true", 1)
oldroute = "app.post('/api/scene-plan',(q,r)=>{const Image=z.object({url:z.string().url(),label:z.string().max(1000).optional(),score:z.number().optional()});const p=z.object({text:z.string().min(20).max(12000),imageCount:z.number().int().min(1).max(10).optional(),images:z.array(Image).max(10).optional(),smartMatch:z.boolean().default(true)}).safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Dữ liệu Scene Studio không hợp lệ'});const count=p.data.images?.length||p.data.imageCount||0;if(!count)return r.status(400).json({error:'Scene Studio cần ít nhất một ảnh'});let scenes=directScenes(p.data.text,count);if(p.data.smartMatch&&p.data.images?.length)scenes=matchImagesToScenes(scenes,p.data.images);return r.json({scenes,imageCount:count,smartMatched:Boolean(p.data.smartMatch&&p.data.images?.length),metadataAware:Boolean(p.data.images?.some(x=>x.label&&!/^Ảnh \\d+$/.test(x.label)))})});"
newroute = "app.post('/api/scene-plan',(q,r)=>{const Image=z.object({url:z.string().url(),label:z.string().max(1000).optional(),score:z.number().optional()});const p=z.object({text:z.string().min(20).max(12000),imageCount:z.number().int().min(1).max(10).optional(),images:z.array(Image).max(10).optional(),smartMatch:z.boolean().default(true),shotCraft:z.boolean().default(true),format:z.enum(['breaking','latest','standard']).default('latest'),audience:z.enum(['general','medical','investor','patient','social']).default('general'),durationSeconds:z.number().min(10).max(300).optional()}).safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Dữ liệu Scene Studio không hợp lệ'});const count=p.data.images?.length||p.data.imageCount||0;if(!count)return r.status(400).json({error:'Scene Studio cần ít nhất một ảnh'});if(p.data.shotCraft){const plan=craftShotPlan({text:p.data.text,imageCount:count,images:p.data.images,smartMatch:p.data.smartMatch,format:p.data.format,audience:p.data.audience,durationSeconds:p.data.durationSeconds});return r.json({scenes:plan.scenes,imageCount:count,smartMatched:Boolean(p.data.smartMatch&&p.data.images?.length),metadataAware:Boolean(p.data.images?.some(x=>x.label&&!/^Ảnh \\d+$/.test(x.label))),shotCraft:{version:plan.version,motionCharacter:plan.motionCharacter,qa:plan.qa,principles:plan.principles}})}let scenes=directScenes(p.data.text,count);if(p.data.smartMatch&&p.data.images?.length)scenes=matchImagesToScenes(scenes,p.data.images);return r.json({scenes,imageCount:count,smartMatched:Boolean(p.data.smartMatch&&p.data.images?.length),metadataAware:Boolean(p.data.images?.some(x=>x.label&&!/^Ảnh \\d+$/.test(x.label))),shotCraft:null})});"
rep('src/server.ts', oldroute, newroute, 1)
rep('src/server.ts', "const Scene=z.object({imageIndex:z.number().int().min(0).max(9),startRatio:z.number().min(0).max(1),endRatio:z.number().min(0).max(1)});", "const Scene=z.object({imageIndex:z.number().int().min(0).max(9),startRatio:z.number().min(0).max(1),endRatio:z.number().min(0).max(1),shotRecipe:z.enum(['still-hold','slow-push','slow-pull','pan-left','pan-right','drift-up','drift-down','diagonal-drift']).optional(),transition:z.enum(['cut','soft-dip']).optional(),holdRatio:z.number().min(0).max(.5).optional(),energy:z.number().min(0).max(1).optional()});", 1)
rep('src/server.ts', "smartScenes:z.boolean().default(true),scenes:z.array(Scene).max(10).default([])", "smartScenes:z.boolean().default(true),shotCraft:z.boolean().default(true),scenes:z.array(Scene).max(10).default([])", 1)
rep('src/server.ts', "smartScenes:p.data.smartScenes,scenes:p.data.scenes", "smartScenes:p.data.smartScenes,shotCraft:p.data.shotCraft,scenes:p.data.scenes", 2)

p = Path('public/scene-studio.js')
s = p.read_text()

def rr(old, new):
    global s
    if old not in s:
        raise SystemExit('scene-studio missing: ' + old[:100])
    s = s.replace(old, new)

rr("body.smartScenes=$('smartScenes')?.checked!==false;if(body.smartScenes&&scenes.length)body.scenes=scenes.map(s=>({imageIndex:s.imageIndex,startRatio:s.startRatio,endRatio:s.endRatio}));", "body.smartScenes=$('smartScenes')?.checked!==false;body.shotCraft=$('shotCraft')?.checked!==false;if(body.smartScenes&&scenes.length)body.scenes=scenes.map(s=>({imageIndex:s.imageIndex,startRatio:s.startRatio,endRatio:s.endRatio,shotRecipe:s.shotRecipe,transition:s.transition,holdRatio:s.holdRatio,energy:s.energy}));")
rr("<label style=\"display:flex;gap:8px;align-items:center\"><input id=\"smartMatch\" type=\"checkbox\" checked style=\"width:auto\"> ✨ Ghép ảnh thông minh</label><button id=\"scenePlanBtn\" class=\"secondary\">✨ PHÂN TÍCH & GHÉP ẢNH</button>", "<label style=\"display:flex;gap:8px;align-items:center\"><input id=\"smartMatch\" type=\"checkbox\" checked style=\"width:auto\"> ✨ Ghép ảnh thông minh</label><label style=\"display:flex;gap:8px;align-items:center\"><input id=\"shotCraft\" type=\"checkbox\" checked style=\"width:auto\"> 🎥 ShotCraft Lite — vận máy điện ảnh</label><button id=\"scenePlanBtn\" class=\"secondary\">✨ PHÂN TÍCH & GHÉP ẢNH</button>")
rr("post('/api/scene-plan',{text,images,smartMatch:$('smartMatch')?.checked!==false})", "post('/api/scene-plan',{text,images,smartMatch:$('smartMatch')?.checked!==false,shotCraft:$('shotCraft')?.checked!==false})")
rr("${x.smartMatched?'Smart Match':'ghép tuần tự'}`", "${x.smartMatched?'Smart Match':'ghép tuần tự'} • ${x.shotCraft?.version?'ShotCraft Lite '+x.shotCraft.qa.score+'/100':'Scene cơ bản'}`")
rr("const pct=Math.round((s.endRatio-s.startRatio)*100),match=typeof s.matchScore==='number'?` • Khớp ${Math.round(s.matchScore)}`:'';info.innerHTML=`<div><b>Cảnh ${i+1}</b> • <span class=\"score\">${pct}%${match}</span></div>", "const pct=Math.round((s.endRatio-s.startRatio)*100),match=typeof s.matchScore==='number'?` • Khớp ${Math.round(s.matchScore)}`:'',motion=s.shotRecipe?` • 🎥 ${s.shotRecipe}`:'';info.innerHTML=`<div><b>Cảnh ${i+1}</b> • <span class=\"score\">${pct}%${match}${motion}</span></div>")
rr("get scenes(){return scenes.map(s=>({imageIndex:s.imageIndex,startRatio:s.startRatio,endRatio:s.endRatio}))}", "get scenes(){return scenes.map(s=>({imageIndex:s.imageIndex,startRatio:s.startRatio,endRatio:s.endRatio,shotRecipe:s.shotRecipe,transition:s.transition,holdRatio:s.holdRatio,energy:s.energy}))},get shotCraft(){return $('shotCraft')?.checked!==false}")
p.write_text(s)

print('ShotCraft Lite integration script completed')
