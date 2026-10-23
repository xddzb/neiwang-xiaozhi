from pathlib import Path
import tarfile,copy,io,json,hashlib,sys
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'dist/R10-Modular';OUT=ROOT/'dist/R11.2-Kylin-ARM64'
OLD='Neiwang-Xiaozhi-Kylin-ARM64-R10';NAME='Neiwang-Xiaozhi-Kylin-ARM64-R11.2';VERSION='R11.2'
GUIDE='''内网小智 R11.2 麒麟 ARM64/aarch64 版

适用目标：麒麟V10 ARM64/aarch64，不适用于麒麟x86_64、Windows或统信等未验证平台。
本版保留钉钉机器人，AI表格恢复插件原有完整读写能力（27个命令，覆盖Base、数据表、字段、记录、视图、搜索与写入结果核对）。不是只读版。需要明确用户授权才执行写入；未确认默认预览，删除先确认。此处“完整”指当前插件公开的命令，不代表已开放DWS所有产品和所有命令。

安装：
1. 将Core核心包解压到新的可写目录，不要直接覆盖旧版本。
2. 将Plugins插件包解压到同一个父目录，使plugin-pack出现在核心目录，与runtime、config同级。
3. 在应用目录执行 sh plugin-pack/安装插件.sh；插件成功安装后再启动。
4. 首次运行先执行 sh 配置模型.sh，填入模型地址、模型名称和API密钥（隐藏输入），然后执行 sh start.sh。
5. 可执行 sh install-desktop.sh 创建桌面入口。钉钉机器人配置与AI表格用户授权分开管理。
6. AI表格：设置→钉钉AI表格→登录／授权AI表格，由用户本人核对组织和权限并完成授权，再刷新状态、选择并保存完整corpId:userId。

权限说明：恢复读写能力不等于组织已授权。DWS授权可能包含较广范围；管理员应核对是否符合组织要求，不会由本包自动批准。机器人管理员与钉钉组织管理员不是同一概念。未知写入结果先查询，不盲目重试。本次构建/验证不修改真实表格、不发送钉钉消息。

核心保留模型对话、文件/命令、代码变更查看；插件补充机器人、AI表格、文档/Python/PyInstaller和内网业务工具。左上角编辑菜单已移除。官方DSH 0.2.0-rc.2内核未修改。
交付包不含个人密钥、机器人绑定、聊天或钉钉授权；不提供内置免费模型额度。沙箱需要系统支持非特权用户命名空间，不可用时不会自动扩大权限。
验证环境和实际结果见validation.json。ARM64 Ubuntu虚拟机验证不能替代真实麒麟V10实机验收。
'''
def dump(v):return json.dumps(v,ensure_ascii=False,indent=2).encode('utf8')
def build():
 OUT.mkdir(exist_ok=True);archives=[];shell_hashes={}
 with tarfile.open(SOURCE/(OLD+'-Plugins.tar.gz'),'r:gz') as source:
  for entry in source:
   if entry.isfile() and entry.name.endswith('.sh') and '/plugin-pack/payload/' in entry.name:
    fixed=source.extractfile(entry).read().removeprefix(b'\xef\xbb\xbf').replace(b'\r\n',b'\n')
    shell_hashes[entry.name.split('/plugin-pack/payload/',1)[1]]=hashlib.sha256(fixed).hexdigest()
 for kind in ['Core','Plugins']:
  src=SOURCE/(OLD+'-'+kind+'.tar.gz');dest=OUT/(NAME+'-'+kind+'.tar.gz');seen=set();count=0
  with tarfile.open(src,'r:gz') as old,tarfile.open(dest,'w:gz',compresslevel=6) as new:
   for entry in old:
    rel=entry.name.removeprefix(OLD+'/')
    if rel.startswith(('data/','config/defaults/')) or rel in ['R10-安装说明.txt','R10更新说明.txt','plugin-pack/R10更新说明.txt']:continue
    n=copy.copy(entry);n.name=NAME+'/'+rel;n.pax_headers={k:v for k,v in entry.pax_headers.items() if k not in ['path','linkpath']}
    if entry.islnk():n.linkname=entry.linkname.replace(OLD+'/',NAME+'/',1)
    data=old.extractfile(entry).read() if entry.isfile() else None
    if rel=='config/app.json':v=json.loads(data);v['version']=VERSION;data=dump(v)
    elif rel=='launcher/bootstrap.cjs':data=data.replace(b"path.resolve(__dirname,'../..')",b"path.resolve(__dirname,'..')")
    elif rel=='launcher/shell/main.js':
     text=data.decode('utf8');start="Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'编辑',submenu:[{role:'copy'},{role:'paste'},{role:'selectAll'}]}]));";assert start in text;data=text.replace(start,'Menu.setApplicationMenu(null);').encode('utf8')
    elif rel=='plugin-pack/pack.json':
     v=json.loads(data);v['release']=VERSION
     for item in v['files']:
      if item['path'] in shell_hashes:item['sha256']=shell_hashes[item['path']]
     data=dump(v)
    elif rel=='manifests/release.json':v=json.loads(data);v.update(version=VERSION,dingtalkAITable=True,dingtalkAITableReadOnly=False);data=dump(v)
    elif rel=='workspace/AGENTS.md':data+=('\n钉钉AI表格支持插件公开的全部读写命令。先核对账号、表格和字段；写入须明确授权，删除先确认。不得仅因具备权限就修改表格，不得在结果未知时重复写入。\n').encode('utf8')
    elif rel in ['README-先看这里.txt','维护与升级说明.txt','安装说明.txt','plugin-pack/安装说明.txt']:data=GUIDE.encode('utf8')
    if data is not None:
     if rel.endswith('.sh'):data=data.removeprefix(b'\xef\xbb\xbf').replace(b'\r\n',b'\n')
     n.size=len(data);new.addfile(n,io.BytesIO(data))
    else:new.addfile(n)
    seen.add(rel);count+=1
   if kind=='Core':
    additions={'tools/setup_model.py':(ROOT/'builds/Neiwang-Xiaozhi-Win10-x64-R11/tools/setup_model.py').read_bytes(),'配置模型.sh':b'#!/bin/sh\nset -eu\nAPP=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexport PYTHONHOME="$APP/runtime/python"\nexport LD_LIBRARY_PATH="$APP/runtime/python/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"\nexec "$APP/runtime/python/bin/python3" "$APP/tools/setup_model.py"\n'}
    if '安装说明.txt' not in seen:additions['安装说明.txt']=GUIDE.encode('utf8')
    for rel,data in additions.items():
     n=tarfile.TarInfo(NAME+'/'+rel);n.mode=0o755 if rel.endswith('.sh') else 0o644;n.size=len(data);new.addfile(n,io.BytesIO(data));count+=1
  digest=hashlib.sha256(dest.read_bytes()).hexdigest();assert dest.stat().st_size<450_000_000
  (OUT/(dest.name+'.sha256')).write_text(digest+'  '+dest.name+'\n',encoding='utf8');archives.append({'file':dest.name,'bytes':dest.stat().st_size,'sha256':digest,'members':count});print('Packaged '+dest.name,flush=True)
 (OUT/'安装说明.txt').write_text(GUIDE,encoding='utf8');(OUT/'build.json').write_bytes(dump({'version':VERSION,'platform':'Kylin-ARM64','aiTableMode':'read-write','archives':archives}));print('Kylin build complete',flush=True)
if __name__=='__main__':build()
