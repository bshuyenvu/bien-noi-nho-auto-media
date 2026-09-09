(()=>{
 const nativeFetch=window.fetch.bind(window),$=id=>document.getElementById(id);
 function auth(){const k=sessionStorage.getItem('renderApiKey')||'';return k?{authorization:'Bearer '+k}:{}}
 function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
 async function api(path,opt={}){opt.headers={...auth(),...(opt.headers||{})};const r=await nativeFetch(path,opt),x=await r.json();if(!r.ok)throw Error(x.error||r.status);return x}
 function mount(){
  if($('aiProviderConsole'))return;
  const grid=$('systemCockpit');if(!grid)return setTimeout(mount,300);
  const card=document.createElement('div');card.className='sys-card';card.id='aiProviderConsole';
  card.innerHTML=`<h3>🧠 AI BIÊN TẬP CHUẨN</h3><div class="sys-note">Một provider dùng xuyên suốt Fact Engine → Hook → Script. Rules chỉ là dự phòng an toàn.</div>
  <label>Provider ưu tiên</label><select id="aiPreferred"><option value="gemini">Gemini</option><option value="openai">OpenAI-compatible API</option></select>
  <div style="border-top:1px solid #334155;margin-top:10px;padding-top:8px"><b>Gemini</b><div id="geminiState" class="sys-note"></div><label>Model</label><input id="geminiModel" placeholder="gemini-3.6-flash"><label>API key mới (để trống = giữ khóa hiện tại)</label><input id="geminiKey" type="password" autocomplete="off"><button id="testGemini" class="secondary">TEST GEMINI</button></div>
  <div style="border-top:1px solid #334155;margin-top:10px;padding-top:8px"><b>OpenAI-compatible</b><div id="openaiState" class="sys-note"></div><label>Base URL</label><input id="openaiBase" placeholder="https://api.openai.com/v1"><label>Model</label><input id="openaiModel" placeholder="gpt-5.6-luna"><label>Protocol</label><select id="openaiProtocol"><option value="responses">Responses API</option><option value="chat_completions">Chat Completions</option></select><label>API key mới (để trống = giữ khóa hiện tại)</label><input id="openaiKey" type="password" autocomplete="off"><button id="testOpenai" class="secondary">TEST OPENAI API</button></div>
  <button id="saveAiProvider" class="green">💾 LƯU CẤU HÌNH AI</button><div id="aiProviderStatus" class="sys-note"></div>`;
  grid.prepend(card);wire();load();
 }
 function wire(){
  $('saveAiProvider').onclick=save;
  $('testGemini').onclick=()=>test('gemini');
  $('testOpenai').onclick=()=>test('openai');
 }
 function renderSettings(x){
  $('aiPreferred').value=x.preferredProvider||'gemini';
  $('geminiModel').value=x.gemini?.model||'gemini-3.6-flash';
  $('openaiBase').value=x.openai?.baseUrl||'https://api.openai.com/v1';
  $('openaiModel').value=x.openai?.model||'';
  $('openaiProtocol').value=x.openai?.protocol||'responses';
  $('geminiState').innerHTML=x.gemini?.keyConfigured?`<span class="sys-ok">✓ Có API key</span> • ${esc(x.gemini.keySource)}`:'<span class="sys-bad">✕ Chưa có API key</span>';
  $('openaiState').innerHTML=x.openai?.keyConfigured?`<span class="sys-ok">✓ Có API key</span> • ${esc(x.openai.keySource)}`:'<span class="sys-warn">Chưa cấu hình — tùy chọn</span>';
 }
 async function load(){try{const[x,s]=await Promise.all([api('/api/ai/settings'),api('/api/ai/status')]);renderSettings(x);const order=(s.order||[]).map(v=>v==='gemini'?'Gemini':v==='openai'?'OpenAI-compatible':v).join(' → ');$('aiProviderStatus').innerHTML=`Đang dùng: <b>${esc(order||'Rules fallback')}</b>`}catch(e){$('aiProviderStatus').textContent='⚠ '+e.message}}
 async function save(){
  const b=$('saveAiProvider');b.disabled=true;
  try{const payload={preferredProvider:$('aiPreferred').value,geminiModel:$('geminiModel').value.trim(),openaiBaseUrl:$('openaiBase').value.trim(),openaiModel:$('openaiModel').value.trim(),openaiProtocol:$('openaiProtocol').value};if($('geminiKey').value.trim())payload.geminiApiKey=$('geminiKey').value.trim();if($('openaiKey').value.trim())payload.openaiApiKey=$('openaiKey').value.trim();const x=await api('/api/ai/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});$('geminiKey').value='';$('openaiKey').value='';renderSettings(x);$('aiProviderStatus').innerHTML='<span class="sys-ok">✓ Đã lưu. Từ bản tin tiếp theo Fact Engine và Editor dùng cấu hình này.</span>'}catch(e){$('aiProviderStatus').innerHTML=`<span class="sys-bad">${esc(e.message)}</span>`}finally{b.disabled=false}
 }
 async function test(provider){const id=provider==='gemini'?'testGemini':'testOpenai',b=$(id);b.disabled=true;try{const x=await api('/api/ai/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider})});const target=provider==='gemini'?'geminiState':'openaiState';$(target).innerHTML+=x.ok?`<div class="sys-ok">✓ Kết nối OK • ${esc(x.model)}</div>`:`<div class="sys-bad">✕ ${(x.errors||[]).map(esc).join(' • ')}</div>`}catch(e){$('aiProviderStatus').innerHTML=`<span class="sys-bad">${esc(e.message)}</span>`}finally{b.disabled=false}}
 window.fetch=async(input,init)=>{const r=await nativeFetch(input,init);const url=typeof input==='string'?input:input?.url||'';if(url==='/api/ai-edit'){try{const x=await r.clone().json(),box=$('aiStatus');if(box&&x.provider)box.textContent+=` • Provider: ${String(x.provider).toUpperCase()}`}catch{}}return r};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
