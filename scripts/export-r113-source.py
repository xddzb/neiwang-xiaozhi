"""Export the credential-free release launcher/config snapshot, not runtimes."""
from pathlib import Path
import tarfile,json,hashlib,sys
ROOT=Path(__file__).resolve().parents[1];archive=Path(sys.argv[1]);out=ROOT/'release-source/kylin-r11.3';base='Neiwang-Xiaozhi-Kylin-ARM64-R11.3/'
tools={'model_config.py','rag_tool.py','api_tool.py','setup_model.py','setup_rag.py','dws-login.cjs','configure-official-dingtalk.mjs'}
rows=[]
with tarfile.open(archive) as tf:
 for e in tf:
  if not e.isfile() or not e.name.startswith(base):continue
  rel=e.name[len(base):]
  wanted=(rel.startswith('launcher/') and not rel.startswith('launcher/electron/') or rel.startswith('tools/') and Path(rel).name in tools or rel in ['config/app.json','config/brand.json','config/deployment.yml','config/overrides.json','start.sh','配置模型.sh','配置RAG.sh','plugin-pack/install.cjs','plugin-pack/安装插件.sh'])
  if not wanted:continue
  data=tf.extractfile(e).read();p=out/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);rows.append({'path':rel,'sha256':hashlib.sha256(data).hexdigest()})
h=hashlib.sha256()
with archive.open('rb') as stream:
 for block in iter(lambda:stream.read(1048576),b''):h.update(block)
(out/'source-manifest.json').write_text(json.dumps({'version':'R11.3','source':'credential-free public archive','archiveSha256':h.hexdigest(),'extensions':'Use repository root extensions/ for skill-incubator, offline attachment-formats and branding. Upstream commits and licenses are included there.','configuration':'Install-local encryption key; no organization seeds or shared decryption key.','files':rows},ensure_ascii=False,indent=2),encoding='utf8')
print('Exported credential-free R11.3 launcher/config snapshot:',len(rows),'files')
