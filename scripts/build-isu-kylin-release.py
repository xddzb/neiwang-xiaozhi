"""Rebuild a local Internal ARM64 pair; preserve private material and official core."""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
BROWSER = 'extensions/node_modules/@neiwang/browser-automation/'
BUSINESS = 'extensions/node_modules/@deepseek-ai/neiwang-business/'
BUILD = 'Kylin-ARM64-20261102-ISU'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode('utf8')

def build(baseline, output):
    if output.exists():
        raise ValueError('Use a fresh output directory')
    assets = json.loads((baseline/'release-assets.json').read_text(encoding='utf8'))
    assets = [r for r in assets if r['name'].endswith('.tar.gz')]
    if len(assets) != 2:
        raise ValueError('Expected ARM64 Core/Plugins pair')
    for row in assets:
        if digest((baseline/row['name']).read_bytes()) != row['sha256']:
            raise ValueError('Baseline checksum mismatch')
    changes = {}
    for name in ['controller.mjs', 'index.mjs', 'compact.mjs', 'browser-main.cjs', 'session-auth.mjs', 'isu-session.mjs', 'session_adapter.py', 'package.json', 'package-lock.json']:
        changes['plugin-pack/payload/'+BROWSER+name] = (ROOT/'extensions/@neiwang/browser-automation'/name).read_bytes()
    for name in ['isu-instruments.cjs', 'isu-browser-session.cjs', 'index.mjs']:
        changes['plugin-pack/payload/'+BUSINESS+name] = (ROOT/'extensions/@deepseek-ai/neiwang-business'/name).read_bytes()
    for name in ['api_tool.py', 'browser_session.py']:
        changes['tools/'+name] = (ROOT/'tools'/name).read_bytes()
    for name in ['HANDOVER.md', 'INSTALL.md']:
        changes['docs/'+name] = (ROOT/'docs'/name).read_bytes()
    output.mkdir(parents=True)
    reports = []
    unchanged_count = {}
    for row in assets:
        kind = 'Plugins' if '-Plugins' in row['name'] else 'Core'
        target = output/row['name'].replace('R11.6-Internal', 'R11.6-20261102-ISU-Internal')
        originals, added = {}, set()
        with tarfile.open(baseline/row['name'], 'r:gz') as archive, tarfile.open(target, 'w:gz', compresslevel=6) as dest:
            for member in archive:
                prefix, _, relative = member.name.partition('/')
                if not relative:
                    dest.addfile(copy.copy(member));continue
                if relative.startswith('data/'):
                    raise ValueError('Unexpected runtime data in baseline')
                if not member.isfile():
                    dest.addfile(copy.copy(member));continue
                data = archive.extractfile(member).read()
                if relative == 'config/app.json':
                    value = json.loads(data);value.update(buildId=BUILD, buildDate='2026-11-02', browserPluginVersion='1.2.0');changes[relative] = encoded(value)
                elif relative == 'plugin-pack/pack.json':
                    value = json.loads(data)
                    for file, payload in list(changes.items()):
                        if not file.startswith('plugin-pack/payload/'):
                            continue
                        file = file[len('plugin-pack/payload/'):]
                        rows = [r for r in value['files'] if r['path'] == file]
                        if rows:rows[0]['sha256'] = digest(payload)
                        else:value['files'].append({'path': file, 'sha256': digest(payload), 'mode': 420})
                    changes[relative] = encoded(value)
                if relative in changes:
                    data = changes[relative]
                else:
                    originals[member.name] = digest(data)
                item = copy.copy(member);item.size = len(data);dest.addfile(item, io.BytesIO(data));added.add(relative)
            for relative, data in changes.items():
                if relative not in added and relative.startswith('plugin-pack/') == (kind == 'Plugins'):
                    item = tarfile.TarInfo(prefix+'/'+relative);item.mode = 0o644;item.size = len(data);dest.addfile(item, io.BytesIO(data))
        verified = 0
        with tarfile.open(target, 'r:gz') as archive:
            for member in archive:
                if not member.isfile():continue
                relative = member.name.partition('/')[2];data = archive.extractfile(member).read()
                if member.name in originals:
                    if digest(data) != originals[member.name]:raise ValueError('Untouched baseline member differs')
                    verified += 1
                elif relative in changes and data != changes[relative]:raise ValueError('Updated member differs')
        if verified != len(originals) or target.stat().st_size >= 500_000_000:
            raise ValueError('Archive verification or 500 MB limit failed')
        sha = digest(target.read_bytes());Path(str(target)+'.sha256').write_text(sha+'  '+target.name+'\n', encoding='ascii', newline='\n')
        reports.append({'kind': kind, 'name': target.name, 'bytes': target.stat().st_size, 'sha256': sha})
        unchanged_count[kind] = verified;print(json.dumps({'kind':kind, 'unchangedFilesVerified':verified}),flush=True)
    (output/'release-assets.json').write_bytes(encoded(reports))
    (output/'SHA256SUMS.txt').write_text(''.join(r['sha256']+'  '+r['name']+'\n' for r in reports), encoding='ascii', newline='\n')
    installer = (baseline/'合并安装R11.6.sh').read_text(encoding='utf-8-sig').replace('R11.6-Internal-', 'R11.6-20261102-ISU-Internal-').replace('合并后的R11.6','安装后的R11.6-ISU-20261102').replace('合并安装R11.6.sh','安装麒麟ISU版.sh')
    (output/'安装麒麟ISU版.sh').write_text(installer,encoding='utf8',newline='\n')
    (output/'构建验证.json').write_bytes(encoded({'buildId':BUILD,'browserPluginVersion':'1.2.0','coreUnmodified':True,'privateInputsPreserved':True,'unchangedMembersVerified':unchanged_count,'changedFiles':{p:digest(v) for p,v in changes.items()},'publicUploadAllowed':False}))

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();build(a.baseline.resolve(),a.output.resolve())
