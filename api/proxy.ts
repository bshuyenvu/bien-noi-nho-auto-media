import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest,res: VercelResponse){
 const base=process.env.RENDER_API_URL;
 if(!base)return res.status(503).json({error:'RENDER_API_URL is not configured'});
 const path=String(req.query.path||'');
 const target=`${base.replace(/\/$/,'')}/api/${path}`;
 const headers:Record<string,string>={'content-type':'application/json'};
 if(process.env.RENDER_API_KEY)headers.authorization=`Bearer ${process.env.RENDER_API_KEY}`;
 try{
  const upstream=await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method||'GET')?undefined:JSON.stringify(req.body??{})});
  const text=await upstream.text();
  res.status(upstream.status);res.setHeader('content-type',upstream.headers.get('content-type')||'application/json');return res.send(text);
 }catch(error){return res.status(502).json({error:'Render server unavailable',detail:error instanceof Error?error.message:String(error)})}
}
