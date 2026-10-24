"""Build a private ARM64 browser/API patch without downloading or copying user state."""
from pathlib import Path
import argparse,shutil,json,tarfile,hashlib,subprocess,io
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--sources',required=True);p.add_argument('--legacy-session',required=True);p.add_argument('--node',required=True);p.add_argument('--output',required=True);a=p.parse_args()
 out=Path(a.output).resolve();out.parent.mkdir(parents=True,exist_ok=True);stage=out.parent/(out.name.removesuffix('.tar.gz')+'-stage')
 if stage.exists():raise ValueError('Use a new output filename/staging folder')
 prepared=stage.parent/(stage.name+'-plugin');shutil.copytree(ROOT/'extensions/@neiwang/browser-automation',prepared,ignore=shutil.ignore_patterns('.bin','.git','__pycache__','.cache','*.pyc'))
 stage.mkdir();subprocess.run([a.node,str(ROOT/'scripts/build-offline-plugin.cjs'),'--source',str(prepared),'--output',str(stage/'plugin'),'--core','0.2.0-rc.2','--os','linux','--arch','arm64'],check=True)
 rows=[]
 for rel,source in {
  'offline-plugin-manager.cjs':ROOT/'tools/offline-plugin-manager.cjs','setup-plugin-manager.cjs':ROOT/'tools/setup-plugin-manager.cjs','plugin-profile.cjs':ROOT/'launcher/plugin-profile.cjs','manage-plugins.sh':ROOT/'tools/manage-plugins.sh','启用插件管理.sh':ROOT/'tools/enable-plugin-manager.sh','使用说明.md':ROOT/'docs/DEVELOPMENT.md'
 }.items():
  data=source.read_bytes();(stage/rel).write_bytes(data);rows.append({'path':rel,'sha256':hashlib.sha256(data).hexdigest()})
 (stage/'kit-manifest.json').write_text(json.dumps({'schemaVersion':1,'files':rows},ensure_ascii=False,indent=2),encoding='utf8')
 shutil.copyfile(ROOT/'launcher/shell/brand-ui.js',stage/'brand-ui.js')
 shutil.copyfile(ROOT/'tools/install-browser-patch.cjs',stage/'install-browser-patch.cjs');shutil.copyfile(a.legacy_session,stage/'legacy-browser-session.py')
 source=Path(a.sources).resolve();shutil.copytree(source,stage/'sources')
 for file in (stage/'sources/extensions/apis/connections').glob('*.json'):
  c=json.loads(file.read_text(encoding='utf8'))
  if c.get('token') or c.get('headers') or c.get('auth_mode')!='none':raise ValueError('Refusing credentials in source seed')
 for command,name in [('install','安装补丁.sh'),('rollback','回退补丁.sh')]:
  script='#!/bin/sh\nset -eu\n[ "$#" -eq 1 ] || { echo "请提供现有R11.3 APP目录"; exit 1; }\nKIT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nAPP=$(CDPATH= cd -- "$1" && pwd)\nexec "$APP/runtime/node/bin/node" "$KIT/install-browser-patch.cjs" '+command+' "$APP"\n'
  (stage/name).write_text(script,encoding='utf8',newline='\n')
 files=[]
 for file in sorted(stage.rglob('*')):
  if file.is_symlink():raise ValueError('Symbolic payload file')
  if file.is_file():files.append({'path':file.relative_to(stage).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
 (stage/'patch-manifest.json').write_text(json.dumps({'schemaVersion':1,'files':files},ensure_ascii=False,indent=2),encoding='utf8')
 with tarfile.open(out,'w:gz') as archive:
  for file in sorted(stage.rglob('*')):
   if file.is_file():
    data=file.read_bytes();entry=tarfile.TarInfo('Neiwang-Kylin-ARM64-Browser-API-Patch/'+file.relative_to(stage).as_posix());entry.mode=0o755 if file.suffix=='.sh' else 0o644;entry.size=len(data);archive.addfile(entry,io.BytesIO(data))
 digest=hashlib.sha256(out.read_bytes()).hexdigest();Path(str(out)+'.sha256').write_text(digest+'  '+out.name+'\n',encoding='ascii');print(json.dumps({'file':str(out),'bytes':out.stat().st_size,'sha256':digest,'privateBusinessDefinitions':True},ensure_ascii=False))
if __name__=='__main__':main()
