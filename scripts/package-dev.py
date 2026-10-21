"""Archive a fresh development build; refuse any runtime user state."""
from pathlib import Path
import sys,zipfile,tarfile,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
def package(app):
 app=app.resolve(strict=True)
 if not (app/'manifests/development.json').is_file():raise ValueError('Not a development app')
 if any((app/name).exists() for name in ['data','workspace','workspaces']):raise ValueError('App has been run. Package a NEW build, never a user app.')
 if (app/'config/defaults').exists():raise ValueError('Credential seed directory is not allowed')
 if any(p.name not in {'README.md','内网接口文档.template.html'} for p in (app/'private-docs').glob('*')):raise ValueError('Private interface material is not allowed in distribution packages')
 template=app/'private-docs/内网接口文档.template.html'
 if template.exists() and hashlib.sha256(template.read_bytes()).hexdigest()!=json.loads((ROOT/'manifests/interface-template.json').read_text(encoding='utf8'))['sha256']:raise ValueError('Public blank template was modified; do not distribute private interface material')
 dest=ROOT/'dist';dest.mkdir(exist_ok=True)
 out=dest/(app.name+('.zip' if (app/'runtime/node/node.exe').exists() else '.tar.gz'))
 if out.exists():raise ValueError('Archive already exists; use a new build name')
 if out.suffix=='.zip':
  with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
   for p in app.rglob('*'):
    if p.is_symlink():raise ValueError('ZIP build contains symlinks; do not package a started app')
    if p.is_file():z.write(p,app.name+'/'+p.relative_to(app).as_posix())
 else:
  def normalize(info):
   info.uid=info.gid=0;info.uname=info.gname='';return info
  with tarfile.open(out,'w:gz',compresslevel=4) as t:t.add(app,arcname=app.name,filter=normalize)
 print(out)
if __name__=='__main__':
 if len(sys.argv)!=2:raise SystemExit('Usage: npm run package -- builds/<development-app-directory>')
 package(Path(sys.argv[1]))
