import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile);
export interface MediaCandidate{path:string;url?:string;manual?:boolean;width:number;height:number;area:number;aspect:number;score:number;accepted:boolean;reason:string}
async function probe(path:string){
 const {stdout}=await execFileAsync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',path],{timeout:10000,maxBuffer:1024*1024});
 const data=JSON.parse(stdout);const s=data?.streams?.[0];const width=Number(s?.width||0),height=Number(s?.height||0);if(!width||!height)throw new Error('Không đọc được kích thước ảnh');return{width,height};
}
function urlPenalty(url=''){const s=url.toLowerCase();return /logo|icon|avatar|sprite|emoji|tracking|pixel|banner|advert|quangcao|favicon/.test(s)?35:0}
export async function inspectMedia(path:string,opts:{url?:string;manual?:boolean}={}):Promise<MediaCandidate>{
 const {width,height}=await probe(path),area=width*height,aspect=Math.max(width,height)/Math.max(1,Math.min(width,height));const manual=Boolean(opts.manual);let accepted=true,reason='Ảnh đạt chuẩn';
 if(!manual&&Math.min(width,height)<180){accepted=false;reason='Cạnh ngắn dưới 180 px'}else if(!manual&&area<150000){accepted=false;reason='Diện tích ảnh dưới 150.000 px'}else if(!manual&&aspect>4.5){accepted=false;reason='Tỷ lệ ảnh quá dài/hẹp'}
 let score=Math.log10(Math.max(area,1))*20-urlPenalty(opts.url);if(width>=640&&height>=360)score+=18;if(width>=1000||height>=1000)score+=10;if(aspect<=2.2)score+=8;if(manual)score+=1000;
 return{path,url:opts.url,manual,width,height,area,aspect:Number(aspect.toFixed(2)),score:Number(score.toFixed(1)),accepted,reason};
}
export async function selectBestMedia(items:{path:string;url?:string;manual?:boolean}[],limit=10){
 const inspected:MediaCandidate[]=[];for(const item of items){try{inspected.push(await inspectMedia(item.path,item))}catch(e){inspected.push({path:item.path,url:item.url,manual:item.manual,width:0,height:0,area:0,aspect:0,score:item.manual?1000:-999,accepted:Boolean(item.manual),reason:e instanceof Error?e.message:String(e)})}}
 const selected=inspected.filter(x=>x.accepted).sort((a,b)=>b.score-a.score).slice(0,limit);return{selected,rejected:inspected.filter(x=>!x.accepted),all:inspected};
}
