import { lookup } from 'node:dns/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function isPrivateIp(ip:string){
 return /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip)||ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:');
}
async function assertPublicUrl(url:URL){
 if(!['http:','https:'].includes(url.protocol))throw new Error('Unsupported remote URL protocol');
 const addresses=await lookup(url.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>isPrivateIp(a.address)))throw new Error('Private/local remote URLs are not allowed');
}
async function safeFetch(raw:string,init:RequestInit,maxRedirects=4){
 let current=new URL(raw);
 for(let i=0;i<=maxRedirects;i++){
  await assertPublicUrl(current);const response=await fetch(current,{...init,redirect:'manual'});
  if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('Remote redirect thiếu Location');if(i===maxRedirects)throw new Error('Remote URL redirect quá nhiều lần');current=new URL(location,current);continue}
  return response;
 }
 throw new Error('Remote URL không thể tải');
}

export async function downloadRemoteImage(url:string,outputBase:string){
 const response=await safeFetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; BienNoiNhoAutoMedia/3.1)'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Image returned HTTP ${response.status}`);
 const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
 const ext=type==='image/png'?'.png':type==='image/webp'?'.webp':type==='image/gif'?'.gif':type==='image/jpeg'?'.jpg':'';
 if(!ext)throw new Error(`Unsupported image type: ${type||'unknown'}`);
 const length=Number(response.headers.get('content-length')||0);if(length>15_000_000)throw new Error('Image is too large');
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>15_000_000)throw new Error('Image is too large');
 const path=outputBase+ext;await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);return path;
}

export async function downloadRemoteVideo(url:string,outputBase:string,maxBytes=120_000_000){
 const response=await safeFetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; MultiContentStudio/3.1)'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Video returned HTTP ${response.status}`);
 const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
 const ext=type==='video/mp4'?'.mp4':type==='video/webm'?'.webm':'';
 if(!ext)throw new Error(`Chỉ hỗ trợ direct video MP4/WebM; content-type nhận được: ${type||'unknown'}`);
 const length=Number(response.headers.get('content-length')||0);if(length>maxBytes)throw new Error('Video vượt giới hạn dung lượng cho lồng tiếng trực tiếp');
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>maxBytes)throw new Error('Video vượt giới hạn dung lượng cho lồng tiếng trực tiếp');
 const path=outputBase+ext;await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);return path;
}
