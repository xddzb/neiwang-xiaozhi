"""One transaction for the context policy and tool discovery fixes."""
from pathlib import Path
import argparse,hashlib,importlib.util,io,json,tarfile,tempfile
ROOT=Path(__file__).resolve().parents[1]
def build(output):
    output=Path(output)
    if output.exists():raise ValueError('Use a fresh output path')
    files={}
    for kind,prefix in [('tool-discovery','tools-kit'),('context-models','context-kit')]:
        spec=importlib.util.spec_from_file_location(kind,ROOT/f'scripts/package-{kind}-patch.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            arc=Path(tmp)/'part.tar.gz';module.build(arc)
            with tarfile.open(arc) as t:
                for m in t:
                    name=m.name.split('/',1)[1];data=t.extractfile(m).read()
                    files[prefix+'/'+name]=data
                    if kind=='context-models' and name.endswith(('.sh','.desktop')):files[name]=data.replace(b'install-context-models-patch.cjs',b'install-context-tools-patch.cjs')
    for name in ['install-context-tools-patch.cjs','install-tool-discovery-patch.cjs','install-context-models-patch.cjs','offline-plugin-manager.cjs']:files[name]=(ROOT/'tools'/name).read_bytes()
    files['context-policy.cjs']=(ROOT/'launcher/context-policy.cjs').read_bytes()
    boot=(ROOT/'launcher/bootstrap.cjs').read_text(encoding='utf8')
    files['boot-hook.txt']=(' // Repair legacy profile'+boot.split(' // Repair legacy profile',1)[1].split(' const patchFile=',1)[0]).encode()
    deployment=(ROOT/'extensions/@neiwang/deployment/cordis.patch.yml').read_text(encoding='utf8')
    files['deployment-block.yml']=('- id: compaction-basic\n'+deployment.split('- id: compaction-basic\n',1)[1].split('- id:',1)[0]).encode()
    files['combined.json']=json.dumps({'kind':'context-tools-20261125','hashes':{n:hashlib.sha256(b).hexdigest() for n,b in files.items()}},indent=2).encode()
    files['使用说明.txt']='''麒麟 ARM64 R11.6 上下文与工具调用组合补丁（20261125）
适用核心 0.2.1-rc.3 / Node 24，浏览器 1.4.1 或 1.4.2，需完整 plugin-pack。
关闭小智，解压，将整个“上下文与工具调用修复补丁”目录放入 APP，与 start.sh 同级。
双击“安装补丁.desktop”（如提示则允许运行），看到 installed 后重启并新建会话；unchanged 表示已经安装。
包含此前工具目录修复，无需另装工具调用补丁。可在此前上下文/预览/工具补丁之上安装。
修复部署层和默认 data/dsh/profiles/web 的用户层、modelPolicies 压缩参数：thresholdRatio=.9，headroomTokens=16384，摘要输出 maxTokens=8192，retainRatio=.2。清除冲突 retainTokens，并启用自动压缩。
注意：摘要 maxTokens 与模型输出预留不同。本补丁不改已有模型提供商参数或密钥；默认输出预留仍为 8192。128000/8192 时常规压缩点为 103424（80.8%），不同模型或服务端超限可能提前触发。
重启后 data/runtime/context-policy.json 可查看部署预算和本次是否迁移；这不是服务器实际使用量，也不是每个路由模型的完整诊断。
本修复将压缩预算视作部署参数，启动时也会修正用户层旧覆盖；其他设置保持。模型 API、聊天和业务接口不变。不升级核心、不下载依赖。
若自定义数据目录，请勿假定默认目录已覆盖，当前补丁明确支持 APP/data。动态 JS 压缩配置会被拒绝。
备份在 config/context-tools-patch-backup.json。退出 APP 后双击“回退补丁.desktop”；安装中断双击“恢复补丁.desktop”。先回退本补丁，再回退更早补丁。用户层文件后续改动时回退会停止，不覆盖新设置。
实体麒麟尚未现场测试。报错请保留错误文字，不要强制覆盖文件。
'''.encode()
    files['SHA256SUMS.txt']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in files.items()).encode()
    output.parent.mkdir(parents=True,exist_ok=True)
    with tarfile.open(output,'w:gz') as t:
        for name,b in files.items():
            m=tarfile.TarInfo('上下文与工具调用修复补丁/'+name);m.size=len(b);m.mode=0o755 if name.endswith(('.sh','.desktop')) else 0o644;t.addfile(m,io.BytesIO(b))
    Path(str(output)+'.sha256').write_text(hashlib.sha256(output.read_bytes()).hexdigest()+'  '+output.name+'\n',encoding='utf8')
    return {'file':str(output),'bytes':output.stat().st_size}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);print(json.dumps(build(p.parse_args().output),ensure_ascii=False))
