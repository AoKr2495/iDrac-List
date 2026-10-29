"""SQLite is the sole authority; every mutation and audit event commit together."""
from contextlib import contextmanager
import hashlib
import json
import re
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from .config import Settings

MODELS = ['R250', 'R260', 'R450', 'R640', 'R660XS', 'SE50']
SYSTEMS = ['xDome', 'CTD', 'SRA']
STAGES = ['Bios Set-up', 'Firmware update', 'TSR', 'Installation', 'Validation']

class Problem(Exception):
    def __init__(self, code, message, status=400, record=None):
        self.code, self.message, self.status, self.record = code, message, status, record

def now():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')

def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def normalize_pkf(value, year=26):
    if not isinstance(value,str):
        raise Problem('invalid_pkf', 'PKF 不得为空')
    value = value.strip().upper()
    m = re.fullmatch(r'(?:(?:PKF)?(\d{2})GR)?(\d{1,5})', value)
    if not m or not 1 <= int(m[2]) <= 99999 or not 0 <= year <= 99:
        raise Problem('invalid_pkf', '请输入有效编号，例如 468、26gr00468、PKF26GR00468')
    return f'PKF{int(m[1]) if m[1] else year:02d}GR{int(m[2]):05d}'

SCHEMA = '''
CREATE TABLE IF NOT EXISTS pkfs(pkf TEXT PRIMARY KEY, position TEXT NOT NULL DEFAULT 'Normal' CHECK(position IN ('Pinned','Normal','Bottom')), note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS servers(
 id TEXT PRIMARY KEY, pkf TEXT NOT NULL REFERENCES pkfs(pkf), sn TEXT NOT NULL COLLATE BINARY CHECK(length(sn)>0),
 model TEXT, os TEXT, status TEXT NOT NULL DEFAULT '', stage INTEGER NOT NULL DEFAULT -1 CHECK(stage BETWEEN -1 AND 4),
 progress_state TEXT NOT NULL DEFAULT '', lifecycle TEXT NOT NULL DEFAULT 'Active' CHECK(lifecycle IN ('Active','Packing','History','Deleted')),
 generation INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, packing_entered_at TEXT,
 user_id TEXT, created_by TEXT, updated_by TEXT,
 CHECK ((stage=-1 AND progress_state='') OR (stage BETWEEN 0 AND 3 AND progress_state IN ('ing','Success','Fail')) OR (stage=4 AND progress_state='Success')),
 CHECK ((lifecycle='History' AND completed_at IS NOT NULL AND stage=4) OR lifecycle!='History'),
 CHECK (lifecycle!='Packing' OR (stage=4 AND progress_state='Success' AND packing_entered_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS business_key ON servers(pkf,sn) WHERE lifecycle!='Deleted';
CREATE TABLE IF NOT EXISTS status_history(id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL REFERENCES servers(id), text TEXT NOT NULL, saved_at TEXT NOT NULL, user_id TEXT);
CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, server_id TEXT, object TEXT NOT NULL, action TEXT NOT NULL, time TEXT NOT NULL, before_json TEXT, after_json TEXT, client_id TEXT, request_id TEXT, operation_id TEXT NOT NULL UNIQUE, user_id TEXT);
CREATE TABLE IF NOT EXISTS deleted_snapshots(server_id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, time TEXT NOT NULL, event_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox(seq INTEGER PRIMARY KEY REFERENCES audit(seq), delivered INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS operations(operation_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS snapshot_no_update BEFORE UPDATE ON deleted_snapshots BEGIN SELECT RAISE(ABORT, 'immutable snapshot'); END;
CREATE TRIGGER IF NOT EXISTS snapshot_no_delete BEFORE DELETE ON deleted_snapshots BEGIN SELECT RAISE(ABORT, 'immutable snapshot'); END;
'''

class Store:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.path = settings.data_dir / 'idrac-list.sqlite3'
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.log_lock = threading.Lock()
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version > 3:
                raise RuntimeError('Database schema is newer than this application')
            # Rebuild only the constrained parent table with FK enforcement disabled
            # outside the transaction; dependent table declarations retain servers.
            db.execute('PRAGMA foreign_keys=OFF')
            try:
                db.executescript('BEGIN IMMEDIATE;\n' + SCHEMA)
                if 'note' not in {r['name'] for r in db.execute('PRAGMA table_info(pkfs)')}:
                    db.execute("ALTER TABLE pkfs ADD COLUMN note TEXT NOT NULL DEFAULT ''")
                if 'packing_entered_at' not in {r['name'] for r in db.execute('PRAGMA table_info(servers)')}:
                    create_sql = SCHEMA[SCHEMA.index('CREATE TABLE IF NOT EXISTS servers('):SCHEMA.index('CREATE UNIQUE INDEX')]
                    db.execute(create_sql.replace('IF NOT EXISTS servers(', 'servers_upgrade('))
                    columns = ','.join(r['name'] for r in db.execute('PRAGMA table_info(servers)'))
                    db.execute(f'INSERT INTO servers_upgrade({columns}) SELECT {columns} FROM servers')
                    db.execute('DROP TABLE servers')
                    db.execute('ALTER TABLE servers_upgrade RENAME TO servers')
                    db.execute("CREATE UNIQUE INDEX business_key ON servers(pkf,sn) WHERE lifecycle!='Deleted'")
                db.execute('CREATE TABLE IF NOT EXISTS active_order(pkf TEXT PRIMARY KEY REFERENCES pkfs(pkf), rank INTEGER NOT NULL UNIQUE)')
                db.execute('CREATE TABLE IF NOT EXISTS order_meta(id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL)')
                if not db.execute('SELECT 1 FROM order_meta').fetchone():
                    db.execute('INSERT INTO order_meta VALUES(1,0)')
                    initial = db.execute("SELECT pkf FROM pkfs WHERE EXISTS(SELECT 1 FROM servers WHERE servers.pkf=pkfs.pkf AND lifecycle='Active') ORDER BY CASE position WHEN 'Pinned' THEN 0 WHEN 'Normal' THEN 1 ELSE 2 END,pkf").fetchall()
                    db.executemany('INSERT INTO active_order VALUES(?,?)', [(r[0], i) for i,r in enumerate(initial)])
                if db.execute('PRAGMA foreign_key_check').fetchall():
                    raise RuntimeError('Migration foreign key check failed')
                db.execute('PRAGMA user_version=3')
            except Exception:
                db.rollback()
                raise
            finally:
                db.execute('PRAGMA foreign_keys=ON')

    def open(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA busy_timeout=15000')
        db.execute('PRAGMA synchronous=FULL')
        return db

    @contextmanager
    def connect(self):
        db = self.open()
        try:
            with db:
                yield db
        finally:
            db.close()

    def record(self, db, sid):
        row = db.execute('SELECT * FROM servers WHERE id=?', (sid,)).fetchone()
        if not row:
            raise Problem('not_found', 'Server 不存在', 404)
        obj = dict(row)
        obj['status_history'] = [dict(x) for x in db.execute('SELECT id,text,saved_at FROM status_history WHERE server_id=? ORDER BY saved_at DESC,id DESC', (sid,))]
        return obj

    def revision(self):
        with self.connect() as db:
            return db.execute('SELECT COALESCE(MAX(seq),0) FROM audit').fetchone()[0]

    def snapshot(self):
        with self.connect() as db:
            db.execute('BEGIN')
            rows = [self.record(db, r[0]) for r in db.execute("SELECT id FROM servers WHERE lifecycle!='Deleted'")]
            groups = [dict(r) for r in db.execute('SELECT * FROM pkfs')]
            order = self.order_state(db)
            rev = db.execute('SELECT COALESCE(MAX(seq),0) FROM audit').fetchone()[0]
            db.commit()
        return dict(active_order=order['pkfs'], order_version=order['version'], servers=rows, pkfs=groups, revision=rev, timezone=self.settings.timezone, models=MODELS, systems=SYSTEMS, stages=STAGES, pkf_default_prefix=self.settings.pkf_default_prefix, validation_reminders=self.settings.validation_reminders)

    @staticmethod
    def order_state(db):
        return dict(pkfs=[r[0] for r in db.execute('SELECT pkf FROM active_order ORDER BY rank')],
                    version=db.execute('SELECT version FROM order_meta WHERE id=1').fetchone()[0])

    def sync_order(self, db):
        old = self.order_state(db)['pkfs']
        active = {r[0] for r in db.execute("SELECT DISTINCT pkf FROM servers WHERE lifecycle='Active'")}
        new = [p for p in old if p in active] + sorted(active-set(old))
        if new != old:
            db.execute('DELETE FROM active_order')
            db.executemany('INSERT INTO active_order VALUES(?,?)', [(p,i) for i,p in enumerate(new)])
            db.execute('UPDATE order_meta SET version=version+1 WHERE id=1')

    def mutate(self, action, sid, body, client_id='', request_id=''):
        operation = body['operation_id']
        fingerprint = hashlib.sha256(packed([action, sid, body, client_id]).encode()).hexdigest()
        db = self.open()
        try:
            db.execute('BEGIN IMMEDIATE')
            prev = db.execute('SELECT * FROM operations WHERE operation_id=?', (operation,)).fetchone()
            if prev:
                if prev['fingerprint'] != fingerprint:
                    raise Problem('operation_reused', '操作 ID 已用于其他请求', 409)
                return json.loads(prev['response'])
            before, after, event, stamp = None, None, False, now()
            if action == 'sort':
                before = self.order_state(db)
                order = body.get('pkfs')
                if body.get('base_version') != before['version']:
                    raise Problem('order_conflict', '列表已发生变化，请 Reload 最新顺序', 409)
                if not isinstance(order,list) or any(not isinstance(p,str) for p in order) or len(order)!=len(set(order)) or set(order)!=set(before['pkfs']):
                    raise Problem('order_conflict', '列表已发生变化，请 Reload 最新顺序', 409)
                event = order != before['pkfs']
                if event:
                    db.execute('DELETE FROM active_order')
                    db.executemany('INSERT INTO active_order VALUES(?,?)', [(p,i) for i,p in enumerate(order)])
                    db.execute('UPDATE order_meta SET version=version+1 WHERE id=1')
                after = self.order_state(db)
            elif action == 'position':
                raise Problem('retired_operation', '请刷新页面并使用 Sort PKFs', 409)
            elif action == 'create':
                pkf = normalize_pkf(body.get('pkf', ''))
                if pkf != body.get('pkf'):
                    raise Problem('invalid_pkf', '创建 Server 必须使用标准 PKF')
                sn = self.valid_sn(body.get('sn', ''))
                self.unique(db, pkf, sn)
                db.execute('INSERT OR IGNORE INTO pkfs(pkf) VALUES(?)', (pkf,))
                sid = str(uuid.uuid4())
                db.execute('INSERT INTO servers(id,pkf,sn,created_at,updated_at) VALUES(?,?,?,?,?)', (sid,pkf,sn,stamp,stamp))
                after, event = self.record(db, sid), True
            elif action == 'pkf_note':
                value = body.get('text')
                if not isinstance(value, str) or '\n' in value or '\r' in value:
                    raise Problem('invalid_note', 'PKF 备注必须为单行文本')
                value = value.strip()
                field = 'note'
                before = db.execute('SELECT * FROM pkfs WHERE pkf=?', (sid,)).fetchone()
                if not before or not db.execute("SELECT 1 FROM servers WHERE pkf=? AND lifecycle='Active'", (sid,)).fetchone():
                    raise Problem('not_found', 'Active PKF 不存在', 404)
                before = dict(before)
                db.execute(f'UPDATE pkfs SET {field}=? WHERE pkf=?', (value,sid))
                after = dict(db.execute('SELECT * FROM pkfs WHERE pkf=?', (sid,)).fetchone())
                event = before[field] != value
            else:
                before = self.record(db, sid)
                if before['lifecycle'] == 'Deleted':
                    raise Problem('deleted', 'Server 已删除，无法继续编辑', 410)
                allowed = ('History','Packing') if action=='return' else ('Active','Packing') if action=='status' else ('Packing',) if action=='packing' else ('Active',)
                if before['lifecycle'] not in allowed:
                    raise Problem('completed', 'Server 阶段已变化，请刷新后重试', 409)
                if body.get('generation') != before['generation']:
                    raise Problem('stale_lifecycle', 'Server 生命周期已变化，请刷新后重试', 409)
                if action == 'edit':
                    changes = body.get('changes', {})
                    if len(changes) != 1 or not set(changes) <= {'sn','model','os'}:
                        raise Problem('invalid_edit', '每次仅修改 SN、Model 或 OS 一个字段')
                    key, value = next(iter(changes.items()))
                    if key == 'sn':
                        value = self.valid_sn(value)
                        self.unique(db, before['pkf'], value, sid)
                    elif value not in ([None] + (MODELS if key=='model' else SYSTEMS)):
                        raise Problem('invalid_option', '无效选项')
                    if value != before[key]:
                        db.execute(f'UPDATE servers SET {key}=?,updated_at=? WHERE id=?', (value,stamp,sid))
                        event = True
                elif action == 'status':
                    text = body.get('text')
                    if not isinstance(text, str) or '\n' in text or '\r' in text:
                        raise Problem('invalid_status', 'Status 必须为单行文本')
                    text = text.strip()
                    if text or before['status_history']:
                        db.execute('INSERT INTO status_history(server_id,text,saved_at) VALUES(?,?,?)', (sid,text,stamp))
                        db.execute('UPDATE servers SET status=?,updated_at=? WHERE id=?', (text,stamp,sid))
                        event = True
                elif action == 'progress':
                    stage, state = body.get('stage'), body.get('state')
                    if type(stage) is not int or stage not in range(5) or state not in (['Success'] if stage==4 else ['ing','Success','Fail']):
                        raise Problem('invalid_progress', '无效阶段或状态')
                    if stage==4:
                        self.confirm(body)
                        db.execute("UPDATE servers SET stage=4,progress_state='Success',lifecycle='Packing',generation=generation+1,packing_entered_at=?,updated_at=? WHERE id=?", (stamp,stamp,sid))
                        event = True
                    elif stage != before['stage'] or state != before['progress_state']:
                        db.execute('UPDATE servers SET stage=?,progress_state=?,updated_at=? WHERE id=?', (stage,state,stamp,sid))
                        event = True
                elif action == 'packing':
                    self.confirm(body)
                    db.execute("UPDATE servers SET lifecycle='History',generation=generation+1,completed_at=?,updated_at=? WHERE id=?", (stamp,stamp,sid))
                    event = True
                elif action == 'return':
                    self.confirm(body)
                    db.execute("UPDATE servers SET lifecycle='Active',generation=generation+1,stage=-1,progress_state='',completed_at=NULL,packing_entered_at=NULL,updated_at=? WHERE id=?", (stamp,sid))
                    event = True
                elif action == 'delete':
                    self.confirm(body)
                    db.execute("UPDATE servers SET lifecycle='Deleted',generation=generation+1,updated_at=? WHERE id=?", (stamp,sid))
                    event = True
                else:
                    raise Problem('invalid_action', '未知操作')
                after = self.record(db, sid)
            self.sync_order(db)
            if event:
                event_id = str(uuid.uuid4())
                cur = db.execute('INSERT INTO audit(event_id,server_id,object,action,time,before_json,after_json,client_id,request_id,operation_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
                    (event_id,sid if action not in ('position','pkf_note','sort') else None,sid,action,stamp,packed(before),packed(after),client_id,request_id,operation))
                db.execute('INSERT INTO outbox(seq) VALUES(?)', (cur.lastrowid,))
                if action=='delete':
                    snapshot = dict(before)
                    snapshot['pkf_note'] = db.execute('SELECT note FROM pkfs WHERE pkf=?', (before['pkf'],)).fetchone()[0]
                    snapshot['operations'] = [dict(x) for x in db.execute("SELECT * FROM audit WHERE server_id=? OR (object=? AND action='pkf_note') ORDER BY seq", (sid,before['pkf']))]
                    db.execute('INSERT INTO deleted_snapshots VALUES(?,?,?,?)', (sid,packed(snapshot),stamp,event_id))
            revision = db.execute('SELECT COALESCE(MAX(seq),0) FROM audit').fetchone()[0]
            result = dict(record=after, changed=event, revision=revision)
            db.execute('INSERT INTO operations VALUES(?,?,?)', (operation,fingerprint,packed(result)))
            db.commit()
            return result
        except sqlite3.IntegrityError as exc:
            db.rollback()
            raise Problem('integrity', '数据约束冲突，刷新后重试', 409) from exc
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def confirm(body):
        if body.get('confirmed') is not True:
            raise Problem('confirmation_required', '请先确认此操作')

    @staticmethod
    def valid_sn(sn):
        if not isinstance(sn,str) or not sn.strip():
            raise Problem('invalid_sn', 'SN 不得为空')
        return sn.strip()

    def unique(self, db, pkf, sn, exclude=''):
        duplicate = db.execute("SELECT id,lifecycle FROM servers WHERE pkf=? AND sn=? AND lifecycle!='Deleted' AND id!=?", (pkf,sn,exclude)).fetchone()
        if duplicate:
            raise Problem('duplicate_history' if duplicate['lifecycle']=='History' else 'duplicate_packing' if duplicate['lifecycle']=='Packing' else 'duplicate_active', '相同 PKF + SN 已存在', 409, self.record(db, duplicate['id']))

    def flush_logs(self):
        """Outbox replay is safe after an append/ack crash; repair incomplete final lines."""
        with self.log_lock, self.connect() as db:
            pending = list(db.execute('SELECT audit.* FROM audit JOIN outbox USING(seq) WHERE delivered=0 ORDER BY seq'))
            seen = {}
            for row in pending:
                event = dict(row)
                local = datetime.fromisoformat(event['time']).astimezone(ZoneInfo(self.settings.timezone))
                month = local.strftime('%Y-%m')
                event['time'] = local.isoformat(timespec='milliseconds')
                event['before'] = json.loads(event.pop('before_json'))
                event['after'] = json.loads(event.pop('after_json'))
                targets = [('Timeline', event)]
                if row['action']=='delete':
                    snap = db.execute('SELECT snapshot_json FROM deleted_snapshots WHERE server_id=?', (row['server_id'],)).fetchone()[0]
                    targets.append(('Delete', dict(event, snapshot=json.loads(snap))))
                for kind, content in targets:
                    dest = self.settings.logs_dir / kind / f'{month}.log'
                    dest.parent.mkdir(parents=True,exist_ok=True)
                    if dest not in seen:
                        ids = set()
                        if dest.exists():
                            data = dest.read_bytes()
                            boundary = data.rfind(b'\n')+1
                            if boundary != len(data):
                                with dest.open('r+b') as f:
                                    f.truncate(boundary)
                            for line in data[:boundary].splitlines():
                                ids.add(json.loads(line)['event_id'])
                        seen[dest] = ids
                    if row['event_id'] not in seen[dest]:
                        import os
                        with dest.open('a',encoding='utf-8') as f:
                            f.write(packed(content)+'\n')
                            f.flush()
                            os.fsync(f.fileno())
                        seen[dest].add(row['event_id'])
                db.execute('UPDATE outbox SET delivered=1 WHERE seq=?', (row['seq'],))
                db.commit()
