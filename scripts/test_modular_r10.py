from pathlib import Path
import sys,os,json,tempfile,subprocess,threading,queue,re,time,urllib.request,http.cookiejar,hashlib
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
ROOT=Path(__file__).resolve().parents[1];APP=Path(os.environ['TEST_APP_ROOT']).resolve();FULL=os.environ.get('TEST_MODULAR_FULL')=='1'
sys.path.insert(0,str(APP/'tools'));import model_config
class Mock(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  request=json.loads(self.rfile.read(int(self.headers['Content-Length'])));messages=request['messages'];last=max(i for i,m in enumerate(messages) if m['role']=='user')
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  if not any(m['role']=='tool' for m in messages[last+1:]):
   code="console.log(await tools.read({file_path:'r8-diff.txt'})); console.log(await tools.edit({file_path:'r8-diff.txt',old_string:'beta',new_string:'gamma'}));" if '修改测试文件' in str(messages[last]) else "console.log(await tools.write({file_path:'r8-diff.txt',content:'alpha\\nbeta\\n'}));"
   chunks=[({'role':'assistant','tool_calls':[{'index':0,'id':'fixture-'+str(last),'type':'function','function':{'name':'run_code','arguments':json.dumps({'code':code,'description':'modular release integration'})}}]},None),({},'tool_calls')]
  else:chunks=[({'role':'assistant','content':'模块化测试成功'},None),({},'stop')]
  for delta,finish in chunks:self.wfile.write(('data: '+json.dumps({'id':'mock','object':'chat.completion.chunk','created':1,'model':'deepseek_v4','choices':[{'index':0,'delta':delta,'finish_reason':finish}]},ensure_ascii=False)+'\n\n').encode())
  self.wfile.write(b'data: [DONE]\n\n')
mock=ThreadingHTTPServer(('127.0.0.1',0),Mock);threading.Thread(target=mock.serve_forever,daemon=True).start()
(ROOT/'tmp').mkdir(exist_ok=True);(ROOT/'outputs').mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(dir=ROOT/'tmp',ignore_cleanup_errors=True) as temp:
 p=Path(temp);(p/'config').mkdir();(p/'workspace').mkdir()
 (p/'config/model.enc').write_bytes(model_config.encode({'version':1,'base_url':f'http://127.0.0.1:{mock.server_port}/v1','api_key':'synthetic-only','models':['deepseek_v4'],'default_model':'deepseek_v4'}))
 (p/'patch.json').write_text(json.dumps([{'insert':[{'id':'modular-test','name':(ROOT/'scripts/test_modular_agent.mjs').as_uri()}]}]))
 env={**os.environ,'NEIWANG_APP_ROOT':str(APP),'NEIWANG_DATA_DIR':str(p),'NEIWANG_WORKSPACE_DIR':str(p/'workspace'),'NEIWANG_TEST_PATCH':str(p/'patch.json')}
 node=APP/('runtime/node/node.exe' if os.name=='nt' else 'runtime/node/bin/node')
 kwargs={'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {'start_new_session':True}
 proc=subprocess.Popen([str(node),str(ROOT/'scripts/r8/test-entry.cjs')],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,**kwargs)
 q=queue.Queue()
 def reader():
  for line in iter(proc.stdout.readline,b''):q.put(line.decode('utf8','replace'))
 threading.Thread(target=reader,daemon=True).start();buf=''
 try:
  deadline=time.time()+180;url=None
  while time.time()<deadline:
   try:buf+=q.get(timeout=1)
   except queue.Empty:
    if proc.poll() is not None:break
    continue
   found=re.search(r'http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_-]+',buf)
   if found:url=found.group();break
  assert url,'No startup URL: '+re.sub(r'token=[A-Za-z0-9_-]+','token=REDACTED',buf[-5000:])
  opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));body=opener.open(url,timeout=60).read().decode();assert '@neiwang/brand' in body
  origin=url.split('/?')[0]
  try:report=json.load(opener.open(origin+'/test-modular',timeout=180))
  except urllib.error.HTTPError as e:raise AssertionError(e.read().decode())
  assert report['status']=='PASS',report
  review=json.load(opener.open(origin+'/api/dsh-code-review?sessionId='+report['reviewSessionId'],timeout=60));assert review.get('ok'),review;assert 'gamma' in json.dumps(review) and 'beta' in json.dumps(review)
  report['checks'].append('Code review tracks additions and replacements')
  if os.environ.get('TEST_MODULAR_UI')=='1':
   ui=[str(node),str(ROOT/'scripts/test_modular_ui.cjs')] if os.name=='nt' else [str(APP/'launcher/electron/electron'),'--no-sandbox','--disable-gpu',str(ROOT/'scripts/test_modular_linux_ui.cjs')]
   ui_env={**env,'DSH_URL':url}
   if os.name!='nt':ui_env['FONTCONFIG_FILE']=str(p/'runtime/fonts.conf')
   subprocess.run(ui,cwd=ROOT,env=ui_env,check=True,timeout=180);report['checks'].append('Native desktop shell and settings verified')
  expected=json.loads((APP/'manifests/core-sha256.json').read_text());core=APP/'core/0.2.0-rc.2';assert all(hashlib.sha256((core/n).read_bytes()).hexdigest()==h for n,h in expected.items())
  report['checks'].append('Upstream core hashes unchanged')
  (ROOT/'outputs'/('R10-'+('Windows' if os.name=='nt' else 'ARM64')+'-'+('full' if FULL else 'core')+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False),flush=True)
 finally:
  while not q.empty():buf+=q.get_nowait()
  (ROOT/'outputs/R10-startup-last.txt').write_text(re.sub(r'token=[A-Za-z0-9_-]+','token=REDACTED',buf),encoding='utf8')
  if os.name=='nt':subprocess.run(['taskkill','/PID',str(proc.pid),'/T','/F'],capture_output=True)
  else:
   import signal
   os.killpg(proc.pid,signal.SIGTERM)
  proc.wait(timeout=20);mock.shutdown()
