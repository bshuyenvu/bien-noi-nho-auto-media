import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { enqueueRender, renderJobs } from './video/job.js';
import { importArticleFromUrl } from './import/url.js';
import { addRssSource, rssItems, rssSources, scanAllRss, scanRssSource } from './rss/manager.js';
import { all, run } from './storage/db.js';
import { editNews } from './ai/editor.js';

const app=express();app.use(express.json({limit:'1mb'}));const PORT=Number(process.env.PORT||8787);const API_KEY=process.env.RENDER_API_KEY;
function requireApiKey(req:express.Request,res:express.Response,next:express.NextFunction){if(!API_KEY)return next();const token=req.header('authorization')?.replace(/^Bearer\s+/i,'');if(token!==API_KEY)return res.status(401).json({error:'Unauthorized'});next();}
app.get('/health',(_q,r)=>r.json({ok:true,service:'bien-noi-nho-auto-media',version:'1.5.0',mode:'self-hosted',storage:'sqlite',ai:process.env.AI_API_URL&&process.env.AI_API_KEY&&process.env.AI_MODEL?'llm+local-fallback':'local-editor',templates:['classic','breaking','clean']}));
app.use('/api',requireApiKey);app.use('/output',requireApiKey,express.static('output',{fallthrough:false,maxAge:'1h'}));app.use(express.static('public'));
const NewsDraft=z.object({title:z.string().min(5).max(180),sourceUrl:z.string().url().optional(),sourceName:z.string().max(120).optional(),imageUrl:z.string().url().optional(),body:z.string().min(20).max(10000),format:z.enum(['breaking','latest','standard']).default('latest')});
type Draft=z.infer<typeof NewsDraft>&{id:string;status:'draft'|'approved'|'rendering'|'ready'|'failed';createdAt:string};
type DraftRow={id:string;title:string;body:string;source_url?:string;source_name?:string;image_url?:string;format:'breaking'|'latest'|'standard';status:Draft['status'];created_at:string};
const drafts:Draft[]=all<DraftRow>('SELECT * FROM drafts ORDER BY created_at DESC').map(r=>({id:r.id,title:r.title,body:r.body,sourceUrl:r.source_url||undefined,sourceName:r.source_name||undefined,imageUrl:r.image_url||undefined,format:r.format,status:r.status==='rendering'?'failed':r.status,createdAt:r.created_at}));
for(const d of drafts)if(d.status==='failed')run("UPDATE drafts SET status='failed' WHERE id=?",d.id);
function saveDraft(d:Draft){run('INSERT INTO drafts(id,title,body,source_url,source_name,image_url,format,status,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,source_url=excluded.source_url,source_name=excluded.source_name,image_url=excluded.image_url,format=excluded.format,status=excluded.status',d.id,d.title,d.body,d.sourceUrl||null,d.sourceName||null,d.imageUrl||null,d.format,d.status,d.createdAt);}

app.post('/api/import-url',async(q,r)=>{const p=z.object({url:z.string().url()}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'URL không hợp lệ'});try{return r.json(await importArticleFromUrl(p.data.url));}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)});}});
app.post('/api/ai-edit',async(q,r)=>{const p=z.object({title:z.string().min(5).max(180),body:z.string().min(20).max(10000),sourceName:z.string().max(120).optional(),length:z.enum(['30','60','90']).default('60')}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'Dữ liệu biên tập không hợp lệ'});try{return r.json(await editNews(p.data));}catch(e){return r.status(500).json({error:e instanceof Error?e.message:String(e)});}});
app.get('/api/templates',(_q,r)=>r.json([{id:'classic',name:'Classic News',description:'Bản tin chuẩn, nhãn đỏ và ảnh lớn.'},{id:'breaking',name:'Breaking News',description:'Nhấn mạnh tin nóng với header đỏ.'},{id:'clean',name:'Clean Blue',description:'Tối giản, hiện đại, ưu tiên hình ảnh.'}]));
app.get('/api/rss-sources',(_q,r)=>r.json(rssSources));
app.post('/api/rss-sources',(q,r)=>{const p=z.object({url:z.string().url(),name:z.string().max(120).optional()}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'RSS URL không hợp lệ'});try{return r.status(201).json(addRssSource(p.data));}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)});}});
app.post('/api/rss-sources/:id/scan',async(q,r)=>{const s=rssSources.find(x=>x.id===q.params.id);if(!s)return r.status(404).json({error:'RSS source not found'});try{return r.json(await scanRssSource(s));}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)});}});
app.post('/api/rss-scan-all',async(_q,r)=>r.json(await scanAllRss()));app.get('/api/rss-items',(_q,r)=>r.json(rssItems.slice(0,100)));
app.get('/api/drafts',(_q,r)=>r.json(drafts));
app.post('/api/drafts',(q,r)=>{const p=NewsDraft.safeParse(q.body);if(!p.success)return r.status(400).json({error:p.error.flatten()});const d:Draft={...p.data,id:crypto.randomUUID(),status:'draft',createdAt:new Date().toISOString()};drafts.unshift(d);saveDraft(d);return r.status(201).json(d)});
app.post('/api/drafts/:id/approve',(q,r)=>{const d=drafts.find(x=>x.id===q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});d.status='approved';saveDraft(d);return r.json(d)});
app.get('/api/render-jobs',(_q,r)=>r.json(renderJobs));
app.post('/api/drafts/:id/render',(q,r)=>{const d=drafts.find(x=>x.id===q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});const p=z.object({voice:z.enum(['male','female']).default('male'),template:z.enum(['classic','breaking','clean']).optional()}).safeParse(q.body||{});if(!p.success)return r.status(400).json({error:'Tùy chọn render không hợp lệ'});d.status='rendering';saveDraft(d);const job=enqueueRender({draftId:d.id,text:`${d.title}. ${d.body}`,headline:d.title,source:d.sourceName,breaking:d.format==='breaking',voice:p.data.voice,imageUrl:d.imageUrl,template:p.data.template});return r.status(202).json(job)});
app.get('/',(_q,r)=>r.sendFile('app.html',{root:'public'}));app.listen(PORT,'0.0.0.0',()=>console.log(`Auto Media V1.5 Template Studio running on :${PORT}`));
