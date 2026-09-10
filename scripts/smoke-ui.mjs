import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['--check','public/health-studio.js'],{stdio:'inherit'});
const h=fs.readFileSync('public/index.html','utf8');
const required=[
  'MULTI-CONTENT STUDIO V3.4','SRT → giọng','Lồng tiếng video',
  'MEDIA RIGHTS ENGINE','evidenceConfirm','GIỌNG CỦA TÔI','MEDIA UPLOAD',
  'TIN NÓNG','previewScenesBtn','LỊCH SỬ RENDER',
  'data-task-target="configPanel"','channelNameInput','CẤU HÌNH WORKSPACE'
];
const missing=required.filter(x=>!h.includes(x));
if(missing.length){console.error('UI contract missing:',missing);process.exit(1)}
for(const hiddenId of ['uploadMediaPanel','voiceStudioPanel','reviewPanel']){
  if(new RegExp(`id="${hiddenId}"[^>]*class="[^"]*hidden`).test(h)){
    console.error('Primary task is hidden:',hiddenId);process.exit(1)
  }
}
console.log('Multi-Content Studio V3.4 UI contract OK');
