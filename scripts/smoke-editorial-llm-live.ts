import { config } from 'dotenv';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const envFile=process.env.EDITORIAL_LIVE_ENV_FILE?.trim();
if(envFile)config({path:envFile,override:false});
const configured=Boolean(process.env.GEMINI_API_KEY?.trim()||(process.env.AI_API_URL?.trim()&&process.env.AI_API_KEY?.trim()&&process.env.AI_MODEL?.trim())||(/^true$/i.test(process.env.OLLAMA_ENABLED||'')&&process.env.OLLAMA_MODEL?.trim()));
if(!configured){console.error('Editorial live LLM smoke skipped: no configured provider');process.exit(2)}
const dir=mkdtempSync(join(tmpdir(),'editorial-live-'));
process.env.DB_PATH=join(dir,'live.sqlite');
const {editNews,aiEditorStatus}=await import('../src/ai/editor.js');
const facts:any[]=[
 {kind:'event',text:'Cơ quan y tế triển khai hệ thống cảnh báo sớm để rút ngắn thời gian phát hiện sự cố sức khỏe cộng đồng.',confidence:.98,corroboratedBy:2,support:'corroborated'},
 {kind:'number',text:'Hệ thống thí điểm tại 12 địa phương và yêu cầu báo cáo tín hiệu bất thường trong vòng 24 giờ.',confidence:.97,corroboratedBy:1,support:'corroborated'},
 {kind:'effect',text:'Mục tiêu là giúp cơ quan chuyên môn đánh giá và phản ứng sớm hơn khi xuất hiện tín hiệu cần xác minh.',confidence:.94,corroboratedBy:1,support:'corroborated'},
 {kind:'advice',text:'Người dân được khuyến cáo theo dõi thông báo từ cơ quan y tế chính thức và đi khám khi có triệu chứng bất thường.',confidence:.96,corroboratedBy:1,support:'corroborated'}
];
const edited=await editNews({title:'Thí điểm hệ thống cảnh báo sớm y tế',body:facts.map(x=>x.text).join(' '),sourceName:'Nguồn chính thức',length:'auto',ownerId:'live-smoke',facts,sourceScore:96,audience:'general'});
const meta:any=edited.editorial;
if(!meta||meta.phase!=='7.7-professional')throw new Error(`Editorial Professional V2 metadata missing or stale: ${String(meta?.phase||'none')}`);
const requireProvider=/^true$/i.test(process.env.EDITORIAL_LIVE_REQUIRE_PROVIDER||'');
if(edited.provider==='rules'&&requireProvider)throw new Error('Configured LLM provider was not used for final polish');
if(meta.quality?.missingMandatory?.length)throw new Error('LLM polish lost mandatory claims');
if(!/[.!?]$/.test(edited.script)||edited.script.endsWith('…'))throw new Error('LLM script ending is incomplete');
const status=aiEditorStatus();
console.log(edited.provider==='rules'?'Editorial Professional V2 live LLM smoke DEGRADED-SAFE':'Editorial Professional V2 live LLM smoke OK',JSON.stringify({phase:meta.phase,provider:edited.provider,model:status.providers.find((x:any)=>x.id===edited.provider)?.model||'configured',hookStrategy:meta.hookStudio?.selected?.strategy,quality:meta.quality?.score,duration:edited.estimatedSeconds,storyId:Boolean(meta.storyId),degradedSafe:Boolean(meta.generation?.degradedSafe)}));
rmSync(dir,{recursive:true,force:true});
