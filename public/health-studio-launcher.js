(()=>{
 function mount(){
  if(document.getElementById('healthStudioLauncher'))return;
  const hero=document.querySelector('.hero');if(!hero)return setTimeout(mount,250);
  const a=document.createElement('a');a.id='healthStudioLauncher';a.href='/health-studio.html';a.textContent='🩺 HEALTH CONTENT STUDIO';
  a.style.cssText='display:inline-flex;margin-top:10px;padding:10px 14px;border-radius:10px;background:#087d70;color:white;text-decoration:none;font-weight:900;border:1px solid #48b7aa;box-shadow:0 8px 24px #0003';
  const target=hero.querySelector('.actions,.hero-actions')||hero;a.addEventListener('click',()=>sessionStorage.setItem('healthStudioReturn','dashboard'));target.append(a);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
