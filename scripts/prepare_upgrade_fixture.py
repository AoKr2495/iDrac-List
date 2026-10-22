"""Create CI-owned v1 business data to verify the v2 image upgrade, never NAS data."""
import json
from pathlib import Path
from backend.config import Settings
from backend.store import Store
from uuid import uuid4

base=Path('.cache/smoke')
if (base/'Data/idrac-list.sqlite3').exists():
    raise RuntimeError('Upgrade fixture requires an empty CI-only directory')
store=Store(Settings(base/'Data',base/'Logs'))
def mutate(action,sid='',**body):
    return store.mutate(action,sid,dict(operation_id=str(uuid4()),**body))
row=mutate('create',pkf='PKF25GR00001',sn='CI-EXISTING-V1')['record']
mutate('position',row['pkf'],position='Pinned')
mutate('status',row['id'],generation=0,text='Pre-upgrade business history')
mutate('progress',row['id'],generation=0,stage=4,state='Success',confirmed=True)
with store.connect() as db:
    db.execute('ALTER TABLE pkfs DROP COLUMN note')
    db.execute('PRAGMA user_version=1')
state=store.snapshot()
Path('.cache/container-upgrade-before.json').write_text(json.dumps({key:state[key] for key in ('servers','pkfs','revision')},sort_keys=True))
print('Isolated schema-v1 upgrade fixture created with Server, History, Status and audit.')
