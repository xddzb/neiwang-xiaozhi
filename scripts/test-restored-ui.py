"""Repeat desktop checks against an existing synthetic restored-runtime fixture."""
from pathlib import Path
import os, sys, json, subprocess, threading, queue, time, re, signal, urllib.request, urllib.parse, http.cookiejar
HERE=Path(__file__).resolve().parent
APP=Path(sys.argv[1]).resolve();WORK=Path(sys.argv[2]).resolve()
assert (WORK/'restored-result.json').is_file(), 'Run test-restored-runtime.py first'
data=WORK/'data';workspace=WORK/'workspace'
env={**os.environ,'NEIWANG_APP_ROOT':str(APP),'NEIWANG_DATA_DIR':str(data),'NEIWANG_WORKSPACE_DIR':str(workspace),'NEIWANG_TEST_PATCH':str(WORK/'patch.json')}
proc=subprocess.Popen([str(APP/('runtime/node/node.exe' if os.name=='nt' else 'runtime/node/bin/node')),str(HERE/'r113-entry.cjs')],cwd=APP,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
q=queue.Queue();buf=''
def read():
 for line in iter(proc.stdout.readline,b''):q.put(line.decode('utf8','replace'))
threading.Thread(target=read,daemon=True).start()
try:
 deadline=time.time()+900;url=None
 while time.time()<deadline:
  try:buf+=q.get(timeout=1)
  except queue.Empty:
   if proc.poll() is not None:break
   continue
  match=re.search(r'http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_-]+',buf)
  if match:url=match.group();break
 assert url,'Synthetic Host failed to start'
 print('PASS actual Host restarted for existing synthetic UI fixture',flush=True)
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 opener.open(url,timeout=300).read();origin=url.split('/?')[0]
 points=list((data/'dsh/change-ledger').rglob('manifests/*.json'))
 session=next(json.loads(p.read_text())['sessionId'] for p in points if json.loads(p.read_text()).get('kind')=='turn')
 timeline=json.load(opener.open(origin+'/turn-rewind/review?'+urllib.parse.urlencode({'sessionId':session,'timeline':'1'}),timeout=120))
 assert timeline.get('entries'),'Actual review timeline is empty'
 print('PASS actual review API returns persisted rounds',flush=True)
 ui={**env,'DSH_URL':url,'BROWSER_UI_OUTPUT':str(WORK/'browser-settings.png'),'NEIWANG_REWIND_UI':'1','NEIWANG_CHANGES_UI':'1','NEIWANG_EXPECT_SIDEBAR':'1','NEIWANG_EXPECTED_SOURCES':str(len(list((APP/'extensions/apis/sources').glob('*.json')))),'FONTCONFIG_FILE':str(data/'runtime/fonts.conf')}
 ui.pop('ELECTRON_RUN_AS_NODE',None)
 command=([str(APP/'launcher/electron/electron.exe')] if os.name=='nt' else ['xvfb-run','-a',str(APP/'launcher/electron/electron')])+['--no-sandbox','--disable-gpu',str(HERE/'test-changes-ui.cjs')]
 subprocess.run(command,env=ui,cwd=APP,check=True,timeout=600)
 result=json.loads((WORK/'restored-result.json').read_text());result.update(desktopUiVerified=True,changesPaneVerified=True)
 if os.environ.get('NEIWANG_MODELS_UI')=='1':result['manualModelApiFormVerified']=True
 (WORK/'restored-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
finally:
 if proc.poll() is None:
  if os.name=='nt':subprocess.run(['taskkill','/PID',str(proc.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  else:os.killpg(proc.pid,signal.SIGTERM)
  try:proc.wait(timeout=20)
  except subprocess.TimeoutExpired:
   if os.name=='nt':proc.kill()
   else:os.killpg(proc.pid,signal.SIGKILL)
   proc.wait()
