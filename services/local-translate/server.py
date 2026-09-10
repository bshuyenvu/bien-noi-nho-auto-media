import os,re
from typing import List,Union
import ctranslate2
from fastapi import FastAPI,HTTPException
from pydantic import BaseModel
import sentencepiece as spm

MODEL=os.getenv('LOCAL_TRANSLATE_MODEL','/model')
PORT=int(os.getenv('LOCAL_TRANSLATE_PORT','8080'))
THREADS=max(1,int(os.getenv('LOCAL_TRANSLATE_THREADS','2')))
translator=ctranslate2.Translator(MODEL,device='cpu',compute_type='int8',inter_threads=1,intra_threads=THREADS)
source_sp=spm.SentencePieceProcessor(model_file=os.path.join(MODEL,'source.spm'))
target_sp=spm.SentencePieceProcessor(model_file=os.path.join(MODEL,'target.spm'))
app=FastAPI(title='VietNewsFlow Local Translate',version='1.0')

class TranslateRequest(BaseModel):
    q: Union[str,List[str]]
    source: str='en'
    target: str='vi'


def chunks(text:str,max_chars:int=900)->List[str]:
    parts=[x.strip() for x in re.split(r'(?<=[.!?])\s+|\n+',text) if x.strip()]
    out:List[str]=[];buf=''
    for part in parts:
        if len(buf)+len(part)+1<=max_chars: buf=(buf+' '+part).strip()
        else:
            if buf: out.append(buf)
            while len(part)>max_chars:
                cut=part.rfind(' ',0,max_chars)
                if cut<max_chars//2: cut=max_chars
                out.append(part[:cut].strip());part=part[cut:].strip()
            buf=part
    if buf: out.append(buf)
    return out or [text[:max_chars]]
def translate_chunk(text:str)->str:
    tokens=source_sp.encode(text,out_type=str)[:510]+['</s>']
    result=translator.translate_batch([tokens],beam_size=2,max_decoding_length=512)[0]
    target=result.hypotheses[0]
    return target_sp.decode([x for x in target if x not in {'</s>','<pad>'}]).strip()


def translate_text(text:str)->str:
    return ' '.join(filter(None,(translate_chunk(x) for x in chunks(text))))

@app.get('/health')
def health():
    return {'ok':True,'engine':'CTranslate2','model':'Helsinki-NLP/opus-mt-en-vi','computeType':'int8','source':'en','target':'vi'}

@app.post('/translate')
def translate(req:TranslateRequest):
    if req.source!='en' or req.target!='vi':
        raise HTTPException(400,'Phase 9.3 chỉ hỗ trợ en → vi')
    values=req.q if isinstance(req.q,list) else [req.q]
    if not values or any(len(str(x))>12000 for x in values):
        raise HTTPException(400,'Nội dung dịch không hợp lệ hoặc quá dài')
    translated=[translate_text(str(x).strip()) for x in values]
    return {'translatedText':translated,'provider':'local-ctranslate2-opus-mt','source':'en','target':'vi'}

if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='0.0.0.0',port=PORT,workers=1,log_level='warning')