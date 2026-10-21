from pathlib import Path
import sys,os,json,shutil,hashlib,zipfile,tarfile,posixpath
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from finalize_r8 import files
OPTIONAL=['@deepseek-ai/neiwang-business','@dingtalk-real-ai/dsh-dingtalk','@deepseek-ai/neiwang-dingtalk-ui','@neiwang/dws-aitable']
PY_BASE=('cryptography','cffi','pycparser','_cffi_backend')
def is_feature(r):
 if r.startswith(('extensions/dws/','extensions/office-fonts/')):return True
 if r.startswith('extensions/python/'):
  name=r.split('/')[2]
  return not any(name==x or name.startswith(x+'-') or name.startswith(x+'.') for x in PY_BASE)
 if any(r.startswith('extensions/node_modules/'+p+'/') for p in OPTIONAL):return True
 return r.split('/')[0] in ['登录AI表格.cmd','钉钉诊断.cmd','配置钉钉.cmd','生成钉钉绑定口令.cmd','Python打包.cmd','登录AI表格.sh','钉钉诊断.sh','配置钉钉.sh','生成钉钉绑定口令.sh','Python打包.sh']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def mode(p,r):
 with p.open('rb') as f:m=f.read(4)
 return 0o755 if m==b'\x7fELF' or m[:2]==b'#!' or r.endswith('.sh') else 0o644
def build(platform):
 linux=platform=='Kylin-ARM64'; old=ROOT/'builds'/('Neiwang-Xiaozhi-'+platform+'-R9'); name='Neiwang-Xiaozhi-'+platform+'-R10'; app=ROOT/'builds'/name
 if app.exists():raise RuntimeError('Output already exists: '+str(app))
 app.mkdir();pack=app/'plugin-pack';payload=pack/'payload';core_files=[];feature_files=[]
 for p,r in files(old):
  # Release-only inputs: never copy data, sessions, personal workspace, or runtime junctions.
  if r.startswith('data/'):raise RuntimeError('Private data in release file list')
  dst=(payload if is_feature(r) else app)/r;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dst)
  (feature_files if is_feature(r) else core_files).append(r)
 conf=app/'config/app.json';config=json.loads(conf.read_text(encoding='utf8'));config.update(version='R10',platform=platform,edition='core');config['bundles']=[b for b in config['bundles'] if b not in OPTIONAL];conf.write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
 # Refresh the generated profile's bundle list after installation, preserving user extras.
 boot=app/'launcher/bootstrap.cjs';text=boot.read_text(encoding='utf8')
 text=text.replace("  fs.writeFileSync(manifest,JSON.stringify({name:'neiwang-web-profile',private:true,dependencies,dsh:{profile:{bundles}}},null,2));", "  fs.writeFileSync(manifest,JSON.stringify({name:'neiwang-web-profile',private:true,dependencies,dsh:{profile:{bundles}}},null,2));")
 needle=" const userPatch=path.join(profile,'cordis.patch.yml');"
 insertion=""" const currentProfile=read(manifest);
 const expectedBundles=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app',...deployment.bundles];
 currentProfile.dependencies=currentProfile.dependencies||{};
 for(const name of deployment.bundles)currentProfile.dependencies[name]=read(path.join(extensions,name,'package.json')).version;
 currentProfile.dsh=currentProfile.dsh||{};currentProfile.dsh.profile=currentProfile.dsh.profile||{};
 currentProfile.dsh.profile.bundles=[...new Set([...expectedBundles,...(currentProfile.dsh.profile.bundles||[])])];
 fs.writeFileSync(manifest,JSON.stringify(currentProfile,null,2));
"""
 assert needle in text;text=text.replace(needle,insertion+needle);boot.write_text(text,encoding='utf8')
 if linux:
  text=boot.read_text(encoding='utf8').replace('env.PATH=[','env.PATH=[path.join(root,\'runtime/sandbox\'),');boot.write_text(text,encoding='utf8')
  sandbox=ROOT/'downloads/sandbox-r10'
  if not (sandbox/'bwrap').exists():raise RuntimeError('Restore verified ARM64 bubblewrap binary and license/source first')
  shutil.copytree(sandbox,app/'runtime/sandbox')
 (app/'workspace/AGENTS.md').write_text((ROOT/'scripts/r10-workspace-instructions.txt').read_text(encoding='utf8'),encoding='utf8')
 from adapt_modular_ui import adapt
 adapt(app,linux)
 # Python model settings remain usable without the optional document dependencies.
 # Shell's RAG policy is self-contained; no optional bundle is imported at startup.
 # Deployment patches must not point at absent plugins in the core edition.
 deploy=app/'extensions/node_modules/@neiwang/deployment/cordis.patch.yml'
 patch=deploy.read_text(encoding='utf8');patch=patch.split('- id: dingtalk-channel')[0];deploy.write_text(patch,encoding='utf8')
 # Optional plugin defaults are provided by their own plugin-pack bundle.
 opt=payload/'extensions/node_modules/@neiwang/feature-defaults';opt.mkdir(parents=True)
 (opt/'package.json').write_text(json.dumps({'name':'@neiwang/feature-defaults','version':'1.0.0','type':'module','dsh':{'bundle':{'patch':'./cordis.patch.yml'}}}),encoding='utf8')
 (opt/'cordis.patch.yml').write_text('''- id: dingtalk-channel
  config: !!js 'JSON.parse(process.env.NEIWANG_DEPLOYMENT_CONFIG).find(row=>row.id==="dingtalk-channel").config'
- id: office-to-pdf
  config: !!js 'JSON.parse(process.env.NEIWANG_DEPLOYMENT_CONFIG).find(row=>row.id==="office-to-pdf").config'
''',encoding='utf8')
 feature_files.extend(['extensions/node_modules/@neiwang/feature-defaults/package.json','extensions/node_modules/@neiwang/feature-defaults/cordis.patch.yml'])
 links=json.loads((old/'manifests/archive-links.json').read_text()) if linux else []
 core_links=[v for v in links if not is_feature(v['path'])];feature_links=[v for v in links if is_feature(v['path'])]
 # Installer handles relative symlinks itself; turn hardlinks into equivalent relative symlinks.
 for link in feature_links:
  if link.get('hardlink'):link['target']=posixpath.relpath(link['target'],posixpath.dirname(link['path']));link.pop('hardlink',None)
 (pack/'pack.json').write_text(json.dumps({'release':'R10','platform':platform,'os':'linux' if linux else 'win32','arch':'arm64' if linux else 'x64','bundles':OPTIONAL+['@neiwang/feature-defaults'],'files':[{'path':r,'sha256':sha(payload/r),'mode':mode(payload/r,r)} for r in feature_files],'links':feature_links},ensure_ascii=False,indent=2),encoding='utf8')
 shutil.copyfile(ROOT/'scripts/install-feature-pack.cjs',pack/'install.cjs')
 (pack/'安装插件.cmd').write_bytes('@echo off\r\ncd /d "%~dp0.."\r\n"runtime\\node\\node.exe" "plugin-pack\\install.cjs"\r\nif errorlevel 1 (echo Installation failed.) else (echo Installation completed.)\r\npause\r\n'.encode('utf8'))
 (pack/'安装插件.sh').write_text('#!/bin/sh\nset -eu\ncd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"\nexec ./runtime/node/bin/node ./plugin-pack/install.cjs\n',encoding='utf8')
 for base in [app,pack]:
  shutil.copyfile(ROOT/'docs/R10安装说明.txt',base/'安装说明.txt')
  shutil.copyfile(ROOT/'docs/R10更新说明.txt',base/'R10更新说明.txt')
 (app/'R10-安装说明.txt').write_text('内网小智 R10 模块化版\n\n1. 解压 Core 核心包，可直接启动内网小智。核心含完整官方 DSH 内核、桌面界面、模型对话、文件/命令工具、代码变更查看。模型推理仍使用你配置的模型接口。\n2. 如需扩展，再将同平台 Plugins 插件包解压到核心包的同一级目录，让两个同名 Neiwang-Xiaozhi 目录合并。此时核心目录中应出现 plugin-pack 文件夹。不要放入 data 或 workspace。\n3. 完全退出 APP。Windows 双击 plugin-pack/安装插件.cmd；麒麟在终端运行 sh plugin-pack/安装插件.sh。成功后重新启动 APP。\n4. 插件补齐钉钉官方连接器及绑定设置、DWS AI表格、Python/PyInstaller文档处理、Office/PDF/OCR及内网业务工具。平台必须一致，不联网安装依赖。\n5. 仅解压插件不会自动启用；安装器先校验完整性和版本，再注册插件。重复安装同一包可安全重试；冲突文件会拒绝覆盖。config、data、workspace 不会被插件包覆盖。\n6. 使用与R9分开的新目录；如需迁移用户数据请先备份。不能直接将本插件包装到R9或Win7。保留两个压缩包用于重装。\n',encoding='utf8')
 # Replace obsolete R9 instructions; do not ship claims about bundled optional features in core.
 (app/'README-先看这里.txt').write_text((app/'R10-安装说明.txt').read_text(encoding='utf8'),encoding='utf8')
 manifest=json.loads((app/'manifests/archive-links.json').read_text()) if linux else None
 if linux:(app/'manifests/archive-links.json').write_text(json.dumps(core_links),encoding='utf8')
 out=ROOT/'dist/R10-Modular';out.mkdir(exist_ok=True)
 def archive(kind):
  dest=out/(name+'-'+kind+('.tar.gz' if linux else '.zip'))
  entries=[]
  for p,r in files(app):
   if (r.startswith('plugin-pack/'))!=(kind=='Plugins'):continue
   entries.append((p,r))
  if linux:
   with tarfile.open(dest,'w:gz',compresslevel=6) as tf:
    for p,r in entries:
     info=tf.gettarinfo(str(p),arcname=name+'/'+r);info.uid=info.gid=0;info.uname=info.gname='';info.mode=mode(p,r)
     with p.open('rb') as stream:tf.addfile(info,stream)
    if kind=='Core':
     for link in core_links:
      info=tarfile.TarInfo(name+'/'+link['path']);info.type=tarfile.LNKTYPE if link.get('hardlink') else tarfile.SYMTYPE;info.linkname=name+'/'+link['target'] if link.get('hardlink') else link['target'];info.mode=0o755;tf.addfile(info)
  else:
   with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p,r in entries:z.write(p,name+'/'+r)
  assert dest.stat().st_size<450_000_000,(dest,dest.stat().st_size)
  (out/(dest.name+'.sha256')).write_text(sha(dest)+'  '+dest.name+'\n',encoding='utf8');print(json.dumps({'archive':dest.name,'bytes':dest.stat().st_size}),flush=True)
 for kind in ['Core','Plugins']:archive(kind)
 print('Built '+name,flush=True)
if __name__=='__main__':
 for platform in sys.argv[1:] or ['Win10-x64','Kylin-ARM64']:build(platform)
