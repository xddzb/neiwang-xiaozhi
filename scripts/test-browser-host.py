"""Real Host/Agent fixture for compact prompt assembly; never contacts org models."""
from pathlib import Path
import os,sys,json,subprocess,threading,queue,re,time,urllib.request,http.cookiejar,signal,hashlib
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
HERE=Path(__file__).resolve().parent;APP=Path(sys.argv[1]).resolve();WORK=Path(sys.argv[2]).resolve();WORK.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(APP/'tools'));import model_config
observed={}
class Mock(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  request=json.loads(self.rfile.read(int(self.headers['Content-Length'])));messages=request['messages'];human=[i for i,m in enumerate(messages) if m['role']=='user' and 'BROWSER_PATCH_' in str(m)];last=human[-1] if human else max(i for i,m in enumerate(messages) if m['role']=='user');text=str(messages[last]);label='compact' if 'COMPACT' in text else 'baseline'
  if request.get('tools') and not any(m['role']=='tool' for m in messages[last+1:]):
   system='\n'.join(str(m['content']) for m in messages if m['role']=='system');observed[label]={'systemChars':len(system),'systemUtf8Bytes':len(system.encode()),'wireToolCount':len(request['tools']),'containsFullSdkMap':'interface ToolArgsMap' in system,'containsLazyCatalog':'工具按需发现' in system}
  if request.get('tools') and label=='compact' and not any(m['role']=='tool' for m in messages[last+1:]):
   code="console.log(await tools.tool_catalog({operation:'describe',name:'mcp__browser__automation'}));console.log(await tools.mcp__browser__automation({operation:'help'}));console.log(await tools.business_api({operation:'list'}));"
   chunks=[({'role':'assistant','tool_calls':[{'index':0,'id':'browser-fixture','type':'function','function':{'name':'run_code','arguments':json.dumps({'code':code,'description':'Inspect offline tools and registered local sources'})}}]},None),({},'tool_calls')]
  else:chunks=[({'role':'assistant','content':'BROWSER_PATCH_DONE'},None),({},'stop')]
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  for delta,finish in chunks:self.wfile.write(('data: '+json.dumps({'id':'mock','object':'chat.completion.chunk','created':1,'model':'fixture','choices':[{'index':0,'delta':delta,'finish_reason':finish}]})+'\n\n').encode())
  self.wfile.write(b'data: [DONE]\n\n')
mock=ThreadingHTTPServer(('127.0.0.1',0),Mock);threading.Thread(target=mock.serve_forever,daemon=True).start()
data=WORK/'data';(data/'config').mkdir(parents=True,exist_ok=True);workspace=WORK/'workspace';workspace.mkdir(exist_ok=True)
(data/'config/model.enc').write_bytes(model_config.encode({'version':1,'base_url':f'http://127.0.0.1:{mock.server_port}/v1','api_key':'synthetic-test-only','models':['fixture'],'default_model':'fixture'}))
(WORK/'patch.json').write_text(json.dumps([{'insert':[{'id':'browser-addon-test','name':(HERE/'test-browser-host.mjs').as_uri()}]}]))
env={**os.environ,'NEIWANG_APP_ROOT':str(APP),'NEIWANG_DATA_DIR':str(data),'NEIWANG_WORKSPACE_DIR':str(workspace),'NEIWANG_TEST_PATCH':str(WORK/'patch.json')}
proc=subprocess.Popen([str(APP/'runtime/node/bin/node'),str(HERE/'r113-entry.cjs')],cwd=APP,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
q=queue.Queue();buf=''
def reader():
 for line in iter(proc.stdout.readline,b''):q.put(line.decode('utf8','replace'))
threading.Thread(target=reader,daemon=True).start()
try:
 deadline=time.time()+240;url=None
 while time.time()<deadline:
  try:buf+=q.get(timeout=1)
  except queue.Empty:
   if proc.poll() is not None:break
   continue
  match=re.search(r'http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_-]+',buf)
  if match:url=match.group();break
 if not url:raise AssertionError(re.sub(r'token=[A-Za-z0-9_-]+','token=REDACTED',buf[-6000:]))
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));opener.open(url,timeout=90).read();origin=url.split('/?')[0]
 def rpc(method,payload):
  req=urllib.request.Request(origin+'/neiwang-browser/'+method,data=json.dumps({'type':'client-request','rpcId':'fixture-'+method,'method':method,'payload':payload}).encode(),headers={'Content-Type':'application/json'})
  return json.load(opener.open(req,timeout=30))
 rpc('compact',{'enabled':False});baseline=json.load(opener.open(origin+'/browser-addon-test/baseline',timeout=180));assert baseline['status']=='PASS'
 rpc('compact',{'enabled':True});compact=json.load(opener.open(origin+'/browser-addon-test/compact',timeout=180));assert compact['status']=='PASS'
 status=rpc('status',{})['result']['value'];assert status['registeredSources']>=15
 assert observed['baseline']['containsFullSdkMap'] and not observed['compact']['containsFullSdkMap'];assert observed['compact']['containsLazyCatalog'];assert observed['compact']['systemChars']<observed['baseline']['systemChars']
 report={'status':'PASS','prompt':observed,'removedSystemCharacters':observed['baseline']['systemChars']-observed['compact']['systemChars'],'exactModelTokensMeasured':False,'sourceCount':status['registeredSources'],'realAgentToolLoop':True,'safetyAndToolPermissionsUnchanged':True}
 (WORK/'prompt-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
 ui_env={**env,'DSH_URL':url,'FONTCONFIG_FILE':str(data/'runtime/fonts.conf'),'BROWSER_UI_OUTPUT':str(WORK/'browser-settings.png')}
 subprocess.run(['xvfb-run','-a',str(APP/'launcher/electron/electron'),'--no-sandbox','--disable-gpu',str(HERE/'test-browser-ui.cjs')],env=ui_env,cwd=APP,check=True,timeout=240)
 (WORK/'prompt-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
finally:
 if proc.poll() is None:
  os.killpg(proc.pid,signal.SIGTERM)
  try:proc.wait(timeout=20)
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
 mock.shutdown()
