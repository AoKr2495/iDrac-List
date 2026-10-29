import json
import sqlite3
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import pytest
from backend.store import Store, Problem
from backend.config import Settings
from test_core import create, op


def sort(store, ids, version=None, operation=None):
    snap=store.snapshot()
    return store.mutate('sort','active-order',dict(operation_id=operation or str(uuid.uuid4()),pkfs=ids,base_version=snap['order_version'] if version is None else version))


def test_order_membership_noop_idempotency_and_lifecycle(store):
    a=create(store,pkf='PKF27GR00002');b=create(store,pkf='PKF25GR00001');a2=create(store,'second',a['pkf'])
    snap=store.snapshot();assert snap['active_order']==[a['pkf'],b['pkf']]
    version=snap['order_version'];revision=snap['revision']
    assert not sort(store,snap['active_order'])['changed']
    assert store.snapshot()['revision']==revision and store.snapshot()['order_version']==version
    operation=str(uuid.uuid4());first=sort(store,list(reversed(snap['active_order'])),version,operation)
    assert sort(store,list(reversed(snap['active_order'])),version,operation)==first
    packing=op(store,'progress',a,stage=4,state='Success',confirmed=True)['record']
    assert store.snapshot()['order_version']==version+1 # sibling retains membership
    op(store,'delete',a2,confirmed=True)
    assert store.snapshot()['active_order']==[b['pkf']]
    returned=op(store,'return',packing,confirmed=True)['record']
    assert store.snapshot()['active_order']==[b['pkf'],a['pkf']]
    assert returned['id']==a['id'] and returned['stage']==-1
    assert Store(store.settings).snapshot()['active_order']==[b['pkf'],a['pkf']]


def test_sort_conflicts_and_atomic_rollback(store):
    a=create(store);b=create(store,pkf='PKF26GR00468');snap=store.snapshot()
    with ThreadPoolExecutor(max_workers=2) as pool:
        def attempt(_):
            try:return sort(store,list(reversed(snap['active_order'])),snap['order_version'])
            except Problem as e:return e.code
        results=list(pool.map(attempt,range(2)))
    assert sum(isinstance(r,dict) for r in results)==1 and 'order_conflict' in results
    with pytest.raises(Problem):sort(store,[a['pkf'],a['pkf']])
    with pytest.raises(Problem):sort(store,[a['pkf']])
    before=store.snapshot()
    with store.connect() as db:db.execute("CREATE TRIGGER fail_sort BEFORE INSERT ON audit WHEN NEW.action='sort' BEGIN SELECT RAISE(ABORT,'test failure'); END")
    with pytest.raises(Problem):sort(store,list(reversed(before['active_order'])))
    assert store.snapshot()==before
    create(store,pkf='PKF26GR00469')
    with pytest.raises(Problem):sort(store,before['active_order'],before['order_version'])


def test_packing_full_status_and_concurrent_transitions(store):
    row=create(store);sibling=create(store,'sibling');op(store,'status',row,text='old')
    p=op(store,'progress',row,stage=4,state='Success',confirmed=True)['record']
    assert p['lifecycle']=='Packing' and p['packing_entered_at'] and p['completed_at'] is None
    assert next(r for r in store.snapshot()['servers'] if r['id']==sibling['id'])['lifecycle']=='Active'
    with pytest.raises(Problem):op(store,'status',row,text='stale')
    with pytest.raises(Problem) as error:create(store)
    assert error.value.code=='duplicate_packing'
    for text in ['old','new','']:p=op(store,'status',p,text=text)['record']
    assert [h['text'] for h in p['status_history']]==['','new','old','old']
    for action,body in [('edit',dict(changes={'model':'R250'})),('delete',dict(confirmed=True))]:
        with pytest.raises(Problem):op(store,action,p,**body)
    with ThreadPoolExecutor(max_workers=2) as pool:
        def finish(_):
            try:return op(store,'packing',p,confirmed=True)['record']
            except Problem:return None
        finished=list(pool.map(finish,range(2)))
    h=next(r for r in finished if r);assert len([r for r in finished if r])==1
    assert h['lifecycle']=='History' and h['completed_at']>=p['packing_entered_at']
    assert h['status_history']==p['status_history']
    active=op(store,'return',h,confirmed=True)['record']
    packing=op(store,'progress',active,stage=4,state='Success',confirmed=True)['record']
    assert packing['lifecycle']=='Packing' and packing['generation']==4
    store.flush_logs()
    logs=''.join(f.read_text() for f in store.settings.logs_dir.rglob('*.log'))
    assert '"Packing"' in logs and '"packing"' in logs and '"return"' in logs


def legacy_database(tmp_path, version=2):
    # The released schema, not a downgraded current Store, is the migration source.
    schema=(Path(__file__).parent/'fixtures/schema_v2.sql').read_text()
    settings=Settings(tmp_path/'Data',tmp_path/'Logs');settings.data_dir.mkdir()
    path=settings.data_dir/'idrac-list.sqlite3'
    with sqlite3.connect(path) as db:
        db.executescript(schema)
        for pkf,pos in [('PKF26GR00470','Bottom'),('PKF26GR00469','Pinned'),('PKF25GR00001','Normal'),('PKF26GR00468','Pinned')]:
            db.execute('INSERT INTO pkfs VALUES(?,?,?)',(pkf,pos,'note-'+pkf))
            db.execute('INSERT INTO servers(id,pkf,sn,created_at,updated_at) VALUES(?,?,?,?,?)',(pkf,pkf,'SN','old','old'))
        db.execute("INSERT INTO servers(id,pkf,sn,stage,progress_state,lifecycle,created_at,updated_at,completed_at) VALUES('old-history','PKF26GR00470','H',4,'Success','History','old','old','completed')")
        db.execute("INSERT INTO status_history(server_id,text,saved_at) VALUES('old-history','saved status','old')")
        db.execute("INSERT INTO audit(event_id,object,action,time,operation_id) VALUES('old-event','old-history','progress','2026-10-01T00:00:00+00:00','old-operation')")
        db.execute('INSERT INTO outbox VALUES(1,1)')
        if version==1:db.execute('ALTER TABLE pkfs DROP COLUMN note')
        db.execute(f'PRAGMA user_version={version}')
    return settings


@pytest.mark.parametrize('version',[1,2])
def test_real_old_schema_migration_preserves_every_relation(tmp_path,version):
    settings=legacy_database(tmp_path,version)
    path=settings.data_dir/'idrac-list.sqlite3'
    with sqlite3.connect(path) as db:
        before={t:db.execute('SELECT * FROM '+t).fetchall() for t in ['servers','status_history','audit','outbox']}
    upgraded=Store(settings);snap=upgraded.snapshot()
    assert snap['active_order']==['PKF26GR00468','PKF26GR00469','PKF25GR00001','PKF26GR00470']
    with upgraded.connect() as db:
        for t,records in before.items():
            after=db.execute('SELECT * FROM '+t).fetchall()
            assert [tuple(r)[:len(records[0])] for r in after]==records
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        assert db.execute('PRAGMA user_version').fetchone()[0]==3
        assert db.execute('PRAGMA foreign_key_list(status_history)').fetchone()['table']=='servers'
    history=next(r for r in snap['servers'] if r['id']=='old-history')
    assert history['lifecycle']=='History' and history['status_history'][0]['text']=='saved status'
    assert all(g['note']==('note-'+g['pkf'] if version==2 else '') for g in snap['pkfs'])
    assert Store(settings).snapshot()==snap


def test_migration_failure_rolls_back_original_schema(tmp_path):
    settings=legacy_database(tmp_path)
    with sqlite3.connect(settings.data_dir/'idrac-list.sqlite3') as db:
        db.execute('CREATE TABLE order_meta(invalid TEXT)')
    with pytest.raises(sqlite3.OperationalError):Store(settings)
    with sqlite3.connect(settings.data_dir/'idrac-list.sqlite3') as db:
        assert db.execute('PRAGMA user_version').fetchone()[0]==2
        assert 'packing_entered_at' not in [r[1] for r in db.execute('PRAGMA table_info(servers)')]
        assert db.execute('SELECT COUNT(*) FROM servers').fetchone()[0]==5
