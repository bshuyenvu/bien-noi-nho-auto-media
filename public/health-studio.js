(()=>{
 const $=id=>document.getElementById(id),state={result:null,draft:null,clerk:null,publicConfig:null};
 const apiKey=()=>sessionStorage.getItem('renderApiKey')||'';
 function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 async function headers(json=false){const h={...(json?{'content-type':'application/json'}:{})},session=state.clerk?.session;if(session?.getToken){try{const token=await session.getToken();if(token){h.authorization='Bearer '+token;return h}}catch{}}const legacy=apiKey();if(legacy)h.authorization='Bearer '+legacy;return h}
 async function api(url,opt={}){const send=async()=>{const r=await fetch(url,{...opt,headers:{...(await headers(Boolean(opt.body))),...(opt.headers||{})}}),d=await r.json().catch(()=>({error:'Phản hồi không hợp lệ'}));return{r,d}};let {r,d}=await send();if(r.status===401&&state.clerk?.session&&!apiKey()){({r,d}=await send())}if(!r.ok){const e=Error(typeof d.error==='string'?d.error:JSON.stringify(d.error||r.status));e.code=d.code||String(r.status);throw e}return d}
 function statusClass(status){return status==='pass'?'gate-pass':status==='review'?'gate-review':'gate-block'}
 function statusLabel(status){return status==='pass'?'PASS':status==='review'?'REVIEW':'BLOCK'}
 function gateCard(label,status,score,detail){return `<div class="gate-card ${statusClass(status)}"><small>${esc(label)}</small><strong>${statusLabel(status)}${Number.isFinite(score)?' • '+Math.round(score):''}</strong><small>${esc(detail||'')}</small></div>`}
 const progressMessages=['Tìm nguồn y khoa uy tín theo chủ đề…','Tạo Evidence Pack từ nguồn chính thống + y văn…','Đọc và kiểm tra tính nhất quán của nguồn…','Fact Engine đang khóa claim y khoa…','Đối chiếu Evidence Gate và nguồn độc lập…','Editorial Professional V2 đang viết bản nguyên gốc…','Medical Safety + Copyright Gate đang kiểm tra…'];
 function setBusy(on){$('generateBtn').disabled=on;$('progress').classList.toggle('hidden',!on);if(on)$('result').classList.add('hidden')}
 function renderSources(x){
  const access=x.healthStudio?.sourceAccess||{},rows=[...(access.requestedUrl&&access.mode!=='direct'&&access.mode!=='topic-research'?[{name:'Nguồn yêu cầu (bị chặn truy cập tự động)',url:access.requestedUrl}]:[]),{name:x.article?.sourceName||'Nguồn bằng chứng chính',url:x.article?.sourceUrl},...(x.research?.sources||[])];
  $('sources').innerHTML=rows.filter(v=>v?.url).map(v=>`<div class="source"><b>${esc(v.name||'Nguồn')}</b><br><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.url)}</a></div>`).join('')||'<div class="muted">Không có nguồn hiển thị.</div>';
 }
 function renderWarnings(x){
  const studio=x.healthStudio||{},hs=studio.healthSafety||{},items=[...(studio.sourceAccess?.mode&&studio.sourceAccess.mode!=='direct'&&studio.sourceAccess.mode!=='topic-research'?[`Nguồn chính không cho máy chủ đọc (${studio.sourceAccess.reason||'access blocked'}). Đã chuyển sang nguồn y khoa đối chiếu: ${studio.sourceAccess.fallbackSource?.name||'nguồn thay thế'}.`]:[]),...(hs.reasons||[]),...(hs.warnings||[]),...(x.evidenceGate?.reasons||[]),...(x.intelligence?.warnings||[]),...(studio.researchDiscovery?.warnings||[])];
  $('warnings').innerHTML=items.length?items.map(v=>`<div class="warning">${esc(v)}</div>`).join(''):'<div class="ok-note">Không phát hiện cảnh báo bổ sung ở lớp kiểm tra tự động.</div>';
 }
 function renderMetrics(x){
  const h=x.healthStudio||{},i=x.intelligence||{},o=x.copyrightSafety?.originality||{};
  $('evidenceSummary').innerHTML=[['Evidence score',x.evidenceGate?.score],['Source score',i.sourceScore],['Authority',i.authorityScore],['Originality',o.score],['Topic match',Math.round((h.topicMatch||0)*100)+'%'],['Claims',x.evidenceGate?.supportedClaimCount+'/'+x.evidenceGate?.claimCount],['Research',h.researchDiscovery?.mode||'URL']].map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
 }
 function renderResult(x){
  state.result=x;state.draft=null;const h=x.healthStudio||{},m=h.healthSafety||{},o=x.copyrightSafety?.originality||{};
  $('headline').textContent=x.edited?.headline||'';$('hook').textContent=x.edited?.hook||'';$('script').textContent=x.edited?.script||'';
  $('gateGrid').innerHTML=[gateCard('Evidence Gate',x.evidenceGate?.status,x.evidenceGate?.score,'Claim → Source'),gateCard('Translation',h.translationGate||'pass',undefined,h.localTranslationUsed?'Local MT • bắt buộc kiểm tra':'AI/nguồn Việt • đã qua lớp Việt hóa'),gateCard('Originality',o.safe?'pass':'block',o.score,'Không sao chép nguồn'),gateCard('Medical Safety',m.status,m.score,'An toàn nội dung y khoa'),gateCard('Copyright',x.copyrightSafety?.mode==='strict'?'pass':'review',undefined,'Media bên ngoài bị khóa'),gateCard('Human Review','review',undefined,'Bắt buộc trước render')].join('');
  renderMetrics(x);renderSources(x);renderWarnings(x);
  const ready=Boolean(h.readyForDraft);$('readyBadge').textContent=ready?(h.translationGate==='review'?'⚠ CHUYỂN REVIEW • KIỂM TRA BẢN DỊCH':'✓ ĐỦ ĐIỀU KIỆN CHUYỂN REVIEW'):'⚠ CẦN SỬA / KIỂM TRA';$('readyBadge').className='badge '+(ready?'gate-pass':'gate-review');
  $('draftBtn').disabled=!ready||!x.draftPayload;$('draftStatus').textContent=ready?(h.translationGate==='review'?'Bản dịch local chưa được xác nhận. Bắt buộc đối chiếu nguồn gốc trước khi duyệt render.':'Bản này chưa được duyệt và chưa thể render.'):'Health Studio chưa cho phép đưa bản này sang Review.';
  $('result').classList.remove('hidden');$('result').scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function generate(){
  const primaryUrl=$('primaryUrl').value.trim(),topic=$('topic').value.trim();
  if(!primaryUrl&&!topic)return alert('Hãy nhập một chủ đề sức khỏe. URL nguồn là tùy chọn.');
  if(primaryUrl){try{const u=new URL(primaryUrl);if(!/^https?:$/.test(u.protocol))throw Error()}catch{return alert('URL nguồn phải là HTTP/HTTPS hợp lệ.')}}
  setBusy(true);$('progressTitle').textContent=progressMessages[0];$('progressText').textContent='Quy trình có thể chuyển sang rules fallback nếu AI provider tạm hết quota.';
  let i=0;const timer=setInterval(()=>{$('progressTitle').textContent=progressMessages[++i%progressMessages.length]},1300);
  try{const x=await api('/api/health-studio/generate',{method:'POST',body:JSON.stringify({primaryUrl:primaryUrl||undefined,topic:topic||undefined,audience:$('audience').value,length:$('length').value,format:$('format').value})});renderResult(x)}
  catch(e){$('progress').classList.remove('hidden');$('progressTitle').textContent='Không thể tạo bản Health Studio';$('progressText').textContent=e.message;$('progress').classList.add('gate-review')}
  finally{clearInterval(timer);$('generateBtn').disabled=false;if(state.result)$('progress').classList.add('hidden')}
 }
 async function createDraft(){
  const x=state.result;if(!x?.healthStudio?.readyForDraft||!x.draftPayload)return;
  $('draftBtn').disabled=true;$('draftStatus').textContent='Đang tạo Draft và gắn Evidence Bundle…';
  try{const d=await api('/api/drafts',{method:'POST',body:JSON.stringify(x.draftPayload)});state.draft=d;$('draftStatus').innerHTML=`✓ Đã tạo Draft <b>${esc(d.id)}</b>. Evidence Bundle đã được khóa vào Draft; tiếp tục Evidence Review trên Dashboard.`;$('draftBtn').textContent='✓ ĐÃ CHUYỂN SANG REVIEW'}
  catch(e){$('draftBtn').disabled=false;$('draftStatus').textContent=e.message;alert(e.message)}
 }
 function initials(v){const x=String(v||'TK').trim().split(/\s+/).filter(Boolean);return (x.length>1?x[0][0]+x[x.length-1][0]:x[0]?.slice(0,2)||'TK').toLocaleUpperCase('vi-VN')}
 function drawAccount(x,publicConfig){
  const a=x.account||x,c=x.channel||{},u=x.usage||{},name=c.name||x.channelName||a.email||'Tài khoản';
  $('accountName').textContent=name;$('accountEmail').textContent=a.email||'Tài khoản quản trị nội bộ';$('accountAvatar').textContent=initials(name);$('accountRole').textContent=a.role==='admin'?'Quản trị viên':'Thành viên';$('accountPlan').textContent=a.role==='admin'?'Không giới hạn':'Gói '+(a.plan||'free');$('accountCard').classList.remove('loading');
  $('accountUsage').textContent=u.label?`${u.label} • Đã dùng ${u.total??0} tổng • ${u.today??0} hôm nay • Còn ${u.remaining??'không giới hạn'}`:'Tài khoản đã sẵn sàng cho Health Studio.';
  const clerk=Boolean(state.clerk?.isSignedIn);$('legacyAccess').classList.toggle('hidden',clerk);$('signOut').classList.toggle('hidden',!clerk);$('authStatus').textContent=clerk?'✓ Đăng nhập bằng Clerk • đồng bộ với Dashboard':'✓ Xác thực bằng API legacy';
 }
 function loadScript(src,attrs={}){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.defer=true;s.crossOrigin='anonymous';Object.entries(attrs).forEach(([k,v])=>s.setAttribute(k,v));s.onload=ok;s.onerror=()=>no(Error('Không tải được Clerk'));document.head.append(s)})}
 async function ensureClerk(c){if(window.Clerk)return window.Clerk;const encoded=c?.clerkPublishableKey?.split('_')[2];if(!encoded)throw Error('Thiếu Clerk Publishable Key');const domain=atob(encoded).slice(0,-1);await loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,{'data-clerk-publishable-key':c.clerkPublishableKey});await window.Clerk.load();return window.Clerk}
 async function boot(){
  $('apiKey').value=apiKey();$('saveKey').onclick=()=>{const v=$('apiKey').value.trim();if(v)sessionStorage.setItem('renderApiKey',v);else sessionStorage.removeItem('renderApiKey');location.reload()};
  $('generateBtn').onclick=generate;$('draftBtn').onclick=createDraft;$('resetBtn').onclick=()=>{state.result=null;state.draft=null;$('result').classList.add('hidden');$('draftBtn').textContent='ĐƯA SANG REVIEW';window.scrollTo({top:0,behavior:'smooth'})};
  $('manageAccount').onclick=()=>{sessionStorage.setItem('autoMediaStage','wf-account');location.href='/'};
  try{const c=await fetch('/api/public-config',{cache:'no-store'}).then(r=>r.json());state.publicConfig=c;if(c.clerkEnabled){try{state.clerk=await ensureClerk(c)}catch(e){if(!apiKey())throw e}if(!state.clerk?.isSignedIn&&!apiKey())throw Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại từ Dashboard.')}const [s,a]=await Promise.all([api('/api/health-studio/status'),api('/api/account/me')]);$('runtimeBadge').textContent=`ONLINE • Health Studio ${s.version} • Copyright Safe ${s.copyrightSafeMode?'ON':'OFF'}`;$('runtimeBadge').className='badge gate-pass';drawAccount(a,c);$('signOut').onclick=async()=>{try{const clerk=state.clerk||await ensureClerk(c);await clerk.signOut();sessionStorage.removeItem('renderApiKey');location.href='/'}catch(e){alert('Không thể đăng xuất: '+e.message)}}}
  catch(e){$('runtimeBadge').textContent='CẦN XÁC THỰC';$('runtimeBadge').className='badge gate-review';$('accountName').textContent='Chưa xác thực';$('accountEmail').textContent='Vui lòng quay lại Dashboard để đăng nhập.';$('accountAvatar').textContent='!';$('accountCard').classList.remove('loading');$('authStatus').textContent='Không truy cập được API: '+e.message}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
