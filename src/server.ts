import 'dotenv/config';
import express from 'express';
import { z } from 'zod';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 8787);

const NewsDraft = z.object({
  title: z.string().min(5),
  sourceUrl: z.string().url().optional(),
  sourceName: z.string().optional(),
  body: z.string().min(20),
  format: z.enum(['breaking', 'latest', 'standard']).default('latest'),
});

type Draft = z.infer<typeof NewsDraft> & {
  id: string;
  status: 'draft' | 'approved' | 'rendering' | 'ready';
  createdAt: string;
};

const drafts: Draft[] = [];

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bien-noi-nho-auto-media', version: '0.1.0' });
});

app.get('/api/drafts', (_req, res) => res.json(drafts));

app.post('/api/drafts', (req, res) => {
  const parsed = NewsDraft.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const draft: Draft = {
    ...parsed.data,
    id: crypto.randomUUID(),
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  drafts.unshift(draft);
  return res.status(201).json(draft);
});

app.post('/api/drafts/:id/approve', (req, res) => {
  const draft = drafts.find((item) => item.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  draft.status = 'approved';
  return res.json(draft);
});

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Biển & Nỗi Nhớ Auto Media</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e5e7eb;margin:0;padding:32px}.wrap{max-width:960px;margin:auto}.card{background:#111827;border:1px solid #263244;border-radius:18px;padding:24px;margin-top:20px}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#7f1d1d}h1{font-size:36px;margin-bottom:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.item{padding:18px;background:#172033;border-radius:14px}</style></head>
<body><main class="wrap"><span class="badge">V1 DEVELOPMENT</span><h1>Biển & Nỗi Nhớ Auto Media</h1><p>Nhà máy sản xuất video tin nhanh tự động.</p><section class="card"><h2>Pipeline</h2><div class="grid"><div class="item">📰 URL / RSS</div><div class="item">✨ AI Studio</div><div class="item">🎙️ Vietnamese TTS</div><div class="item">🎬 Video Engine</div><div class="item">💬 Subtitle</div><div class="item">✅ Review Queue</div></div></section><section class="card"><h2>API V1</h2><p><code>GET /health</code> · <code>GET/POST /api/drafts</code> · <code>POST /api/drafts/:id/approve</code></p></section></main></body></html>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Auto Media running on :${PORT}`));
