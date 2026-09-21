import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['--check','public/health-studio.js'],{stdio:'inherit'});
const h=fs.readFileSync('public/index.html','utf8');
const required=[
  'MULTI-CONTENT STUDIO V3.5','SRT → giọng','Lồng tiếng video',
  'MEDIA RIGHTS ENGINE','evidenceConfirm','GIỌNG CỦA TÔI','MEDIA UPLOAD',
  'TIN NÓNG','previewScenesBtn','LỊCH SỬ RENDER','CONTENT STUDIO V2 • PROJECT PIPELINE','contentStudioV2Panel','contentStudioProjectSelect','contentStudioSceneList',
  'data-task-target="configPanel"','channelNameInput','CẤU HÌNH WORKSPACE','openAccountConfigBtn','workspace-drawer hidden'
];
const missing=required.filter(x=>!h.includes(x));
if(missing.length){console.error('UI contract missing:',missing);process.exit(1)}
for(const hiddenId of ['uploadMediaPanel','voiceStudioPanel','reviewPanel']){
  if(new RegExp(`id="${hiddenId}"[^>]*class="[^"]*hidden`).test(h)){
    console.error('Primary task is hidden:',hiddenId);process.exit(1)
  }
}
const js=fs.readFileSync('public/health-studio.js','utf8');
for(const requiredJs of ['MỞ REVIEW Y KHOA','pipeline-review-summary','✓ ACCEPT & TIẾP TỤC','Research đã PASS. Hãy đối chiếu Evidence Pack']){
  if(!js.includes(requiredJs)){console.error('Review gate UX contract missing:',requiredJs);process.exit(1)}
}
console.log('Multi-Content Studio V3.5 UI + Content Studio V2 dashboard/review contract OK');
