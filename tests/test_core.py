import json
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.config import Settings
from backend.store import Problem, Store, normalize_pkf

def op(store, action='create', row=None, **body):
    return store.mutate(action,row['id'] if row else '', dict(operation_id=str(uuid.uuid4()), **({'generation':row['generation']} if row else {}), **body))

def create(store,sn='SN1',pkf='PKF26GR00467'):
    return op(store,pkf=pkf,sn=sn)['record']

@pytest.mark.parametrize('value',['468','0468','00468','26gr00468','PKF26GR00468'])
def test_normalize(value):
    assert normalize_pkf(value)=='PKF26GR00468'

@pytest.mark.parametrize('value',['0','00000','123456','PKF2GR00468','abc','26 GR4'])
def test_invalid_pkf(value):
    with pytest.raises(Problem): normalize_pkf(value)

def test_global_uniqueness_and_history_conflict(store):
    a=create(store)
    with pytest.raises(Problem) as e: create(store)
    assert e.value.code=='duplicate_active'
    create(store,pkf='PKF26GR00468')
    h=op(store,'progress',a,stage=4,state='Success',confirmed=True)['record']
    with pytest.raises(Problem) as e: create(store)
    assert e.value.code=='duplicate_history' and e.value.record['id']==h['id']
    with store.connect() as db:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("INSERT INTO servers(id,pkf,sn,created_at,updated_at) VALUES('x',?,?,?,?)", (a['pkf'],a['sn'],'t','t'))

def test_status_empty_idempotency_and_same_text(store):
    a=create(store)
    r=op(store,'status',a,text='   ')
    assert not r['changed'] and not r['record']['status_history']
    body=dict(operation_id=str(uuid.uuid4()),generation=0,text='ready')
    first=store.mutate('status',a['id'],body)
    assert store.mutate('status',a['id'],body)==first
    op(store,'status',a,text='ready')
    latest=op(store,'status',a,text='')['record']
    assert [x['text'] for x in latest['status_history']]==['','ready','ready']
    with pytest.raises(Problem): store.mutate('status',a['id'],dict(body,text='other'))

def test_validation_return_stale_and_delete(store):
    a=create(store)
    op(store,'status',a,text='note')
    with pytest.raises(Problem): op(store,'progress',a,stage=4,state='Success')
    h=op(store,'progress',a,stage=4,state='Success',confirmed=True)['record']
    assert h['completed_at'] and h['generation']==1 and h['id']==a['id']
    with pytest.raises(Problem) as exc: op(store,'status',a,text='old')
    assert exc.value.code=='completed' and exc.value.message=='Server 已完成'
    with pytest.raises(Problem): op(store,'edit',h,changes={'model':'R250'})
    b=op(store,'return',h,confirmed=True)['record']
    assert b['id']==a['id'] and b['stage']==-1 and b['completed_at'] is None and b['status_history'][0]['text']=='note'
    with pytest.raises(Problem): op(store,'status',a,text='old after return')
    op(store,'delete',b,confirmed=True)
    with pytest.raises(Problem) as e: op(store,'edit',b,changes={'sn':'back'})
    assert e.value.code=='deleted'
    assert create(store)['id']!=a['id']
    with store.connect() as db:
        snapshot=json.loads(db.execute('SELECT snapshot_json FROM deleted_snapshots').fetchone()[0])
        assert snapshot['status_history'][0]['text']=='note' and len(snapshot['operations'])==5
        with pytest.raises(sqlite3.IntegrityError): db.execute('DELETE FROM deleted_snapshots')

def test_progress_and_last_write_wins(store):
    a=create(store)
    op(store,'progress',a,stage=0,state='Fail')
    b=op(store,'progress',a,stage=3,state='ing')['record']
    assert b['stage']==3 and b['progress_state']=='ing'
    op(store,'edit',a,changes={'model':'R250'})
    op(store,'edit',a,changes={'model':'R260'})
    b=op(store,'edit',a,changes={'os':'CTD'})['record']
    assert b['model']=='R260' and b['os']=='CTD'
    with pytest.raises(Problem): op(store,'progress',a,stage=4,state='Fail',confirmed=True)
    with pytest.raises(Problem): op(store,'edit',a,changes={'os':'other'})

def test_concurrent_creates_and_status(store):
    def worker(_):
        try: return create(store)
        except Problem: return None
    with ThreadPoolExecutor(max_workers=8) as pool: rows=list(pool.map(worker,range(12)))
    a=next(r for r in rows if r)
    assert len([r for r in rows if r])==1
    with ThreadPoolExecutor(max_workers=8) as pool: list(pool.map(lambda n:op(store,'status',a,text=f'note {n}'),range(16)))
    assert len(store.snapshot()['servers'][0]['status_history'])==16

def test_logs_restart_and_replay(store):
    a=create(store)
    op(store,'delete',a,confirmed=True)
    store.flush_logs()
    timeline=next((store.settings.logs_dir/'Timeline').glob('*.log'))
    delete=next((store.settings.logs_dir/'Delete').glob('*.log'))
    assert len(timeline.read_text().splitlines())==2
    assert json.loads(delete.read_text())['snapshot']['sn']=='SN1'
    # Simulate append succeeded but acknowledgement did not persist.
    with store.connect() as db: db.execute('UPDATE outbox SET delivered=0')
    with timeline.open('ab') as f: f.write(b'{incomplete')
    other=Store(store.settings); other.flush_logs()
    assert len(timeline.read_text().splitlines())==2
    assert len(delete.read_text().splitlines())==1
    assert not other.snapshot()['servers']

def test_log_failure_does_not_lose_snapshot(store):
    a=create(store); op(store,'delete',a,confirmed=True)
    store.settings.logs_dir.mkdir(parents=True)
    (store.settings.logs_dir/'Timeline').write_text('blocked')
    with pytest.raises(OSError): store.flush_logs()
    with store.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM outbox WHERE delivered=0').fetchone()[0]==2
        assert db.execute('SELECT COUNT(*) FROM deleted_snapshots').fetchone()[0]==1
    (store.settings.logs_dir/'Timeline').unlink(); store.flush_logs()

def test_position_persistence_and_sn_binary(store):
    a=create(store,' A '); create(store,'a')
    store.mutate('position',a['pkf'],dict(operation_id=str(uuid.uuid4()),position='Pinned'))
    op(store,'delete',a,confirmed=True)
    assert Store(store.settings).snapshot()['pkfs'][0]['position']=='Pinned'

def test_api(tmp_path):
    app=create_app(Settings(tmp_path/'Data',tmp_path/'Logs'))
    with TestClient(app) as c:
        assert c.get('/api/state').status_code==200
        payload=dict(operation_id=str(uuid.uuid4()),pkf='PKF26GR00467',sn='SN')
        r=c.post('/api/servers',json=payload)
        assert r.status_code==200 and r.json()['record']['generation']==0
        assert c.post('/api/servers',json={**payload,'operation_id':str(uuid.uuid4())}).status_code==409
        assert c.post('/api/servers',json={'sn':''}).status_code==422
        assert c.get('/api/state').headers['cache-control']=='no-store'

def test_config_switch_guard(tmp_path):
    cfg=tmp_path/'config.yaml'; cfg.write_text('storage:\n  data_dir: ./Other\n')
    with pytest.raises(ValueError): Settings.load(cfg)
    settings=Settings.load(cfg,initialize_empty=True)
    Store(settings)
    assert Settings.load(cfg).data_dir==settings.data_dir

def test_transaction_rollback_does_not_leave_business_or_audit(store):
    with store.connect() as db:
        db.execute("CREATE TRIGGER injected_failure BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'injected disk error'); END")
    with pytest.raises(Problem): create(store)
    state=store.snapshot()
    assert state['servers']==[] and state['pkfs']==[] and state['revision']==0
    with store.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM operations').fetchone()[0]==0
        assert db.execute('SELECT COUNT(*) FROM outbox').fetchone()[0]==0

def test_edit_sn_history_conflict_and_optional_fields(store):
    a=create(store,'A'); b=create(store,'B')
    op(store,'progress',a,stage=4,state='Success',confirmed=True)
    with pytest.raises(Problem) as e:op(store,'edit',b,changes={'sn':' A '})
    assert e.value.code=='duplicate_history'
    assert store.snapshot()['servers'][1]['sn']=='B'
    for field in ('model','os'):
        value='R250' if field=='model' else 'xDome'
        op(store,'edit',b,changes={field:value})
        assert op(store,'edit',b,changes={field:None})['record'][field] is None
    h=op(store,'progress',b,stage=4,state='Success',confirmed=True)['record']
    assert h['model'] is None and h['os'] is None

def test_api_bad_payloads_are_rejected_without_changes(tmp_path):
    app=create_app(Settings(tmp_path/'Data',tmp_path/'Logs'))
    with TestClient(app) as c:
        assert c.post('/api/servers',json={'operation_id':str(uuid.uuid4())}).status_code==400
        a=c.post('/api/servers',json=dict(operation_id=str(uuid.uuid4()),pkf='PKF26GR00467',sn='SN')).json()['record']
        assert c.post(f"/api/servers/{a['id']}/progress",json=dict(operation_id=str(uuid.uuid4()),generation=0,stage=True,state='Success')).status_code==422
        assert c.post(f"/api/servers/{a['id']}/status",json=dict(operation_id=str(uuid.uuid4()),generation=0,text='two\nlines')).status_code==400
        assert c.post(f"/api/servers/{a['id']}/delete",json=dict(operation_id=str(uuid.uuid4()),generation=0)).status_code==400
        assert c.get('/api/state').json()['revision']==1
