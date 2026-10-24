"""Verify the two archives reconstruct an APP and retain the reviewed core."""
from pathlib import Path
import argparse,tarfile,zipfile,hashlib,json,struct,importlib.util,re,sys,base64
spec=importlib.util.spec_from_file_location('release_builder',Path(__file__).with_name('build-r114-release.py'));builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder);private=builder.private
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
 source=Path(source);local=source/'data/config/.local-key'
 key=local.read_bytes() if local.exists() else bytes.fromhex(re.search(r"KEY\s*=\s*bytes\.fromhex\(['\"]([a-fA-F0-9]{64})['\"]\)",(source/'tools/model_config.py').read_text(encoding='utf8'))[1])
 sys.path.insert(0,str(source/'extensions/python'))
 from cryptography.hazmat.primitives.ciphers.aead import AESGCM
 values=[key.hex().encode()]
 for name in ['model.enc','dify.enc']:
  e=json.loads((source/'data/config'/name).read_text(encoding='utf8'));b=base64.b64decode(e['payload']);v=json.loads(AESGCM(key).decrypt(b[:12],b[12:],e['format'].encode()));values.append(v['api_key'].encode())
 return values
def verify(paths,edition,secrets=()):
 files={};links={};root=None;assets=[]
 for path in paths:
  path=Path(path);assert path.stat().st_size<500_000_000
  h=hashlib.sha256(path.read_bytes()).hexdigest();assets.append({'name':path.name,'bytes':path.stat().st_size,'sha256':h})
  for name,data,link in members(path):
   base,_,rel=name.partition('/');assert root in [None,base];root=base
   assert rel not in files and rel not in links,rel
   assert not rel.startswith('data/') and '..' not in Path(rel).parts
   if data is None:links[rel]=link;continue
   files[rel]={'sha256':hashlib.sha256(data).hexdigest(),'size':len(data)}
   if rel.endswith('.sh'):assert b'\r\n' not in data and not data.startswith(b'\xef\xbb\xbf'),rel
   if rel=='launcher/bootstrap.cjs':assert b"require('./plugin-profile.cjs').assertReady(root)" in data and b"require('./plugin-profile.cjs')(root,currentProfile,deployment)" in data
   if rel.endswith('@neiwang/dws-aitable/index.mjs'):assert '写入已禁用'.encode() not in data
   if rel.endswith('@neiwang/dws-aitable/contracts.json'):assert len(json.loads(data))==27
   if edition=='Public':assert not private(rel.removeprefix('plugin-pack/payload/')),rel
   if edition=='Public' and not rel.startswith(('core/','runtime/','launcher/electron/')):assert not any(s in data for s in secrets),'Private credential in '+rel
   if rel in ['config/app.json','plugin-pack/pack.json','manifests/core-sha256.json','manifests/release.json']:files[rel]['json']=json.loads(data)
   if rel.endswith('/canvas-linux-arm64-gnu/skia.linux-arm64-gnu.node'):assert data[:4]==b'\x7fELF' and struct.unpack_from('<H',data,18)[0]==183
   if rel.endswith('/canvas-win32-x64-msvc/skia.win32-x64-msvc.node'):
    assert data[:2]==b'MZ';offset=struct.unpack_from('<I',data,0x3c)[0];assert data[offset:offset+4]==b'PE\0\0' and struct.unpack_from('<H',data,offset+4)[0]==0x8664
 app=files['config/app.json']['json'];pack=files['plugin-pack/pack.json']['json'];assert app['version']==pack['release']=='R11.4';assert app['platform']==pack['platform']
 for row in pack['files']:assert files['plugin-pack/payload/'+row['path']]['sha256']==row['sha256'],row['path']
 for rel,h in files['manifests/core-sha256.json']['json'].items():assert files['core/0.2.0-rc.2/'+rel]['sha256']==h,rel
 assert all(n in pack['bundles'] for n in ['@neiwang/browser-automation','@neiwang/skill-incubator','dsh-attachment-formats'])
 assert '@deepseek-ai/dsh-experimental-schedule-bundle' in app['bundles']
 if edition=='Internal':assert all('config/defaults/'+n in files for n in ['model.enc','dify.enc','.local-key']);assert 'offline-api-tool/内网接口文档.html' in files
 return {'status':'PASS','edition':edition,'platform':app['platform'],'version':'R11.4','files':len(files),'links':len(links),'splitMembersDisjoint':True,'pluginHashesValid':True,'coreHashesUnchanged':True,'noLiveUserData':True,'currentPrivateCredentialsCompared':bool(secrets),'assets':assets}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--edition',choices=['Public','Internal'],required=True);p.add_argument('--report',required=True);p.add_argument('--private-source');p.add_argument('archives',nargs=2);a=p.parse_args();r=verify(a.archives,a.edition,credential_values(a.private_source) if a.private_source else ());Path(a.report).write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(r,ensure_ascii=False))
