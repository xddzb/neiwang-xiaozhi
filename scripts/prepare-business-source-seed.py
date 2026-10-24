"""Restore source definitions from the operator's trusted legacy builders, no HTTP calls.

The real business scripts are only parsed by the legacy generator using ast.literal_eval.
Use only the project's reviewed local packaging scripts, never downloaded/user documents.
Output is private deployment material and must stay out of Git.
"""
from pathlib import Path
import argparse,json,hashlib,re,ast
from urllib.parse import urlsplit
def main():
 p=argparse.ArgumentParser();p.add_argument('--legacy-scripts',required=True);p.add_argument('--reference',required=True);p.add_argument('--output',required=True);a=p.parse_args()
 scripts=Path(a.legacy_scripts).resolve();reference=Path(a.reference).resolve();out=Path(a.output).resolve()
 if out.exists():raise ValueError('Use a new private output directory')
 out.mkdir(parents=True)
 for filename,stop in [('generate_weekly_sources.py',"save('接口清单.json'"),('build_once_patch.py',"for name in ['api_tool.py'")]:
  file=scripts/filename;source=file.read_text(encoding='utf-8-sig');prefix=source.split(stop)[0]
  if prefix==source:raise ValueError('Unknown reviewed legacy packaging script')
  prefix=re.sub(r'^OUT=.*$', lambda _:'OUT=Path('+repr(str(out))+')',prefix,flags=re.M)
  prefix=re.sub(r'^REF=.*$', lambda _:'REF=Path('+repr(str(reference))+')',prefix,flags=re.M)
  # This trusted packaging prefix contains static definition generation, not business HTTP execution.
  tree=ast.parse(prefix)
  for node in ast.walk(tree):
   if isinstance(node,(ast.Import,ast.ImportFrom)):
    names=[x.name for x in node.names] if isinstance(node,ast.Import) else [node.module]
    if any(x not in ['ast','hashlib','json','pathlib','shutil','zipfile'] for x in names):raise ValueError('Unexpected builder import')
  exec(compile(tree,str(file),'exec'),{'__file__':str(file),'__name__':'_private_static_source_builder'})
 api=out/'extensions/apis'
 for file in (api/'connections').glob('*.json'):
  c=json.loads(file.read_text(encoding='utf8'));u=urlsplit(c['base_url'])
  if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.query or u.fragment:raise ValueError('Invalid private base URL')
  if c.get('token') or c.get('headers'):raise ValueError('Refusing to package captured credentials')
  c['browser_session']={'driver':'playwright','profile_path':'APP_BUSINESS_BROWSER_PROFILE','allowed_origins':[u.scheme+'://'+u.netloc]}
  file.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 spec={'enabled':True,'description':'ISU 仪表当前值（原有Socket.IO只读适配器）','read_only':True,'transport':'isu-engineio3','parameters':{'points':{'type':'array','required':True},'limit':{'type':'integer','default':50,'minimum':1,'maximum':50}},'response_notes':'复用本机已有 ISU 独立登录配置；不复制或重置凭据。'}
 (api/'sources/isu-instruments.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 rows=[json.loads(f.read_text(encoding='utf8')) for f in (api/'sources').glob('*.json')]
 report={'sources':len(rows),'enabled':sum(bool(r.get('enabled')) for r in rows),'connections':len(list((api/'connections').glob('*.json'))),'capturesOrCredentialsCopied':False,'inputs':{n:hashlib.sha256((scripts/n).read_bytes()).hexdigest() for n in ['generate_weekly_sources.py','build_once_patch.py']}}
 (out/'provenance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
