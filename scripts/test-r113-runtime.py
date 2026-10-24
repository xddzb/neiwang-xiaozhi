from pathlib import Path
import os,sys,json,subprocess,threading,queue,re,time,urllib.request,http.cookiejar,signal
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
HERE=Path(__file__).resolve().parent;APP=Path(sys.argv[1]).resolve();WORK=Path(sys.argv[2]).resolve();WORK.mkdir(exist_ok=True)
sys.path.insert(0,str(APP/'tools'));import model_config
requests_seen=[]
class Mock(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  request=json.loads(self.rfile.read(int(self.headers['Content-Length'])));messages=request['messages'];human=[i for i,m in enumerate(messages) if m['role']=='user' and 'R113_' in str(m)];last=human[-1] if human else max(i for i,m in enumerate(messages) if m['role']=='user');text=str(messages[last]);requests_seen.append(text[-400:])
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  if request.get('tools') and 'R113_FEATURES' in text and not any(m['role']=='tool' for m in messages[last+1:]):
   code="""console.log(await tools.skill_new({goal:'1. Read register.\\n2. Produce weekly report.',name:'agent-weekly',description:'Use when producing weekly register reports',confirm:true}));console.log(await tools.skill_validate({path:"""+json.dumps(str(WORK/'data/dsh/skills/agent-weekly'))+"""}));console.log(await tools.pdf_parse({path:'text.pdf'}));console.log(await tools.schedule_create({title:'R113 one-shot',prompt:'R113_TIMER_FIRED',after_seconds:2}));"""
   chunks=[({'role':'assistant','tool_calls':[{'index':0,'id':'r113-'+str(len(requests_seen)),'type':'function','function':{'name':'run_code','arguments':json.dumps({'code':code,'description':'R113 isolated synthetic acceptance'})}}]},None),({},'tool_calls')]
  else:chunks=[({'role':'assistant','content':'R113_LOCAL_MODEL_COMPLETED'},None),({},'stop')]
  for delta,finish in chunks:self.wfile.write(('data: '+json.dumps({'id':'mock','object':'chat.completion.chunk','created':1,'model':'deepseek_v4','choices':[{'index':0,'delta':delta,'finish_reason':finish}]})+'\n\n').encode())
  self.wfile.write(b'data: [DONE]\n\n')
mock=ThreadingHTTPServer(('127.0.0.1',0),Mock);threading.Thread(target=mock.serve_forever,daemon=True).start()
data=WORK/'data';(data/'config').mkdir(parents=True,exist_ok=True);workspace=WORK/'workspace';workspace.mkdir(exist_ok=True)
(data/'config/model.enc').write_bytes(model_config.encode({'version':1,'base_url':f'http://127.0.0.1:{mock.server_port}/v1','api_key':'synthetic-test-only','models':['deepseek_v4'],'default_model':'deepseek_v4'}))
(WORK/'patch.json').write_text(json.dumps([{'insert':[{'id':'r113-test','name':(HERE/'test-r113-runtime.mjs').as_uri()}]}]))
env={**os.environ,'NEIWANG_APP_ROOT':str(APP),'NEIWANG_DATA_DIR':str(data),'NEIWANG_WORKSPACE_DIR':str(workspace),'NEIWANG_TEST_PATCH':str(WORK/'patch.json')}
node=APP/'runtime/node/bin/node';proc=None;buf=''
def start():
 global proc,buf
 proc=subprocess.Popen([str(node),str(HERE/'r113-entry.cjs')],cwd=APP,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
 q=queue.Queue();buf=''
 def reader():
  for line in iter(proc.stdout.readline,b''):q.put(line.decode('utf8','replace'))
 threading.Thread(target=reader,daemon=True).start()
 deadline=time.time()+240;url=None
 while time.time()<deadline:
  try:buf+=q.get(timeout=1)
  except queue.Empty:
   if proc.poll() is not None:break
   continue
  match=re.search(r'http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_-]+',buf)
  if match:url=match.group();break
 if not url:raise AssertionError('No startup URL: '+re.sub(r'token=[A-Za-z0-9_-]+','token=REDACTED',buf[-12000:]))
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));opener.open(url,timeout=90).read()
 return opener,url.split('/?')[0],url
def get(opener,url):
 try:return json.load(opener.open(url,timeout=240))
 except urllib.error.HTTPError as e:raise AssertionError(e.read().decode())
def stop():
 if proc and proc.poll() is None:
  os.killpg(proc.pid,signal.SIGTERM)
  try:proc.wait(timeout=20)
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
try:
 opener,origin,url=start()
 if os.environ.get('R113_UI_ONLY')=='1':report=json.loads((WORK/'runtime-result.json').read_text())['features']
 else:
  report=get(opener,origin+'/r113-test/features');print(json.dumps(report),flush=True);assert report['status']=='PASS'
  ready=get(opener,origin+'/r113-test/prepare-restart');assert ready['status']=='READY';stop();opener,origin,url=start()
 restored=get(opener,origin+'/r113-test/restored');assert restored['status']=='PASS';print(json.dumps(restored),flush=True)
 # UI probe runs against the same authenticated synthetic test Host.
 ui_env={**env,'DSH_URL':url,'FONTCONFIG_FILE':str(data/'runtime/fonts.conf'),'R113_UI_OUTPUT':str(WORK/'r113-ui.png')}
 subprocess.run(['xvfb-run','-a',str(APP/'launcher/electron/electron'),'--no-sandbox','--disable-gpu',str(HERE/'test-r113-ui.cjs')],cwd=APP,env=ui_env,check=True,timeout=240)
 result={'status':'PASS','features':report,'restart':restored,'ui':True,'model':'local synthetic fixture','nativeKylinTested':False}
 (WORK/'runtime-result.json').write_text(json.dumps(result,indent=2));print('PASS R113 actual Host, Agent tool loop, schedule delivery/restart and desktop UI',flush=True)
finally:
 stop();mock.shutdown()
