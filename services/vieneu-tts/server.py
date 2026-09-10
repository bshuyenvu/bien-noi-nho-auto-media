import base64
import io
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import soundfile as sf
from vieneu import Vieneu

_lock=threading.Lock()
_infer_lock=threading.Lock()
_engine=None
VOICE_DIR=Path(os.getenv("VIENEU_VOICE_DIR","/voices"))
VOICE_DIR.mkdir(parents=True,exist_ok=True)
VOICE_RE=re.compile(r"^user-[a-f0-9]{24}$")
DEFAULT_VOICE=os.getenv("VIENEU_DEFAULT_VOICE","Minh Đức")

def custom_path(name):
    if not VOICE_RE.fullmatch(str(name or "")): raise ValueError("Tên giọng tùy chỉnh không hợp lệ")
    return VOICE_DIR/f"{name}.wav"

def engine():
    global _engine
    with _lock:
        if _engine is None:
            _engine=Vieneu(mode=os.getenv("VIENEU_MODE","v3turbo"))
            for path in VOICE_DIR.glob("user-*.wav"):
                try:_engine.add_voice(path.stem,path,denoise=True,use_ref_codes=True,save=False)
                except Exception as exc: print(f"Voice enrollment skipped {path.name}: {exc}")
    return _engine

def custom_count(): return len(list(VOICE_DIR.glob("user-*.wav")))
class Handler(BaseHTTPRequestHandler):
    def log_message(self,format,*args): return
    def send_json(self,code,payload):
        body=json.dumps(payload,ensure_ascii=False).encode()
        self.send_response(code);self.send_header("content-type","application/json; charset=utf-8");self.send_header("content-length",str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        if self.path=="/health": return self.send_json(200,{"ok":True,"mode":os.getenv("VIENEU_MODE","v3turbo"),"cloneSupported":True,"customVoices":custom_count(),"defaultVoice":DEFAULT_VOICE})
        if self.path.startswith("/voices/"):
            try:name=self.path.split("/voices/",1)[1];exists=custom_path(name).exists();return self.send_json(200,{"exists":exists,"cloneSupported":True})
            except Exception as exc:return self.send_json(400,{"error":str(exc)})
        return self.send_json(404,{"error":"not found"})
    def do_POST(self):
        try:
            size=int(self.headers.get("content-length","0"));data=json.loads(self.rfile.read(size) or b"{}")
            if self.path=="/enroll": return self.enroll(data)
            if self.path=="/synthesize": return self.synthesize(data)
            return self.send_json(404,{"error":"not found"})
        except Exception as exc:return self.send_json(422,{"error":str(exc)})
    def enroll(self,data):
        name=str(data.get("name","")).strip();path=custom_path(name)
        raw=base64.b64decode(str(data.get("audio_base64","")).encode(),validate=True)
        if not raw or len(raw)>2_000_000: raise ValueError("Mẫu WAV không hợp lệ hoặc quá lớn")
        path.write_bytes(raw)
        try:engine().add_voice(name,path,denoise=True,use_ref_codes=True,save=False)
        except Exception:
            path.unlink(missing_ok=True);raise
        return self.send_json(200,{"ok":True,"voice":name,"cloneSupported":True})
    def synthesize(self,data):
        text=str(data.get("text","")).strip();voice=str(data.get("voice",DEFAULT_VOICE)).strip() or DEFAULT_VOICE
        if not text: raise ValueError("text is required")
        with _infer_lock: audio=engine().infer(text,voice=voice)
        buf=io.BytesIO();sf.write(buf,audio,48000,format="WAV",subtype="PCM_16");payload=buf.getvalue()
        try:
            self.send_response(200);self.send_header("content-type","audio/wav");self.send_header("content-length",str(len(payload)));self.end_headers();self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError): return
    def do_DELETE(self):
        if not self.path.startswith("/voices/"): return self.send_json(404,{"error":"not found"})
        try:
            name=self.path.split("/voices/",1)[1];path=custom_path(name);path.unlink(missing_ok=True)
            global _engine
            with _lock:
                if _engine is not None:
                    try:_engine.remove_voice(name)
                    except Exception: pass
            return self.send_json(200,{"deleted":True})
        except Exception as exc:return self.send_json(400,{"error":str(exc)})

if __name__=="__main__":
    ThreadingHTTPServer(("0.0.0.0",int(os.getenv("PORT","7861"))),Handler).serve_forever()
