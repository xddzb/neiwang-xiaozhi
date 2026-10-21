"""Prepare pinned, hash-verified portable Python/PyInstaller and official DWS assets."""
from pathlib import Path,PurePosixPath
import argparse,hashlib,json,os,platform,posixpath,shutil,subprocess,sys,tarfile,urllib.request,zipfile
ROOT=Path(__file__).resolve().parents[1]
def current_platform():
 if sys.platform not in ['win32','linux']:raise ValueError('Supported build systems are Windows and Linux')
 arch={'AMD64':'x64','x86_64':'x64','aarch64':'arm64','ARM64':'arm64'}.get(platform.machine(),platform.machine())
 return ('win32' if sys.platform=='win32' else 'linux')+'-'+arch
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def download(asset,cache):
 p=cache/asset['name'];cache.mkdir(parents=True,exist_ok=True)
 if not p.exists():
  print('Downloading '+asset['name'],flush=True);partial=p.with_name(p.name+'.partial')
  request=urllib.request.Request(asset['url'],headers={'User-Agent':'neiwang-xiaozhi-build'})
  with urllib.request.urlopen(request,timeout=45) as response,partial.open('wb') as out:shutil.copyfileobj(response,out)
  if digest(partial)!=asset['sha256']:raise ValueError('Downloaded asset hash mismatch: '+p.name)
  partial.rename(p)
 if digest(p)!=asset['sha256']:raise ValueError('Cached asset hash mismatch: '+p.name)
 return p
def safe_extract(archive,dest):
 dest.mkdir(parents=True,exist_ok=True)
 def safe(name):
  normalized=posixpath.normpath(name.replace('\\','/'))
  if normalized.startswith('/') or normalized=='..' or normalized.startswith('../') or ':' in normalized:raise ValueError('Unsafe archive path')
  return normalized
 if archive.suffix=='.zip':
  with zipfile.ZipFile(archive) as z:
   for item in z.infolist():
    safe(item.filename)
    if (item.external_attr>>16)&0o170000==0o120000:raise ValueError('ZIP links are unsupported')
   z.extractall(dest)
 else:
  with tarfile.open(archive,'r:*') as t:
   entries=t.getmembers();links=[]
   for item in entries:
    name=safe(item.name)
    if not (item.isfile() or item.isdir() or item.issym() or item.islnk()):raise ValueError('Unsupported archive entry')
    if item.issym() or item.islnk():
     safe(posixpath.join(posixpath.dirname(name),item.linkname) if item.issym() else item.linkname);links.append(name)
   for item in entries:
    name=safe(item.name)
    if any(name.startswith(link+'/') for link in links):raise ValueError('Archive traverses a link')
   # Paths and every link have been checked above; support Python 3.10 bootstrap hosts.
   for item in entries:t.extract(item,dest)
def install_sandbox(package,sources,output):
 stage=output/'sandbox-package';stage.mkdir();data=package.read_bytes()
 if not data.startswith(b'!<arch>\n'):raise ValueError('Invalid Debian archive')
 offset=8;payload=None
 while offset+60<=len(data):
  header=data[offset:offset+60];size=int(header[48:58]);name=header[:16].decode('ascii').strip().rstrip('/');offset+=60
  if header[58:60]!=b'`\n':raise ValueError('Invalid Debian member')
  if name.startswith('data.tar'):
   payload=stage/name;payload.write_bytes(data[offset:offset+size])
  offset+=size+(size%2)
 if payload is None:raise ValueError('Debian payload missing')
 safe_extract(payload,stage/'root');dest=output/'sandbox';dest.mkdir()
 shutil.copyfile(stage/'root/usr/bin/bwrap',dest/'bwrap');(dest/'bwrap').chmod(0o755)
 shutil.copyfile(stage/'root/usr/share/doc/bubblewrap/copyright',dest/'COPYRIGHT')
 (dest/'source').mkdir()
 for archive in sources:
  shutil.copyfile(archive,dest/'source'/archive.name)
  if archive.name.endswith('.orig.tar.xz'):
   with tarfile.open(archive) as t:
    license=next(v for v in t.getmembers() if v.name.endswith('/COPYING'))
    (dest/'COPYING').write_bytes(t.extractfile(license).read())
def prepare(target,cache):
 lock=json.loads((ROOT/'manifests/dev-runtime-assets.json').read_text(encoding='utf8'))
 if target not in lock['platforms']:raise ValueError('Unsupported build platform: '+target)
 if target!=current_platform():raise ValueError('Run preparation on the target OS/CPU; cross execution is unsupported')
 assets=lock['platforms'][target];output=ROOT/'build-materials'/target;stamp=output/'ready.json'
 expected={'platform':target,'assets':assets,'python':lock['python_version'],'pyinstaller':lock['pyinstaller_version'],'dws':lock['dws_version']}
 if stamp.exists() and json.loads(stamp.read_text(encoding='utf8'))==expected:print('Build materials already ready: '+str(output));return
 if stamp.exists():
  previous=json.loads(stamp.read_text(encoding='utf8'))
  # Safe additive migration: only add the missing Linux sandbox to an identical runtime.
  same_versions=all(previous.get(k)==expected[k] for k in ['platform','python','pyinstaller','dws'])
  same_runtime=all(previous.get('assets',{}).get(k)==assets[k] for k in ['python','dws','wheels'])
  if same_versions and same_runtime and 'sandbox' not in previous['assets'] and 'sandbox' in assets:
   package=download(assets['sandbox'],cache);sources=[download(a,cache) for a in assets['sandbox_sources']]
   install_sandbox(package,sources,output);stamp.write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print('Added verified Linux sandbox: '+str(output));return
 if output.exists():raise ValueError('Incomplete materials directory exists; preserve it for diagnosis and move it aside before retrying: '+str(output))
 downloaded={key:download(assets[key],cache) for key in ['python','dws']}
 wheels=[download(a,cache) for a in assets['wheels']]
 sandbox=download(assets['sandbox'],cache) if 'sandbox' in assets else None
 sandbox_sources=[download(a,cache) for a in assets.get('sandbox_sources',[])]
 output.mkdir(parents=True)
 safe_extract(downloaded['python'],output)
 safe_extract(downloaded['dws'],output/'dws')
 python=output/'python'/('python.exe' if target.startswith('win32') else 'bin/python3')
 if not python.is_file():raise ValueError('Portable Python archive layout changed')
 if os.name!='nt':(output/'dws/dws').chmod(0o755)
 if sandbox:install_sandbox(sandbox,sandbox_sources,output)
 env={**os.environ,'PYTHONNOUSERSITE':'1','PIP_DISABLE_PIP_VERSION_CHECK':'1'}
 subprocess.run([str(python),'-I','-m','pip','--isolated','--disable-pip-version-check','install','--no-index','--no-deps','--upgrade',*[str(p) for p in wheels]],check=True,env=env)
 subprocess.run([str(python),'-I','-m','PyInstaller','--version'],check=True,env=env)
 stamp.write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print('Prepared '+str(output),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,default=ROOT/'downloads/dev-assets');args=parser.parse_args()
 prepare(current_platform(),args.cache.resolve())
