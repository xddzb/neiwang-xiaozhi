"""Small offline Kylin patch; run from an extracted folder inside the APP."""
import argparse, hashlib, io, json, tarfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def digest(b): return hashlib.sha256(b).hexdigest()

def build(output):
    output=Path(output)
    if output.exists(): raise ValueError('Output exists')
    source=(ROOT/'launcher/bootstrap.cjs').read_text(encoding='utf-8')
    start=" const overrides=read(path.join(root,'config/overrides.json'));\n"
    block=source.split(start)[1].split(' const patches=[...overrides,')[0]
    model_block=block.split(' // Old offline baselines')[0]
    policies=[r for r in json.loads((ROOT/'config/overrides.json').read_text()) if r['id'] in ('ui-settings-models','compaction-basic')]
    files={'normalization.txt':block.encode(),'policies.json':json.dumps(policies,indent=2).encode()}
    for name in ['install-context-models-patch.cjs','offline-plugin-manager.cjs']:
        files[name]=(ROOT/'tools'/name).read_bytes()
    manifest={'kind':'context-models-20261123','os':'linux','arch':'arm64','nodeMajor':24,
              'hashes':{n:digest(b) for n,b in files.items()},'acceptedBlocks':[digest(b.encode()) for b in ['',model_block,block]]}
    files['patch.json']=json.dumps(manifest,indent=2).encode()
    for action,title in [('install','安装补丁'),('rollback','回退补丁'),('recover','恢复补丁')]:
        files[title+'.sh']=('''#!/bin/sh
set -eu
KIT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP=$(CDPATH= cd -- "$KIT/.." && pwd)
if [ ! -t 0 ] && [ "${NEIWANG_PATCH_TERMINAL:-}" != 1 ]; then
 export NEIWANG_PATCH_TERMINAL=1
 for term in x-terminal-emulator mate-terminal gnome-terminal konsole xterm; do
  if command -v "$term" >/dev/null 2>&1; then
   case "$term" in mate-terminal|gnome-terminal) exec "$term" -- sh "$0" ;; *) exec "$term" -e sh "$0" ;; esac
  fi
 done
fi
if [ ! -x "$APP/runtime/node/bin/node" ] || [ ! -f "$APP/config/app.json" ]; then
 echo '请将整个补丁文件夹放入内网小智 APP 目录（与 start.sh 同级），再双击安装补丁。'
 code=1
else
 echo '请先完全退出内网小智。正在检查并执行补丁……'
 code=0
 "$APP/runtime/node/bin/node" "$KIT/install-context-models-patch.cjs" ACTION "$APP" || code=$?
fi
printf '\n按回车关闭窗口：'
read -r answer || true
exit "$code"
'''.replace('ACTION',action)).encode()
        # %k is supplied as an argument, never interpolated into shell code.
        command='exec sh "$(dirname "$1")/'+title+'.sh"'
        escaped=command.replace('\\','\\\\').replace('"','\\"').replace('$','\\$').replace('`','\\`')
        files[title+'.desktop']=('[Desktop Entry]\nType=Application\nName='+title+'\nTerminal=true\nExec=sh -c "'+escaped+'" sh %k\n').encode()
    files['使用说明.txt']='''麒麟 ARM64 R11.6 上下文与模型设置补丁（2026-11-23）
1. 完全退出内网小智，解压本压缩包。
2. 将解压得到的整个“上下文与模型补丁”文件夹放进 APP 安装目录，与 start.sh 同级。
3. 双击文件夹中的“安装补丁.desktop”（文件管理器可能显示为“安装补丁”）。若系统提示，选择信任/允许运行。
   也可双击“安装补丁.sh”并选择“在终端运行”；若系统只用编辑器打开脚本，在此文件夹打开终端运行 sh 安装补丁.sh。
4. 等待窗口显示 installed / 操作完成，再重新启动 APP。unchanged 表示已安装。
不下载依赖、不修改加密模型、会话、API 密钥或用户模型设置。备份位于 APP/config/context-models-patch-backup.json，请保留。
如需撤销，完全退出 APP 后双击“回退补丁”；意外断电后先双击“恢复补丁”，再重新安装。
设置 → 模型 → 添加提供商 → 自定义模型 API，可添加新接口。已有用户参数优先。
128000 上下文、8192 输出预留、16384 余量时，常规阈值为 103424 Token（80.8%）。模型切换、用户覆盖、服务端超限恢复会影响触发。
本补丁不会移动既有工作区。若提示 STATE_WORKSPACE_OVERLAP，请将工作区切换为 APP/workspace 或独立业务目录，不要选择 APP 根目录，也不要删除变更记录。
补丁只适配 R11.6 / 内核 0.2.1-rc.3 / Linux ARM64 / 随包 Node 24。不支持其他版本时会停止，不覆盖未知配置段。
'''.encode()
    files['SHA256SUMS.txt']=''.join(digest(b)+'  '+n+'\n' for n,b in files.items()).encode()
    output.parent.mkdir(parents=True,exist_ok=True)
    with tarfile.open(output,'w:gz') as archive:
        for name,data in files.items():
            m=tarfile.TarInfo('上下文与模型补丁/'+name);m.size=len(data);m.mode=0o755 if name.endswith(('.sh','.desktop')) else 0o644
            archive.addfile(m,io.BytesIO(data))
    Path(str(output)+'.sha256').write_text(digest(output.read_bytes())+'  '+output.name+'\n',encoding='utf-8')
    return {'file':str(output),'bytes':output.stat().st_size}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();print(json.dumps(build(a.output),ensure_ascii=False))
