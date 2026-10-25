"""R11.5 live synthetic Agent, timer delivery and cold restart on both platforms."""
from pathlib import Path
import os,sys,json,subprocess,threading,queue,re,time,urllib.request,http.cookiejar,signal
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
HERE=Path(__file__).resolve().parent;APP=Path(sys.argv[1]).resolve();WORK=Path(sys.argv[2]).resolve();WORK.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(APP/'tools'));import model_config
requests_seen=[]
class Mock(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  request=json.loads(self.rfile.read(int(self.headers['Content-Length'])));messages=request['messages'];human=[i for i,m in enumerate(messages) if m['role']=='user' and 'R115_' in str(m)];last=human[-1] if human else max(i for i,m in enumerate(messages) if m['role']=='user');text=str(messages[last]);requests_seen.append(text[-400:])
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  if request.get('tools') and 'R115_FEATURES' in text and not any(m['role']=='tool' for m in messages[last+1:]):
   code="""console.log(await tools.skill_new({goal:'1. Read register.\\n2. Produce weekly report.',name:'agent-weekly',description:'Use when producing weekly register reports',confirm:true}));console.log(await tools.skill_validate({path:"""+json.dumps(str(WORK/'data/dsh/skills/agent-weekly'))+"""}));console.log(await tools.schedule_create({title:'R115 one-shot',prompt:'R115_TIMER_FIRED',after_seconds:2}));"""
   chunks=[({'role':'assistant','tool_calls':[{'index':0,'id':'r113-'+str(len(requests_seen)),'type':'function','function':{'name':'run_code','arguments':json.dumps({'code':code,'description':'R115 isolated synthetic acceptance'})}}]},None),({},'tool_calls')]
  else:chunks=[({'role':'assistant','content':'R115_LOCAL_MODEL_COMPLETED'},None),({},'stop')]
  for delta,finish in chunks:self.wfile.write(('data: '+json.dumps({'id':'mock','object':'chat.completion.chunk','created':1,'model':'deepseek_v4','choices':[{'index':0,'delta':delta,'finish_reason':finish}]})+'\n\n').encode())
  self.wfile.write(b'data: [DONE]\n\n')
mock=ThreadingHTTPServer(('127.0.0.1',0),Mock);threading.Thread(target=mock.serve_forever,daemon=True).start()
data=WORK/'data';(data/'config').mkdir(parents=True,exist_ok=True);workspace=WORK/'workspace';workspace.mkdir(exist_ok=True)
(data/'config/model.enc').write_bytes(model_config.encode({'version':1,'base_url':f'http://127.0.0.1:{mock.server_port}/v1','api_key':'synthetic-test-only','models':['deepseek_v4'],'default_model':'deepseek_v4'}))
(data/'config/.local-key').write_bytes(model_config.KEY)
(WORK/'patch.json').write_text(json.dumps([{'insert':[{'id':'r115-test','name':(HERE/'test-r115-runtime.mjs').as_uri()}]}]))
env={**os.environ,'NEIWANG_APP_ROOT':str(APP),'NEIWANG_DATA_DIR':str(data),'NEIWANG_WORKSPACE_DIR':str(workspace),'NEIWANG_TEST_PATCH':str(WORK/'patch.json')}
node=APP/('runtime/node/node.exe' if os.name=='nt' else 'runtime/node/bin/node');proc=None;buf=''
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
  if os.name=='nt':subprocess.run(['taskkill','/PID',str(proc.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  else:os.killpg(proc.pid,signal.SIGTERM)
  try:proc.wait(timeout=20)
  except subprocess.TimeoutExpired:
   if os.name=='nt':proc.kill()
   else:os.killpg(proc.pid,signal.SIGKILL)
   proc.wait()
try:
 opener,origin,url=start()
 if os.environ.get('R115_UI_ONLY')=='1':report=json.loads((WORK/'runtime-result.json').read_text())['features']
 else:
  report=get(opener,origin+'/r115-test/features');print(json.dumps(report),flush=True);assert report['status']=='PASS'
  ready=get(opener,origin+'/r115-test/prepare-restart');assert ready['status']=='READY';stop();opener,origin,url=start()
 restored=get(opener,origin+'/r115-test/restored');assert restored['status']=='PASS';print(json.dumps(restored),flush=True)
 result={'status':'PASS','version':json.loads((APP/'config/app.json').read_text(encoding='utf8'))['version'],'features':report,'restart':restored,'model':'local synthetic fixture','nativeKylinTested':False}
 (WORK/'runtime-result.json').write_text(json.dumps(result,indent=2));print('PASS R11.5 actual Agent, skills, timer delivery and restart recovery',flush=True)
finally:
 stop();mock.shutdown()
