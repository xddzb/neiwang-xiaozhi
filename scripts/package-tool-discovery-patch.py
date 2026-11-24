"""Offline delta for our tool-discovery extensions, retaining the reviewed core."""
from pathlib import Path
import argparse,hashlib,importlib.util,io,json,tarfile,tempfile
ROOT=Path(__file__).resolve().parents[1]
GROUPS={'@neiwang/browser-automation':['index.mjs','compact.mjs','client.js','package.json','package-lock.json'],
        '@deepseek-ai/neiwang-tool-catalog':['index.mjs','catalog.mjs','package.json','cordis.patch.yml']}
def digest(b):return hashlib.sha256(b).hexdigest()
def build(output):
    output=Path(output)
    if output.exists():raise ValueError('Use a new output path')
    files={};rows=[]
    for group,names in GROUPS.items():
        for name in names:
            rel='extensions/node_modules/'+group+'/'+name;b=(ROOT/'extensions'/group/name).read_bytes()
            files['payload/'+rel]=b;rows.append({'path':rel,'sha256':digest(b)})
    support={}
    for name in ['install-tool-discovery-patch.cjs','offline-plugin-manager.cjs']:
        files[name]=(ROOT/'tools'/name).read_bytes();support[name]=digest(files[name])
    files['patch.json']=json.dumps({'kind':'tool-discovery-20261124','os':'linux','arch':'arm64','nodeMajor':24,'files':rows,'support':support},indent=2).encode()
    spec=importlib.util.spec_from_file_location('base',ROOT/'scripts/package-context-models-patch.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
    with tempfile.TemporaryDirectory() as temp:
        source=Path(temp)/'base.tar.gz';base.build(source)
        with tarfile.open(source) as t:
            for m in t:
                name=m.name.partition('/')[2]
                if name.endswith(('.sh','.desktop')):files[name]=t.extractfile(m).read().replace(b'install-context-models-patch.cjs',b'install-tool-discovery-patch.cjs')
    files['使用说明.txt']='''麒麟 ARM64 工具调用修复补丁（2026-11-24）
适用：R11.6 / DSH 0.2.1-rc.3 / Node 24，浏览器插件 1.4.1 或 1.4.2，已有完整 plugin-pack/payload 与清单。
1. 完全退出内网小智；解压本压缩包。
2. 把整个“工具调用修复补丁”文件夹放入 APP 根目录，与 start.sh 同级。
3. 双击“安装补丁.desktop”；若提示信任/允许执行，请允许。也可在补丁目录运行 sh 安装补丁.sh。
4. 窗口出现 installed 后重启小智。unchanged 表示已安装。失败时不要忽略报错或手动覆盖文件。
5. 设置 → 业务浏览器与接口 → 刷新状态，应看到“工具目录：已注册”。打开新会话再查询目录。

更新浏览器的调用引导与目录插件；目录缺失时补齐并加入应用 bundle。运行与离线载荷同步更新。
不升级核心，不替换其他插件，不改模型密钥、聊天、接口连接或浏览器登录数据。已有用户 profile 显式禁用仍保留；若目录仍未注册，请提供报错，不要删除用户配置。
备份：APP/config/tool-discovery-patch-backup.json。不要删除此备份。
需要撤销时，退出 APP 后双击“回退补丁.desktop”；安装中断后先运行“恢复补丁.desktop”。本补丁之后若文件又被修改，回退会停止以保护修改。
若要撤销更早的 ISU 等补丁，应先回退本补丁，遵守后装先退的顺序。
旧版本、散列不一致或缺少离线载荷时会停止；请发送报错和版本，不要强制安装。
仅供离线交付；不连接外部模型或服务，不下载任何依赖。未在物理麒麟桌面进行现场测试。
'''.encode()
    files['SHA256SUMS.txt']=''.join(digest(b)+'  '+n+'\n' for n,b in files.items()).encode()
    output.parent.mkdir(parents=True,exist_ok=True)
    with tarfile.open(output,'w:gz') as t:
        for name,b in files.items():
            m=tarfile.TarInfo('工具调用修复补丁/'+name);m.size=len(b);m.mode=0o755 if name.endswith(('.sh','.desktop')) else 0o644;t.addfile(m,io.BytesIO(b))
    Path(str(output)+'.sha256').write_text(digest(output.read_bytes())+'  '+output.name+'\n',encoding='utf8')
    return {'file':str(output),'bytes':output.stat().st_size}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();print(json.dumps(build(a.output),ensure_ascii=False))
