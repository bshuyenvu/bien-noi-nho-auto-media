import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req:VercelRequest,res:VercelResponse){
 const base=process.env.RENDER_API_URL;
 if(!base)return res.status(503).json({error:'RENDER_API_URL is not configured'});
 const path=String(req.query.path||'').replace(/^\/+/, '');
 if(!path||path.includes('..'))return res.status(400).json({error:'Invalid media path'});
 const target=`${base.replace(/\/$/,'')}/output/${path}`;
 const headers:Record<string,string>={};
 if(process.env.RENDER_API_KEY)headers.authorization=`Bearer ${process.env.RENDER_API_KEY}`;
 try{
  const upstream=await fetch(target,{headers});
  if(!upstream.ok)return res.status(upstream.status).send(await upstream.text());
  const buffer=Buffer.from(await upstream.arrayBuffer());
  res.setHeader('content-type',upstream.headers.get('content-type')||'application/octet-stream');
  res.setHeader('cache-control','private, max-age=60');
  return res.status(200).send(buffer);
 }catch(error){return res.status(502).json({error:'Render media unavailable',detail:error instanceof Error?error.message:String(error)})}
}
