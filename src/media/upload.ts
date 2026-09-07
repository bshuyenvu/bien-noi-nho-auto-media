import multer from 'multer';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

export const uploadDir='data/uploads';
mkdirSync(uploadDir,{recursive:true});

const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const storage=multer.diskStorage({
 destination:(_req,_file,cb)=>cb(null,uploadDir),
 filename:(_req,file,cb)=>{
  const ext=extname(file.originalname).toLowerCase()||'.jpg';
  cb(null,`${Date.now()}-${crypto.randomUUID()}${ext}`);
 }
});

export const mediaUpload=multer({
 storage,
 limits:{fileSize:15*1024*1024,files:8},
 fileFilter:(_req,file,cb)=>allowed.has(file.mimetype)?cb(null,true):cb(new Error('Chỉ hỗ trợ ảnh JPG, PNG, WebP hoặc GIF'))
});

export function listUploadedMedia(){
 return readdirSync(uploadDir).filter(name=>/\.(jpe?g|png|webp|gif)$/i.test(name)).map(name=>{
  const full=join(uploadDir,name);const st=statSync(full);
  return {name,path:full,size:st.size,createdAt:st.mtime.toISOString()};
 }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);
}

export function validateUploadedPaths(paths:string[]){
 const safeRoot=uploadDir.replace(/\\/g,'/');
 return paths.filter(p=>typeof p==='string'&&p.replace(/\\/g,'/').startsWith(safeRoot+'/')).slice(0,8);
}
