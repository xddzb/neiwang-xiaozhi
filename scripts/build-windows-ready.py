"""Build a preinstalled Windows ZIP from local reviewed archives; no downloads."""
import argparse, hashlib, json, subprocess, zipfile
from pathlib import Path
from deployment_defaults import merge_defaults
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
PAYLOAD='plugin-pack/payload/'
REWIND='extensions/node_modules/@anionex/dsh-turn-rewind/'
def sha(data): return hashlib.sha256(data).hexdigest()
def encode(value): return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
def file_sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()

def build(baseline,output,date,page_url):
    if output.exists():raise ValueError('Use a fresh output directory')
    rows=json.loads((baseline/'release-assets.json').read_text(encoding='utf-8'))
    rows=[r for r in rows if r['name'].endswith('.zip')]
    if len(rows)!=2:raise ValueError('Expected Windows Core/Plugins pair')
    for r in rows:
        if file_sha(baseline/r['name'])!=r['sha256']:raise ValueError('Baseline hash mismatch')
    tracked=subprocess.check_output(['git','-c','safe.directory=*','ls-files','-z'],cwd=ROOT).decode().split('\0')
    sources={}
    for rel in tracked:
        if rel.startswith('extensions/'):sources[rel.replace('extensions/','extensions/node_modules/',1)]=(ROOT/rel).read_bytes()
        elif rel.startswith(('launcher/','tools/')):sources[rel]=(ROOT/rel).read_bytes()
    lib=ROOT/'extensions/@anionex/dsh-turn-rewind/lib'
    evidence=json.loads((lib/'build-source.json').read_text())
    for rel,digest in evidence['files'].items():
        if sha((lib.parent/rel).read_bytes())!=digest:raise ValueError('Stale rewind compilation')
    for p in lib.rglob('*'):
        if p.is_file():sources[REWIND+'lib/'+p.relative_to(lib).as_posix()]=p.read_bytes()
    app=pack=None
    for r in rows:
        with zipfile.ZipFile(baseline/r['name']) as z:
            for n in z.namelist():
                rel=n.partition('/')[2]
                if rel=='config/app.json':app=json.loads(z.read(n))
                if rel=='config/overrides.json':sources[rel]=merge_defaults(z.read(n))
                if rel=='plugin-pack/pack.json':pack=json.loads(z.read(n))
                if rel==PAYLOAD+'extensions/apis/connections/weekly-isu.json':
                    value=json.loads(z.read(n));origin=urlsplit(value['base_url']);page=urlsplit(page_url)
                    if value.get('browser_session',{}).get('driver')!='playwright' or origin.scheme!='https' or (page.scheme,page.netloc)!=(origin.scheme,origin.netloc) or page.username or page.password or page.query:raise ValueError('Invalid ISU browser configuration')
                    value['verify_tls']=False;value['browser_session']['isu_realtime_url']=page_url
                    sources[rel[len(PAYLOAD):]]=encode(value)
    if not app or not pack or pack['platform']!='Win10-x64' or pack.get('links'):raise ValueError('Unsupported Windows baseline')
    if 'extensions/apis/connections/weekly-isu.json' not in sources:raise ValueError('Missing ISU browser connection')
    output.mkdir(parents=True)
    prefix='Neiwang-Xiaozhi-Win10-x64-R11.6-'+date
    target=output/(prefix+'.zip');emitted={};payload={};core={};updated={}
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as dest:
        def emit(rel,data):
            if '..' in Path(rel).parts or rel.startswith('/') or '\\' in rel:raise ValueError('Unsafe archive member')
            digest=sha(data)
            if rel in emitted:
                if emitted[rel]!=digest:raise ValueError('Conflicting member: '+rel)
                return
            emitted[rel]=digest;dest.writestr(prefix+'/'+rel,data)
        for r in rows:
            with zipfile.ZipFile(baseline/r['name']) as z:
                for m in z.infolist():
                    rel=m.filename.partition('/')[2]
                    if not rel or m.is_dir():continue
                    if rel.startswith('data/'):raise ValueError('Unexpected runtime data')
                    if rel in ('config/app.json','config/feature-pack.json','plugin-pack/pack.json'):continue
                    raw=z.read(m);logical=rel.removeprefix(PAYLOAD)
                    if logical.startswith(REWIND+'lib/') and logical not in sources:continue
                    if rel.startswith('core/'):core[rel]=sha(raw)
                    data=sources.get(logical,raw)
                    if logical in sources:updated[logical]=sha(data)
                    emit(rel,data)
                    if rel.startswith(PAYLOAD):
                        payload[logical]={'path':logical,'sha256':sha(data),'mode':420};emit(logical,data)
        # Include new modules as well as updates to existing files.
        for logical,data in sources.items():
            emit(logical,data);updated[logical]=sha(data)
            if logical.startswith('extensions/') and not logical.startswith(('extensions/node_modules/@neiwang/brand/','extensions/node_modules/@neiwang/deployment/')):
                emit(PAYLOAD+logical,data);payload[logical]={'path':logical,'sha256':sha(data),'mode':420}
        pack['files']=list(payload.values());emit('plugin-pack/pack.json',encode(pack))
        app.update(edition='full',buildId='Win10-x64-'+date+'-Full',buildDate=date,browserPluginVersion=json.loads((ROOT/'extensions/@neiwang/browser-automation/package.json').read_text(encoding='utf-8'))['version'],bundles=list(dict.fromkeys(app['bundles']+pack['bundles'])))
        emit('config/app.json',encode(app))
        emit('config/feature-pack.json',encode({'version':pack['release'],'platform':pack['platform'],'bundles':pack['bundles'],'preinstalled':True}))
        emit('最新版使用说明.txt','Windows 10/11 x64 内网完整包。双击 start.cmd 或 内网小智.exe 启动。\n插件已经预装，不需要安装或下载依赖。请使用新目录，不覆盖旧应用。\n'.encode('utf-8'))
    print('Archive composed; verifying every member',flush=True)
    with zipfile.ZipFile(target) as z:
        for m in z.infolist():
            rel=m.filename.partition('/')[2]
            if sha(z.read(m))!=emitted[rel]:raise ValueError('Archive verification failed')
    for rel,digest in core.items():
        if emitted.get(rel)!=digest:raise ValueError('Official core changed')
    for rel,r in payload.items():
        if emitted.get(rel)!=r['sha256'] or emitted.get(PAYLOAD+rel)!=r['sha256']:raise ValueError('Installed payload mismatch')
    report={'sourceCommit':subprocess.check_output(['git','-c','safe.directory=*','rev-parse','HEAD'],cwd=ROOT).decode().strip(),'runtimeSourceHashes':updated,'officialCoreFilesVerified':len(core),'installedPayloadFilesVerified':len(payload),'archiveSha256':file_sha(target),'archiveBytes':target.stat().st_size,'publicUploadAllowed':False}
    (output/'构建验证.json').write_bytes(encode(report))
    (output/'SHA256SUMS.txt').write_text(report['archiveSha256']+'  '+target.name+'\n',encoding='ascii')
    print(json.dumps({'archive':target.name,'coreFiles':len(core),'payloadFiles':len(payload)}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--date',required=True);p.add_argument('--page-url',required=True);a=p.parse_args();build(a.baseline,a.output,a.date,a.page_url)
