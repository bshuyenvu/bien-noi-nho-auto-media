import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { enqueueRender, renderJobs } from './video/job.js';

const app=express(); app.use(express.json()); app.use('/output',express.static('output'));
const PORT=Number(process.env.PORT||8787);
const NewsDraft=z.object({title:z.string().min(5),sourceUrl:z.string().url().optional(),sourceName:z.string().optional(),body:z.string().min(20),format:z.enum(['breaking','latest','standard']).default('latest')});
type Draft=z.infer<typeof NewsDraft>&{id:string;status:'draft'|'approved'|'rendering'|'ready';createdAt:string};
const drafts:Draft[]=[];
app.get('/health',(_q,r)=>r.json({ok:true,service:'bien-noi-nho-auto-media',version:'0.4.0'}));
app.get('/api/drafts',(_q,r)=>r.json(drafts));
app.post('/api/drafts',(q,r)=>{const p=NewsDraft.safeParse(q.body);if(!p.success)return r.status(400).json({error:p.error.flatten()});const d:Draft={...p.data,id:crypto.randomUUID(),status:'draft',createdAt:new Date().toISOString()};drafts.unshift(d);return r.status(201).json(d)});
app.post('/api/drafts/:id/approve',(q,r)=>{const d=drafts.find(x=>x.id===q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});d.status='approved';return r.json(d)});
app.get('/api/render-jobs',(_q,r)=>r.json(renderJobs));
app.post('/api/drafts/:id/render',(q,r)=>{const d=drafts.find(x=>x.id===q.params.id);if(!d)return r.status(404).json({error:'Draft not found'});d.status='rendering';const job=enqueueRender({draftId:d.id,text:`${d.title}. ${d.body}`,voice:q.body?.voice==='female'?'female':'male'});return r.status(202).json(job)});
app.get('/',(_q,r)=>r.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Biển & Nỗi Nhớ Auto Media</title><style>body{font-family:system-ui;background:#07111f;color:#eef2ff;margin:0}.wrap{max-width:1100px;margin:auto;padding:28px}.hero{padding:28px;background:linear-gradient(135deg,#111827,#172554);border-radius:22px}.badge{background:#b91c1c;padding:7px 12px;border-radius:999px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-top:20px}.card{background:#111827;border:1px solid #273449;border-radius:16px;padding:20px}button{background:#dc2626;color:white;border:0;border-radius:10px;padding:10px 14px;font-weight:700}code{color:#93c5fd}</style></head><body><main class="wrap"><section class="hero"><span class="badge">V0.4</span><h1>BIỂN & NỖI NHỚ AUTO MEDIA</h1><p>News → Voice → Subtitle → Render → Review</p></section><div class="grid"><div class="card"><h3>📰 Tin mới</h3><p>URL / RSS / nhập tay</p></div><div class="card"><h3>✨ AI Studio</h3><p>Headline · Hook · Script</p></div><div class="card"><h3>🎙️ Voice</h3><p>Nam Minh / Hoài My</p></div><div class="card"><h3>🎬 Render Queue</h3><p><code>POST /api/drafts/:id/render</code></p></div><div class="card"><h3>💬 Subtitle</h3><p>SRT tự động</p></div><div class="card"><h3>✅ Review</h3><p>MP4 chờ duyệt trước đăng</p></div></div></main></body></html>`));
app.listen(PORT,'0.0.0.0',()=>console.log(`Auto Media V0.4 running on :${PORT}`));
