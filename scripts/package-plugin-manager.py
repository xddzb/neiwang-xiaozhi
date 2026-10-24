"""Create a small offline R11.3 retrofit kit; no APP/core/user config included."""
from pathlib import Path
import tarfile,hashlib,json,io,argparse
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
 files={
  'offline-plugin-manager.cjs':ROOT/'tools/offline-plugin-manager.cjs',
  'setup-plugin-manager.cjs':ROOT/'tools/setup-plugin-manager.cjs',
  'plugin-profile.cjs':ROOT/'launcher/plugin-profile.cjs',
  'manage-plugins.sh':ROOT/'tools/manage-plugins.sh',
  '启用插件管理.sh':ROOT/'tools/enable-plugin-manager.sh',
  '使用说明.md':ROOT/'docs/DEVELOPMENT.md',
 }
 rows=[]
 with tarfile.open(out,'w:gz') as tf:
  for rel,source in files.items():
   data=source.read_bytes();info=tarfile.TarInfo('Neiwang-Offline-Plugin-Manager/'+rel);info.size=len(data);info.mode=0o755 if rel.endswith('.sh') else 0o644;tf.addfile(info,io.BytesIO(data));rows.append({'path':rel,'sha256':hashlib.sha256(data).hexdigest()})
  data=json.dumps({'schemaVersion':1,'files':rows},ensure_ascii=False,indent=2).encode('utf8');info=tarfile.TarInfo('Neiwang-Offline-Plugin-Manager/kit-manifest.json');info.size=len(data);tf.addfile(info,io.BytesIO(data))
 digest=hashlib.sha256(out.read_bytes()).hexdigest();Path(str(out)+'.sha256').write_text(digest+'  '+out.name+'\n',encoding='ascii');print(json.dumps({'file':str(out),'bytes':out.stat().st_size,'sha256':digest},ensure_ascii=False))
if __name__=='__main__':main()
