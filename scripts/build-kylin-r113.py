"""Compose a reviewed R11.2 offline baseline with R11.3 extensions.

Requires the authorized baseline and prepared plugin dependencies. Public output
removes organization seeds, internal API definitions and uses install-local keys.
Does not execute the target application or modify user data.
"""
from pathlib import Path
import argparse,tarfile,copy,io,json,hashlib,re,os
REPO=Path(__file__).resolve().parents[1]
NAME='Neiwang-Xiaozhi-Kylin-ARM64-R11.3'
NEW=['@neiwang/skill-incubator','dsh-attachment-formats']
SCHEDULE='@deepseek-ai/dsh-experimental-schedule-bundle'
def digest(data):return hashlib.sha256(data).hexdigest()
def dump(v):return json.dumps(v,ensure_ascii=False,indent=2).encode('utf8')
def private_path(rel):
 return rel.startswith(('data/','config/defaults/','offline-api-tool/','晓光agent/','extensions/apis/')) or rel.endswith('.enc') or '接口文档' in rel or 'known_hosts' in rel or 'id_rsa' in rel
def source_files():
 for name in NEW:
  folder=REPO/'extensions'/name
  for p in folder.rglob('*'):
   if not p.is_file() or p.is_symlink():continue
   r=p.relative_to(folder).as_posix()
   if any(x in r.split('/') for x in ['.git','__pycache__','.bin','.cache']):continue
   if r.endswith(('.pyc','.map')) or r.startswith('scripts/'):continue
   if 'node_modules/' in r:
    if any(x in r for x in ['win32','darwin','linux-x64','linux-arm-gnueabi','linux-arm64-musl','linux-riscv','android','linux-ppc','linux-s390','linux-loong','freebsd','linuxmusl','@img/','node_modules/sharp/']):continue
   yield 'extensions/node_modules/'+name+'/'+r,p.read_bytes(),0o644
def local_key_python(data):
 text=data.decode('utf8')
 text=re.sub(r"KEY = bytes.fromhex\('[0-9a-f]{64}'\)","""def local_key():
    target = ROOT/'data/config/.local-key'
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
        try:
            with target.open('xb') as f: f.write(os.urandom(32))
            target.chmod(0o600)
        except FileExistsError: pass
    value=target.read_bytes()
    if len(value)!=32: raise ValueError('invalid local configuration key')
    return value
KEY = local_key()""",text)
 return text.encode('utf8')
def build(args):
 for asset in ['vendor/tessdata/eng.traineddata.gz','vendor/tessdata/chi_sim.traineddata.gz','node_modules/@napi-rs/canvas-linux-arm64-gnu/skia.linux-arm64-gnu.node']:
  if not (REPO/'extensions/dsh-attachment-formats'/asset).is_file():raise ValueError('Missing reviewed ARM64 offline asset: '+asset)
 output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
 additions={r:(d,m) for r,d,m in source_files()}
 for name in ['client.js','package.json']:
  additions['extensions/node_modules/@neiwang/brand/'+name]=((REPO/'extensions/@neiwang/brand'/name).read_bytes(),0o644)
 files={};entries={};manifest=None;oldbase=None;skipped=[];core_hashes={}
 # Track only small mutable files here; stream the unchanged baseline later.
 with tarfile.open(args.baseline,'r:gz') as tf:
  for e in tf:
   if oldbase is None:oldbase=e.name.split('/')[0]
   rel=e.name[len(oldbase):].lstrip('/')
   if e.isfile() and rel in ['config/app.json','plugin-pack/pack.json','manifests/release.json','workspace/AGENTS.md','launcher/bootstrap.cjs','tools/model_config.py','manifests/core-sha256.json']:
    files[rel]=tf.extractfile(e).read()
 assert files['config/app.json'] and files['plugin-pack/pack.json']
 app=json.loads(files['config/app.json']);app.update(version='R11.3');app['bundles']=list(dict.fromkeys(app['bundles']+[SCHEDULE]));files['config/app.json']=dump(app)
 release=json.loads(files['manifests/release.json']);release.update(version='R11.3',scheduleEnabled=True,skillIncubator=True,offlinePDF=True);files['manifests/release.json']=dump(release)
 files['workspace/AGENTS.md']+=('\nR11.3：支持本地技能孵化器、pdf_parse和定时任务。PTC工具经run_code调用，先按tool_catalog发现参数。技能先预览，用户要求保存才写入；格式校验不等于业务效果验收。扫描PDF使用本地OCR，无外网回退；低质量识别必须提示核对原页。定时任务只在Host运行时调度，补投递不保证业务仅执行一次，敏感写入仍需管理员/用户授权。\n').encode('utf8')
 files['tools/setup_rag.py']=(REPO/'tools/setup_rag.py').read_bytes()
 for rel in ['tools/offline-plugin-manager.cjs','launcher/plugin-profile.cjs']:
  files[rel]=(REPO/rel).read_bytes()
 files['管理插件.sh']=(REPO/'tools/manage-plugins.sh').read_bytes()
 boot=files['launcher/bootstrap.cjs'].decode('utf8')
 boot=boot.replace('function prepare(){',"function prepare(){\n require('./plugin-profile.cjs').assertReady(root);")
 boot=boot.replace(' fs.writeFileSync(manifest,JSON.stringify(currentProfile,null,2));'," require('./plugin-profile.cjs')(root,currentProfile,deployment);\n fs.writeFileSync(manifest,JSON.stringify(currentProfile,null,2));")
 files['launcher/bootstrap.cjs']=boot.encode('utf8')
 files['配置RAG.sh']=b'#!/bin/sh\nset -eu\nAPP=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexport PYTHONHOME="$APP/runtime/python"\nexport LD_LIBRARY_PATH="$APP/runtime/python/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"\nexec "$APP/runtime/python/bin/python3.11" "$APP/tools/setup_rag.py"\n'
 manifest=json.loads(files['plugin-pack/pack.json']);manifest['release']='R11.3';manifest['bundles']=list(dict.fromkeys(manifest['bundles']+NEW))
 # Source packages live in payload; brand is also a core file and is replaced in place.
 for rel,(data,mode) in additions.items():
  if rel.startswith('extensions/node_modules/@neiwang/brand/'):
   files[rel]=data
   if any(x['path']==rel for x in manifest['files']):files['plugin-pack/payload/'+rel]=data
  else:files['plugin-pack/payload/'+rel]=data
 for item in manifest['files']:
  key='plugin-pack/payload/'+item['path']
  if key in files:item['sha256']=digest(files[key])
 existing={x['path'] for x in manifest['files']}
 for rel,(data,mode) in additions.items():
  if rel not in existing and not rel.startswith('extensions/node_modules/@neiwang/brand/'):
   manifest['files'].append({'path':rel,'mode':mode,'sha256':digest(data)})
 if args.public:
  files['tools/model_config.py']=local_key_python(files['tools/model_config.py'])
  boot=files['launcher/bootstrap.cjs'].decode('utf8')
  boot=re.sub(r"Buffer.from\('[0-9a-f]{64}',\s*'hex'\)","fs.readFileSync(path.join(root,'data/config/.local-key'))",boot)
  files['launcher/bootstrap.cjs']=boot.encode('utf8')
  manifest['files']=[x for x in manifest['files'] if not private_path(x['path'])]
  # The Python module may also be an optional payload member.
  for item in manifest['files']:
   if item['path']=='tools/model_config.py':
    files['plugin-pack/payload/tools/model_config.py']=files['tools/model_config.py'];item['sha256']=digest(files['tools/model_config.py'])
 guide=('内网小智 R11.3 麒麟 ARM64 · 2026-10-24\n\n'
 '解压到新的可写目录，不覆盖旧版。进入应用根目录执行：\nsh plugin-pack/安装插件.sh\n'
 +('sh 配置模型.sh\n公开版不含组织模型和RAG凭据。需要知识库时另执行 sh 配置RAG.sh。\n' if args.public else '已保留原有内网模型及Dify加密默认配置，新目录首次启动自动初始化。需要重新配置知识库时执行 sh 配置RAG.sh。\n')+
 'sh start.sh\n\n新增：原生定时任务、技能孵化器、离线PDF/中英文OCR；首页为“你说我做，随时待命”。\n'
 '设置→技能孵化器查看用法；对话中可说“将这个流程生成技能，先预览”。确认后保存。\n'
 '将PDF拖入聊天，或让小智解析当前工作区PDF；扫描件使用随包WASM和中英文语言包，不联网补下载，不调用云OCR。\n'
 '定时任务通过任务页或对话创建；APP关闭、电脑关机或睡眠时不能按时运行，重启后按内核规则补投递。投递成功不等于任务成功，不保证业务操作仅执行一次。\n'
 '保留钉钉机器人和AI表格读写插件；使用仍需组织网络与授权，敏感操作权限保持原规则。\n'
 '原生麒麟V10与实际组织服务仍需现场验收；具体已验证项目见validation.json。\n')
 files['安装说明.txt']=guide.encode('utf8');files['新版安装说明.txt']=files['安装说明.txt']
 files['docs/R11_3_HANDOVER.md']=(REPO/'docs/R11_3_HANDOVER.md').read_bytes()
 files['docs/OFFLINE_PLUGIN_MANAGER.md']=(REPO/'docs/OFFLINE_PLUGIN_MANAGER.md').read_bytes()
 validation=REPO/'manifests/r113-validation.json'
 if validation.exists():
  report=json.loads(validation.read_text(encoding='utf8'));report['edition']='public' if args.public else 'organization';report['organizationDefaultsIncluded']=not args.public;files['validation.json']=dump(report)
 provenance={name:json.loads((REPO/'extensions'/name/'upstream.json').read_text(encoding='utf8')) for name in NEW}
 files['manifests/r113-features.json']=dump({'version':'R11.3','core':'0.2.0-rc.2','schedule':SCHEDULE,'offlinePDF':{'engine':'pdfjs','ocr':'tesseract-js','languages':['eng','chi_sim'],'networkFallback':False},'skillIncubator':'@neiwang/skill-incubator','upstream':provenance,'edition':'public' if args.public else 'organization'})
 files['plugin-pack/pack.json']=dump(manifest)
 seen=set();count=0
 with tarfile.open(args.baseline,'r:gz') as src,tarfile.open(output,'w:gz',compresslevel=3) as dst:
  for e in src:
   rel=e.name[len(oldbase):].lstrip('/')
   if rel=='plugin-pack/pack.json':continue
   if args.public and (private_path(rel) or rel.startswith('plugin-pack/payload/') and private_path(rel[len('plugin-pack/payload/'):])):
    skipped.append(rel);continue
   # Old build reports and organization-specific instructions are superseded.
   if rel in ['新版验证结果.json']:continue
   n=copy.copy(e);n.name=NAME+'/'+rel;n.pax_headers={k:v for k,v in e.pax_headers.items() if k not in ['path','linkpath']}
   if n.islnk():n.linkname=n.linkname.replace(oldbase+'/',NAME+'/',1)
   data=src.extractfile(e).read() if e.isfile() else None
   if data is not None:
    if rel in files:data=files[rel]
    elif rel in ['README-先看这里.txt','维护与升级说明.txt','plugin-pack/安装说明.txt']:data=files['安装说明.txt']
    elif args.public and not rel.startswith(('core/','runtime/','launcher/electron/')) and Path(rel).suffix in ['.py','.js','.mjs','.cjs','.json','.yml','.yaml','.txt','.md','.html']:
     try:
      text=data.decode('utf-8-sig')
      text=re.sub(r'(?<![\w.])(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)','127.0.0.1',text).replace('https://aei/v1','https://dify.example.invalid/v1')
      data=text.encode('utf8')
      # Refresh checksums for any sanitized optional payload content.
      if rel.startswith('plugin-pack/payload/'):
       target=rel[len('plugin-pack/payload/'):]
       for item in manifest['files']:
        if item['path']==target:item['sha256']=digest(data)
     except UnicodeDecodeError:pass
    if rel.endswith('.sh'):data=data.removeprefix(b'\xef\xbb\xbf').replace(b'\r\n',b'\n')
    n.size=len(data);dst.addfile(n,io.BytesIO(data))
   else:dst.addfile(n)
   seen.add(rel);count+=1
  for rel,data in files.items():
   if rel in seen or rel=='plugin-pack/pack.json' or args.public and private_path(rel):continue
   n=tarfile.TarInfo(NAME+'/'+rel);n.mode=0o755 if rel.endswith('.sh') else 0o644;n.size=len(data);dst.addfile(n,io.BytesIO(data));count+=1
  data=dump(manifest);n=tarfile.TarInfo(NAME+'/plugin-pack/pack.json');n.mode=0o644;n.size=len(data);dst.addfile(n,io.BytesIO(data));count+=1
 with output.open('rb') as stream:
  h=hashlib.sha256()
  for b in iter(lambda:stream.read(1048576),b''):h.update(b)
 sha=h.hexdigest();Path(str(output)+'.sha256').write_text(sha+'  '+output.name+'\n',encoding='ascii')
 print(json.dumps({'file':str(output),'bytes':output.stat().st_size,'sha256':sha,'members':count,'excludedPrivateFiles':len(skipped)},ensure_ascii=False),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--output',required=True);p.add_argument('--public',action='store_true');build(p.parse_args())
