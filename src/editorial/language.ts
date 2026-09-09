export interface LanguageDetection {
  code:string;
  name:string;
  confidence:number;
  script:'latin'|'cyrillic'|'han'|'japanese'|'korean'|'thai'|'arabic'|'mixed'|'unknown';
  isVietnamese:boolean;
  hint?:string;
}

const NAMES:Record<string,string>={
  vi:'Tiếng Việt',en:'Tiếng Anh',zh:'Tiếng Trung',ja:'Tiếng Nhật',ko:'Tiếng Hàn',th:'Tiếng Thái',
  ru:'Tiếng Nga',uk:'Tiếng Ukraina',fr:'Tiếng Pháp',de:'Tiếng Đức',es:'Tiếng Tây Ban Nha',
  pt:'Tiếng Bồ Đào Nha',id:'Tiếng Indonesia',ms:'Tiếng Mã Lai',ar:'Tiếng Ả Rập',und:'Chưa xác định'
};
const VI_CHARS=/[ăâđêôơưĂÂĐÊÔƠƯàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/;
const VI_WORDS=/\b(và|của|những|được|trong|ngày|cho|với|tại|theo|người|đã|đang|không|một|các|này|khi|sau)\b/gi;
const EN_WORDS=/\b(the|and|of|to|in|for|on|with|said|says|from|after|will|has|have|was|were)\b/gi;
const FR_WORDS=/\b(le|la|les|des|une|dans|pour|avec|sur|est|sont|après|selon)\b/gi;
const DE_WORDS=/\b(der|die|das|und|mit|für|von|ist|sind|nach|auf|den|dem)\b/gi;
const ES_WORDS=/\b(el|la|los|las|una|para|con|del|por|según|después|está|son)\b/gi;
const ID_WORDS=/\b(yang|dan|dengan|untuk|dari|pada|setelah|menurut|adalah|ini|itu)\b/gi;

function normalizeHint(raw?:string){
  const h=String(raw||'').trim().toLowerCase().replace('_','-');
  if(!h)return'';
  const first=h.split('-')[0];
  if(first==='zh'||first==='cmn')return'zh';
  if(first==='iw')return'he';
  return first;
}
function hits(text:string,re:RegExp){return (text.match(re)||[]).length}
function result(code:string,confidence:number,script:LanguageDetection['script'],hint?:string):LanguageDetection{
  return{code,name:NAMES[code]||code,confidence:Math.max(0,Math.min(1,confidence)),script,isVietnamese:code==='vi',...(hint?{hint}: {})};
}
export function detectLanguage(text:string,hint?:string):LanguageDetection{
  const sample=String(text||'').replace(/\s+/g,' ').trim().slice(0,12000),h=normalizeHint(hint);
  if(h&&NAMES[h])return result(h,0.98,scriptOf(sample),hint);
  if(!sample)return result('und',0,'unknown',hint);
  if(/[ぁ-ゟ゠-ヿ]/u.test(sample))return result('ja',0.99,'japanese',hint);
  if(/[가-힣]/u.test(sample))return result('ko',0.99,'korean',hint);
  if(/[ก-๙]/u.test(sample))return result('th',0.99,'thai',hint);
  if(/[\u0600-\u06ff]/u.test(sample))return result('ar',0.98,'arabic',hint);
  if(/[іїєґІЇЄҐ]/u.test(sample))return result('uk',0.96,'cyrillic',hint);
  if(/[А-Яа-яЁё]/u.test(sample))return result('ru',0.91,'cyrillic',hint);
  const han=(sample.match(/[\u3400-\u9fff]/gu)||[]).length;
  if(han>=Math.max(4,Math.floor(sample.length*0.08)))return result('zh',0.96,'han',hint);
  const viChars=(sample.match(new RegExp(VI_CHARS.source,'g'))||[]).length,viWords=hits(sample.toLowerCase(),VI_WORDS);
  if(viChars>=2||viWords>=4)return result('vi',Math.min(0.99,0.76+viChars*0.015+viWords*0.02),'latin',hint);
  const scores:{code:string;score:number}[]=[
    {code:'en',score:hits(sample.toLowerCase(),EN_WORDS)},
    {code:'fr',score:hits(sample.toLowerCase(),FR_WORDS)},
    {code:'de',score:hits(sample.toLowerCase(),DE_WORDS)},
    {code:'es',score:hits(sample.toLowerCase(),ES_WORDS)},
    {code:'id',score:hits(sample.toLowerCase(),ID_WORDS)}
  ].sort((a,b)=>b.score-a.score);
  if(scores[0].score>=3)return result(scores[0].code,Math.min(0.94,0.64+scores[0].score*0.035),'latin',hint);
  return result('und',0.35,scriptOf(sample),hint);
}
export function scriptOf(text:string):LanguageDetection['script']{
  const s=String(text||'');
  if(/[ぁ-ゟ゠-ヿ]/u.test(s))return'japanese';if(/[가-힣]/u.test(s))return'korean';if(/[ก-๙]/u.test(s))return'thai';
  if(/[\u0600-\u06ff]/u.test(s))return'arabic';if(/[А-Яа-яЁёІЇЄҐіїєґ]/u.test(s))return'cyrillic';if(/[\u3400-\u9fff]/u.test(s))return'han';
  if(/[A-Za-zÀ-ỹ]/u.test(s))return'latin';return s.trim()?'mixed':'unknown';
}
