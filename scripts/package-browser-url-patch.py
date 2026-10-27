"""Package a small, public-safe Kylin ARM64 delta; no user configs or dependencies."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import tarfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['controller.mjs', 'index.mjs', 'compact.mjs', 'browser-main.cjs', 'package.json', 'package-lock.json']


def build(output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise ValueError('Output already exists; choose a new filename')
    stage = output.parent/(output.name.removesuffix('.tar.gz')+'-stage')
    stage.mkdir()
    rows = []
    for name in FILES:
        data = (ROOT/'extensions/@neiwang/browser-automation'/name).read_bytes()
        target = stage/'payload'/name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(data)
        rows.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest()})
    support = []
    for name in ['install-browser-url-patch.cjs', 'offline-plugin-manager.cjs']:
        data = (ROOT/'tools'/name).read_bytes()
        (stage/name).write_bytes(data)
        support.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest()})
    manifest = {'schemaVersion': 1, 'kind': 'neiwang-browser-url-delta', 'id': 'browser-url-1.0.1',
                'compatibility': {'os': 'linux', 'arch': 'arm64', 'nodeMajor': 24, 'coreVersions': ['0.2.1-rc.3']},
                'files': rows, 'support': support}
    (stage/'patch.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf8', newline='\n')
    for command, name in [('check', '检查补丁.sh'), ('install', '安装补丁.sh'), ('rollback', '回退补丁.sh'), ('recover', '恢复补丁.sh')]:
        text = '''#!/bin/sh
set -eu
[ "$#" -eq 1 ] || { echo '用法：sh 本脚本.sh "/现有APP绝对目录"'; exit 1; }
KIT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP=$(CDPATH= cd -- "$1" && pwd)
[ -x "$APP/runtime/node/bin/node" ] || { echo '找不到APP随包Node，请检查目录'; exit 1; }
exec "$APP/runtime/node/bin/node" "$KIT/install-browser-url-patch.cjs" COMMAND "$APP"
'''.replace('COMMAND', command)
        (stage/name).write_text(text, encoding='utf8', newline='\n')
    install_doc = (ROOT/'docs/INSTALL.md').read_text(encoding='utf8')
    start = install_doc.index('## 浏览器参数离线补丁')
    end = install_doc.find('\n## ', start+4)
    (stage/'使用说明.md').write_text(install_doc[start:end if end >= 0 else None]+'\n', encoding='utf8', newline='\n')
    sums = []
    for p in sorted(stage.rglob('*')):
        if p.is_file():
            sums.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(stage).as_posix())
    (stage/'SHA256SUMS.txt').write_text('\n'.join(sums)+'\n', encoding='utf8', newline='\n')
    top = 'Neiwang-Kylin-ARM64-Browser-Fix-1.0.1'
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
    return {'file': str(output), 'bytes': output.stat().st_size, 'sha256': digest, 'pluginVersion': '1.0.1'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.output), ensure_ascii=False))
