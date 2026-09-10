import { readFile, writeFile } from 'node:fs/promises';
import { analyzeSrtTimeline } from '../tts/studio.js';

function assTime(ms:number){const cs=Math.max(0,Math.round(ms/10)),h=Math.floor(cs/360000),m=Math.floor(cs%360000/6000),s=Math.floor(cs%6000/100),x=cs%100;return`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(x).padStart(2,'0')}`}
function clean(v:string){return v.replace(/\\/g,'／').replace(/[{}]/g,'').replace(/\r?\n/g,' ').replace(/\s+/g,' ').trim()}
function karaokeText(text:string,durationMs:number){const words=clean(text).split(/\s+/).filter(Boolean);if(!words.length)return'';const weights=words.map(w=>Math.max(1,w.replace(/[^\p{L}\p{N}]/gu,'').length)),sum=weights.reduce((a,b)=>a+b,0)||1;let used=0,lineLen=0;return words.map((w,i)=>{const raw=i===words.length-1?durationMs-used:Math.max(50,Math.round(durationMs*weights[i]/sum)),cs=Math.max(1,Math.round(raw/10));used+=raw;const sep=lineLen>38?'\\N':' ';lineLen=lineLen>38?w.length:lineLen+w.length+1;return`${i?sep:''}{\\k${cs}}${w}`}).join('')}
export async function createKaraokeAss(srtPath:string,assPath:string){
 const raw=await readFile(srtPath,'utf8'),analysis=analyzeSrtTimeline(raw);
 const header=`[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Karaoke,DejaVu Sans,18,&H0000FFFF,&H00F4F7FB,&H00101820,&H78000000,1,0,0,0,100,100,0,0,1,2,0,2,72,72,650,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
 const events=analysis.cues.map(c=>`Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Karaoke,,0,0,0,karaoke,${karaokeText(c.text,c.durationMs)}`).join('\n');
 await writeFile(assPath,header+events+'\n','utf8');return{assPath,analysis};
}
