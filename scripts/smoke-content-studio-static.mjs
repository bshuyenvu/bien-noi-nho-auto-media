import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportComicPackage, exportThumbnail } from '../dist/studio/pipeline-v2-static-export.js';

const root=await mkdtemp(join(tmpdir(),'content-studio-static-'));
const common={rootDir:root,projectId:'project-static-smoke',batchId:'batch-1',seriesName:'Chuyện Sức Khỏe Quanh Ta',topic:'Nhận biết sớm dấu hiệu cảnh báo sức khỏe'};
const comic=await exportComicPackage({...common,scenes:[
  {index:0,beat:'hook',narration:'Một buổi sáng bình thường bỗng xuất hiện dấu hiệu bất thường khiến cả gia đình chú ý.'},
  {index:1,beat:'context',narration:'Mọi người giữ bình tĩnh, ghi nhận thời điểm thay đổi và tìm sự hỗ trợ y tế phù hợp.'},
  {index:2,beat:'takeaway',narration:'Điều quan trọng là nhận biết sớm, không chủ quan và để nội dung y khoa được kiểm tra trước khi phát hành.'},
]});
assert.equal(comic.assets.length,3);for(const path of comic.assets)assert.ok((await stat(path)).size>5000);assert.ok((await stat(comic.outputPath)).size>200);
const thumb=await exportThumbnail({...common,episode:3});assert.equal(thumb.assets.length,1);assert.ok((await stat(thumb.outputPath)).size>5000);
console.log('Content Studio static comic + thumbnail smoke OK',JSON.stringify({comicPanels:comic.assets.length,comicManifest:comic.outputPath,thumbnail:thumb.outputPath}));