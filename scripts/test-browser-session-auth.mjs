import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
const app=process.env.NEIWANG_TEST_APP;
const moduleURL=name=>app?pathToFileURL(join(app,'extensions/node_modules/@neiwang/browser-automation',name)):new URL('../extensions/@neiwang/browser-automation/'+name,import.meta.url);
const {SessionAuth}=await import(moduleURL('session-auth.mjs'));
// Synthetic, preinstalled interface documents; not a production registration API.
async function fixtureAPI(root,args){
 const folder=join(root,'extensions/apis');for(const name of ['sources','connections'])await fs.mkdir(join(folder,name),{recursive:true});
 await fs.writeFile(join(folder,'connections',args.connection+'.json'),JSON.stringify({base_url:args.base_url,auth_mode:'none',header:'Authorization',token:'',browser_session:{driver:'playwright',allowed_origins:[args.base_url],auth_headers:args.auth_headers||[]}}));
 await fs.writeFile(join(folder,'sources',args.source+'.json'),JSON.stringify({...args.definition,connection:args.connection,enabled:true,read_only:true}));
}
const {BrowserController}=await import(moduleURL('controller.mjs'));
const exec=promisify(execFile);
const registration=(base,extras={})=>({source:'fixture',connection:'fixture',base_url:base,document:'Synthetic API document',read_only:true,definition:{path:'/query',method:'GET',description:'Synthetic records',parameters:{},response_type:'json'},...extras});

test('browser rejects automatic registration without launching or writing configuration',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-no-register-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const controller=new BrowserController({root});controller.start=async()=>{throw Error('must not launch')};
 assert.equal(Object.hasOwn((await controller.run('help')).operations,'register_api'),false);
 await assert.rejects(controller.run('register_api',registration('https://example.invalid')),/Unknown browser operation/);
 await assert.rejects(fs.access(join(root,'extensions/apis')));
});

test('auth is scoped to registered queries and refreshes from storage without exposing values',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-auth-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const base='https://example.invalid';await fixtureAPI(root,registration(base,{auth_headers:[{header:'Authorization',source:'localStorage',key:'login',json_path:['access'],prefix:'Bearer '}]}));
 const auth=new SessionAuth(root);let token='synthetic-one';
 const context={cookies:async()=>[{name:'session',value:'synthetic-cookie'}],pages:()=>[{url:()=>base, evaluate:async()=>JSON.stringify({access:token})}]};
 assert.equal((await auth.headers(context,'fixture',base+'/query')).authorization,'Bearer synthetic-one');
 token='synthetic-two';assert.equal((await auth.headers(context,'fixture',base+'/query')).authorization,'Bearer synthetic-two');
 await assert.rejects(auth.headers(context,'fixture',base+'/other'),/endpoint/);
 await assert.rejects(auth.headers(context,'fixture','https://unregistered.invalid/query'),/origin/);
 const ambiguous={...context,pages:()=>[...context.pages(),{url:()=>base,evaluate:async()=>'other-account'}]};
 await assert.rejects(auth.headers(ambiguous,'fixture',base+'/query'),/ambiguous/);
 token='';await assert.rejects(auth.headers(context,'fixture',base+'/query'),/login_required/);
});

test('sessionStorage and CSRF cookies are read fresh; newline injection fails closed',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-csrf-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const base='https://example.invalid';await fixtureAPI(root,registration(base,{auth_headers:[
  {header:'X-Auth-Token',source:'sessionStorage',key:'access'},
  {header:'X-XSRF-Token',source:'cookie',key:'XSRF-TOKEN',decode_uri:true}
 ]}));
 let csrf='synthetic%2Bcsrf';const context={cookies:async()=>[{name:'XSRF-TOKEN',value:csrf}],pages:()=>[{url:()=>base,evaluate:async (_callback,args)=>{assert.equal(args.source,'sessionStorage');assert.equal(args.key,'access');return 'synthetic-session-token'}}]};
 const auth=new SessionAuth(root),headers=await auth.headers(context,'fixture',base+'/query');assert.equal(headers['x-auth-token'],'synthetic-session-token');assert.equal(headers['x-xsrf-token'],'synthetic+csrf');
 csrf='value%0D%0AInjected';await assert.rejects(auth.headers(context,'fixture',base+'/query'),/invalid_auth_value/);
});

test('cookie-only reuse needs no page request observer or response cache',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-cookie-only-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const base='https://example.invalid';await fixtureAPI(root,registration(base));const auth=new SessionAuth(root);
 assert.equal(auth.attach,undefined);assert.equal(auth.observe,undefined);assert.equal(auth.observed,undefined);
 assert.deepEqual(await auth.headers({cookies:async()=>[{name:'session',value:'synthetic'}]},'fixture',base+'/query'),{cookie:'session=synthetic'});
 await assert.rejects(auth.headers({cookies:async()=>[]},'fixture',base+'/query'),/login_required/);
});

test('real Electron login -> Python query, rotation, POST, 401 and redirect boundaries',{skip:!process.env.NEIWANG_TEST_ELECTRON,timeout:120000},async()=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-session-e2e-')),controller=new BrowserController({root,electron:process.env.NEIWANG_TEST_ELECTRON,extraArgs:process.platform==='linux'?['--no-sandbox','--disable-gpu']:[]});
 let token='synthetic-one',denied=false,queryHits=0,leaks=0;
 const server=createServer((req,res)=>{
  if(req.url==='/login'){res.setHeader('Set-Cookie','session=synthetic-cookie; HttpOnly; Path=/');res.setHeader('Content-Type','text/html');res.end('<html><body>Logged in<script>localStorage.setItem("login",JSON.stringify({access:"synthetic-one"}));</script></body></html>');return}
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/leak'});res.end();return}
  if(req.url==='/leak'){leaks++;res.end('{}');return}
  queryHits++;const good=!denied&&req.headers.cookie?.includes('session=synthetic-cookie')&&req.headers.authorization==='Bearer '+token;
  res.writeHead(good?200:401,{'Content-Type':'application/json'});res.end(good?'[{"id":7,"value":42}]':'{"error":"expired"}');
 });
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const auth_headers=[{header:'Authorization',source:'localStorage',key:'login',json_path:['access'],prefix:'Bearer '}];
  await fixtureAPI(root,registration(base,{auth_headers}));
  for(const dir of ['tools','workspace','extensions/node_modules/@neiwang/browser-automation'])await fs.mkdir(join(root,dir),{recursive:true});
  for(const name of ['api_tool.py','browser_session.py'])await fs.copyFile(app?join(app,'tools',name):new URL('../tools/'+name,import.meta.url),join(root,'tools',name));
  await fs.copyFile(moduleURL('session_adapter.py'),join(root,'extensions/node_modules/@neiwang/browser-automation/session_adapter.py'));
  await controller.listen();await controller.run('open',{url:base+'/login'});
  const page=controller.browser.contexts()[0].pages()[0];await page.waitForFunction(()=>!!localStorage.getItem('login'));
  async function query(output,source='fixture',operation='query'){
   const result=await exec(process.env.NEIWANG_TEST_PYTHON||'python',[join(root,'tools/api_tool.py'),operation,'--source',source,'--workspace',join(root,'workspace'),'--output',output],{env:{...process.env,NEIWANG_APP_ROOT:root,NEIWANG_DATA_DIR:join(root,'data')},windowsHide:true});
   assert(!/synthetic-one|synthetic-two|synthetic-cookie|Bearer /.test(result.stdout+result.stderr));return JSON.parse(result.stdout);
  }
  assert.equal((await query('check.json','fixture','session-check')).status,'session_readable');assert.equal(queryHits,0);
  assert.equal((await query('first.json')).ok,true);assert.deepEqual(JSON.parse(await fs.readFile(join(root,'workspace/first.json'),'utf8')),[{id:7,value:42}]);
  token='synthetic-two';await page.evaluate(()=>localStorage.setItem('login',JSON.stringify({access:'synthetic-two'})));
  assert.equal((await query('second.json')).ok,true);
  await fixtureAPI(root,registration(base,{source:'post',auth_headers,definition:{path:'/query',method:'POST',parameters:{},response_type:'json'}}));assert.equal((await query('post.json','post')).ok,true);
  denied=true;const before=queryHits;assert.equal((await query('expired.json')).status,'browser_login_or_permission_required');assert.equal(queryHits,before+1);
  await assert.rejects(fs.access(join(root,'workspace/expired.json')));denied=false;
  await fixtureAPI(root,registration(base,{source:'redirect',auth_headers,definition:{path:'/redirect',method:'GET',parameters:{},response_type:'json'}}));
  assert.equal((await query('redirect.json','redirect')).http_status,302);assert.equal(leaks,0);
  const runtime=JSON.parse(await fs.readFile(controller.runtime,'utf8'));
  const bridge='http://127.0.0.1:'+runtime.port+'/session-headers';
  const body=JSON.stringify({connection:'fixture',url:base+'/query'});
  assert.equal((await fetch(bridge,{method:'POST',body})).status,403);
  assert.equal((await fetch(bridge,{method:'POST',body,headers:{Authorization:'Bearer '+runtime.token,Origin:base}})).status,403);
  assert.equal((await fetch(bridge,{method:'POST',body:JSON.stringify({connection:'fixture',url:base+'/leak'}),headers:{Authorization:'Bearer '+runtime.token}})).status,409);
 }finally{await controller.dispose();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true})}
});
