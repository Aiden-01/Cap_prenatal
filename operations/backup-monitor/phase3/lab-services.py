"""Only the temporary fixture API and simulated Resend; never a real transport."""
import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import hashlib
import json
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from monitor import server

lab=Path(sys.argv[1]).resolve()
assert 'runtime' in lab.parts and lab.name.startswith('run-')
db_path=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else lab/'monitor.sqlite'
assert db_path.is_relative_to(lab)
os.environ['CAP_BACKUP_ALERT_RECIPIENT']='alerts@example.invalid'
api=server(str(db_path),'synthetic-api-not-a-real-secret-123456',18866)
original=api.RequestHandlerClass.do_POST
def handler(self):
    if self.path=='/v1/ack' and (lab/'lose-ack').exists():
        return self.respond(503,{'error':'SIMULATED_ACK_LOSS'})
    return original(self)
api.RequestHandlerClass.do_POST=handler

class Provider(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        data=self.rfile.read(int(self.headers.get('Content-Length','0')))
        value=json.loads(data)
        assert self.path=='/emails'
        assert self.headers.get('Authorization')=='Bearer synthetic-resend-never-valid'
        assert value['to'] in ('alerts@example.invalid',['alerts@example.invalid'])
        assert not any(k in value for k in ('cc','bcc','attachments'))
        key=self.headers.get('Idempotency-Key');assert key and key.startswith('cap-backup-')
        if (lab/'provider-error').exists():
            self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"name":"application_error","message":"Simulated provider failure"}');return
        db=sqlite3.connect(lab/'provider.sqlite');db.execute('CREATE TABLE IF NOT EXISTS sent(key TEXT PRIMARY KEY,digest TEXT,id TEXT)')
        digest=hashlib.sha256(data).hexdigest();row=db.execute('SELECT digest,id FROM sent WHERE key=?',(key,)).fetchone()
        if row:assert row[0]==digest;ident=row[1]
        else:
            ident='synthetic-'+hashlib.sha256(key.encode()).hexdigest()[:24]
            db.execute('INSERT INTO sent VALUES (?,?,?)',(key,digest,ident));db.commit()
        db.close();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'id':ident}).encode())

mock=ThreadingHTTPServer(('127.0.0.1',18867),Provider)
threading.Thread(target=api.serve_forever,daemon=True).start()
(lab/'services-ready').write_text('loopback fixtures only')
mock.serve_forever()
