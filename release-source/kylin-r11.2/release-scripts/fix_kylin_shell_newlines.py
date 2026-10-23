from pathlib import Path
import tarfile,io,copy,json,hashlib,re,subprocess
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'dist/R11.2-Kylin-ARM64-Internal';OUT=ROOT/'dist/R11.2-Kylin-ARM64-Internal-LF-Fix';NAME='Neiwang-Xiaozhi-Kylin-ARM64-R11.2'
def main():
 OUT.mkdir(exist_ok=True);meta=json.loads((SRC/'build.json').read_text(encoding='utf8'));changed={};report=[]
 # Calculate exact post-normalization payload hashes before serializing its manifest.
 for a in meta['archives']:
  with tarfile.open(SRC/a['file'],'r:gz') as tf:
   for e in tf:
    if e.isfile() and e.name.endswith('.sh'):
     raw=tf.extractfile(e).read();fixed=raw.removeprefix(b'\xef\xbb\xbf').replace(b'\r\n',b'\n')
     if raw!=fixed:changed[e.name]=fixed
 guide=(SRC/'安装说明.txt').read_text(encoding='utf8')+'\n2026-10-23 修复：安装及入口Shell脚本统一Linux LF换行，同步更新插件校验值。请用修复包在新目录解压安装；不要自行修改payload脚本而不更新pack.json。\n'
 for a in meta['archives']:
  target=OUT/a['file']
  with tarfile.open(SRC/a['file'],'r:gz') as old,tarfile.open(target,'w:gz',compresslevel=6) as new:
   for e in old:
    n=copy.copy(e);data=old.extractfile(e).read() if e.isfile() else None
    if e.name in changed:data=changed[e.name]
    if e.name==NAME+'/plugin-pack/pack.json':
     manifest=json.loads(data)
     for entry in manifest['files']:
      key=NAME+'/plugin-pack/payload/'+entry['path']
      if key in changed:entry['sha256']=hashlib.sha256(changed[key]).hexdigest()
     data=json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf8')
    if e.name.removeprefix(NAME+'/') in ['安装说明.txt','README-先看这里.txt','维护与升级说明.txt','plugin-pack/安装说明.txt']:data=guide.encode('utf8')
    if data is None:new.addfile(n)
    else:n.size=len(data);new.addfile(n,io.BytesIO(data))
  a.update(bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest());(OUT/(target.name+'.sha256')).write_text(a['sha256']+'  '+target.name+'\n',encoding='utf8');print('Fixed '+target.name,flush=True)
 payload={};manifest=None;shells=0;original_seed=None;new_seed=None
 for a in meta['archives']:
  with tarfile.open(OUT/a['file'],'r:gz') as tf:
   for e in tf:
    if not e.isfile():continue
    data=tf.extractfile(e).read()
    if e.name.endswith('.sh'):assert b'\r\n' not in data and not data.startswith(b'\xef\xbb\xbf'),e.name;shells+=1
    if '/plugin-pack/payload/' in e.name:payload[e.name.split('/plugin-pack/payload/',1)[1]]=hashlib.sha256(data).hexdigest()
    if e.name==NAME+'/plugin-pack/pack.json':manifest=json.loads(data)
    if e.name==NAME+'/config/defaults/model.enc':new_seed=hashlib.sha256(data).hexdigest()
  with tarfile.open(SRC/a['file'],'r:gz') as tf:
   for e in tf:
    if e.name==NAME+'/config/defaults/model.enc':original_seed=hashlib.sha256(tf.extractfile(e).read()).hexdigest()
 assert original_seed==new_seed and original_seed
 assert manifest and all(payload[e['path']]==e['sha256'] for e in manifest['files'])
 meta['shellNewlineFix']=True
 validation=json.loads((SRC/'validation.json').read_text(encoding='utf8'));validation.update(archives=meta['archives'],shellNewlines='PASS LF only',shellScriptsChecked=shells,changedShellScripts=[k.removeprefix(NAME+'/') for k in changed],pluginHashesValid=True,internalModelSeedUnchanged=True,newShellFixRuntimeTest='pending')
 (OUT/'build.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8');(OUT/'validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2),encoding='utf8');(OUT/'安装说明.txt').write_text(guide,encoding='utf8')
 # Small update for the test VM, without personal configuration.
 with tarfile.open(ROOT/'tmp/kylin-lf-fix-delta.tar','w') as tf:
  for name,data in changed.items():
   rel=name.removeprefix(NAME+'/');n=tarfile.TarInfo('Neiwang-Xiaozhi-Kylin-ARM64-R10/'+rel);n.size=len(data);n.mode=0o755;tf.addfile(n,io.BytesIO(data))
  data=json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf8');n=tarfile.TarInfo('Neiwang-Xiaozhi-Kylin-ARM64-R10/plugin-pack/pack.json');n.size=len(data);n.mode=0o644;tf.addfile(n,io.BytesIO(data))
 print('PASS LF scripts, updated payload hashes, unchanged internal model seed',flush=True)
if __name__=='__main__':main()
