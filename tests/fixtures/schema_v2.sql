
CREATE TABLE IF NOT EXISTS pkfs(pkf TEXT PRIMARY KEY, position TEXT NOT NULL DEFAULT 'Normal' CHECK(position IN ('Pinned','Normal','Bottom')), note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS servers(
 id TEXT PRIMARY KEY, pkf TEXT NOT NULL REFERENCES pkfs(pkf), sn TEXT NOT NULL COLLATE BINARY CHECK(length(sn)>0),
 model TEXT, os TEXT, status TEXT NOT NULL DEFAULT '', stage INTEGER NOT NULL DEFAULT -1 CHECK(stage BETWEEN -1 AND 4),
 progress_state TEXT NOT NULL DEFAULT '', lifecycle TEXT NOT NULL DEFAULT 'Active' CHECK(lifecycle IN ('Active','History','Deleted')),
 generation INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
 user_id TEXT, created_by TEXT, updated_by TEXT,
 CHECK ((stage=-1 AND progress_state='') OR (stage BETWEEN 0 AND 3 AND progress_state IN ('ing','Success','Fail')) OR (stage=4 AND progress_state='Success')),
 CHECK ((lifecycle='History' AND completed_at IS NOT NULL AND stage=4) OR lifecycle!='History')
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
