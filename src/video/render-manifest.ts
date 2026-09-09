import { writeFile } from 'node:fs/promises';
import { shotMotionCap, type MotionLevel, type VideoScene, type VideoTemplate } from './ffmpeg.js';

export interface ShotCraftRenderManifestInput{
  outputPath:string;
  headline:string;
  template?:VideoTemplate;
  motion?:MotionLevel;
  scenes:VideoScene[];
}

export async function writeShotCraftRenderManifest(input:ShotCraftRenderManifestInput){
  const path=input.outputPath.replace(/\.mp4$/i,'-shotcraft.json');
  const motion=input.motion||'light';
  const manifest={
    schema:'vietnewsflow.shotcraft-render.v1',
    generatedAt:new Date().toISOString(),
    videoFile:input.outputPath.split('/').pop()||input.outputPath,
    headline:input.headline,
    aspectRatio:'9:16',
    frame:{width:1080,height:1920,fps:30},
    template:input.template||'classic',
    motion,
    scenes:input.scenes.map((scene,index)=>({
      index,
      imageIndex:scene.imageIndex,
      startRatio:scene.startRatio,
      endRatio:scene.endRatio,
      durationRatio:Number(Math.max(0,scene.endRatio-scene.startRatio).toFixed(4)),
      shotRecipe:scene.shotRecipe||'slow-push',
      transition:scene.transition||'cut',
      holdRatio:scene.holdRatio??.14,
      energy:scene.energy??.4,
      motionCap:shotMotionCap(motion,scene.energy??.4),
      sourceCredit:scene.sourceCredit||null
    }))
  };
  await writeFile(path,JSON.stringify(manifest,null,2),'utf8');
  return path;
}
