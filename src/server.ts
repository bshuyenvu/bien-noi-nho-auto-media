import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { enqueueRender, renderJobs } from './video/job.js';
import { importArticleFromUrl } from './import/url.js';
import { addRssSource, rssItems, rssSources, scanAllRss, scanRssSource } from './rss/manager.js';

const app=express();
app.use(express.json({limit:'1mb'}));
const PORT=Number(process.env.PORT||8787);
const API_KEY=process.env.RENDER_API_KEY;
function requireApiKey(req:express.Request,res:express.Response,next:express.NextFunction){if(!API_KEY)return next();const token=req.header('authorization')?.replace(/^Bearer\s+/i,'');if(token!==API_KEY)return res.status(401).json({error:'Unauthorized'});next();}
app.get('/health',(_q,r)=>r.json({ok:true,service:'bien-noi-nho-auto-media',version:'1.2.0',mode:'self-hosted'}));
app.use('/api',requireApiKey);app.use('/output',requireApiKey,express.static('output',{fallthrough:false,maxAge:'1h'}));app.use(express.static('public'));
const NewsDraft=z.object({title:z.string().min(5).max(180),sourceUrl:z.string().url().optional(),sourceName:z.string().max(120).optional(),imageUrl:z.string().url().optional(),body:z.string().min(20).max(10000),format:z.enum(['breaking','latest','standard']).default('latest')});
type Draft=z.infer<typeof NewsDraft>&{id:string;status:'draft'|'approved'|'rendering'|'ready'|'failed';createdAt:string};const drafts:Draft[]=[];

app.post('/api/import-url',async(q,r)=>{const p=z.object({url:z.string().url()}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'URL không hợp lệ'});try{return r.json(await importArticleFromUrl(p.data.url));}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)});}});
app.get('/api/rss-sources',(_q,r)=>r.json(rssSources));
app.post('/api/rss-sources',(q,r)=>{const p=z.object({url:z.string().url(),name:z.string().max(120).optional()}).safeParse(q.body);if(!p.success)return r.status(400).json({error:'RSS URL không hợp lệ'});try{return r.status(201).json(addRssSource(p.data));}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)});}});
app.post('/api/rss-sources/:id/scan',async(q,r)=>{const s=rssSources.find(x=>x.id===q.params.id);if(!s)return r.status(404).json({error:'RSS source not found'});try{return r.json(await scanRssSource(s));}catch(e){return r.status(422).json({error:e instanceof Error?e.message:String(e)});}});
app.post('/api/rss-scan-all',async(_q,r)=>r.json(await scanAllRss()));
app.get('/api/rss-items',(_q,r)=>r.json(rssItems.slice(0,100)));

app.get('/api/drafts',(_q,r)=>r.json(drafts));
app.post('/api/drafts',(q,r)=>{const p=NewsDraft.safeParse(q.body);if(!p.success)return r.status(400).json({error:p.error.flatten()});const d:Draft={...p.data,id:crypto.randomUUID(),status:'draft',createdAt:new Date().toISOString()};drafts.unshift(d);return r.status(201).json(d)});
app.post('/api/drafts/:id/approve',(q,r)=>{const d=drafts.find(x=>x.id===q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});d.status='approved';return r.json(d)});
app.get('/api/render-jobs',(_q,r)=>r.json(renderJobs));
app.post('/api/drafts/:id/render',(q,r)=>{const d=drafts.find(x=>x.id===q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});d.status='rendering';const job=enqueueRender({draftId:d.id,text:`${d.title}. ${d.body}`,headline:d.title,source:d.sourceName,breaking:d.format==='breaking',voice:q.body?.voice==='female'?'female':'male',imageUrl:d.imageUrl});return r.status(202).json(job)});
app.get('/',(_q,r)=>r.sendFile('app.html',{root:'public'}));app.listen(PORT,'0.0.0.0',()=>console.log(`Auto Media V1.2 self-hosted running on :${PORT}`));
