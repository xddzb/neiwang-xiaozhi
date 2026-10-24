from pathlib import Path
import tarfile,json,hashlib,sys,struct,io
p=Path(sys.argv[1]);base='Neiwang-Xiaozhi-Kylin-ARM64-R11.3/'
hashes={};meta={};shells=0;seeds=[];canvas=False
delta=tarfile.open(sys.argv[2],'w:gz',compresslevel=1) if len(sys.argv)>2 else None
with tarfile.open(p,'r:gz') as tf:
 for e in tf:
  if not e.name.startswith(base):continue
  rel=e.name[len(base):]
  if e.isfile():
   data=tf.extractfile(e).read();hashes[rel]=hashlib.sha256(data).hexdigest()
   if rel in ['config/app.json','plugin-pack/pack.json','manifests/core-sha256.json','manifests/r113-features.json']:meta[rel]=json.loads(data)
   if rel.endswith('.sh'):assert b'\r\n' not in data and not data.startswith(b'\xef\xbb\xbf'),rel;shells+=1
   if rel.startswith('config/defaults/'):seeds.append(rel)
   if rel.endswith('/canvas-linux-arm64-gnu/skia.linux-arm64-gnu.node'):assert data[:4]==b'\x7fELF' and struct.unpack('<H',data[18:20])[0]==183;canvas=True
  else:data=None
  if delta and rel and not rel.startswith(('core/','runtime/','launcher/electron/','config/defaults/','data/')):
   n=tarfile.TarInfo('r113-test-app/'+rel);n.type=e.type;n.linkname=e.linkname;n.mode=e.mode;n.size=len(data) if data is not None else 0
   delta.addfile(n,io.BytesIO(data) if data is not None else None)
if delta:delta.close()
manifest=meta['plugin-pack/pack.json'];assert manifest['release']=='R11.3'
assert all(hashes['plugin-pack/payload/'+f['path']]==f['sha256'] for f in manifest['files'])
assert all(hashes['core/0.2.0-rc.2/'+r]==h for r,h in meta['manifests/core-sha256.json'].items())
assert '@deepseek-ai/dsh-experimental-schedule-bundle' in meta['config/app.json']['bundles']
assert all(n in manifest['bundles'] for n in ['@neiwang/skill-incubator','dsh-attachment-formats'])
assert canvas
public=meta['manifests/r113-features.json']['edition']=='public'
assert not public or not seeds
print(json.dumps({'status':'PASS','files':len(hashes),'shellsLF':shells,'pluginHashes':True,'coreUnchanged':True,'canvasARM64':canvas,'public':public,'organizationSeeds':len(seeds)},indent=2))
