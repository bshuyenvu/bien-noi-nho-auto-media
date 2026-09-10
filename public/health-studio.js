(()=>{
 const $=id=>document.getElementById(id),state={result:null,draft:null};
 const apiKey=()=>sessionStorage.getItem('renderApiKey')||'';
 function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function headers(json=false){return{...(json?{'content-type':'application/json'}:{}),...(apiKey()?{authorization:'Bearer '+apiKey()}:{})}}
 async function api(url,opt={}){opt.headers={...headers(Boolean(opt.body)),...(opt.headers||{})};const r=await fetch(url,opt),d=await r.json().catch(()=>({error:'Phản hồi không hợp lệ'}));if(!r.ok)throw Error(typeof d.error==='string'?d.error:JSON.stringify(d.error||r.status));return d}
 function statusClass(status){return status==='pass'?'gate-pass':status==='review'?'gate-review':'gate-block'}
 function statusLabel(status){return status==='pass'?'PASS':status==='review'?'REVIEW':'BLOCK'}
 function gateCard(label,status,score,detail){return `<div class="gate-card ${statusClass(status)}"><small>${esc(label)}</small><strong>${statusLabel(status)}${Number.isFinite(score)?' • '+Math.round(score):''}</strong><small>${esc(detail||'')}</small></div>`}
 const progressMessages=['Đọc và kiểm tra tính nhất quán của nguồn…','Fact Engine đang khóa claim y khoa…','Đối chiếu Evidence Gate và nguồn độc lập…','Editorial Professional V2 đang viết bản nguyên gốc…','Medical Safety + Copyright Gate đang kiểm tra…'];
 function setBusy(on){$('generateBtn').disabled=on;$('progress').classList.toggle('hidden',!on);if(on)$('result').classList.add('hidden')}
 function renderSources(x){
  const rows=[{name:x.article?.sourceName||'Nguồn chính',url:x.article?.sourceUrl},...(x.research?.sources||[])];
  $('sources').innerHTML=rows.filter(v=>v?.url).map(v=>`<div class="source"><b>${esc(v.name||'Nguồn')}</b><br><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.url)}</a></div>`).join('')||'<div class="muted">Không có nguồn hiển thị.</div>';
 }
 function renderWarnings(x){
  const hs=x.healthStudio?.healthSafety||{},items=[...(hs.reasons||[]),...(hs.warnings||[]),...(x.evidenceGate?.reasons||[]),...(x.intelligence?.warnings||[])];
  $('warnings').innerHTML=items.length?items.map(v=>`<div class="warning">${esc(v)}</div>`).join(''):'<div class="ok-note">Không phát hiện cảnh báo bổ sung ở lớp kiểm tra tự động.</div>';
 }
 function renderMetrics(x){
  const h=x.healthStudio||{},i=x.intelligence||{},o=x.copyrightSafety?.originality||{};
  $('evidenceSummary').innerHTML=[['Evidence score',x.evidenceGate?.score],['Source score',i.sourceScore],['Authority',i.authorityScore],['Originality',o.score],['Topic match',Math.round((h.topicMatch||0)*100)+'%'],['Claims',x.evidenceGate?.supportedClaimCount+'/'+x.evidenceGate?.claimCount]].map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
 }
 function renderResult(x){
  state.result=x;state.draft=null;const h=x.healthStudio||{},m=h.healthSafety||{},o=x.copyrightSafety?.originality||{};
  $('headline').textContent=x.edited?.headline||'';$('hook').textContent=x.edited?.hook||'';$('script').textContent=x.edited?.script||'';
  $('gateGrid').innerHTML=[gateCard('Evidence Gate',x.evidenceGate?.status,x.evidenceGate?.score,'Claim → Source'),gateCard('Originality',o.safe?'pass':'block',o.score,'Không sao chép nguồn'),gateCard('Medical Safety',m.status,m.score,'An toàn nội dung y khoa'),gateCard('Copyright',x.copyrightSafety?.mode==='strict'?'pass':'review',undefined,'Media bên ngoài bị khóa'),gateCard('Human Review','review',undefined,'Bắt buộc trước render')].join('');
  renderMetrics(x);renderSources(x);renderWarnings(x);
  const ready=Boolean(h.readyForDraft);$('readyBadge').textContent=ready?'✓ ĐỦ ĐIỀU KIỆN TẠO DRAFT':'⚠ CẦN SỬA / KIỂM TRA';$('readyBadge').className='badge '+(ready?'gate-pass':'gate-review');
  $('draftBtn').disabled=!ready||!x.draftPayload;$('draftStatus').textContent=ready?'Bản này chưa được duyệt và chưa thể render.':'Health Studio chưa cho phép đưa bản này sang Review.';
  $('result').classList.remove('hidden');$('result').scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function generate(){
  const primaryUrl=$('primaryUrl').value.trim(),topic=$('topic').value.trim();
  try{const u=new URL(primaryUrl);if(!/^https?:$/.test(u.protocol))throw Error()}catch{return alert('Vui lòng nhập URL nguồn HTTP/HTTPS hợp lệ.')}
  setBusy(true);$('progressTitle').textContent=progressMessages[0];$('progressText').textContent='Quy trình có thể chuyển sang rules fallback nếu AI provider tạm hết quota.';
  let i=0;const timer=setInterval(()=>{$('progressTitle').textContent=progressMessages[++i%progressMessages.length]},1300);
  try{const x=await api('/api/health-studio/generate',{method:'POST',body:JSON.stringify({primaryUrl,topic:topic||undefined,audience:$('audience').value,length:$('length').value,format:$('format').value})});renderResult(x)}
  catch(e){$('progress').classList.remove('hidden');$('progressTitle').textContent='Không thể tạo bản Health Studio';$('progressText').textContent=e.message;alert(e.message)}
  finally{clearInterval(timer);$('generateBtn').disabled=false;if(state.result)$('progress').classList.add('hidden')}
 }
 async function createDraft(){
  const x=state.result;if(!x?.healthStudio?.readyForDraft||!x.draftPayload)return;
  $('draftBtn').disabled=true;$('draftStatus').textContent='Đang tạo Draft và gắn Evidence Bundle…';
  try{const d=await api('/api/drafts',{method:'POST',body:JSON.stringify(x.draftPayload)});state.draft=d;$('draftStatus').innerHTML=`✓ Đã tạo Draft <b>${esc(d.id)}</b>. Evidence Bundle đã được khóa vào Draft; tiếp tục Evidence Review trên Dashboard.`;$('draftBtn').textContent='✓ ĐÃ CHUYỂN SANG REVIEW'}
  catch(e){$('draftBtn').disabled=false;$('draftStatus').textContent=e.message;alert(e.message)}
 }
 async function boot(){
  $('apiKey').value=apiKey();$('saveKey').onclick=()=>{const v=$('apiKey').value.trim();if(v)sessionStorage.setItem('renderApiKey',v);else sessionStorage.removeItem('renderApiKey');location.reload()};
  $('generateBtn').onclick=generate;$('draftBtn').onclick=createDraft;$('resetBtn').onclick=()=>{state.result=null;state.draft=null;$('result').classList.add('hidden');$('draftBtn').textContent='ĐƯA SANG REVIEW';window.scrollTo({top:0,behavior:'smooth'})};
  try{const [s,a]=await Promise.all([api('/api/health-studio/status'),api('/api/account/me')]);$('runtimeBadge').textContent=`ONLINE • Health Studio ${s.version} • Copyright Safe ${s.copyrightSafeMode?'ON':'OFF'}`;$('runtimeBadge').className='badge gate-pass';$('authStatus').textContent=`Đã xác thực • ${a.channel?.name||a.channelName||a.account?.email||'tài khoản'}`}
  catch(e){$('runtimeBadge').textContent='CẦN XÁC THỰC';$('runtimeBadge').className='badge gate-review';$('authStatus').textContent='Không truy cập được API: '+e.message}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
