import { lookup } from 'node:dns/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function isPrivateIp(ip:string){
 return /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip)||ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:');
}

export async function downloadRemoteImage(url:string,outputBase:string){
 const parsed=new URL(url);
 if(!['http:','https:'].includes(parsed.protocol))throw new Error('Unsupported image URL protocol');
 const addresses=await lookup(parsed.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>isPrivateIp(a.address)))throw new Error('Private/local image URLs are not allowed');
 const response=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; BienNoiNhoAutoMedia/1.1)'}});
 if(!response.ok)throw new Error(`Image returned HTTP ${response.status}`);
 const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
 const ext=type==='image/png'?'.png':type==='image/webp'?'.webp':type==='image/gif'?'.gif':type==='image/jpeg'?'.jpg':'';
 if(!ext)throw new Error(`Unsupported image type: ${type||'unknown'}`);
 const length=Number(response.headers.get('content-length')||0);
 if(length>15_000_000)throw new Error('Image is too large');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>15_000_000)throw new Error('Image is too large');
 const path=outputBase+ext;
 await mkdir(dirname(path),{recursive:true});
 await writeFile(path,bytes);
 return path;
}
