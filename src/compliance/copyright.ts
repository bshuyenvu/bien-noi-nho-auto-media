export type MediaRights =
  | 'owned'
  | 'generated'
  | 'public-domain'
  | 'cc0'
  | 'cc-by'
  | 'cc-by-sa'
  | 'licensed-stock'
  | 'unverified';

export interface RightsMetadata {
  rights?: MediaRights;
  creator?: string;
  licenseUrl?: string;
  rightsVerified?: boolean;
}

export interface OriginalityResult {
  safe:boolean;
  score:number;
  headlineSimilarity:number;
  phraseOverlap:number;
  reasons:string[];
}

export const copyrightSafeMode=()=>process.env.COPYRIGHT_SAFE_MODE!=='false';
const SAFE_RIGHTS=new Set<MediaRights>(['owned','generated','public-domain','cc0','cc-by','cc-by-sa','licensed-stock']);
const CREDIT_REQUIRED=new Set<MediaRights>(['cc-by','cc-by-sa','licensed-stock']);

export function mediaRightsAllowed(input:RightsMetadata){
  if(!copyrightSafeMode())return true;
  const rights=input.rights||'unverified';
  if(!SAFE_RIGHTS.has(rights)||input.rightsVerified!==true)return false;
  if(CREDIT_REQUIRED.has(rights)&&!(input.creator?.trim()||input.licenseUrl?.trim()))return false;
  return true;
}

function fold(text:string){return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').trim()}
function tokens(text:string){return fold(text).split(/\s+/).filter(Boolean)}
function jaccard(a:string[],b:string[]){const A=new Set(a),B=new Set(b);if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/(A.size+B.size-hit)}
function grams(text:string,n=8){const t=tokens(text),out=new Set<string>();for(let i=0;i+n<=t.length;i++)out.add(t.slice(i,i+n).join(' '));return out}

export function evaluateOriginality(headline:string,script:string,sources:string[],options?:{allowGenericHeadline?:boolean}):OriginalityResult{
  const source=sources.filter(Boolean).join('\n');
  const headlineSimilarity=jaccard(tokens(headline),tokens(source));
  const outputGrams=grams(script),sourceGrams=grams(source);let common=0;
  for(const g of outputGrams)if(sourceGrams.has(g))common++;
  const phraseOverlap=outputGrams.size?common/outputGrams.size:0;
  const reasons:string[]=[];
  if(headlineSimilarity>.72&&!options?.allowGenericHeadline)reasons.push('Tiêu đề mới quá giống nguồn tham khảo');
  if(phraseOverlap>.12)reasons.push('Kịch bản còn nhiều cụm 8 từ trùng nguồn');
  const safe=reasons.length===0;
  const score=Math.max(0,Math.round(100-headlineSimilarity*35-phraseOverlap*180));
  return{safe,score,headlineSimilarity:Number(headlineSimilarity.toFixed(3)),phraseOverlap:Number(phraseOverlap.toFixed(3)),reasons};
}

export function assertOriginalEditorial(headline:string,script:string,sources:string[],options?:{allowGenericHeadline?:boolean}){
  const result=evaluateOriginality(headline,script,sources,options);
  if(copyrightSafeMode()&&!result.safe)throw new Error(`Copyright Safety Gate chặn bản biên tập: ${result.reasons.join(' | ')}`);
  return result;
}

export function copyrightPolicyStatus(){return{
  enabled:copyrightSafeMode(),
  externalMediaDefault:'blocked-unless-rights-verified',
  directQuotesDefault:'off',
  researchSources:'facts-only',
  safeMedia:[...SAFE_RIGHTS],
};}
