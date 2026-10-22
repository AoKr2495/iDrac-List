"""A real uvicorn process, killed/restarted against the same on-disk database."""
import json
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def test_real_process_restart(tmp_path):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    cfg=tmp_path/'config.yaml'
    cfg.write_text(f'server:\n  host: 127.0.0.1\n  port: {port}\nstorage:\n  data_dir: ./Data\n  logs_dir: ./Logs\n')
    base=f'http://127.0.0.1:{port}'
    def call(path, body=None):
        req=urllib.request.Request(base+path,data=json.dumps(dict(body,operation_id=str(uuid.uuid4()))).encode() if body is not None else None,headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=3) as response:return json.load(response)
    def start():
        log=(tmp_path/'server.log').open('a')
        proc=subprocess.Popen([sys.executable,'-m','backend','--config',str(cfg)],cwd=ROOT,stdout=log,stderr=log)
        log.close()
        for _ in range(100):
            if proc.poll() is not None:raise AssertionError((tmp_path/'server.log').read_text())
            try:call('/api/health');return proc
            except OSError:time.sleep(.05)
        proc.kill();proc.wait();raise AssertionError('Startup timed out')
    def stop(proc):
        proc.terminate()
        try:proc.wait(timeout=5)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()
    proc=start()
    try:
        a=call('/api/servers',dict(pkf='PKF26GR00467',sn='PERSIST'))['record']
        call('/api/pkfs/PKF26GR00467/position',dict(position='Pinned'))
        call(f"/api/servers/{a['id']}/status",dict(generation=0,text='Persistent history'))
        h=call(f"/api/servers/{a['id']}/progress",dict(generation=0,stage=4,state='Success',confirmed=True))['record']
    finally:stop(proc)
    proc=start()
    try:
        state=call('/api/state');row=state['servers'][0]
        assert row['id']==a['id'] and row['lifecycle']=='History' and row['completed_at']==h['completed_at']
        assert row['status_history'][0]['text']=='Persistent history'
        assert state['pkfs'][0]['position']=='Pinned'
        row=call(f"/api/servers/{a['id']}/return",dict(generation=1,confirmed=True))['record']
        assert row['stage']==-1 and row['generation']==2
    finally:stop(proc)
    assert list((tmp_path/'Logs'/'Timeline').glob('*.log'))
