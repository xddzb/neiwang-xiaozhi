"""Reuse the reviewed double-click launchers; package only the preview fix."""
import argparse,hashlib,importlib.util,io,json,tarfile,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def build(output):
    output=Path(output)
    if output.exists():raise ValueError('Output already exists')
    spec=importlib.util.spec_from_file_location('base',ROOT/'scripts/package-context-models-patch.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
    files={}
    with tempfile.TemporaryDirectory() as temp:
        source=Path(temp)/'base.tar.gz';base.build(source)
        with tarfile.open(source) as t:
            for m in t:
                name=m.name.partition('/')[2]
                if name.endswith(('.sh','.desktop')):
                    files[name]=t.extractfile(m).read().replace(b'install-context-models-patch.cjs',b'install-preview-notice-patch.cjs')
    for name in ['install-preview-notice-patch.cjs','install-context-models-patch.cjs','offline-plugin-manager.cjs']:files[name]=(ROOT/'tools'/name).read_bytes()
    digest=lambda b:hashlib.sha256(b).hexdigest()
    files['patch.json']=json.dumps({'kind':'preview-notice-20261124','os':'linux','arch':'arm64','nodeMajor':24,'hashes':{n:digest(b) for n,b in files.items() if n.endswith('.cjs')}},indent=2).encode()
    files['使用说明.txt']='''麒麟 ARM64 R11.6 预览版弹框修复（2026-11-24）
完全退出内网小智，解压后把整个“预览弹框修复补丁”文件夹放到 APP 目录，与 start.sh 同级。
双击“安装补丁.desktop”，首次若提示请允许执行；也可双击“安装补丁.sh”并选择在终端运行。完成后重启 APP。
本补丁可在已安装或未安装 20261123 上下文补丁的 R11.6 / 0.2.1-rc.3 上使用，只设置部署层的预览说明默认状态。
保留手动模型 API 入口、上下文优化、密钥、聊天与其他用户设置，不修改官方核心。
自动备份 APP/config/preview-notice-patch-backup.json。关闭 APP 后可双击回退补丁；安装意外中断请先恢复补丁。
如果用户配置文件手动覆盖了 ui-settings-general.welcomeNoticeVersion，用户层仍有优先权；此补丁不覆盖用户配置。
不包含试验性核心升级。核心升级必须使用另行验证的平台完整依赖。
'''.encode()
    files['SHA256SUMS.txt']=''.join(digest(b)+'  '+n+'\n' for n,b in files.items()).encode()
    output.parent.mkdir(parents=True,exist_ok=True)
    with tarfile.open(output,'w:gz') as t:
        for n,b in files.items():
            m=tarfile.TarInfo('预览弹框修复补丁/'+n);m.size=len(b);m.mode=0o755 if n.endswith(('.sh','.desktop')) else 0o644;t.addfile(m,io.BytesIO(b))
    Path(str(output)+'.sha256').write_text(digest(output.read_bytes())+'  '+output.name+'\n',encoding='utf-8')
    return {'file':str(output),'bytes':output.stat().st_size}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();print(json.dumps(build(a.output),ensure_ascii=False))
