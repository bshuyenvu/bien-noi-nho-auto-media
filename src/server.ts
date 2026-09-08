import 'dotenv/config';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { enqueueRender,renderJobs } from './video/job.js';
import { directScenes } from './video/scenes.js';
import { matchImagesToScenes } from './video/matching.js';
import { importArticleFromUrl } from './import/url.js';
import { analyzeMediaStudio } from './media/studio.js';
import { testVisionConnection,visionConfigStatus } from './media/vision-test.js';
import { prepareAutoNews } from './producer/auto.js';
import { getReview,setReview,canRender } from './review/store.js';
import { ensureQueueItem,setQueueStatus,productionQueue,syncRenderJobs } from './queue/production.js';
import { addRssSource,rssItems,rssSources,scanAllRss,scanRssSource } from './rss/manager.js';
import { rssAdminRouter } from './rss/routes.js';
import { migrateGoogleNewsRss } from './rss/curator.js';
import { createAdminRouter,syncDraftStatuses } from './admin/routes.js';
import { all,run } from './storage/db.js';
import { aiEditorStatus,editNews,testAiEditor } from './ai/editor.js';
import { VOICE_CATALOG,VOICE_STYLES,VIETNAMESE_VOICE_TEST,generateSpeech,isVoiceId,isVoiceStyle } from './tts/edge.js';
import { castVietnameseVoice } from './tts/casting.js';
import { createAutoPilot } from './autopilot/controller.js';
import { accountRouter } from './auth/routes.js';
import { accessOf, authMiddleware, authStatus, defaultChannelName, requireAccess } from './auth/access.js';
import { assertRenderAllowed,planUsage } from './billing/plans.js';

const app=express();
app.use(express.json({limit:'1mb'}));
app.use(authMiddleware);
const PORT=Number(process.env.PORT||8787);
migrateGoogleNewsRss();

app.get('/health',(_q,r)=>r.json({ok:true,service:'vietnewsflow-ai',productName:'VietNewsFlow AI',version:'6.2.0',ttsProvider:process.env.VIENEU_TTS_ENABLED==='true'?'VieNeu v3 local (Edge fallback)':'Edge TTS',vieneu:{enabled:process.env.VIENEU_TTS_ENABLED==='true',mode:process.env.VIENEU_MODE||'v3nano',license:'Apache-2.0'},directRssOnly:true,adminUnlimited:true,memberRssWorkspace:true,mode:'self-hosted',storage:'sqlite',clerkAuth:authStatus.clerkEnabled,multiAccount:true,tenantIsolation:true,planQuotas:{freeTotal:3,starterDaily:10,proDaily:24},paidPlanApiRequired:true,supportZalo:'0917024015',channelBranding:true,hashedApiKeys:true,plans:['free','starter','pro'],aiEditor:aiEditorStatus(),stabilitySync:true,apiJsonGuard:true,managedRssPool:true,rssLocking:true,trustedSourceRotation:true,healthPriority:true,evidenceAwareHealth:true,professionalHooks:true,foreignCorroboration:true,headlineTtsDedup:true,autopilot:true,unattendedPipeline:true,continuousRender:true,queueWatchdog:true,unifiedBackend:true,mediaPlayback:true,reviewRecovery:true,autoProducer:true,reviewGate:true,productionQueue:true,stableControl:true,rssAdmin:true,rssEditDelete:true,themePreview:true,publishDate:true,publishDateFormat:'dd/mm/yyyy',voices:VOICE_CATALOG.length,voiceDirector:Object.keys(VOICE_STYLES),autoVoiceCasting:true,sceneDirector:true,sceneStudio:true,customSceneMapping:true,smartSceneMatching:true,visualMetadata:true,metadataAwareMatching:true,aiVision:{...visionConfigStatus(),testConnection:true},motion:['off','light','medium','strong'],ticker:['off','headline','custom'],media:{images:10,transition:'smart-scenes',autoCollect:true,smartSelector:true,studio:true,metadata:true,vision:true,minShortSide:180,minArea:150000,maxAspect:4.5}}));
app.get('/api/public-config',(_q,r)=>r.json({productName:'VietNewsFlow AI',clerkEnabled:authStatus.clerkEnabled,clerkPublishableKey:authStatus.clerkEnabled?process.env.CLERK_PUBLISHABLE_KEY:null}));
app.use('/api',requireAccess);
app.use('/api',accountRouter);
app.use('/api',rssAdminRouter);
app.use('/output',express.static('output',{fallthrough:false,maxAge:'1h'}));
app.use(express.static('public'));

app.get('/api/vision/status',(_q,r)=>r.json(visionConfigStatus()));
app.post('/api/vision/test',async(_q,r)=>r.json(await testVisionConnection()));
app.get('/api/ai/status',(_q,r)=>r.json(aiEditorStatus()));
app.post('/api/ai/test',async(_q,r)=>r.json(await testAiEditor()));
app.post('/api/auto-producer',async(q,r)=>{const p=z.object({url:z.string().url(),length:z.enum(['30','60','90']).default('60'),format:z.enum(['breaking','latest','standard']).default('latest')}).safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Dữ liệu Auto Producer không hợp lệ'});try{return r.json(await prepareAutoNews(p.data))}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)})}});

const NewsDraft=z.object({title:z.string().min(5).max(180),sourceUrl:z.string().url().optional(),sourceName:z.string().max(120).optional(),imageUrl:z.string().url().optional(),body:z.string().min(20).max(10000),format:z.enum(['breaking','latest','standard']).default('latest')});
type Draft=z.infer<typeof NewsDraft>&{id:string;ownerId:string;status:'draft'|'approved'|'rendering'|'ready'|'failed';createdAt:string};
type DraftRow={id:string;owner_id:string;title:string;body:string;source_url?:string;source_name?:string;image_url?:string;format:'breaking'|'latest'|'standard';status:Draft['status'];created_at:string};
const drafts:Draft[]=all<DraftRow>('SELECT * FROM drafts ORDER BY created_at DESC').map(r=>({id:r.id,ownerId:r.owner_id||'legacy-admin',title:r.title,body:r.body,sourceUrl:r.source_url||undefined,sourceName:r.source_name||undefined,imageUrl:r.image_url||undefined,format:r.format,status:r.status,createdAt:r.created_at}));
function saveDraft(d:Draft){run('INSERT INTO drafts(id,owner_id,title,body,source_url,source_name,image_url,format,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,source_url=excluded.source_url,source_name=excluded.source_name,image_url=excluded.image_url,format=excluded.format,status=excluded.status',d.id,d.ownerId,d.title,d.body,d.sourceUrl||null,d.sourceName||null,d.imageUrl||null,d.format,d.status,d.createdAt)}
function ownDraft(res:express.Response,id:string){const access=accessOf(res);return drafts.find(x=>x.id===id&&x.ownerId===access.accountId)}
function ownDrafts(res:express.Response){const access=accessOf(res);return drafts.filter(x=>x.ownerId===access.accountId)}
const recoveredLocks={script:true,media:true,voice:true,scenes:true};
for(const d of drafts){ensureQueueItem(d.id,d.title);if(d.status==='approved'||d.status==='ready')setReview(d.id,{status:'approved',locks:recoveredLocks})}
syncDraftStatuses(drafts);
const autopilot=createAutoPilot({drafts,saveDraft});
app.use('/api',createAdminRouter(drafts));
const AutoPilotConfig=z.object({enabled:z.boolean().optional(),intervalMinutes:z.number().int().min(2).max(1440).optional(),length:z.enum(['30','60','90']).optional(),format:z.enum(['breaking','latest','standard']).optional(),template:z.enum(['classic','breaking','clean']).optional(),motion:z.enum(['off','light','medium','strong']).optional(),maxPerDay:z.number().int().min(1).max(200).optional()});
app.get('/api/autopilot',(_q,r)=>r.json(autopilot.status()));
app.put('/api/autopilot',(q,r)=>{const p=AutoPilotConfig.safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Cấu hình Autopilot không hợp lệ'});return r.json(autopilot.update(p.data))});
app.post('/api/autopilot/run',async(_q,r)=>r.json(await autopilot.tick(true)));

app.post('/api/import-url',async(q,r)=>{const p=z.object({url:z.string().url(),length:z.enum(['30','60','90']).default('60'),autoEdit:z.boolean().default(true)}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'URL hoặc thời lượng không hợp lệ'});try{const article=await importArticleFromUrl(p.data.url);if(!p.data.autoEdit)return r.json(article);const edited=await editNews({title:article.title,body:article.body,sourceName:article.sourceName,length:p.data.length});return r.json({...article,originalTitle:article.title,originalBody:article.body,title:edited.headline,body:edited.script,edited})}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)})}});
app.post('/api/media-studio',async(q,r)=>{const p=z.object({sourceUrl:z.string().url().optional(),imageUrl:z.string().url().optional(),imageUrls:z.array(z.string().url()).max(9).default([])}).safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Danh sách ảnh không hợp lệ'});try{return r.json(await analyzeMediaStudio(p.data))}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)})}});
app.post('/api/scene-plan',(q,r)=>{const Image=z.object({url:z.string().url(),label:z.string().max(1000).optional(),score:z.number().optional()});const p=z.object({text:z.string().min(20).max(12000),imageCount:z.number().int().min(1).max(10).optional(),images:z.array(Image).max(10).optional(),smartMatch:z.boolean().default(true)}).safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Dữ liệu Scene Studio không hợp lệ'});const count=p.data.images?.length||p.data.imageCount||0;if(!count)return r.status(400).json({error:'Scene Studio cần ít nhất một ảnh'});let scenes=directScenes(p.data.text,count);if(p.data.smartMatch&&p.data.images?.length)scenes=matchImagesToScenes(scenes,p.data.images);return r.json({scenes,imageCount:count,smartMatched:Boolean(p.data.smartMatch&&p.data.images?.length),metadataAware:Boolean(p.data.images?.some(x=>x.label&&!/^Ảnh \d+$/.test(x.label)))})});
app.post('/api/ai-edit',async(q,r)=>{const p=z.object({title:z.string().min(5).max(180),body:z.string().min(20).max(10000),sourceName:z.string().max(120).optional(),length:z.enum(['30','60','90']).default('60')}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'Dữ liệu biên tập không hợp lệ'});try{return r.json(await editNews(p.data))}catch(e){return r.status(500).json({error:e instanceof Error?e.message:String(e)})}});
app.get('/api/templates',(_q,r)=>r.json([{id:'classic',name:'Newsroom Blue'},{id:'breaking',name:'Breaking Red'},{id:'clean',name:'Ocean Clean'}]));
app.get('/api/voices',(_q,r)=>r.json(VOICE_CATALOG));
app.get('/api/voice-styles',(_q,r)=>r.json(Object.entries(VOICE_STYLES).map(([id,v])=>({id,...v}))));
app.post('/api/voice-cast',(q,r)=>{const p=z.object({title:z.string().min(1).max(180),text:z.string().min(1).max(10000),format:z.enum(['breaking','latest','standard']).default('latest')}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'Nội dung casting không hợp lệ'});return r.json(castVietnameseVoice(p.data))});
app.post('/api/voice-preview',async(q,r)=>{const p=z.object({voice:z.string(),style:z.string().default('news'),rate:z.enum(['-20%','-10%','+0%','+10%','+20%']).default('+0%'),text:z.string().min(5).max(400).optional()}).safeParse(q.body||{});if(!p.success||!isVoiceId(p.data.voice)||!isVoiceStyle(p.data.style))return r.status(400).json({error:'Giọng hoặc phong cách không hợp lệ'});try{const name=`voice-preview-${p.data.voice}-${Date.now()}.mp3`;await generateSpeech({text:p.data.text?.trim()||VIETNAMESE_VOICE_TEST,audioPath:`output/${name}`,voice:p.data.voice,rate:p.data.rate,style:p.data.style});return r.json({ok:true,output:name,voice:p.data.voice,style:p.data.style})}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)})}});

app.get('/api/rss-sources',(_q,r)=>r.json(rssSources.filter(x=>x.ownerId===accessOf(r).accountId)));
app.post('/api/rss-sources',(q,r)=>{const p=z.object({url:z.string().url(),name:z.string().max(120).optional()}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'RSS URL không hợp lệ'});try{return r.status(201).json(addRssSource({...p.data,ownerId:accessOf(r).accountId,locked:true,managed:false}))}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)})}});
app.post('/api/rss-sources/:id/scan',async(q,r)=>{const ownerId=accessOf(r).accountId,s=rssSources.find(x=>x.id===q.params.id&&x.ownerId===ownerId);if(!s)return r.status(404).json({error:'RSS source not found'});try{return r.json(await scanRssSource(s))}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)})}});
app.post('/api/rss-scan-all',async(_q,r)=>r.json(await scanAllRss(accessOf(r).accountId)));
app.get('/api/rss-items',(_q,r)=>r.json(rssItems.filter(x=>x.ownerId===accessOf(r).accountId).slice(0,100)));

app.get('/api/drafts',(_q,r)=>{syncDraftStatuses(drafts);return r.json(ownDrafts(r))});
app.post('/api/drafts',(q,r)=>{const p=NewsDraft.safeParse(q.body);if(!p.success)return r.status(400).json({error:p.error.flatten()});const d:Draft={...p.data,id:crypto.randomUUID(),ownerId:accessOf(r).accountId,status:'draft',createdAt:new Date().toISOString()};drafts.unshift(d);saveDraft(d);ensureQueueItem(d.id,d.title);return r.status(201).json({...d,review:getReview(d.id)})});
const ReviewPayload=z.object({status:z.enum(['needs_review','needs_fix','approved','ready']),locks:z.object({script:z.boolean(),media:z.boolean(),voice:z.boolean(),scenes:z.boolean()})});
app.get('/api/drafts/:id/review',(q,r)=>{const d=ownDraft(r,q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});return r.json({review:getReview(d.id)})});
app.post('/api/drafts/:id/review',(q,r)=>{const d=ownDraft(r,q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});const p=ReviewPayload.safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Dữ liệu duyệt không hợp lệ'});const review=setReview(d.id,p.data);if(review.status==='approved'||review.status==='ready'){d.status='approved';setQueueStatus(d.id,'approved')}else{if(d.status==='approved')d.status='draft';setQueueStatus(d.id,'waiting_review')}saveDraft(d);return r.json({draft:d,review})});
app.post('/api/drafts/:id/approve',(q,r)=>{const d=ownDraft(r,q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});const locks={script:true,media:true,voice:true,scenes:true};const review=setReview(d.id,{status:'approved',locks});d.status='approved';saveDraft(d);setQueueStatus(d.id,'approved');return r.json({...d,review})});

app.get('/api/production-queue',(_q,r)=>{syncDraftStatuses(drafts);syncRenderJobs(renderJobs);const ids=new Set(ownDrafts(r).map(x=>x.id));return r.json(productionQueue().filter(x=>ids.has(x.draftId)))});
app.get('/api/render-jobs',(_q,r)=>{syncDraftStatuses(drafts);return r.json(renderJobs.filter(x=>x.ownerId===accessOf(r).accountId))});
app.post('/api/drafts/:id/render',(q,r)=>{const d=ownDraft(r,q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});try{assertRenderAllowed(accessOf(r))}catch(e:any){return r.status(402).json({error:e.message,code:e.code||'QUOTA_EXCEEDED',usage:planUsage(accessOf(r))})}if(!canRender(d.id))return r.status(409).json({error:'Bản tin chưa hoàn tất Review: cần khóa Kịch bản, Ảnh, Giọng đọc và Scene rồi duyệt trước khi render'});const Scene=z.object({imageIndex:z.number().int().min(0).max(9),startRatio:z.number().min(0).max(1),endRatio:z.number().min(0).max(1)});const p=z.object({voiceMode:z.enum(['auto','manual']).default('manual'),voice:z.string().default('vi-male'),voiceRate:z.enum(['-20%','-10%','+0%','+10%','+20%']).default('+0%'),voiceStyle:z.string().default('news'),template:z.enum(['classic','breaking','clean']).optional(),motion:z.enum(['off','light','medium','strong']).default('light'),tickerMode:z.enum(['off','headline','custom']).default('headline'),tickerText:z.string().max(500).optional(),tickerSpeed:z.number().min(35).max(180).default(85),imageUrls:z.array(z.string().url()).max(9).default([]),autoCollectImages:z.boolean().default(true),smartScenes:z.boolean().default(true),scenes:z.array(Scene).max(10).default([])}).safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Tùy chọn render không hợp lệ'});let voice=p.data.voice,voiceStyle=p.data.voiceStyle;if(p.data.voiceMode==='auto'){const cast=castVietnameseVoice({title:d.title,text:d.body,format:d.format});voice=cast.voice;voiceStyle=cast.style}if(!isVoiceId(voice)||!isVoiceStyle(voiceStyle))return r.status(400).json({error:'Giọng hoặc phong cách không hợp lệ'});d.status='rendering';saveDraft(d);setQueueStatus(d.id,'rendering');const job=enqueueRender({draftId:d.id,ownerId:accessOf(r).accountId,text:d.body,headline:d.title,source:d.sourceName,sourceUrl:d.sourceUrl,breaking:d.format==='breaking',voice,voiceRate:p.data.voiceRate,voiceStyle,imageUrl:d.imageUrl,imageUrls:p.data.imageUrls,autoCollectImages:p.data.autoCollectImages,smartScenes:p.data.smartScenes,scenes:p.data.scenes,template:p.data.template,motion:p.data.motion,tickerMode:p.data.tickerMode,tickerText:p.data.tickerText,tickerSpeed:p.data.tickerSpeed,channelName:defaultChannelName(accessOf(r).accountId)});setQueueStatus(d.id,'rendering',{jobId:job.id});return r.status(202).json(job)});

app.use('/api',(q,r)=>r.status(404).json({error:`API endpoint không tồn tại: ${q.method} ${q.originalUrl}`,code:'API_NOT_FOUND',version:'6.2.0'}));

app.get('/',async(_q,r)=>{try{const html=await readFile('public/app.html','utf8');const v='6.2.0';const scripts=`<script src="/account.js?v=${v}"></script><script src="/ai-provider.js?v=${v}"></script><script src="/compat-fixes.js?v=${v}"></script><script src="/scene-studio.js?v=${v}"></script><script src="/producer.js?v=${v}"></script><script src="/review.js?v=${v}"></script><script src="/queue.js?v=${v}"></script><script src="/theme-studio.js?v=${v}"></script><script src="/rss-admin.js?v=${v}"></script><script src="/system-dashboard.js?v=${v}" data-system-dashboard="1"></script><script src="/content-admin.js?v=${v}" data-content-admin="1"></script><script src="/render-monitor.js?v=${v}"></script><script src="/workflow-shell.js?v=${v}"></script><script src="/autopilot.js?v=${v}"></script><script src="/workflow-assistant.js?v=${v}"></script>`;r.set('Cache-Control','no-store');r.type('html').send(html.replace('</body>',scripts+'</body>'))}catch{r.status(500).send('Dashboard unavailable')}});
app.listen(PORT,'0.0.0.0',()=>console.log(`VietNewsFlow AI V6.2.0 running on :${PORT}`));
