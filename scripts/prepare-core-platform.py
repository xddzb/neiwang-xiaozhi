"""Prepare pinned target-platform optional packages on a different build OS.
Only registry URLs and integrity from the existing lockfile are accepted.
No package scripts, compilation or installation on the offline target.
"""
from pathlib import Path,PurePosixPath
import argparse,base64,hashlib,io,json,tarfile,urllib.request
def prepare(root,platform,arch):
 root=Path(root).resolve();lock=json.loads((root/'package-lock.json').read_text(encoding='utf-8'));count=0
 for rel,v in lock['packages'].items():
  if not v.get('os') or platform not in v['os'] or v.get('cpu') and arch not in v['cpu']:continue
  if platform=='linux' and ('musl' in rel or 'linuxmusl' in rel):continue
  dest=root/rel
  if dest.exists():continue
  assert rel.startswith('node_modules/') and '..' not in PurePosixPath(rel).parts
  url=v['resolved'].replace('https://registry.npmmirror.com/','https://registry.npmjs.org/',1);assert url.startswith('https://registry.npmjs.org/')
  algorithm,expected=v['integrity'].split('-',1);assert algorithm in ['sha512','sha256']
  with urllib.request.urlopen(url,timeout=180) as response:data=response.read()
  assert base64.b64encode(hashlib.new(algorithm,data).digest()).decode()==expected
  with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tar:
   for m in tar:
    parts=PurePosixPath(m.name).parts;assert parts and parts[0]=='package' and '..' not in parts and not m.issym() and not m.islnk()
    if not m.isfile():continue
    target=dest.joinpath(*parts[1:]);assert target.is_relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tar.extractfile(m).read())
  count+=1;print('PREPARED '+rel,flush=True)
 return count
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--os',required=True);p.add_argument('--arch',required=True);a=p.parse_args();print('PASS: '+str(prepare(a.root,a.os,a.arch))+' pinned platform packages prepared')
