from pathlib import Path
import tarfile, hashlib, json, io

root = Path(__file__).resolve().parents[1]
source = root / 'dist/R11.2-Kylin-ARM64-Internal-LF-Fix-RAG'
out = root / 'dist/Neiwang-Xiaozhi-Kylin-ARM64-R11.2-RAG-Full-20261023.tar.gz'
base = 'Neiwang-Xiaozhi-Kylin-ARM64-R11.2'
seen = set()
def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()
with tarfile.open(out, 'w:gz', compresslevel=3) as dst:
    for kind in ('Core', 'Plugins'):
        archive = source / f'{base}-{kind}.tar.gz'
        expected = (source / (archive.name + '.sha256')).read_text(encoding='utf-8-sig').split()[0]
        assert sha256(archive) == expected
        with tarfile.open(archive, 'r:gz') as src:
            for member in src:
                if member.name in seen:
                    assert member.isdir(), member.name
                    continue
                seen.add(member.name)
                dst.addfile(member, src.extractfile(member) if member.isfile() else None)
        print(f'Included and verified {kind}', flush=True)
    guide = ('麒麟 ARM64 R11.2 · 2026-10-23 RAG 修复完整版\n'
             '本包已合并核心与插件，无需另下载插件包。请解压到新的可写目录。\n'
             '进入 Neiwang-Xiaozhi-Kylin-ARM64-R11.2 目录后执行：\n'
             'sh plugin-pack/安装插件.sh\nsh start.sh\n'
             '已恢复原有内网模型与 Dify Workflow 配置。启动后开启左下角 RAG，再新建聊天。\n'
             '钉钉机器人、AI表格插件保留；不包含原电脑绑定或授权状态。\n'
             '本包包含组织接口加密配置，请仅在组织授权范围内使用。\n'
             'ARM64 测试已通过；实际麒麟及内网接口连通性仍需本机验证。\n').encode('utf-8')
    for name, data in [('新版安装说明.txt', guide), ('新版验证结果.json', (source / 'validation.json').read_bytes())]:
        member = tarfile.TarInfo(base + '/' + name)
        member.size = len(data)
        member.mode = 0o644
        dst.addfile(member, io.BytesIO(data))
required = ['config/defaults/model.enc', 'config/defaults/dify.enc', 'start.sh', 'plugin-pack/安装插件.sh']
assert all(base + '/' + p in seen for p in required)
digest = sha256(out)
Path(str(out) + '.sha256').write_text(digest + '  ' + out.name + '\n', encoding='ascii')
print(json.dumps({'file': str(out), 'bytes': out.stat().st_size, 'sha256': digest, 'requiredFiles': 'PASS'}, ensure_ascii=False), flush=True)
