"""Windows x64 offline ZIP; reuse the verified combined transaction."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,tarfile,tempfile,zipfile
ROOT=Path(__file__).resolve().parents[1]
def build(output):
    output=Path(output)
    if output.exists():raise ValueError('Use a fresh output path')
    spec=importlib.util.spec_from_file_location('combined',ROOT/'scripts/package-context-tools-patch.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory() as tmp:
        arc=Path(tmp)/'combined.tar.gz';module.build(arc)
        with tarfile.open(arc) as t:files={m.name.split('/',1)[1]:t.extractfile(m).read() for m in t}
    for prefix in ['tools-kit','context-kit']:
        name=prefix+'/patch.json';manifest=json.loads(files[name]);manifest.update(os='win32',arch='x64');files[name]=json.dumps(manifest,indent=2).encode()
    files={n:b for n,b in files.items() if not n.endswith(('.sh','.desktop','SHA256SUMS.txt','使用说明.txt')) and n!='combined.json'}
    files['install-windows-context-tools-patch.cjs']=(ROOT/'tools/install-windows-context-tools-patch.cjs').read_bytes()
    for action,title in [('check','CheckPatch'),('install','InstallPatch'),('rollback','RollbackPatch'),('recover','RecoverPatch')]:
        files[title+'.cmd']=(r'''@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "KIT=%~dp0"
for %%I in ("%KIT%..") do set "APP=%%~fI"
if not exist "%APP%\runtime\node\node.exe" goto missing
if not exist "%APP%\config\app.json" goto missing
"%APP%\runtime\node\node.exe" "%KIT%install-windows-context-tools-patch.cjs" ACTION "%APP%"
set "PATCH_EXIT=%ERRORLEVEL%"
if not "%PATCH_EXIT%"=="0" echo Patch failed. Keep the error above; do not force overwrite.
pause
exit /b %PATCH_EXIT%
:missing
echo Extract the whole WindowsPatch folder INSIDE the APP folder, beside start.cmd.
pause
exit /b 1
'''.replace('ACTION',action).replace('\n','\r\n')).encode('ascii')
    files['combined.json']=json.dumps({'kind':'context-tools-20261125','hashes':{n:hashlib.sha256(b).hexdigest() for n,b in files.items()}},indent=2).encode()
    files['使用说明.txt']='''Windows 10/11 x64 R11.6 组合修复补丁（20261125）
完全退出内网小智和业务浏览器。解压 ZIP，将整个 WindowsPatch 文件夹放进 APP 目录，与 start.cmd、config、runtime 同级。
双击 InstallPatch.cmd。出现 installed 后重启；unchanged 表示已装。窗口保留结果，按键关闭。CheckPatch.cmd 只检查。
适用核心 0.2.1-rc.3 / Node 24 / 浏览器插件 1.4.1 或 1.4.2，需保留完整 plugin-pack；不适用 ARM64、麒麟、其他核心或自定义数据目录。
包含工具调用说明及 tool_catalog 修复、上下文预算修复、手动新增模型 API 入口。无需另装之前的工具调用补丁。
设置 → 模型 → 添加提供商（Add model provider）→ 自定义模型 API，填写自己的服务地址、模型和密钥。原内网模型的 model.enc、.local-key 及默认加密配置不改写、不解密导出；新增 API 按应用现有用户模型设置机制保存，不替换原内网 API。
压缩额外余量为 16384，thresholdRatio=.9，摘要上限 8192；默认模型输出预留仍为 8192。128000/8192 时常规压缩点约 80.8%。其他模型容量、输出设置和服务端超限仍会影响触发。
启动时修复用户层及 modelPolicies 的旧压缩覆盖，启用模型设置入口；保留其他设置、聊天和业务接口。默认关闭预览提示，不修改用户显式通用设置。
备份：config/windows-context-tools-patch-backup.json。退出 APP 后双击 RollbackPatch.cmd 回退；安装中断用 RecoverPatch.cmd。后装先退，文件之后有修改时停止回退以保护新设置。请保留补丁和备份。
仅离线小补丁，不是完整 APP；不升级核心、不下载依赖。ZIP 小于 500 MB，不需要分卷。
'''.encode('utf8')
    files['SHA256SUMS.txt']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in files.items()).encode()
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
        for name,b in files.items():z.writestr('WindowsPatch/'+name,b)
    Path(str(output)+'.sha256').write_text(hashlib.sha256(output.read_bytes()).hexdigest()+'  '+output.name+'\n',encoding='utf8')
    return {'file':str(output),'bytes':output.stat().st_size}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);print(json.dumps(build(p.parse_args().output),ensure_ascii=False))
