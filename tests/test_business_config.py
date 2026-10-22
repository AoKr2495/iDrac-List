import json
import shutil
import uuid
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.config import ROOT, Settings


def configured(tmp_path, prefix='PKF27GR', reminders=None):
    directory=tmp_path/'config'
    shutil.copytree(ROOT/'config',directory)
    (directory/'pkf.json').write_text(json.dumps({'default_prefix':prefix}))
    if reminders is not None:
        (directory/'validation_reminders.json').write_text(json.dumps(reminders))
    filename=tmp_path/'config.yaml'
    filename.write_text('business:\n  config_dir: ./config\n')
    return filename


def test_configured_prefix_and_historical_compatibility(tmp_path):
    cfg=configured(tmp_path)
    app=create_app(Settings.load(cfg))
    with TestClient(app) as client:
        for text in ['468','0468','00468']:
            assert client.get('/api/pkf/normalize',params={'value':text}).json()['pkf']=='PKF27GR00468'
        assert client.get('/api/pkf/normalize',params={'value':'pKf26gR00468'}).json()['pkf']=='PKF26GR00468'
        assert client.get('/api/pkf/normalize',params={'value':'26gr468'}).json()['pkf']=='PKF26GR00468'
        assert client.get('/api/pkf/normalize',params={'value':'468','year':26}).json()['pkf']=='PKF26GR00468'
        assert client.get('/api/state').json()['pkf_default_prefix']=='PKF27GR'
        for pkf in ['PKF26GR00468','PKF27GR00468']:
            assert client.post('/api/servers',json={'operation_id':str(uuid.uuid4()),'pkf':pkf,'sn':'SAME'}).status_code==200
    assert len(app.state.store.snapshot()['servers'])==2


def test_reminders_are_configuration_not_a_validation_gate(tmp_path):
    reminder={'default':['通用提醒'], 'by_model_os':{'R250':{'xDome':['检查固件','<script>literal text</script>']}}}
    cfg=configured(tmp_path,reminders=reminder)
    app=create_app(Settings.load(cfg))
    with TestClient(app) as client:
        assert client.get('/api/state').json()['validation_reminders']==reminder
        row=client.post('/api/servers',json={'operation_id':str(uuid.uuid4()),'pkf':'PKF26GR00468','sn':'NO-MODEL'}).json()['record']
        # Empty Model/OS and unacknowledged reminder still permit confirmed Validation.
        result=client.post(f"/api/servers/{row['id']}/progress",json={'operation_id':str(uuid.uuid4()),'generation':0,'stage':4,'state':'Success','confirmed':True})
        assert result.json()['record']['lifecycle']=='History'


@pytest.mark.parametrize('content',[
    {'default_prefix':'PKF27GR00'}, {'default_prefix':'PKF2GR'}, {'default_prefix':'PKF27GR','typo':1}
])
def test_prefix_configuration_typos_fail_startup(tmp_path,content):
    cfg=configured(tmp_path)
    (tmp_path/'config'/'pkf.json').write_text(json.dumps(content))
    with pytest.raises(ValueError,match='default_prefix'):Settings.load(cfg)


@pytest.mark.parametrize('reminders',[
    {'default':'not an array','by_model_os':{}},
    {'default':[],'by_model_os':{'R999':{}}},
    {'default':[],'by_model_os':{'R250':{'typo':[]}}},
    {'default':[],'by_model_os':{'R250':{'xDome':[123]}}},
])
def test_invalid_reminder_configuration_fails_startup(tmp_path,reminders):
    cfg=configured(tmp_path,reminders=reminders)
    with pytest.raises(ValueError):Settings.load(cfg)


def test_config_changes_apply_after_restart(tmp_path):
    cfg=configured(tmp_path,'PKF26GR')
    first=Settings.load(cfg)
    (tmp_path/'config'/'pkf.json').write_text('{"default_prefix":"PKF27GR"}')
    assert first.pkf_default_prefix=='PKF26GR'
    assert Settings.load(cfg).pkf_default_prefix=='PKF27GR'
