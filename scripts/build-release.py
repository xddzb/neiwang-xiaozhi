"""One local path manifest replaces eight repeated release build arguments. No network."""
from pathlib import Path
import argparse,hashlib,json,subprocess,sys,datetime
ROOT=Path(__file__).resolve().parents[1]
def sha(file):
 h=hashlib.sha256()
 with file.open('rb') as f:
  for block in iter(lambda:f.read(1048576),b''):h.update(block)
 return h.hexdigest()
def plan(config,check_hash=True):
 config=Path(config).resolve();c=json.loads(config.read_text(encoding='utf-8-sig'))
 if c.get('schemaVersion')!=1:raise ValueError('Unsupported local manifest schema')
 def value(name):
  v=c.get(name)
  if not isinstance(v,str) or not v.strip():raise ValueError('Missing local path: '+name)
  p=Path(v);return (config.parent/p).resolve() if not p.is_absolute() else p.resolve()
 linux=value('linuxBaseline');windows=value('windowsBaseline');private=value('privateApp');node=value('node');output=value('outputRoot');core_linux=value('coreLinux');core_windows=value('coreWindows')
 if not linux.is_file() or not node.is_file():raise ValueError('Missing platform archive or Node runtime')
 expected=c.get('linuxBaselineSha256','')
 if len(expected)!=64 or any(x not in '0123456789abcdef' for x in expected):raise ValueError('Pin reviewed Linux baseline SHA256')
 if check_hash and sha(linux)!=expected:raise ValueError('Linux baseline SHA256 mismatch')
 if not (windows/'config/app.json').is_file() or not (windows/'plugin-pack/pack.json').is_file():raise ValueError('Windows baseline is not a complete reviewed APP')
 cfg=private/'data/config' if (private/'data/config/model.enc').is_file() else private/'config/defaults'
 if not all((cfg/n).is_file() for n in ['model.enc','dify.enc']):raise ValueError('Private APP must already contain model and RAG configuration')
 docs=private/'offline-api-tool'
 sources=private if (private/'extensions/apis').is_dir() else private/'plugin-pack/payload'
 if not docs.is_dir() or not (sources/'extensions/apis').is_dir():raise ValueError('Private APP is missing local interface documents or API sources')
 for core in [core_linux,core_windows]:
  if json.loads((core/'node_modules/@deepseek-ai/dsh/package.json').read_text(encoding='utf-8'))['version']!='0.2.1-rc.3':raise ValueError('Prepared core version mismatch')
 for core,target in [(core_linux,'linux-arm64-gnu'),(core_windows,'win32-x64-msvc')]:
  if not (core/('node_modules/node-addon-require-builtin-'+target)).is_dir():raise ValueError('Missing required target-platform native package')
 return dict(core_linux=core_linux,core_windows=core_windows,linux=linux,windows=windows,private=private,node=node,output=output,docs=docs,sources=sources)
def main():
 p=argparse.ArgumentParser();p.add_argument('--config',default=str(ROOT/'config/build.local.json'));p.add_argument('--check',action='store_true');p.add_argument('--assemble-only',action='store_true');a=p.parse_args()
 try:
  v=plan(a.config)
  if a.check:print('PASS: reviewed baselines and consolidated private APP inputs are ready; sensitive paths and values suppressed');return 0
  run=v['output']/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
  args=[sys.executable,str(ROOT/'scripts/build-r115-release.py'),'--core-linux',str(v['core_linux']),'--core-windows',str(v['core_windows']),'--linux-baseline',str(v['linux']),'--windows-baseline',str(v['windows']),'--private-source',str(v['private']),'--private-docs',str(v['docs']),'--private-sources',str(v['sources']),'--node',str(v['node']),'--work',str(run/'builds'),'--dist',str(run/'dist')]
  if a.assemble_only:args.append('--assemble-only')
  return subprocess.run(args,cwd=ROOT).returncode
 except (ValueError,OSError,json.JSONDecodeError) as e:
  # Path manifests are local-only; do not print exception strings with organization paths.
  print('Build input check failed. Check the local manifest, hashes and required files; private values were not printed.',file=sys.stderr);return 1
if __name__=='__main__':sys.exit(main())
