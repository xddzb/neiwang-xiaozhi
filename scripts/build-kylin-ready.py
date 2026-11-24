"""Compose a preinstalled Linux APP from verified local archives and reviewed sources.

Private baseline stays local. Preserve Unix modes and links inside a split tar.gz.
"""
import argparse, copy, hashlib, io, json, subprocess, tarfile
from pathlib import Path
from deployment_defaults import merge_defaults, require_current_core

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = 'plugin-pack/payload/'
REWIND = 'extensions/node_modules/@anionex/dsh-turn-rewind/'
def sha(data): return hashlib.sha256(data).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()
def file_sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''): h.update(b)
    return h.hexdigest()

def build(baseline, output, date, volume_bytes=480_000_000):
    if output.exists(): raise ValueError('Use a fresh output directory')
    tracked=subprocess.check_output(['git','-c','safe.directory=*','ls-files','-z'],cwd=ROOT).decode().split('\0')
    sources={}
    for rel in tracked:
        if rel.startswith('extensions/'):
            sources[rel.replace('extensions/','extensions/node_modules/',1)]=(ROOT/rel).read_bytes()
        elif rel.startswith(('launcher/','tools/')):
            sources[rel]=(ROOT/rel).read_bytes()
    lib=ROOT/'extensions/@anionex/dsh-turn-rewind/lib'
    evidence=json.loads((lib/'build-source.json').read_text())
    for rel,digest in evidence['files'].items():
        if sha((lib.parent/rel).read_bytes())!=digest: raise ValueError('Rewind build is stale: '+rel)
    for p in lib.rglob('*'):
        if p.is_file(): sources[REWIND+'lib/'+p.relative_to(lib).as_posix()]=p.read_bytes()
    rows=json.loads((baseline/'release-assets.json').read_text())
    archives=[baseline/r['name'] for r in rows if r['name'].endswith('.tar.gz')]
    if len(archives)!=2: raise ValueError('Expected Core/Plugins baseline pair')
    for r in rows:
        if r['name'].endswith('.tar.gz') and file_sha(baseline/r['name'])!=r['sha256']: raise ValueError('Baseline checksum failed')
    app=pack=None
    for archive in archives:
        with tarfile.open(archive,'r:gz') as t:
            for m in t:
                rel=m.name.partition('/')[2]
                if rel=='config/app.json': app=json.load(t.extractfile(m))
                if rel=='config/overrides.json': sources[rel]=merge_defaults(t.extractfile(m).read())
                if rel=='plugin-pack/pack.json': pack=json.load(t.extractfile(m))
    if not app or not pack: raise ValueError('Missing manifests')
    require_current_core(app)
    output.mkdir(parents=True)
    prefix='Neiwang-Xiaozhi-Kylin-ARM64-R11.6-'+date
    target=output/(prefix+'.tar.gz')
    emitted={}; payload={}; original_core={}; updated={}
    def source(rel, data):
        logical=rel.removeprefix(PAYLOAD)
        if logical.startswith(REWIND+'lib/') and logical not in sources: return None
        if logical in sources:
            updated[logical]=sha(sources[logical]);return sources[logical]
        return data
    with tarfile.open(target,'w:gz',compresslevel=3) as dest:
        def emit(rel,data=None,member=None):
            if not rel or '..' in Path(rel).parts or rel.startswith('/'): raise ValueError('Unsafe archive path')
            signature=sha(data) if data is not None else (member.type,member.linkname)
            if rel in emitted:
                if emitted[rel]!=signature: raise ValueError('Conflicting member: '+rel)
                return
            emitted[rel]=signature
            item=copy.copy(member) if member else tarfile.TarInfo()
            item.pax_headers=dict(item.pax_headers)
            item.pax_headers.pop('path',None)
            item.pax_headers.pop('linkpath',None)
            item.name=prefix+'/'+rel;item.uid=item.gid=0;item.uname=item.gname=''
            if item.islnk(): item.linkname=prefix+'/'+item.linkname.partition('/')[2]
            if data is not None:
                item.type=tarfile.REGTYPE;item.size=len(data);item.mode=member.mode if member else 0o644
            dest.addfile(item,io.BytesIO(data) if data is not None else None)
        for archive in archives:
            with tarfile.open(archive,'r:gz') as t:
                for m in t:
                    rel=m.name.partition('/')[2]
                    if not rel or m.isdir(): continue
                    if rel.startswith('data/'): raise ValueError('Unexpected runtime data')
                    if rel in ('config/app.json','config/feature-pack.json','plugin-pack/pack.json'): continue
                    if m.isfile():
                        raw=t.extractfile(m).read()
                        if rel.startswith('core/'): original_core[rel]=sha(raw)
                        data=source(rel,raw)
                        if data is None: continue
                        emit(rel,data,m)
                        if rel.startswith(PAYLOAD):
                            logical=rel[len(PAYLOAD):];payload[logical]={'path':logical,'sha256':sha(data),'mode':m.mode}
                            emit(logical,data,m)
                    else: emit(rel,member=m)
        # Add newly generated local runtime modules, including their build provenance.
        for logical,data in sources.items():
            if logical.startswith(REWIND):
                if logical not in payload:
                    emit(PAYLOAD+logical,data);emit(logical,data)
                    payload[logical]={'path':logical,'sha256':sha(data),'mode':0o644}
                    updated[logical]=sha(data)
        for link in pack.get('links',[]):
            m=tarfile.TarInfo();m.type=tarfile.SYMTYPE;m.linkname=link['target'];m.mode=0o777
            emit(link['path'],member=m)
        pack['files']=list(payload.values())
        emit('plugin-pack/pack.json',encode(pack))
        app.update(edition='full',buildId='Kylin-ARM64-'+date+'-Full',buildDate=date,bundles=list(dict.fromkeys(app['bundles']+pack['bundles'])))
        emit('config/app.json',encode(app))
        emit('config/feature-pack.json',encode({'version':pack['release'],'platform':pack['platform'],'bundles':pack['bundles'],'preinstalled':True}))
        emit('解压后启动说明.txt','这是已预装插件的完整麒麟 ARM64 应用。进入本目录运行：bash start.sh\n请解压到新目录，不要覆盖旧应用或复制旧程序文件。\n'.encode())
    print('Full archive composed; verifying runtime, payload and official core',flush=True)
    verified={}
    with tarfile.open(target,'r:gz') as t:
        for m in t:
            if m.isfile(): verified[m.name.partition('/')[2]]=sha(t.extractfile(m).read())
    for rel,digest in original_core.items():
        if verified.get(rel)!=digest: raise ValueError('Official core changed')
    for rel,row in payload.items():
        if verified.get(rel)!=row['sha256'] or verified.get(PAYLOAD+rel)!=row['sha256']: raise ValueError('Installed payload differs: '+rel)
    for rel,digest in updated.items():
        if verified.get(rel)!=digest: raise ValueError('Source overlay missing: '+rel)
    volumes=[]
    with target.open('rb') as f:
        i=1
        while chunk:=f.read(volume_bytes):
            part=Path(str(target)+f'.{i:03}');part.write_bytes(chunk)
            volumes.append({'name':part.name,'bytes':len(chunk),'sha256':sha(chunk)});i+=1
    checksum=file_sha(target)
    (output/'SHA256SUMS.txt').write_text(''.join(r['sha256']+'  '+r['name']+'\n' for r in volumes),encoding='ascii',newline='\n')
    (output/'解压.sh').write_text('#!/bin/sh\nset -eu\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\ncd "$HERE"\nsha256sum -c SHA256SUMS.txt\nDEST=${1:-"$HERE/解压后的APP"}\nif [ -e "$DEST" ]; then echo "目标目录已存在，请指定新目录。"; exit 1; fi\nmkdir -p "$DEST"\ncat '+prefix+'.tar.gz.[0-9][0-9][0-9] | tar -xzf - -C "$DEST"\nprintf "解压完成，进入应用目录运行：bash start.sh\\n"\n',encoding='utf8',newline='\n')
    (output/'构建验证.json').write_bytes(encode({'sourceCommit':subprocess.check_output(['git','-c','safe.directory=*','rev-parse','HEAD'],cwd=ROOT).decode().strip(),'localSourceHashes':updated,'rewindCompiler':evidence['compiler'],'officialCoreFilesVerified':len(original_core),'installedPayloadFilesVerified':len(payload),'archiveSha256':checksum,'volumes':volumes,'publicUploadAllowed':False}))
    target.unlink()
    print(json.dumps({'volumes':len(volumes),'officialCoreFiles':len(original_core),'payloadFiles':len(payload)}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--date',required=True);a=p.parse_args();build(a.baseline,a.output,a.date)
