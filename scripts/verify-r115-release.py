"""Verify the two archives reconstruct an APP and retain the reviewed core."""
from pathlib import Path
import argparse,tarfile,zipfile,hashlib,json,struct,importlib.util,re,sys,base64,os
spec=importlib.util.spec_from_file_location('release_builder',Path(__file__).with_name('build-r115-release.py'));builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder);private=builder.private
def members(path):
 if path.suffix=='.zip':
  with zipfile.ZipFile(path) as z:
   for n in z.namelist():
    if not n.endswith('/'):yield n,z.read(n),None
 else:
  with tarfile.open(path,'r:gz') as t:
   for m in t:
    if m.isfile():yield m.name,t.extractfile(m).read(),None
    elif m.issym() or m.islnk():yield m.name,None,m.linkname

def credential_values(source):
 source=Path(source);config=source/'data/config' if (source/'data/config/model.enc').exists() else source/'config/defaults'
 key=(config/'.local-key').read_bytes()
 sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
 from local_aead import AESGCM
 values=[key.hex().encode()]
 for name in ['model.enc','dify.enc']:
  e=json.loads((config/name).read_text(encoding='utf8'));b=base64.b64decode(e['payload']);v=json.loads(AESGCM(key).decrypt(b[:12],b[12:],e['format'].encode()));values.extend([v['api_key'].encode(),v['base_url'].encode()])
 return values
def verify(paths,edition,secrets=(),private_source=None):
 files={};links={};root=None;assets=[];seed={}
 for path in paths:
  path=Path(path);assert path.stat().st_size<500_000_000
  h=hashlib.sha256(path.read_bytes()).hexdigest();assets.append({'name':path.name,'bytes':path.stat().st_size,'sha256':h})
  for name,data,link in members(path):
   base,_,rel=name.partition('/');assert root in [None,base];root=base
   assert rel not in files and rel not in links,rel
   assert not rel.startswith('data/') and '..' not in Path(rel).parts
   if data is None:links[rel]=link;continue
   files[rel]={'sha256':hashlib.sha256(data).hexdigest(),'size':len(data)}
   if rel in ['config/defaults/.local-key','config/defaults/model.enc','config/defaults/dify.enc']:seed[rel.rsplit('/',1)[-1]]=data
   if rel.endswith('.sh'):assert b'\r\n' not in data and not data.startswith(b'\xef\xbb\xbf'),rel
   if rel=='launcher/bootstrap.cjs':assert b"require('./plugin-profile.cjs').assertReady(root)" in data and b"require('./plugin-profile.cjs')(root,currentProfile,deployment)" in data
   if rel.endswith('@neiwang/dws-aitable/index.mjs'):assert '写入已禁用'.encode() not in data
   if rel.endswith('@neiwang/dws-aitable/contracts.json'):assert len(json.loads(data))==27
   if edition=='Public':assert not private(rel.removeprefix('plugin-pack/payload/')),rel
   if edition=='Public' and not rel.startswith(('core/','runtime/','launcher/electron/')):assert not any(s in data for s in secrets),'Private credential in '+rel
   if rel in ['config/app.json','plugin-pack/pack.json','manifests/core-sha256.json','manifests/release.json','core/0.2.1-rc.3/node_modules/@deepseek-ai/dsh/package.json']:files[rel]['json']=json.loads(data)
   if rel.endswith('/canvas-linux-arm64-gnu/skia.linux-arm64-gnu.node'):assert data[:4]==b'\x7fELF' and struct.unpack_from('<H',data,18)[0]==183
   if rel.endswith('/canvas-win32-x64-msvc/skia.win32-x64-msvc.node'):
    assert data[:2]==b'MZ';offset=struct.unpack_from('<I',data,0x3c)[0];assert data[offset:offset+4]==b'PE\0\0' and struct.unpack_from('<H',data,offset+4)[0]==0x8664
 app=files['config/app.json']['json'];pack=files['plugin-pack/pack.json']['json'];assert app['version']==pack['release']=='R11.6';assert app['platform']==pack['platform'];assert app['coreVersion']=='0.2.1-rc.3'
 for row in pack['files']:assert files['plugin-pack/payload/'+row['path']]['sha256']==row['sha256'],row['path']
 for rel,h in files['manifests/core-sha256.json']['json'].items():assert files['core/0.2.1-rc.3/'+rel]['sha256']==h,rel
 assert all(n in pack['bundles'] for n in ['@neiwang/browser-automation','@neiwang/skill-incubator','dsh-better-sidebar','@anionex/dsh-turn-rewind','@deepseek-ai/neiwang-business','@deepseek-ai/neiwang-tool-catalog','@neiwang/python-tools'])
 assert 'dsh-attachment-formats' not in pack['bundles']
 assert '@deepseek-ai/dsh-experimental-schedule-bundle' not in app['bundles']
 assert files['core/0.2.1-rc.3/node_modules/@deepseek-ai/dsh/package.json']['json']['version']=='0.2.1-rc.3'
 if edition=='Internal':assert all('config/defaults/'+n in files for n in ['model.enc','dify.enc','.local-key']);assert 'offline-api-tool/内网接口文档.html' in files
 if edition=='Internal' and private_source:
  source=Path(private_source);config=source/'data/config' if (source/'data/config/model.enc').exists() else source/'config/defaults'
  sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'));from local_aead import AESGCM
  def decode(raw,key):
   e=json.loads(raw);b=base64.b64decode(e['payload']);return json.loads(AESGCM(key).decrypt(b[:12],b[12:],e['format'].encode()))
  for name in ['model.enc','dify.enc']:assert decode(seed[name],seed['.local-key'])==decode((config/name).read_bytes(),(config/'.local-key').read_bytes())
  api=source/'extensions/apis' if (source/'extensions/apis').exists() else source/'plugin-pack/payload/extensions/apis'
  for src,prefix in [(source/'offline-api-tool','offline-api-tool/'),(api,'plugin-pack/payload/extensions/apis/')]:
   expected={prefix+p.relative_to(src).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in src.rglob('*') if p.is_file() and p.suffix!='.pyc' and not any(n in p.relative_to(src).parts for n in ['__pycache__','.git','.cache'])}
   assert expected and {r:v['sha256'] for r,v in files.items() if r.startswith(prefix)}==expected
 return {'status':'PASS','edition':edition,'platform':app['platform'],'version':'R11.6','files':len(files),'links':len(links),'splitMembersDisjoint':True,'pluginHashesValid':True,'coreHashesUnchanged':True,'noLiveUserData':True,'currentPrivateCredentialsCompared':bool(secrets or private_source),'internalDocumentsCompared':bool(edition=='Internal' and private_source),'assets':assets}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--edition',choices=['Public','Internal'],required=True);p.add_argument('--report',required=True);p.add_argument('--private-source');p.add_argument('--node');p.add_argument('archives',nargs=2);a=p.parse_args()
 if a.node:os.environ['NEIWANG_AEAD_NODE']=a.node
 r=verify(a.archives,a.edition,credential_values(a.private_source) if a.private_source and a.edition=='Public' else (),a.private_source if a.edition=='Internal' else None);Path(a.report).write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(r,ensure_ascii=False))
