from pathlib import Path
import shutil,json,os,hashlib,tarfile,zipfile,stat,posixpath
ROOT=Path(__file__).resolve().parents[1]
WIN=ROOT/'builds/Neiwang-Xiaozhi-Win10-x64-R8';LIN=ROOT/'builds/Neiwang-Xiaozhi-Kylin-ARM64-R8'
def linked(p):return p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction())
def files(root):
 for directory,dirs,names in os.walk(root,followlinks=False):
  base=Path(directory);dirs[:]=[d for d in dirs if not linked(base/d) and d not in ['__pycache__'] and not (base==root and d=='data')]
  for n in names:
   p=base/n;r=p.relative_to(root).as_posix()
   if linked(p) or n.endswith('.pyc') or (r.startswith('workspace/') and r!='workspace/AGENTS.md') or n=='selftest-result.txt':continue
   yield p,r
def sync():
 review='extensions/node_modules/@dsh-plugin/dsh-code-review'
 for relative in ['lib/index.js','lib/client.js','lib/client.bundle.js','src/client.ts','src/client-entry.js','package.json','NEIWANG-ADAPTATIONS.json']:
  dest=LIN/review/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(WIN/review/relative,dest)
 for app in [WIN,LIN]:
  for name in ['bootstrap.cjs','supervisor.cjs']:shutil.copy2(ROOT/'scripts/r8'/name,app/'launcher'/name)
  shutil.copy2(ROOT/'scripts/r8/manage-core.cjs',app/'tools/manage-core.cjs')
  file=app/'tools/configure-official-dingtalk.mjs';text=file.read_text(encoding='utf8');text=text.replace("process.env.DSH_HOME=join(root,'data/dsh');","process.env.DSH_HOME=prepared.home;").replace("process.env.DSH_DINGTALK_STATE_DIR=join(root,'data/dingtalk-official');","process.env.DSH_DINGTALK_STATE_DIR=prepared.env.DSH_DINGTALK_STATE_DIR;");file.write_text(text,encoding='utf8')
  source=app/'extensions/node_modules/@dsh-plugin/dsh-code-review/maintenance';source.mkdir(exist_ok=True);shutil.copy2(ROOT/'scripts/adapt_review_r8.py',source/'adapt_review_r8.py')
  (app/'维护与升级说明.txt').write_text('内网小智 R8：部署配置与官方内核解耦\n\ncore/<版本>/：官方DSH npm内核与其完整依赖，未修改。\nextensions/node_modules/：内网业务工具、钉钉官方连接器、设置页、代码审查、品牌适配。\nconfig/：品牌、部署开关、默认模型种子；config/overrides.json 为部署插件配置。\ndata/：首次运行生成的用户设置、聊天、钉钉凭据和绑定、审查记录，禁止随发行包传播。\nlauncher/：桌面壳、启动和运行时路径适配。runtime/：平台专用Node/Python。\n\n代码审查：会话右上角“变更”打开侧栏，绿色为新增、红色为删除；设置→代码变更可调整配色。只记录Agent通过文件工具产生的修改，不等同于对所有外部程序写盘的完整审计，也不替代Git。\n\n升级步骤：退出APP并备份config、data与workspace；将新内核及该平台依赖放入core/<新版本>；在隔离数据目录验证模型、文件工具、审查、Office和钉钉；通过后更新config/app.json的coreVersion以及manifests/core-sha256.json。保留旧core目录和配置备份用于回退。不要只覆盖某个内核JS文件。\n升级可能需要调整独立扩展适配，不保证未来内核接口自动兼容。自检：使用本包Node运行tools/manage-core.cjs verify。\n\n代码审查为社区插件，固定源码提交见其NEIWANG-ADAPTATIONS.json，含GPL-3.0许可证及源码；钉钉插件采用DingTalk-Real-AI/dsh-dingtalk 0.10.2。发行包不含个人钉钉凭据或聊天。R7使用中的data目录结构不同，不应直接覆盖R8。迁移前备份，并分别迁移模型配置和钉钉账号设置。\n',encoding='utf8')
def package(app,linux=False):
 dest=ROOT/'dist'/(app.name+('.tar.gz' if linux else '.zip'))
 if linux:
  links=json.loads((app/'manifests/archive-links.json').read_text())
  with tarfile.open(dest,'w:gz',compresslevel=3) as archive:
   for p,r in files(app):
    info=archive.gettarinfo(str(p),arcname=app.name+'/'+r);info.uid=info.gid=0;info.uname=info.gname='';info.mode=0o644
    with p.open('rb') as stream:
     magic=stream.read(4);stream.seek(0)
     if magic==b'\x7fELF' or magic[:2]==b'#!' or r.endswith('.sh'):info.mode=0o755
     archive.addfile(info,stream)
   for link in links:
    r=link['path'];assert not r.startswith('/') and '..' not in Path(r).parts
    resolved=posixpath.normpath(posixpath.join(posixpath.dirname(r),link['target']));assert not resolved.startswith('../') and not link['target'].startswith('/')
    info=tarfile.TarInfo(app.name+'/'+r);info.type=tarfile.LNKTYPE if link.get('hardlink') else tarfile.SYMTYPE;info.linkname=app.name+'/'+link['target'] if link.get('hardlink') else link['target'];info.mode=0o755;archive.addfile(info)
 else:
  with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as archive:
   for p,r in files(app):archive.write(p,app.name+'/'+r)
 digest=hashlib.sha256(dest.read_bytes()).hexdigest();(dest.parent/(dest.name+'.sha256')).write_text(digest+'  '+dest.name+'\n',encoding='utf8');print('Packaged',dest.name,dest.stat().st_size,flush=True)
if __name__=='__main__':
 import sys
 if 'sync' in sys.argv:sync()
 if 'win' in sys.argv:package(WIN)
 if 'linux' in sys.argv:package(LIN,True)
 if 'win7' in sys.argv:package(ROOT/'builds/Neiwang-Xiaozhi-Win7-Standalone-Compat-R8')
