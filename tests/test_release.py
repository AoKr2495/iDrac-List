import io
import json
import tarfile
import zipfile
from pathlib import Path
import pytest
from scripts.package_release import check_image, package, tracked_files


def image(path, architecture='amd64'):
    config=json.dumps({'os':'linux','architecture':architecture}).encode()
    manifest=json.dumps([{'Config':'config.json','RepoTags':['idrac-list:test'],'Layers':[]}]).encode()
    with tarfile.open(path,'w') as archive:
        for name,data in [('config.json',config),('manifest.json',manifest)]:
            info=tarfile.TarInfo(name);info.size=len(data);archive.addfile(info,io.BytesIO(data))


def test_archive_requires_amd64_and_exact_tag(tmp_path):
    path=tmp_path/'image.tar';image(path)
    assert check_image(path,'idrac-list:test').startswith('sha256:')
    with pytest.raises(ValueError):check_image(path,'wrong:tag')
    image(path,'arm64')
    with pytest.raises(ValueError,match='amd64'):check_image(path,'idrac-list:test')


def test_tracked_inventory_has_no_runtime_data():
    names=[name for name,_ in tracked_files()]
    assert 'backend/store.py' in names and 'config/pkf.json' in names
    assert not any(name.startswith(('Data/','Logs/','.venv/','.cache/','releases/')) for name in names)


def test_source_archive_is_explicitly_not_offline_ready(monkeypatch,tmp_path):
    import scripts.package_release as release
    root=tmp_path/'project';root.mkdir();(root/'VERSION').write_text('1.0.0')
    file=root/'README.md';file.write_text('source')
    monkeypatch.setattr(release,'ROOT',root)
    monkeypatch.setattr(release,'tracked_files',lambda:[('README.md',file)])
    output=root/'releases'/'source.zip'
    manifest=package(output,'test',None,None)
    assert manifest['kind']=='source-only-not-offline-ready'
    with zipfile.ZipFile(output) as archive:
        assert archive.read('iDrac-List/Data/')==b''
        assert 'iDrac-List/SHA256SUMS' in archive.namelist()
        assert not any(name.endswith('.tar') for name in archive.namelist())


def test_complete_bundle_contains_verified_image_and_no_business_data(monkeypatch,tmp_path):
    import scripts.package_release as release
    root=tmp_path/'project';root.mkdir();(root/'VERSION').write_text('1.0.0')
    file=root/'README.md';file.write_text('source')
    monkeypatch.setattr(release,'ROOT',root)
    monkeypatch.setattr(release,'tracked_files',lambda:[('README.md',file)])
    archive=root/'image.tar';image(archive)
    output=root/'releases'/'offline.zip'
    manifest=package(output,'abc',archive,'idrac-list:test')
    assert manifest['kind']=='offline-linux-amd64' and manifest['includes_business_data'] is False
    with zipfile.ZipFile(output) as zipped:
        assert zipped.read('iDrac-List/.env').startswith(b'IDRAC_IMAGE=idrac-list:test')
        assert 'iDrac-List/image/idrac-list-amd64.tar' in zipped.namelist()
        assert zipped.read('iDrac-List/Logs/')==b''
