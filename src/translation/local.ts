export interface LocalTranslationResult{
  title:string;
  body:string;
  provider:'local-ctranslate2-opus-mt';
}

const enabled=()=>process.env.LOCAL_TRANSLATION_ENABLED!=='false';
const endpoint=()=>String(process.env.LOCAL_TRANSLATION_URL||'http://local-translate:8080').replace(/\/$/,'');
const timeoutMs=()=>Math.max(3000,Number(process.env.LOCAL_TRANSLATION_TIMEOUT_MS||45000));

export function localTranslationStatus(){
  return{
    enabled:enabled(),
    endpoint:enabled()?endpoint():null,
    pair:'en-vi',
    engine:'CTranslate2',
    model:'Helsinki-NLP/opus-mt-en-vi',
  };
}

async function request(values:string[]){
  const r=await fetch(endpoint()+'/translate',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({q:values,source:'en',target:'vi'}),
    signal:AbortSignal.timeout(timeoutMs()),
  });
  const data=await r.json().catch(()=>({} as any));
  if(!r.ok)throw new Error(String((data as any).detail||(data as any).error||`HTTP ${r.status}`));
  const translated=(data as any).translatedText;
  if(!Array.isArray(translated)||translated.length!==values.length)throw new Error('Local translator trả dữ liệu không hợp lệ');
  return translated.map((x:any)=>String(x||'').trim());
}
export async function translateEnglishToVietnamese(input:{title:string;body:string}):Promise<LocalTranslationResult|undefined>{
  if(!enabled())return undefined;
  const title=String(input.title||'').trim().slice(0,1000);
  const body=String(input.body||'').replace(/\s+/g,' ').trim().slice(0,7000);
  if(!title||body.length<40)return undefined;
  const [translatedTitle,translatedBody]=await request([title,body]);
  if(!translatedTitle||translatedBody.length<40)throw new Error('Local translator không tạo được bản dịch đủ nội dung');
  return{title:translatedTitle.slice(0,180),body:translatedBody.slice(0,7000),provider:'local-ctranslate2-opus-mt'};
}

export async function testLocalTranslation(){
  if(!enabled())return{ok:false,enabled:false};
  const r=await fetch(endpoint()+'/health',{signal:AbortSignal.timeout(Math.min(10000,timeoutMs()))});
  const data=await r.json().catch(()=>({}));
  return{ok:r.ok,enabled:true,...data};
}