"""Build an actual released-schema fixture in CI-owned storage only."""
import json
import sqlite3
from pathlib import Path
base=Path('.cache/smoke')
base.joinpath('Data').mkdir(parents=True,exist_ok=True)
path=base/'Data/idrac-list.sqlite3'
if path.exists():raise RuntimeError('Upgrade fixture requires an empty CI-only directory')
with sqlite3.connect(path) as db:
    db.row_factory=sqlite3.Row
    db.executescript(Path('tests/fixtures/schema_v2.sql').read_text())
    for pkf,pos in [('PKF25GR00001','Normal'),('PKF26GR00001','Pinned'),('PKF26GR00002','Bottom')]:
        db.execute('INSERT INTO pkfs VALUES(?,?,?)',(pkf,pos,'Preserved note'))
        db.execute('INSERT INTO servers(id,pkf,sn,created_at,updated_at) VALUES(?,?,?,?,?)',(pkf,pkf,'CI-OLD','2026-10-01T00:00:00+00:00','2026-10-01T00:00:00+00:00'))
    db.execute("INSERT INTO servers(id,pkf,sn,stage,progress_state,lifecycle,created_at,updated_at,completed_at) VALUES('CI-HISTORY','PKF25GR00001','DONE',4,'Success','History','2026-10-01T00:00:00+00:00','2026-10-01T00:00:00+00:00','2026-10-01T01:00:00+00:00')")
    db.execute("INSERT INTO status_history(server_id,text,saved_at) VALUES('CI-HISTORY','Pre-upgrade history','2026-10-01T01:00:00+00:00')")
    db.execute("INSERT INTO audit(event_id,object,action,time,operation_id) VALUES('CI-OLD-EVENT','CI-HISTORY','progress','2026-10-01T00:00:00+00:00','CI-OLD-OPERATION')")
    db.execute('INSERT INTO outbox VALUES(1,1)')
    db.execute('PRAGMA user_version=2')
    expected={t:[dict(r) for r in db.execute('SELECT * FROM '+t)] for t in ['servers','status_history','pkfs','audit']}
Path('.cache/container-upgrade-before.json').write_text(json.dumps(expected,sort_keys=True))
print('Isolated exact schema-v2 fixture includes Active ordering, notes, History, Status and audit.')
