import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from vieneu import Vieneu

_lock = threading.RLock()
_engine = None


def engine():
    global _engine
    with _lock:
        if _engine is None:
            _engine = Vieneu(mode=os.getenv("VIENEU_MODE", "v3nano"), backend="onnx")
        return _engine


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            return self.send_json(404, {"error": "not found"})
        self.send_json(200, {"ok": True, "provider": "VieNeu v3", "mode": os.getenv("VIENEU_MODE", "v3nano"), "license": "Apache-2.0"})

    def do_POST(self):
        if self.path != "/synthesize":
            return self.send_json(404, {"error": "not found"})
        try:
            size = int(self.headers.get("content-length", "0"))
            data = json.loads(self.rfile.read(size))
            text = str(data.get("text", "")).strip()
            if not 1 <= len(text) <= 12000:
                raise ValueError("text length must be 1..12000")
            voice = str(data.get("voice", "Minh Quân"))
            with _lock:
                audio = engine().infer(text, voice=voice)
                handle, path = tempfile.mkstemp(suffix=".wav")
                os.close(handle)
                engine().save(audio, path)
            with open(path, "rb") as stream:
                body = stream.read()
            os.unlink(path)
            self.send_response(200)
            self.send_header("content-type", "audio/wav")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_json(422, {"error": str(exc)})

    def log_message(self, fmt, *args):
        print("VieNeu:", fmt % args, flush=True)


ThreadingHTTPServer(("0.0.0.0", 7861), Handler).serve_forever()
