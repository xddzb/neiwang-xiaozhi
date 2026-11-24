"""Package a small, public-safe Kylin ARM64 delta; no user configs or dependencies."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import tarfile
import subprocess

ROOT = Path(__file__).resolve().parents[1]
GROUPS = {
 'extensions/node_modules/@neiwang/browser-automation/': ('extensions/@neiwang/browser-automation/', ['controller.mjs','index.mjs','compact.mjs','browser-main.cjs','package.json','package-lock.json','session_adapter.py','session-auth.mjs','isu-session.mjs','browser-toolbar.html','browser-toolbar.js','browser-toolbar-preload.cjs']),
 'extensions/node_modules/@deepseek-ai/neiwang-business/': ('extensions/@deepseek-ai/neiwang-business/', ['index.mjs','isu-instruments.cjs','isu-browser-session.cjs']),
 'tools/': ('tools/', ['api_tool.py','browser_session.py'])
}



def build(output, baseline_core=None, page_url=None):
    if json.loads((ROOT/'extensions/@neiwang/browser-automation/package.json').read_text(encoding='utf-8'))['version'] != '1.4.1':
        raise ValueError('This packager targets the frozen ISU 1.4.1 patch; use its reviewed historical commit, not a newer browser plugin')
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise ValueError('Output already exists; choose a new filename')
    stage = output.parent/(output.name.removesuffix('.tar.gz')+'-stage')
    stage.mkdir()
    rows = []
    baseline = {}
    if baseline_core:
        with tarfile.open(baseline_core, 'r:gz') as archive:
            for m in archive:
                rel=m.name.partition('/')[2]
                if rel in ['tools/api_tool.py','tools/browser_session.py']:
                    baseline[rel]=hashlib.sha256(archive.extractfile(m).read()).hexdigest()
    for prefix,(source,names) in GROUPS.items():
        for name in names:
            relative=prefix+name
            data=(ROOT/source/name).read_bytes()
            target=stage/'payload'/relative
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(data)
            row={'path':relative,'sha256':hashlib.sha256(data).hexdigest()}
            if prefix=='tools/':
                old=subprocess.check_output(['git','-c','safe.directory=*','show','43c6c42:'+relative],cwd=ROOT)
                old=old.replace(b'\r\n',b'\n')
                row['allowedBefore']=sorted(set([hashlib.sha256(old).hexdigest(),hashlib.sha256(old.replace(b'\n',b'\r\n')).hexdigest(),row['sha256']]+([baseline[relative]] if relative in baseline else [])))
            rows.append(row)
    support = []
    for name in ['install-isu-session-patch.cjs', 'offline-plugin-manager.cjs']:
        data = (ROOT/'tools'/name).read_bytes()
        (stage/name).write_bytes(data)
        support.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest()})
    manifest = {'schemaVersion': 1, 'kind': 'neiwang-isu-session-delta', 'id': 'isu-session-1.4.1',
                'compatibility': {'os': 'linux', 'arch': 'arm64', 'nodeMajor': 24, 'coreVersions': ['0.2.1-rc.3']},
                'files': rows, 'support': support}
    if page_url:
        manifest['page_url']=page_url
    (stage/'patch.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf8', newline='\n')
    for command, name in [('check', '检查补丁.sh'), ('install', '安装补丁.sh'), ('rollback', '回退补丁.sh'), ('recover', '恢复补丁.sh')]:
        text = '''#!/bin/sh
set -eu
[ "$#" -eq 1 ] || { echo '用法：sh 本脚本.sh "/现有APP绝对目录"'; exit 1; }
KIT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP=$(CDPATH= cd -- "$1" && pwd)
[ -x "$APP/runtime/node/bin/node" ] || { echo '找不到APP随包Node，请检查目录'; exit 1; }
exec "$APP/runtime/node/bin/node" "$KIT/install-isu-session-patch.cjs" COMMAND "$APP"
'''.replace('COMMAND', command)
        (stage/name).write_text(text, encoding='utf8', newline='\n')
    (stage/'使用说明.md').write_text((ROOT/'docs/ISU-PATCH.md').read_text(encoding='utf8'),encoding='utf8',newline='\n')
    sums = []
    for p in sorted(stage.rglob('*')):
        if p.is_file():
            sums.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(stage).as_posix())
    (stage/'SHA256SUMS.txt').write_text('\n'.join(sums)+'\n', encoding='utf8', newline='\n')
    top = 'Neiwang-Kylin-ARM64-ISU-Patch-1.4.1'
    with tarfile.open(output, 'w:gz') as archive:
        for p in sorted(stage.rglob('*')):
            if not p.is_file():
                continue
            data = p.read_bytes()
            member = tarfile.TarInfo(top+'/'+p.relative_to(stage).as_posix())
            member.size = len(data)
            member.mode = 0o755 if p.suffix == '.sh' else 0o644
            archive.addfile(member, io.BytesIO(data))
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    Path(str(output)+'.sha256').write_text(digest+'  '+output.name+'\n', encoding='ascii', newline='\n')
    return {'file': str(output), 'bytes': output.stat().st_size, 'sha256': digest, 'pluginVersion': '1.4.1'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--baseline-core')
    parser.add_argument('--page-url')
    args = parser.parse_args()
    print(json.dumps(build(args.output,args.baseline_core,args.page_url), ensure_ascii=False))
