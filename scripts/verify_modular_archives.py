from pathlib import Path
import json,zipfile,tarfile,hashlib,posixpath
ROOT=Path(__file__).resolve().parents[1];folder=ROOT/'dist/R10-Modular';reports=[]
for p in sorted(folder.iterdir()):
 if not p.name.endswith(('.zip','.tar.gz')):continue
 assert p.stat().st_size<450_000_000,p
 digest=hashlib.sha256(p.read_bytes()).hexdigest();assert (folder/(p.name+'.sha256')).read_text().split()[0]==digest
 archive=zipfile.ZipFile(p) if p.suffix=='.zip' else tarfile.open(p,'r:gz')
 names=archive.namelist() if isinstance(archive,zipfile.ZipFile) else archive.getnames();assert len(names)==len(set(names)),'Duplicate archive members';prefix=names[0].split('/')[0]+'/'
 hashes={};small={}
 selected={'config/app.json','manifests/core-sha256.json','plugin-pack/pack.json','plugin-pack/install.cjs'}
 # Read every member once in archive order; random gzip seeks would repeatedly decompress the whole archive.
 entries=archive.infolist() if isinstance(archive,zipfile.ZipFile) else archive.getmembers()
 for entry in entries:
  name=entry.filename if isinstance(archive,zipfile.ZipFile) else entry.name;r=name[len(prefix):]
  if isinstance(archive,zipfile.ZipFile):stream=archive.open(entry)
  else:
   if not entry.isfile():continue
   stream=archive.extractfile(entry)
  with stream:
   if r in selected:data=stream.read();small[r]=data;hashes[r]=hashlib.sha256(data).hexdigest()
   else:
    h=hashlib.sha256()
    for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    hashes[r]=h.hexdigest()
 def read(name):return small[name]
 docbase='plugin-pack/' if '-Plugins.' in p.name else ''
 for doc,source in [('安装说明.txt','R10安装说明.txt'),('R10更新说明.txt','R10更新说明.txt')]:
  assert hashes[docbase+doc]==hashlib.sha256((ROOT/'docs'/source).read_bytes()).hexdigest(),'Embedded document differs'
 for name in names:
  assert name.startswith(prefix);r=name[len(prefix):];assert not r.startswith('/') and '..' not in r.split('/');assert not r.startswith('data/');assert not r.startswith('workspace/') or r=='workspace/AGENTS.md'
 if '-Core.' in p.name:
  config=json.loads(read('config/app.json'));assert config['edition']=='core';assert '@neiwang/dws-aitable' not in config['bundles'];assert not any(n.startswith(prefix+'plugin-pack/') for n in names)
  expected=json.loads(read('manifests/core-sha256.json'))
  for rel,h in expected.items():assert hashes['core/0.2.0-rc.2/'+rel]==h,rel
  checks=['Complete pristine upstream core','No user data or optional plugin payload','Core edition configured']
 else:
  assert all(n.startswith(prefix+'plugin-pack/') for n in names)
  manifest=json.loads(read('plugin-pack/pack.json'))
  for item in manifest['files']:assert hashes['plugin-pack/payload/'+item['path']]==item['sha256'],item['path']
  assert read('plugin-pack/install.cjs')==(ROOT/'scripts/install-feature-pack.cjs').read_bytes()
  checks=['Every plugin payload hash verified','Final installer source matches archive','No config/data/workspace overwrites in payload']
  assert all(not i['path'].startswith(('config/','data/','workspace/','core/')) for i in manifest['files'])
 checks.append('Installation and update documents embedded and verified')
 archive.close();reports.append({'file':p.name,'bytes':p.stat().st_size,'sha256':digest,'checks':checks});print('PASS '+p.name,flush=True)
(ROOT/'outputs/R10-archive-validation.json').write_text(json.dumps({'status':'PASS','archives':reports},indent=2),encoding='utf8')
