import { createHash,randomUUID } from 'node:crypto';
import { createReadStream,createWriteStream,existsSync } from 'node:fs';
import { mkdir,readFile,stat,writeFile } from 'node:fs/promises';
import { basename,dirname,extname,join,resolve } from 'node:path';
import { once } from 'node:events';
import { db,all,run } from '../storage/db.js';
import { getPipelineProject } from './pipeline-v2.js';
import { getPipelineRuntime,listPipelineReviewEvents } from './pipeline-v2-runtime.js';
import { listStudioArtifacts } from './pipeline-v2-generation.js';

type ZipEntry={sourcePath:string;archivePath:string;sha256:string;size:number;crc32:number;mtime:Date};
export interface ContentStudioExportPackage{
  id:string;projectId:string;ownerId:string;status:'ready';path:string;sha256:string;size:number;fileCount:number;createdAt:string;
}
type PackageRow={id:string;project_id:string;owner_id:string;status:'ready';path:string;sha256:string;size:number;file_count:number;created_at:string};

db.exec(`
CREATE TABLE IF NOT EXISTS content_studio_export_packages(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 status TEXT NOT NULL,
 path TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 size INTEGER NOT NULL,
 file_count INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_studio_export_packages_owner_project
ON content_studio_export_packages(owner_id,project_id,created_at DESC);
`);

const CRC_TABLE=(()=>{
 const t=new Uint32Array(256);
 for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}
 return t;
})();
function crcUpdate(crc:number,buf:Buffer){let c=crc;for(const b of buf)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return c>>>0}
function safeSegment(v:string){return v.replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(0,120)||'file'}
function dosDateTime(date:Date){const y=Math.max(1980,date.getFullYear()),m=date.getMonth()+1,d=date.getDate(),h=date.getHours(),min=date.getMinutes(),sec=Math.floor(date.getSeconds()/2);return{date:((y-1980)<<9)|(m<<5)|d,time:(h<<11)|(min<<5)|sec}}
async function analyzeFile(path:string){
 const h=createHash('sha256');let crc=0xffffffff,size=0;
 for await(const chunk of createReadStream(path)){const b=Buffer.from(chunk as Buffer);h.update(b);crc=crcUpdate(crc,b);size+=b.length}
 const st=await stat(path);return{sha256:h.digest('hex'),crc32:(crc^0xffffffff)>>>0,size,mtime:st.mtime};
}
async function writeChunk(stream:ReturnType<typeof createWriteStream>,buf:Buffer){if(!stream.write(buf))await once(stream,'drain')}
function localHeader(entry:ZipEntry){
 const name=Buffer.from(entry.archivePath,'utf8'),dt=dosDateTime(entry.mtime),b=Buffer.alloc(30+name.length);
 b.writeUInt32LE(0x04034b50,0);b.writeUInt16LE(20,4);b.writeUInt16LE(0x800,6);b.writeUInt16LE(0,8);b.writeUInt16LE(dt.time,10);b.writeUInt16LE(dt.date,12);
 b.writeUInt32LE(entry.crc32,14);b.writeUInt32LE(entry.size,18);b.writeUInt32LE(entry.size,22);b.writeUInt16LE(name.length,26);b.writeUInt16LE(0,28);name.copy(b,30);return b;
}
function centralHeader(entry:ZipEntry,offset:number){
 const name=Buffer.from(entry.archivePath,'utf8'),dt=dosDateTime(entry.mtime),b=Buffer.alloc(46+name.length);
 b.writeUInt32LE(0x02014b50,0);b.writeUInt16LE(20,4);b.writeUInt16LE(20,6);b.writeUInt16LE(0x800,8);b.writeUInt16LE(0,10);b.writeUInt16LE(dt.time,12);b.writeUInt16LE(dt.date,14);
 b.writeUInt32LE(entry.crc32,16);b.writeUInt32LE(entry.size,20);b.writeUInt32LE(entry.size,24);b.writeUInt16LE(name.length,28);b.writeUInt16LE(0,30);b.writeUInt16LE(0,32);b.writeUInt16LE(0,34);b.writeUInt16LE(0,36);b.writeUInt32LE(0,38);b.writeUInt32LE(offset,42);name.copy(b,46);return b;
}
async function writeStoredZip(entries:ZipEntry[],dest:string){
 await mkdir(dirname(dest),{recursive:true});const out=createWriteStream(dest);let offset=0;const centers:Array<{entry:ZipEntry;offset:number}>=[];
 for(const entry of entries){const head=localHeader(entry);centers.push({entry,offset});await writeChunk(out,head);offset+=head.length;for await(const chunk of createReadStream(entry.sourcePath)){const b=Buffer.from(chunk as Buffer);await writeChunk(out,b);offset+=b.length}}
 const centralStart=offset;
 for(const item of centers){const b=centralHeader(item.entry,item.offset);await writeChunk(out,b);offset+=b.length}
 const centralSize=offset-centralStart,eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0,4);eocd.writeUInt16LE(0,6);eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);eocd.writeUInt32LE(centralSize,12);eocd.writeUInt32LE(centralStart,16);eocd.writeUInt16LE(0,20);await writeChunk(out,eocd);out.end();await once(out,'finish');
}

function mapRow(r:PackageRow):ContentStudioExportPackage{return{id:r.id,projectId:r.project_id,ownerId:r.owner_id,status:r.status,path:r.path,sha256:r.sha256,size:Number(r.size),fileCount:Number(r.file_count),createdAt:r.created_at}}
export function listContentStudioExportPackages(ownerId:string,projectId:string){
 return all<PackageRow>('SELECT * FROM content_studio_export_packages WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 20',ownerId,projectId).map(mapRow);
}
export function getContentStudioExportPackage(ownerId:string,id:string){
 const row=all<PackageRow>('SELECT * FROM content_studio_export_packages WHERE owner_id=? AND id=? LIMIT 1',ownerId,id)[0];return row?mapRow(row):undefined;
}

function candidatePaths(path:string,metadata?:Record<string,unknown>){
 const out=[path];const assets=Array.isArray(metadata?.assets)?metadata!.assets:[];
 for(const a of assets)if(typeof a==='string')out.push(a);
 const ext=extname(path).toLowerCase(),base=path.slice(0,path.length-ext.length);
 if(ext==='.mp4'||ext==='.mp3'){for(const suffix of['.srt','.render-manifest.json','.shotcraft.json']){const p=base+suffix;if(existsSync(p))out.push(p)}}
 return [...new Set(out)];
}

export async function createContentStudioExportPackage(ownerId:string,projectId:string):Promise<ContentStudioExportPackage>{
 const project=getPipelineProject(ownerId,projectId);if(!project)throw new Error('Content Studio project not found');
 const runtime=getPipelineRuntime(ownerId,projectId);if(!runtime)throw new Error('Project chưa có runtime.');
 if(!runtime.publishAllowed)throw new Error('Release Gate chưa mở: cần Copyright Review và Final Review ACCEPTED.');
 const artifacts=listStudioArtifacts(ownerId,projectId);if(!artifacts.length)throw new Error('Project chưa có artifact để đóng gói.');
 const id=randomUUID(),root=resolve(process.env.CONTENT_STUDIO_PACKAGE_DIR||'output/content-studio-packages'),work=join(root,safeSegment(projectId),safeSegment(id));
 await mkdir(work,{recursive:true});
 const files:Array<{sourcePath:string;archivePath:string;kind:string;artifactId?:string}>=[];
 const seen=new Set<string>();
 for(const artifact of artifacts){
  for(const p of candidatePaths(artifact.path,artifact.metadata)){
   const abs=resolve(p);if(seen.has(abs)||!existsSync(abs))continue;
   const st=await stat(abs);if(!st.isFile())continue;seen.add(abs);
   files.push({sourcePath:abs,archivePath:`artifacts/${safeSegment(artifact.outputId)}/${safeSegment(basename(abs))}`,kind:artifact.kind,artifactId:artifact.id});
  }
 }
 if(!files.length)throw new Error('Không tìm thấy file artifact thực tế để đóng gói.');

 const reviewEvents=listPipelineReviewEvents(ownerId,projectId,100);
 const inventory=[] as Array<{archivePath:string;sha256:string;size:number;kind:string;artifactId?:string}>;
 for(const file of files){const a=await analyzeFile(file.sourcePath);inventory.push({archivePath:file.archivePath,sha256:a.sha256,size:a.size,kind:file.kind,artifactId:file.artifactId})}
 const manifest={
  schema:'content-studio.release-package.v1',packageId:id,project:{id:project.id,templateId:project.templateId,topic:project.topic,seriesName:project.seriesName,episode:project.episode,outputs:project.plan.outputs.map(x=>({id:x.id,kind:x.kind,aspectRatio:x.aspectRatio}))},
  gates:{research:runtime.research.status,medical:runtime.reviews.medical,copyright:runtime.reviews.copyright,final:runtime.reviews.final,publishAllowed:runtime.publishAllowed},
  research:{sourceCount:runtime.research.sourceCount,authoritativeSourceCount:runtime.research.authoritativeSourceCount,sources:runtime.research.sources,userSuppliedSourceUrls:runtime.research.userSuppliedSourceUrls},
  files:inventory,createdAt:new Date().toISOString()
 };
 const reviewReport={schema:'content-studio.review-report.v1',projectId:project.id,gates:manifest.gates,events:reviewEvents};
 const manifestPath=join(work,'manifest.json'),reviewPath=join(work,'review-report.json'),scriptPath=join(work,'script.txt');
 await writeFile(manifestPath,JSON.stringify(manifest,null,2),'utf8');await writeFile(reviewPath,JSON.stringify(reviewReport,null,2),'utf8');await writeFile(scriptPath,project.script,'utf8');
 files.push({sourcePath:manifestPath,archivePath:'manifest.json',kind:'manifest'},{sourcePath:reviewPath,archivePath:'review-report.json',kind:'review-report'},{sourcePath:scriptPath,archivePath:'script.txt',kind:'script'});
 const entries:ZipEntry[]=[];
 for(const file of files){const a=await analyzeFile(file.sourcePath);entries.push({sourcePath:file.sourcePath,archivePath:file.archivePath,...a})}
 const zipPath=join(root,`${safeSegment(project.seriesName||project.topic)}-${safeSegment(project.id.slice(0,8))}-${id.slice(0,8)}.zip`);
 await writeStoredZip(entries,zipPath);
 const zip=await analyzeFile(zipPath),now=new Date().toISOString();
 run('INSERT INTO content_studio_export_packages(id,project_id,owner_id,status,path,sha256,size,file_count,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,projectId,ownerId,'ready',zipPath,zip.sha256,zip.size,entries.length,now);
 return{id,projectId,ownerId,status:'ready',path:zipPath,sha256:zip.sha256,size:zip.size,fileCount:entries.length,createdAt:now};
}
