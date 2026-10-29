"""Exercise the built container over HTTP; only CI-owned fixture data is used."""
import json
import sys
import time
import urllib.request
import uuid
from pathlib import Path

BASE='http://127.0.0.1:18088'
MARKER=Path('.cache/container-smoke.json')

def call(path,body=None):
    request=urllib.request.Request(BASE+path,data=json.dumps(dict(body,operation_id=str(uuid.uuid4()))).encode() if body else None,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=5) as response:return json.load(response)

for attempt in range(60):
    try:
        call('/api/health');break
    except OSError:time.sleep(1)
else:raise RuntimeError('Container failed to become healthy')

if sys.argv[1]=='seed':
    baseline=Path('.cache/container-upgrade-before.json')
    if baseline.exists():
        expected=json.loads(baseline.read_text())
        snapshot=call('/api/state')
        for row in expected['servers']:
            actual=next(r for r in snapshot['servers'] if r['id']==row['id'])
            assert all(actual[k]==v for k,v in row.items()), 'Existing business data changed'
        assert snapshot['pkfs']==expected['pkfs']
        assert snapshot['active_order']==['PKF26GR00001','PKF25GR00001','PKF26GR00002']
        assert next(r for r in snapshot['servers'] if r['id']=='CI-HISTORY')['status_history'][0]['text']=='Pre-upgrade history'
        print('Schema-v2 business/History/Status/notes/order preserved by schema-v3 upgrade.')

    with urllib.request.urlopen(BASE+'/') as response:
        assert b'<div id="root"></div>' in response.read()
    row=call('/api/servers',dict(pkf='PKF26GR00467',sn='CI-PERSISTENCE'))['record']
    snap=call('/api/state')
    call('/api/pkfs/order',dict(pkfs=list(reversed(snap['active_order'])),base_version=snap['order_version']))
    call(f"/api/servers/{row['id']}/status",dict(generation=0,text='Persist across container restart'))
    complete=call(f"/api/servers/{row['id']}/progress",dict(generation=0,stage=4,state='Success',confirmed=True))['record']
    assert complete['lifecycle']=='Packing'
    complete=call(f"/api/servers/{row['id']}/packing",dict(generation=1,confirmed=True))['record']
    MARKER.write_text(json.dumps(dict(record=complete,order=call('/api/state')['active_order'])))
else:
    marker=json.loads(MARKER.read_text());prior=marker['record'];snapshot=call('/api/state')
    current=next(r for r in snapshot['servers'] if r['id']==prior['id'])
    assert current['lifecycle']=='History' and current['completed_at']==prior['completed_at']
    assert current['status_history']==prior['status_history']
    assert snapshot['active_order']==marker['order']
    active=call(f"/api/servers/{current['id']}/return",dict(generation=2,confirmed=True))['record']
    call(f"/api/servers/{current['id']}/delete",dict(generation=3,confirmed=True))
    for attempt in range(15):
        if call('/api/health')['pending_logs']==0:break
        time.sleep(1)
    else:raise AssertionError('Container did not export audit logs')
    assert list(Path('.cache/smoke/Logs/Delete').glob('*.log'))
    print('Container HTTP, lifecycle, durable logs, config, and restart persistence passed.')
