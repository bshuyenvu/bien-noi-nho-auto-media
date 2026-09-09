import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('public/app.html','utf8');
const matches=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
let checked=0;
for(const match of matches){
  const code=String(match[1]||'').trim();
  if(!code)continue;
  new vm.Script(code,{filename:`public/app.html:inline-${checked+1}.js`});
  checked++;
}
if(!checked)throw new Error('public/app.html không có inline script để kiểm tra');
console.log(`app.html inline syntax OK • ${checked} script`);
