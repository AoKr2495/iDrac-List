import asyncio
import contextlib
import json
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from .config import Settings, ROOT
from .store import Store, Problem, normalize_pkf

class Mutation(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    operation_id: str = Field(min_length=8,max_length=128)
    generation: int | None = None
    pkf: str | None = None
    sn: str | None = None
    changes: dict[str,Any] | None = None
    text: str | None = None
    stage: int | None = None
    state: str | None = None
    confirmed: bool = False
    position: str | None = None
    pkfs: list[str] | None = None
    base_version: int | None = None


def create_app(settings: Settings | None = None):
    settings = settings or Settings.load()
    store = Store(settings)

    async def log_worker():
        while True:
            try:
                await asyncio.to_thread(store.flush_logs)
            except Exception:
                logging.exception('Log export failed; committed audit events retained for retry')
            await asyncio.sleep(1)

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(log_worker())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        try:
            await asyncio.to_thread(store.flush_logs)
        except Exception:
            logging.exception('Pending logs retained for next startup')

    app = FastAPI(title='iDrac-List', lifespan=lifespan)
    app.state.store = store

    @app.exception_handler(Problem)
    async def problem(request, exc):
        return JSONResponse(status_code=exc.status,content=dict(code=exc.code,message=exc.message,record=exc.record))

    @app.middleware('http')
    async def headers(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith('/api'):
            response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.get('/api/state')
    def state():
        return store.snapshot()

    @app.get('/api/health')
    def health():
        with store.connect() as db:
            pending = db.execute('SELECT COUNT(*) FROM outbox WHERE delivered=0').fetchone()[0]
        return dict(status='ok',revision=store.revision(),pending_logs=pending)

    @app.get('/api/pkf/normalize')
    def normalize(value: str, year: int | None = None):
        return dict(pkf=normalize_pkf(value,year if year is not None else int(settings.pkf_default_prefix[3:5])))

    def apply(action, sid, body, request):
        return store.mutate(action,sid,body.model_dump(exclude_none=True),request.headers.get('X-Client-ID','anonymous')[:128],request.headers.get('X-Request-ID',str(uuid.uuid4()))[:128])

    @app.get('/api/pkfs/order')
    def active_order():
        with store.connect() as db:
            db.execute('BEGIN')
            return store.order_state(db)

    @app.post('/api/pkfs/order')
    def save_order(body: Mutation, request: Request):
        return apply('sort','active-order',body,request)

    @app.post('/api/servers')
    def create(body: Mutation, request: Request):
        return apply('create','',body,request)

    @app.post('/api/pkfs/{pkf}/position')
    def position(pkf: str, body: Mutation, request: Request):
        return apply('position',pkf,body,request)

    @app.post('/api/pkfs/{pkf}/note')
    def pkf_note(pkf: str, body: Mutation, request: Request):
        return apply('pkf_note',pkf,body,request)

    @app.post('/api/servers/{sid}/{action}')
    def change(sid: str, action: str, body: Mutation, request: Request):
        if action not in ('edit','status','progress','return','delete','packing'):
            raise Problem('not_found','未知操作',404)
        return apply(action,sid,body,request)

    @app.get('/api/events')
    async def events(request: Request):
        async def stream():
            last = -1
            tick = 0
            while not await request.is_disconnected():
                revision = await asyncio.to_thread(store.revision)
                if revision != last or tick >= 15:
                    yield f'event: state\nid: {revision}\ndata: {json.dumps(dict(revision=revision))}\n\n'
                    last, tick = revision, 0
                await asyncio.sleep(1)
                tick += 1
        return StreamingResponse(stream(),media_type='text/event-stream',headers={'X-Accel-Buffering':'no','Cache-Control':'no-cache'})

    dist = ROOT/'frontend'/'dist'
    if dist.exists():
        app.mount('/assets',StaticFiles(directory=dist/'assets'),name='assets')
        @app.get('/')
        def index():
            return FileResponse(dist/'index.html',headers={'Cache-Control':'no-cache'})
    return app
