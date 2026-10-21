from pathlib import Path
import os,json,hashlib,subprocess
app=Path(os.environ['TEST_APP_ROOT']).resolve();pack=app/'plugin-pack';node=app/('runtime/node/node.exe' if os.name=='nt' else 'runtime/node/bin/node')
def run(ok):
 r=subprocess.run([str(node),str(pack/'install.cjs')],capture_output=True,timeout=300)
 assert (r.returncode==0)==ok,(r.returncode,r.stdout.decode('utf8','replace'),r.stderr.decode('utf8','replace'))
 return r
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
manifest=pack/'pack.json';original=manifest.read_bytes();value=json.loads(original)
config=app/'config/app.json';oldconfig=config.read_bytes()
# Platform mismatch is rejected before copying or enabling any plugin.
wrong={**value,'platform':'wrong-platform'};manifest.write_text(json.dumps(wrong),encoding='utf8')
try:run(False);assert config.read_bytes()==oldconfig
finally:manifest.write_bytes(original)
# Incomplete or modified download is rejected, without changing app registration.
testfile=pack/'payload'/value['files'][0]['path'];originalfile=testfile.read_bytes();testfile.write_bytes(originalfile+b'\ncorrupt-fixture')
try:run(False);assert config.read_bytes()==oldconfig
finally:testfile.write_bytes(originalfile)
# Simulate a core edition already run once, and existing user data.
env={**os.environ,'NEIWANG_APP_ROOT':str(app)}
subprocess.run([str(node),str(app/'launcher/bootstrap.cjs')],env=env,check=True,stdout=subprocess.DEVNULL,timeout=120)
for rel in ['data/install-fixture/chat.txt','workspace/install-fixture.txt','config/install-fixture.txt']:
 p=app/rel;p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():assert p.read_text(encoding='utf8')=='synthetic user data must survive'
 else:p.write_text('synthetic user data must survive',encoding='utf8')
protected={str(p.relative_to(app)):digest(p) for folder in ['data','config','workspace'] for p in (app/folder).rglob('*') if p.is_file() and not p.is_symlink() and p not in [config,app/'config/feature-pack.json']}
run(True)
for rel,h in protected.items():assert digest(app/rel)==h,rel
run(True) # Exact same pack is idempotent.
subprocess.run([str(node),str(app/'launcher/bootstrap.cjs')],env=env,check=True,stdout=subprocess.DEVNULL,timeout=120)
profile=json.loads((app/'data/dsh/profiles/web/package.json').read_text())
for name in value['bundles']:assert name in profile['dsh']['profile']['bundles'],name
for rel in ['data/install-fixture/chat.txt','workspace/install-fixture.txt','config/install-fixture.txt']:(app/rel).unlink()
report={'status':'PASS','platform':value['platform'],'checks':['Wrong platform rejected','Corrupted payload rejected before registration','Core first run then offline plugin install','Existing user files preserved','Idempotent install','Profile refreshed after restart'],'protectedFiles':len(protected)}
out=Path(__file__).resolve().parents[1]/'outputs';out.mkdir(exist_ok=True);(out/('R10-'+value['platform']+'-installation.json')).write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
