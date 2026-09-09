from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly 1 match in {path}, found {count}: {old[:120]}")
    p.write_text(text.replace(old, new, 1))


ffmpeg = "src/video/ffmpeg.ts"
replace_once(
    ffmpeg,
    "export type VideoTemplate='classic'|'breaking'|'clean';export type MotionLevel='off'|'light'|'medium'|'strong';export type TickerMode='off'|'headline'|'custom';",
    "export type VideoTemplate='classic'|'breaking'|'clean';export type MotionLevel='off'|'light'|'medium'|'strong';export type TickerMode='off'|'headline'|'custom';\nexport function shotMotionCap(level:MotionLevel,energy=.4){if(level==='off')return 1;const base={light:1.045,medium:1.075,strong:1.11}[level],normalized=Math.max(0,Math.min(1,energy)),scale=Math.max(.55,Math.min(1.2,.65+normalized*.65));return Number((1+(base-1)*scale).toFixed(6))}",
)
replace_once(
    ffmpeg,
    "function imageClip(inputIndex:number,outLabel:string,mediaH:number,level:MotionLevel,duration:number,start:number,recipe:VideoScene['shotRecipe']='slow-push',transition:VideoScene['transition']='cut',holdRatio=.14){",
    "function imageClip(inputIndex:number,outLabel:string,mediaH:number,level:MotionLevel,duration:number,start:number,recipe:VideoScene['shotRecipe']='slow-push',transition:VideoScene['transition']='cut',holdRatio=.14,energy=.4){",
)
replace_once(
    ffmpeg,
    "const cfg={light:{cap:1.045},medium:{cap:1.075},strong:{cap:1.11}}[level],cap=cfg.cap,delta=(cap-1)/motionFrames,progress=`min(1,on/${motionFrames})`;",
    "const cap=shotMotionCap(level,energy),delta=(cap-1)/motionFrames,progress=`min(1,on/${motionFrames})`;",
)
replace_once(
    ffmpeg,
    "return imageClip(s.imageIndex+1,`im${i}`,mediaH,motion,Math.max(.2,end-start),start,s.shotRecipe,s.transition,s.holdRatio)",
    "return imageClip(s.imageIndex+1,`im${i}`,mediaH,motion,Math.max(.2,end-start),start,s.shotRecipe,s.transition,s.holdRatio,s.energy)",
)

job = "src/video/job.ts"
replace_once(
    job,
    "import { craftShotPlan } from './shotcraft.js';\nimport { cancelActiveFfmpeg, renderNewsVideo, type VideoTemplate, type MotionLevel, type TickerMode, type VideoScene } from './ffmpeg.js';",
    "import { craftShotPlan } from './shotcraft.js';\nimport { writeShotCraftRenderManifest } from './render-manifest.js';\nimport { cancelActiveFfmpeg, renderNewsVideo, type VideoTemplate, type MotionLevel, type TickerMode, type VideoScene } from './ffmpeg.js';",
)
replace_once(
    job,
    "channelName:input.channelName});job.progress=100;job.status='ready';",
    "channelName:input.channelName});await writeShotCraftRenderManifest({outputPath:job.output,headline:input.headline,template:input.template,motion:input.motion,scenes:scenes||[]});job.progress=100;job.status='ready';",
)

print('Phase 8.2 runtime patch applied')
