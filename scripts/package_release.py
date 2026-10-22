#!/usr/bin/env python3
"""Build a clean-source ZIP or a verified linux/amd64 offline image bundle."""
import argparse
import hashlib
import json
import subprocess
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    hasher = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def check_image(path, image_tag):
    with tarfile.open(path, 'r:*') as archive:
        manifest = json.load(archive.extractfile('manifest.json'))
        if len(manifest) != 1 or image_tag not in manifest[0].get('RepoTags', []):
            raise ValueError('Archive must contain exactly the requested release image/tag')
        config_bytes = archive.extractfile(manifest[0]['Config']).read()
        config = json.loads(config_bytes)
        if config.get('os') != 'linux' or config.get('architecture') != 'amd64':
            raise ValueError('NAS release requires linux/amd64, not Mac ARM64')
        return 'sha256:'+hashlib.sha256(config_bytes).hexdigest()


def tracked_files():
    result = subprocess.check_output(['git','ls-files','-z'],cwd=ROOT)
    names = result.decode().rstrip('\0').split('\0')
    forbidden = {'.git','.cache','.venv','node_modules','Data','Logs','releases','__pycache__','.pytest_cache'}
    files = []
    for name in names:
        file = ROOT / name
        if not name or not file.is_file():
            continue
        if set(Path(name).parts) & forbidden or file.suffix in {'.log','.pyc'} or '.sqlite' in file.name or name == '.env':
            raise ValueError(f'Private/runtime file unexpectedly tracked: {name}')
        if file.is_symlink():
            raise ValueError(f'Symlinks are not allowed in the release: {name}')
        files.append((name,file))
    return files


def package(output, commit, image_tar=None, image_tag=None):
    output = output.resolve()
    if not output.is_relative_to(ROOT / 'releases'):
        raise ValueError('Release output must be inside project releases/')
    output.parent.mkdir(parents=True, exist_ok=True)
    image_id = check_image(image_tar, image_tag) if image_tar else None
    manifest = {'version':(ROOT/'VERSION').read_text().strip(), 'commit':commit,
                'kind':'offline-linux-amd64' if image_tar else 'source-only-not-offline-ready',
                'image_tag':image_tag,'image_id':image_id,'includes_business_data':False}
    entries = tracked_files()
    if image_tar:
        entries += [('image/idrac-list-amd64.tar',image_tar)]
    # Include the built UI in folder delivery as well as inside the container image.
    dist = ROOT/'frontend'/'dist'
    if dist.exists():
        entries += [(str(file.relative_to(ROOT)), file) for file in sorted(dist.rglob('*')) if file.is_file()]
    contents = {name:file for name,file in entries}
    generated = {'release-manifest.json':(json.dumps(manifest,indent=2)+'\n').encode()}
    if image_tar:
        generated['.env'] = f'IDRAC_IMAGE={image_tag}\nAPP_UID=1000\nAPP_GID=1000\nIDRAC_PORT=8088\n'.encode()
    checksums = [f'{digest(file)}  {name}' for name,file in sorted(contents.items())]
    checksums += [f'{hashlib.sha256(data).hexdigest()}  {name}' for name,data in sorted(generated.items())]
    generated['SHA256SUMS'] = ('\n'.join(checksums)+'\n').encode()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name,file in sorted(contents.items()):
            archive.write(file,'iDrac-List/'+name)
        for name,data in generated.items():
            archive.writestr('iDrac-List/'+name,data)
        for name in ('Data','Logs'):
            archive.writestr('iDrac-List/'+name+'/',b'')
    output.with_suffix(output.suffix+'.sha256').write_text(f'{digest(output)}  {output.name}\n')
    return manifest


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--commit',required=True)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--source-only',action='store_true')
    mode.add_argument('--image-tar',type=Path)
    parser.add_argument('--image-tag')
    args=parser.parse_args()
    if args.image_tar and not args.image_tag:
        parser.error('--image-tag is required with --image-tar')
    print(json.dumps(package(args.output,args.commit,args.image_tar,args.image_tag),indent=2))
