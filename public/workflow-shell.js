(()=>{
 const $=id=>document.getElementById(id),main=()=>document.querySelector('main.wrap');
 function css(){
  if($('workflowShellStyle'))return;
  const s=document.createElement('style');s.id='workflowShellStyle';s.textContent=`
  .wf-nav{position:sticky;top:0;z-index:30;margin:14px 0 18px;padding:8px;background:#0b1627f2;border:1px solid #263449;border-radius:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;backdrop-filter:blur(10px)}
  .wf-nav button{margin:0;background:#17243a;color:#cbd5e1;min-height:42px}.wf-nav button.active{background:#2563eb;color:#fff;box-shadow:0 0 0 1px #60a5fa inset}
  .wf-stage{display:none}.wf-stage.active{display:block}.wf-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin:4px 0 12px}.wf-title{font-size:22px;font-weight:850}.wf-note{color:#94a3b8;font-size:13px;max-width:760px}.wf-flow{display:flex;gap:5px;flex-wrap:wrap;color:#93c5fd;font-size:12px}.wf-flow span{padding:4px 8px;background:#0f2038;border-radius:999px}.wf-flow .now{background:#1d4ed8;color:#fff}
  .wf-stage>.card,.wf-stage>.media-studio,.wf-stage>.wf-group{margin-top:14px}.wf-group{border:1px solid #263449;border-radius:16px;background:#0c1525;overflow:hidden}.wf-group>summary{cursor:pointer;padding:14px 16px;font-weight:800;list-style:none}.wf-group>summary::-webkit-details-marker{display:none}.wf-group>summary:after{content:'▾';float:right;color:#93c5fd}.wf-group[open]>summary:after{content:'▴'}.wf-group-note{color:#94a3b8;font-size:12px;font-weight:400;margin-top:4px}.wf-group-body{padding:0 14px 14px}.wf-group-body>.card,.wf-group-body>.media-studio,.wf-group-body>.sys-grid,.wf-group-body>#vnf-account-workspace{margin-top:10px}
  .wf-primary{border-color:#2563eb!important;box-shadow:0 0 0 1px #1d4ed8 inset}.wf-manual h2{font-size:18px}.wf-hidden{display:none!important}.wf-compact-label{font-size:12px;color:#94a3b8}.wf-quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.wf-quick-actions button{margin:0}.wf-settings .card{max-width:100%}
  @media(max-width:820px){.wf-nav{position:static;grid-template-columns:1fr 1fr}.wf-flow{display:none}.wf-head{display:block}}
  `;document.head.append(s);
 }
 function cardByTitle(t){return[...document.querySelectorAll('.card')].find(c=>c.querySelector(':scope>h2')?.textContent?.trim()===t)}
 function move(el,host){if(el&&host&&!host.contains(el))host.append(el)}
 function stage(id,title,note,_step){const s=document.createElement('section');s.id=id;s.className='wf-stage';s.innerHTML=`<div class="wf-head"><div><div class="wf-title">${title}</div><div class="wf-note">${note}</div></div></div>`;return s}
 function group(id,title,note,open=false){let d=$(id);if(d)return d;d=document.createElement('details');d.id=id;d.className='wf-group';d.open=open;d.innerHTML=`<summary>${title}<div class="wf-group-note">${note}</div></summary><div class="wf-group-body"></div>`;return d}
 function body(id){return $(id)?.querySelector('.wf-group-body')}
 function fieldPair(id,host){const el=$(id);if(!el||!host)return;const label=el.previousElementSibling?.tagName==='LABEL'?el.previousElementSibling:null;if(label)host.append(label);host.append(el)}
 function activate(id){document.querySelectorAll('.wf-stage').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.wf-nav [data-stage]').forEach(x=>x.classList.toggle('active',x.dataset.stage===id));sessionStorage.setItem('autoMediaStage',id);scrollTo({top:0,behavior:'smooth'})}
 function prepareEditor(){const editor=cardByTitle('Biên tập bản tin');if(!editor)return;
  const social=group('wf-editor-social','📣 Caption & mạng xã hội','Chỉ mở khi cần chỉnh nội dung đăng kèm.');
  const metadata=group('wf-editor-meta','🔗 Nguồn & URL media','Thông tin kỹ thuật; Auto Producer đã điền tự động.');
  const advanced=group('wf-editor-advanced','🎛️ Video nâng cao','Template, ticker và lưu draft thủ công.');
  for(const g of[social,metadata,advanced])if(!editor.contains(g))editor.append(g);
  ['hook','caption','hashtags'].forEach(id=>fieldPair(id,body('wf-editor-social')));
  ['sourceName','sourceUrl','imageUrl','imageUrls'].forEach(id=>fieldPair(id,body('wf-editor-meta')));
  const template=$('template')?.closest('.row');if(template)move(template,body('wf-editor-advanced'));
  fieldPair('tickerText',body('wf-editor-advanced'));fieldPair('tickerSpeed',body('wf-editor-advanced'));
  const save=$('saveBtn');if(save){save.textContent='💾 LƯU THỦ CÔNG THÀNH DRAFT';move(save,body('wf-editor-advanced'))}
 }
 function reviewQuickActions(){const box=$('reviewWorkspace');if(!box||$('wfReviewQuick'))return;const q=document.createElement('div');q.id='wfReviewQuick';q.className='wf-quick-actions';q.innerHTML='<button id="wfLockAll" class="secondary">🔒 KHÓA 4 THÀNH PHẦN</button><span class="wf-compact-label">Evidence vẫn phải được xác nhận riêng trước khi duyệt.</span>';box.querySelector('.muted')?.insertAdjacentElement('afterend',q);$('wfLockAll').onclick=()=>{for(const id of['lockScript','lockMedia','lockVoice','lockScenes']){const el=$(id);if(el&&!el.checked){el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}))}}};
 }
 function organize(){
  const create=$('wf-create'),studio=$('wf-studio'),review=$('wf-review-publish'),system=$('wf-system');if(!create||!studio||!review||!system)return;
  const hero=document.querySelector('.hero p');if(hero)hero.textContent='Tạo bản tin → Studio → Duyệt & Xuất bản → Hệ thống.';
  const len=$('scriptLength');if(len&&!len.querySelector('option[value="auto"]')){const current=len.value;len.innerHTML='<option value="auto" selected>✨ AUTO theo nội dung</option><option value="30">30 giây</option><option value="45">45 giây</option><option value="60">60 giây</option><option value="90">90 giây</option><option value="120">120 giây</option>';if(['30','45','60','90','120'].includes(current))len.value=current;}
  const autoNote=$('autoProducer')?.querySelector('.muted');if(autoNote)autoNote.textContent='Dán URL một lần → AI khóa facts → Evidence → biên tập → Media/Scene → Voice → tạo Draft để duyệt. Đây là đường làm việc mặc định.';
  const accountBtn=$('vnf-open-account');if(accountBtn)accountBtn.onclick=()=>{activate('wf-system');setTimeout(()=>{const g=$('wf-system-account');if(g)g.open=true},80)};
  const rssGroup=group('wf-create-rss','📰 RSS & nguồn tin','Quản lý nguồn và chọn tin khi không dán URL trực tiếp.'),autoGroup=group('wf-create-auto','🤖 Autopilot','Tự quét RSS và chạy dây chuyền; mặc định đóng để không làm rối luồng thủ công.'),manual=group('wf-create-manual','⌨️ Nhập & biên tập thủ công','Dùng khi không muốn chạy Auto Producer; mặc định nên dùng ô Auto Producer phía trên.');for(const g of[rssGroup,autoGroup,manual])if(!create.contains(g))create.append(g);
  const auto=$('autoProducer');if(auto){auto.classList.add('wf-primary');const head=create.querySelector('.wf-head');if(head&&head.nextElementSibling!==auto)head.insertAdjacentElement('afterend',auto)}
  move($('rssAdmin'),body('wf-create-rss'));move($('autoPilotPanel'),body('wf-create-auto'));const importCard=cardByTitle('Nhập bài báo từ URL');if(importCard){importCard.classList.add('wf-manual');const h=importCard.querySelector('h2');if(h)h.textContent='Nhập URL thủ công';move(importCard,body('wf-create-manual'))}
  const editor=cardByTitle('Biên tập bản tin');move(editor,studio);prepareEditor();
  const production=group('wf-studio-production','🎬 Media • Scene • Voice • Theme','Các công cụ sản xuất; mở khi cần can thiệp thủ công.',true);if(!studio.contains(production))studio.append(production);
  const media=$('mediaAnalyze')?.closest('.media-studio'),voice=$('voiceMode')?.closest('.voicebox');[media,$('sceneStudio'),voice,$('themeStudio')].forEach(x=>move(x,body('wf-studio-production')));
  reviewQuickActions();move($('reviewWorkspace'),review);
  const renderGroup=group('wf-render-group','🎞️ Render & kết quả','Draft, hàng đợi và video đầu ra.',true),publishGroup=group('wf-publish-group','📡 Xuất bản','Kết nối kênh, kiểm tra an toàn và lịch đăng.',true);if(!review.contains(renderGroup))review.append(renderGroup);if(!review.contains(publishGroup))review.append(publishGroup);
  move(cardByTitle('Bản tin'),body('wf-render-group'));move($('productionQueue'),body('wf-render-group'));const renderCard=[...document.querySelectorAll('.card')].find(c=>/^Render(?: Monitor)?$/.test(c.querySelector('h2')?.textContent?.trim()||''));move(renderCard||$('renderMonitor'),body('wf-render-group'));
  [$('channelConnections'),$('contentSafetyChecklist'),$('publishScheduler')].forEach(x=>move(x,body('wf-publish-group')));
  const account=group('wf-system-account','👤 Tài khoản & API','Hồ sơ kênh, thành viên và khóa API.'),ops=group('wf-system-ops','🛡️ Giám sát & vận hành','Health, analytics, monitor, bảo trì và trợ lý vận hành.'),release=group('wf-system-release','🚦 Kích hoạt LIVE / Public — nâng cao','Chỉ dùng khi chủ động phát hành thật; mặc định hệ thống giữ private.',false);for(const g of[account,ops,release])if(!system.contains(g))system.append(g);
  move($('vnf-auth'),body('wf-system-account'));move($('vnf-account-workspace'),body('wf-system-account'));move($('apiKey')?.closest('.card'),body('wf-system-account'));
  [$('systemCockpit'),$('productionAnalyticsPanel'),$('opsAssistant'),$('productionMonitorPanel'),$('maintenanceOpsPanel'),$('activityTimelinePanel')].forEach(x=>move(x,body('wf-system-ops')));
  [$('releaseGate'),$('activationWizard'),$('publicRollout'),$('publicRamp')].forEach(x=>move(x,body('wf-system-release')));
  const oldRss=cardByTitle('RSS'),oldItems=cardByTitle('Tin RSS');oldRss?.classList.add('wf-hidden');oldItems?.classList.add('wf-hidden');document.querySelectorAll('.grid').forEach(g=>{if(!g.children.length)g.remove()});
 }
 function mount(){
  if($('workflowNav'))return;css();const root=main(),hero=document.querySelector('.hero');if(!root||!hero)return;
  const nav=document.createElement('nav');nav.id='workflowNav';nav.className='wf-nav';[['wf-create','① TẠO BẢN TIN'],['wf-studio','② STUDIO'],['wf-review-publish','③ DUYỆT & XUẤT BẢN'],['wf-system','④ HỆ THỐNG']].forEach(([id,label])=>{const b=document.createElement('button');b.dataset.stage=id;b.textContent=label;b.onclick=()=>activate(id);nav.append(b)});hero.insertAdjacentElement('afterend',nav);
  root.append(stage('wf-create','Tạo bản tin','Dán URL một lần và để Auto Producer xử lý nguồn, evidence, kịch bản, media và giọng. RSS hoặc nhập thủ công chỉ là đường phụ.',0),stage('wf-studio','Studio','Tinh chỉnh kịch bản và sản xuất video. Các trường kỹ thuật ít dùng đã được thu gọn.',1),stage('wf-review-publish','Duyệt & Xuất bản','Xác nhận Evidence → khóa nội dung → render → xem kết quả → lên lịch xuất bản trong cùng một workspace.',2),stage('wf-system','Hệ thống','Tài khoản, API, giám sát và activation được tách khỏi công việc sản xuất hằng ngày.',3));
  organize();document.addEventListener('vnf-account-ready',organize);document.addEventListener('auto-producer-ready',()=>activate('wf-review-publish'));document.addEventListener('review-updated',e=>{if(e.detail?.review?.status==='approved')activate('wf-review-publish')});
  let pending;new MutationObserver(()=>{clearTimeout(pending);pending=setTimeout(organize,80)}).observe(root,{childList:true,subtree:true});
  const wanted=sessionStorage.getItem('autoMediaStage');activate($(wanted)?wanted:'wf-create');setTimeout(organize,350);setTimeout(organize,1200);setTimeout(organize,2500);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,180));else setTimeout(mount,180);
})();
