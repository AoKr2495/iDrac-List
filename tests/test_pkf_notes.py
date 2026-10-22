import json
import sqlite3
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.config import Settings
from backend.store import Store, Problem
from test_core import create, op


def note(store, pkf, text, operation=None):
    return store.mutate('pkf_note',pkf,dict(operation_id=operation or str(uuid.uuid4()),text=text))


def test_note_is_shared_pkf_metadata_preserved_through_history_and_return(store):
    row=create(store)
    result=note(store,row['pkf'],'  客户说明 / delivery  ')
    assert result['record']['note']=='客户说明 / delivery' and result['changed']
    operation=str(uuid.uuid4())
    first=note(store,row['pkf'],'Updated',operation)
    assert note(store,row['pkf'],'Updated',operation)==first
    assert not note(store,row['pkf'],'Updated')['changed']
    history=op(store,'progress',row,stage=4,state='Success',confirmed=True)['record']
    with pytest.raises(Problem):note(store,row['pkf'],'History is read only')
    assert Store(store.settings).snapshot()['pkfs'][0]['note']=='Updated'
    active=op(store,'return',history,confirmed=True)['record']
    assert active['id']==row['id']
    assert note(store,row['pkf'],'')['record']['note']==''


def test_notes_do_not_create_empty_pkf_or_accept_multiline(store):
    with pytest.raises(Problem):note(store,'PKF26GR00467','empty group')
    assert store.snapshot()['pkfs']==[]
    row=create(store)
    for text in [None,'two\nlines','two\rlines',123]:
        with pytest.raises(Problem):note(store,row['pkf'],text)


def test_note_audit_and_deleted_server_context(store):
    row=create(store);note(store,row['pkf'],'Before deleting')
    op(store,'delete',row,confirmed=True)
    store.flush_logs()
    with store.connect() as db:
        audit=db.execute("SELECT * FROM audit WHERE action='pkf_note'").fetchone()
        assert audit['server_id'] is None
        assert json.loads(audit['before_json'])['note']==''
        assert json.loads(audit['after_json'])['note']=='Before deleting'
        snapshot=json.loads(db.execute('SELECT snapshot_json FROM deleted_snapshots').fetchone()[0])
        assert snapshot['pkf_note']=='Before deleting'
        assert any(event['action']=='pkf_note' for event in snapshot['operations'])
    replacement=create(store)
    assert replacement['id']!=row['id']
    assert store.snapshot()['pkfs'][0]['note']=='Before deleting'


def test_version_one_database_migrates_without_losing_business_or_audit(store):
    row=create(store);op(store,'status',row,text='Existing data')
    with store.connect() as db:
        # Recreate the exact v1 pkfs table shape, retaining its existing key/position.
        db.execute('ALTER TABLE pkfs DROP COLUMN note')
        db.execute('PRAGMA user_version=1')
    before=store.snapshot()
    upgraded=Store(store.settings)
    after=upgraded.snapshot()
    assert after['servers']==before['servers'] and after['revision']==before['revision']
    assert after['pkfs'][0]==dict(before['pkfs'][0],note='')
    with upgraded.connect() as db:assert db.execute('PRAGMA user_version').fetchone()[0]==2
    # Re-running startup never overwrites an already stored note.
    note(upgraded,row['pkf'],'Survives restart')
    assert Store(store.settings).snapshot()['pkfs'][0]['note']=='Survives restart'


def test_pkf_note_api(tmp_path):
    app=create_app(Settings(tmp_path/'Data',tmp_path/'Logs'))
    with TestClient(app) as client:
        row=client.post('/api/servers',json={'operation_id':str(uuid.uuid4()),'pkf':'PKF26GR00467','sn':'NOTE'}).json()['record']
        response=client.post('/api/pkfs/PKF26GR00467/note',json={'operation_id':str(uuid.uuid4()),'text':'API note'})
        assert response.status_code==200
        assert client.get('/api/state').json()['pkfs'][0]['note']=='API note'
