"""Compose R11.4 from reviewed platform baselines; never modify the old APP.

Private inputs are explicit CLI arguments, never source-controlled materials.
Public and internal directories are physically separate. No runtime downloads.
"""
from pathlib import Path
import argparse,tarfile,zipfile,json,hashlib,shutil,os,io,subprocess,re,posixpath
ROOT=Path(__file__).resolve().parents[1]
VERSION='R11.4'
EXTRA=['@neiwang/skill-incubator','dsh-attachment-formats','@neiwang/browser-automation']
SCHEDULE='@deepseek-ai/dsh-experimental-schedule-bundle'
def dump(v):return json.dumps(v,ensure_ascii=False,indent=2).encode('utf8')
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def put(root,rel,data):
 p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
def private(rel):
 if rel in ['private-docs/README.md','private-docs/内网接口文档.template.html']:return False
 return rel.startswith(('data/','config/defaults/','offline-api-tool/','private-docs/','晓光agent/','extensions/apis/','extensions/.plugin-manager/')) or rel.endswith(('.enc','.dpapi')) or '接口文档' in rel or Path(rel).name in ['known_hosts','id_rsa']
def obsolete(rel):return bool(re.search(r'R(?:8|9|10|11\.1|11\.2)[-_更新安装维护]',Path(rel).name)) or rel in ['validation.json','新版验证结果.json','config/feature-pack.json']
def regulars(root):
 def linked(p):return p.is_symlink() or bool(getattr(p.lstat(),'st_file_attributes',0)&0x400)
 for base,dirs,names in os.walk(root,followlinks=False):
  base=Path(base);dirs[:]=[n for n in dirs if n not in ['__pycache__','.git','.cache'] and not linked(base/n)]
  for n in names:
   p=base/n
   if not linked(p) and not n.endswith('.pyc'):yield p,p.relative_to(root).as_posix()
def extract_baseline(archive,dest):
 links=[]
 with tarfile.open(archive,'r:gz') as src:
  for m in src:
   rel=m.name.partition('/')[2]
   if not rel:continue
   if rel.startswith('/') or '..' in Path(rel).parts:raise ValueError('Unsafe baseline')
   logical=rel.removeprefix('plugin-pack/payload/')
   if private(logical) or obsolete(rel):continue
   if m.isfile():put(dest,rel,src.extractfile(m).read())
   elif m.issym() or m.islnk():
    target=m.linkname.partition('/')[2] if m.islnk() else m.linkname
    links.append({'path':rel,'target':target,'hardlink':m.islnk()})
 return links
def copy_windows(source,dest):
 pack=json.loads((source/'plugin-pack/pack.json').read_text(encoding='utf8'));installed={f['path'] for f in pack['files']}
 for p,rel in regulars(source):
  logical=rel.removeprefix('plugin-pack/payload/')
  if private(logical) or obsolete(rel) or rel in installed or rel.startswith('workspace/') and rel!='workspace/AGENTS.md':continue
  put(dest,rel,p.read_bytes())
 return []
def plugin_files(name,platform):
 folder=ROOT/'extensions'/name
 for p,rel in regulars(folder):
  if p.suffix=='.map':continue
  if any(n in rel.split('/') for n in ['.bin','scripts','.cache','.git']):continue
  if '/@napi-rs/canvas-' in '/'+rel:
   wanted='canvas-linux-arm64-gnu' if platform=='Kylin-ARM64' else 'canvas-win32-x64-msvc'
   if wanted not in rel:continue
  if 'node_modules/' in rel and any(s in rel for s in ['node_modules/@img/','node_modules/sharp/','darwin-','linux-x64','linux-arm64-musl','android-']):continue
  yield 'extensions/node_modules/'+name+'/'+rel,p.read_bytes()
def latest_integrations(app,manifest):
 contracts=ROOT/'extensions/@neiwang/dws-aitable/contracts.json'
 if not contracts.is_file() or len(json.loads(contracts.read_text(encoding='utf8')))!=27:raise ValueError('Generate the 27-command official DWS contracts before packaging')
 for name in ['@neiwang/dws-aitable','@deepseek-ai/neiwang-dingtalk-ui']:
  for rel,data in plugin_files(name,manifest['platform']):put(app/'plugin-pack/payload',rel,data)
 for rel in ['tools/dws-login.cjs','tools/configure-official-dingtalk.mjs']:
  targets=[p for p in [app/rel,app/'plugin-pack/payload'/rel] if p.exists()]
  if not targets:targets=[app/'plugin-pack/payload'/rel]
  for target in targets:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/rel).read_bytes())
 p=app/'launcher/bootstrap.cjs';text=p.read_text(encoding='utf8')
 guard=" require('./plugin-profile.cjs').assertReady(root);";hook=" require('./plugin-profile.cjs')(root,currentProfile,deployment);"
 if guard not in text:text=text.replace('function prepare(){','function prepare(){\n'+guard)
 if hook not in text:
  anchor=' fs.writeFileSync(manifest,JSON.stringify(currentProfile,null,2));'
  if text.count(anchor)!=1:raise ValueError('Unknown profile composition anchor')
  text=text.replace(anchor,hook+'\n'+anchor)
 p.write_text(text,encoding='utf8',newline='\n')
def compose(app,platform,public_model,public_boot):
 linux=platform=='Kylin-ARM64';pack=app/'plugin-pack';manifest=json.loads((pack/'pack.json').read_text(encoding='utf8'))
 manifest.update(release=VERSION,platform=platform,os='linux' if linux else 'win32',arch='arm64' if linux else 'x64')
 manifest['bundles']=list(dict.fromkeys(manifest['bundles']+EXTRA))
 # Remove inherited private entries before rebuilding the payload inventory.
 manifest['files']=[r for r in manifest['files'] if (pack/'payload'/r['path']).is_file() and not private(r['path'])]
 for name in EXTRA:
  for rel,data in plugin_files(name,platform):put(pack/'payload',rel,data)
 for rel in ['tools/offline-plugin-manager.cjs','launcher/plugin-profile.cjs','tools/migrate-settings.cjs','tools/setup_rag.py']:
  put(app,rel,(ROOT/rel).read_bytes())
 put(app,'管理插件.sh',(ROOT/'tools/manage-plugins.sh').read_bytes())
 put(app,'管理插件.cmd',b'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node\\node.exe" "tools\\offline-plugin-manager.cjs" %*\r\n')
 for p,rel in regulars(ROOT/'launcher/shell'):
  if rel.startswith(('assets/','electron/')):continue
  put(app,'launcher/shell/'+rel,p.read_bytes())
 for n in ['client.js','package.json']:put(app,'extensions/node_modules/@neiwang/brand/'+n,(ROOT/'extensions/@neiwang/brand'/n).read_bytes())
 boot=public_boot.decode('utf8')
 old=" for(const name of ['model.enc','dify.enc']){const dest=path.join(data,'config',name),source=path.join(root,'config/defaults',name);if(!fs.existsSync(dest)&&fs.existsSync(source))fs.copyFileSync(source,dest);}"
 replacement=" const defaults=path.join(root,'config/defaults');if(fs.existsSync(defaults))for(const name of fs.readdirSync(defaults)){const dest=path.join(data,'config',name),source=path.join(defaults,name);if(fs.statSync(source).isFile()&&!fs.existsSync(dest))fs.copyFileSync(source,dest);}"
 if old not in boot:raise ValueError('Unknown reviewed public launcher')
 boot=boot.replace(old,replacement)
 put(app,'launcher/bootstrap.cjs',boot.encode('utf8'));put(app,'tools/model_config.py',public_model)
 for rel in ['tools/offline-plugin-manager.cjs','tools/model_config.py']:
  if (pack/'payload'/rel).exists():put(pack/'payload',rel,(app/rel).read_bytes())
 # Existing business API consumes browser cookies through a narrowly scoped local bridge.
 adapter=app/'tools/browser_session.py'
 if not adapter.exists() and (pack/'payload/tools/browser_session.py').exists():adapter=pack/'payload/tools/browser_session.py'
 text=adapter.read_text(encoding='utf8');anchor='def cookie_header(settings, url, unprotect=None):'
 hook=subprocess.check_output([ARGS.node,'-e',"process.stdout.write(require(process.argv[1]).HOOK)",str(ROOT/'tools/install-browser-patch.cjs')]).decode('utf8')
 if 'NEIWANG_PLAYWRIGHT_SESSION_V1' not in text:
  if text.count(anchor)!=1:raise ValueError('Unknown session adapter')
  text=text.replace(anchor,anchor+'\n'+hook)
 adapter.write_text(text,encoding='utf8',newline='\n')
 if adapter==app/'tools/browser_session.py' and (pack/'payload/tools/browser_session.py').exists():put(pack/'payload','tools/browser_session.py',adapter.read_bytes())
 cfg=json.loads((app/'config/app.json').read_text(encoding='utf8'));cfg.update(version=VERSION,platform=platform,edition='core',businessBrowser=False)
 cfg['bundles']=[n for n in cfg['bundles'] if n not in manifest['bundles']]
 cfg['bundles']=list(dict.fromkeys(cfg['bundles']+[SCHEDULE]));put(app,'config/app.json',dump(cfg))
 put(pack,'install.cjs',(ROOT/'scripts/install-feature-pack.cjs').read_bytes())
 for name in ['R11_4_INSTALL.md','OFFLINE_PLUGIN_MANAGER.md','BROWSER_API_PATCH.md']:
  put(app,'docs/'+name,(ROOT/'docs'/name).read_bytes())
 for name in ['README.md','内网接口文档.template.html']:put(app,'private-docs/'+name,(ROOT/'private-docs'/name).read_bytes())
 if not linux:
  put(app,'配置RAG.cmd','@echo off\r\ncd /d "%~dp0"\r\n"runtime\\python\\python.exe" "tools\\setup_rag.py"\r\npause\r\n'.encode('utf8'))
 instructions=(ROOT/'docs/R11_4_INSTALL.md').read_bytes()
 for rel in ['README-先看这里.txt','安装说明.txt','新版安装说明.txt','维护与升级说明.txt','plugin-pack/安装说明.txt']:put(app,rel,instructions)
 put(app,'workspace/AGENTS.md',(app/'workspace/AGENTS.md').read_bytes()+b'\nR11.4: use run_code and tool_catalog to discover tools on demand. Browser credentials stay local.\n')
 # No DWS or DingTalk account is activated during composition or tests.
 latest_integrations(app,manifest)
 return manifest
def refresh_manifest(app,manifest):
 rows=[]
 for p,rel in regulars(app/'plugin-pack/payload'):
  rows.append({'path':rel,'sha256':sha(p),'mode':0o755 if p.suffix=='.sh' or p.read_bytes()[:4]==b'\x7fELF' else 0o644})
 manifest['files']=rows;put(app,'plugin-pack/pack.json',dump(manifest))
 release={'version':VERSION,'platform':manifest['platform'],'coreVersion':'0.2.0-rc.2','features':['schedule','skill-incubator','offline-pdf-ocr','playwright','compact-tool-prompt','dingtalk','dws-aitable','offline-plugin-manager'],'configurationMigration':'tools/migrate-settings.cjs','coreModified':False}
 release['shippedUserFiles']={rel:sha(p) for p,rel in regulars(app) if rel.startswith(('offline-api-tool/','private-docs/'))}
 defaults=app/'config/defaults'
 if defaults.exists():
  for p in defaults.iterdir():
   if p.is_file() and p.name!='.local-key':release['shippedUserFiles']['data/config/'+p.name]=sha(p)
 put(app,'manifests/release.json',dump(release))
 for p,rel in regulars(app):
  if p.suffix=='.sh':p.write_bytes(p.read_bytes().removeprefix(b'\xef\xbb\xbf').replace(b'\r\n',b'\n'))
 # Normalize before hashing; payload shell checksums must match distributed bytes.
 for row in manifest['files']:row['sha256']=sha(app/'plugin-pack/payload'/row['path'])
 put(app,'plugin-pack/pack.json',dump(manifest))
def sanitize_public(app):
 for p,rel in regulars(app):
  if rel.startswith(('core/','runtime/','launcher/electron/')) or p.suffix not in ['.py','.js','.mjs','.cjs','.json','.yml','.yaml','.txt','.md','.html']:continue
  try:text=p.read_text(encoding='utf-8-sig')
  except UnicodeDecodeError:continue
  text=re.sub(r'(?<![\w.])(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)','127.0.0.1',text)
  # Replace single-label organization service URLs without embedding their actual hostname.
  text=re.sub(r'https?://(?!localhost(?=[:/\s\"\']|$))[A-Za-z][A-Za-z0-9-]*(?=[:/\s\"\']|$)(?::[0-9]+)?(?:/[^\s\"\'<>]*)?', 'https://service.example.invalid/v1', text)
  p.write_text(text,encoding='utf8',newline='\n')
def package(app,links,out,edition,core_paths=None):
 platform=json.loads((app/'config/app.json').read_text(encoding='utf8'))['platform'];linux=platform=='Kylin-ARM64'
 out.mkdir(parents=True,exist_ok=True);suffix='.tar.gz' if linux else '.zip';base=app.name+'-'+edition
 destinations={k:out/(base+'-'+k+suffix) for k in ['Core','Plugins']};counts={k:0 for k in destinations}
 archives={k:tarfile.open(p,'w:gz',compresslevel=3) if linux else zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) for k,p in destinations.items()}
 try:
  for p,rel in regulars(app):
   if rel.startswith('data/'):continue
   if core_paths is not None and not rel.startswith('plugin-pack/') and rel not in core_paths:continue
   kind='Plugins' if rel.startswith('plugin-pack/') else 'Core';a=archives[kind]
   if linux:
    data=p.read_bytes();m=tarfile.TarInfo(app.name+'/'+rel);m.mode=0o600 if rel.startswith('config/defaults/') else (0o755 if data[:4]==b'\x7fELF' or data[:2]==b'#!' or rel.endswith('.sh') else 0o644);m.size=len(data);a.addfile(m,io.BytesIO(data))
   else:a.write(p,app.name+'/'+rel)
   counts[kind]+=1
  if linux:
   for link in links:
    rel=link['path'];kind='Plugins' if rel.startswith('plugin-pack/') else 'Core'
    if private(rel) or obsolete(rel):continue
    resolved=link['target'] if link['hardlink'] else posixpath.normpath(posixpath.join(posixpath.dirname(rel),link['target']))
    if resolved.startswith('../') or resolved.startswith('/'):raise ValueError('Unsafe archive link')
    m=tarfile.TarInfo(app.name+'/'+rel);m.type=tarfile.LNKTYPE if link['hardlink'] else tarfile.SYMTYPE;m.linkname=app.name+'/'+link['target'] if link['hardlink'] else link['target'];m.mode=0o755;archives[kind].addfile(m);counts[kind]+=1
 finally:
  for a in archives.values():a.close()
 report=[]
 for kind,p in destinations.items():
  if p.stat().st_size>=500_000_000:raise ValueError('Asset exceeds DingTalk 500MB limit: '+p.name)
  h=sha(p);Path(str(p)+'.sha256').write_text(h+'  '+p.name+'\n',encoding='ascii');report.append({'name':p.name,'kind':kind,'bytes':p.stat().st_size,'sha256':h,'members':counts[kind]})
 put(out,'release-assets.json',dump(report));print(json.dumps({'edition':edition,'platform':platform,'assets':report}),flush=True)
 return report
def seed_internal(source,app):
 defaults=app/'config/defaults';defaults.mkdir(parents=True)
 code="const fs=require('fs'),path=require('path'),crypto=require('crypto');const {keyFor,convert}=require(process.argv[1]);const s=process.argv[2],d=process.argv[3],old=keyFor(s),key=crypto.randomBytes(32);fs.writeFileSync(path.join(d,'.local-key'),key);for(const n of ['model.enc','dify.enc']){const f=path.join(s,'data/config',n);if(!fs.existsSync(f))throw Error('Missing requested organization configuration');fs.writeFileSync(path.join(d,n),convert(fs.readFileSync(f),old,key));}console.log('PASS: model and RAG seeds re-encrypted without exposing credentials');"
 subprocess.run([ARGS.node,'-e',code,str(ROOT/'tools/migrate-settings.cjs'),str(source),str(defaults)],check=True)
 for p in (source/'data/config').glob('*'):
  if p.is_file() and p.name not in ['.local-key','model.enc','dify.enc'] and not p.name.endswith(('.tmp','.new')):shutil.copyfile(p,defaults/p.name)
def main(a):
 global ARGS;ARGS=a
 work=Path(a.work).resolve();dist=Path(a.dist).resolve()
 if work.exists() or dist.exists():raise ValueError('Use fresh release directories; old APPs must remain untouched')
 work.mkdir(parents=True);dist.mkdir(parents=True)
 linux=work/'Public'/('Neiwang-Xiaozhi-Kylin-ARM64-'+VERSION);linux.mkdir(parents=True)
 links=extract_baseline(a.linux_baseline,linux)
 model=(linux/'tools/model_config.py').read_bytes();boot=(linux/'launcher/bootstrap.cjs').read_bytes()
 if b'KEY = bytes.fromhex' in model:raise ValueError('Expected reviewed public baseline with installation-local encryption')
 lm=compose(linux,'Kylin-ARM64',model,boot);sanitize_public(linux);refresh_manifest(linux,lm)
 public_assets=package(linux,links,dist/'GitHub','Public')
 windows=work/'Public'/('Neiwang-Xiaozhi-Win10-x64-'+VERSION);windows.mkdir(parents=True)
 copy_windows(Path(a.windows_baseline),windows);wm=compose(windows,'Win10-x64',model,boot);sanitize_public(windows);refresh_manifest(windows,wm)
 public_assets+=package(windows,[],dist/'GitHub','Public');put(dist/'GitHub','release-assets.json',dump(public_assets))
 internal=work/'Internal'/linux.name;shutil.copytree(linux,internal);seed_internal(Path(a.private_source),internal)
 docs=Path(a.private_docs);shutil.copytree(docs,internal/'offline-api-tool')
 # Internal API sources belong to the plugin payload, never the public artifact.
 source=Path(a.private_sources)/'extensions/apis';shutil.copytree(source,internal/'plugin-pack/payload/extensions/apis')
 im=json.loads((internal/'plugin-pack/pack.json').read_text(encoding='utf8'));refresh_manifest(internal,im)
 internal_assets=package(internal,links,dist/'Send-to-Intranet','Internal')
 put(dist/'Send-to-Intranet','安装与合并说明.md',(ROOT/'docs/INTERNAL_INSTALL.md').read_bytes())
 put(dist/'Send-to-Intranet','合并安装R11.4.sh',(ROOT/'scripts/install-internal-r114.sh').read_bytes())
 put(dist/'Send-to-Intranet','R11_4_HANDOVER.md',(ROOT/'docs/R11_4_HANDOVER.md').read_bytes())
 put(dist/'Send-to-Intranet','INTERNAL_INSTALL.md',(ROOT/'docs/INTERNAL_INSTALL.md').read_bytes())
 put(work,'composition.json',dump({'version':VERSION,'publicAssets':public_assets,'internalAssets':internal_assets,'oldDirectoriesModified':False}))
 print(json.dumps({'status':'BUILT','version':VERSION,'work':str(work),'dist':str(dist)}),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser()
 for name in ['linux-baseline','windows-baseline','private-source','private-docs','private-sources','work','dist','node']:p.add_argument('--'+name,required=True)
 main(p.parse_args())
