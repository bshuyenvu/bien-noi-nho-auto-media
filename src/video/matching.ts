import type { ScenePlan } from './scenes.js';
export interface SceneImage{url:string;label?:string;score?:number}
const STOP=new Set('và là của có các một những được cho với trong trên tại từ về này đó khi đã sẽ đang vào ra theo như để bởi nhưng hay hoặc thì mà cũng rất hơn nhất tin mới nguồn'.split(' '));
function words(text:string){return text.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').match(/[a-z0-9]{3,}/g)?.filter(x=>!STOP.has(x))||[]}
function tokens(text:string){return new Set(words(text))}
function urlText(url:string){try{const u=new URL(url);return decodeURIComponent(`${u.hostname} ${u.pathname} ${u.searchParams.get('alt')||''} ${u.searchParams.get('title')||''}`).replace(/[-_/+.=?&%0-9]+/g,' ')}catch{return url}}
function similarity(scene:string,image:string){const a=tokens(scene),b=tokens(image);if(!a.size||!b.size)return 0;let hit=0;for(const x of a)if(b.has(x))hit++;return hit/Math.sqrt(a.size*b.size)}
export function matchImagesToScenes(scenes:ScenePlan[],images:SceneImage[]){if(!images.length)return scenes;const used=new Map<number,number>();return scenes.map((scene,i)=>{let best=i%images.length,bestScore=-1;images.forEach((img,index)=>{const semantic=similarity(scene.text,`${img.label||''} ${urlText(img.url)}`),reuse=used.get(index)||0,quality=Math.max(0,Math.min(1,(img.score||0)/160));const score=semantic*100+quality*8-reuse*12;if(score>bestScore){best=index;bestScore=score}});used.set(best,(used.get(best)||0)+1);return{...scene,imageIndex:best,matchScore:Number(Math.max(0,bestScore).toFixed(1))}})}
