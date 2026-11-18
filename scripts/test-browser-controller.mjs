import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
const {BrowserController,httpURL,visibleURL,redactPasswords,parseToolArguments}=await import(process.env.NEIWANG_TEST_APP?pathToFileURL(join(process.env.NEIWANG_TEST_APP,'extensions/node_modules/@neiwang/browser-automation/controller.mjs')):new URL('../extensions/@neiwang/browser-automation/controller.mjs',import.meta.url));

test('browser URL validation explains missing inputs and preserves valid hash routes',()=>{
 for(const value of [undefined,null,0,{},[],true,'','   '])assert.throws(()=>httpURL(value),/Missing url parameter.*arguments_json/);
 assert.equal(httpURL(' https://example.invalid/#/homeIndex ').href,'https://example.invalid/#/homeIndex');
 const secret='synthetic-private-value';assert.throws(()=>httpURL('invalid '+secret),error=>/Invalid url parameter/.test(error.message)&&!error.message.includes(secret));
});

test('tool envelope rejects ignored top-level fields, bad JSON and non-object parameters',()=>{
 for(const args of [{operation:'open',url:'https://example.invalid/'},{operation:'open',arguments_json:'{}',url:'https://example.invalid/'}])assert.throws(()=>parseToolArguments(args),/Unknown top-level.*url.*arguments_json/);
 for(const arguments_json of [[],{},null,7,'null','[]','true','"url"','{broken'])assert.throws(()=>parseToolArguments({operation:'open',arguments_json}),/Invalid arguments_json/);
 const url='https://example.invalid/#/homeIndex';assert.deepEqual(parseToolArguments({operation:'open',arguments_json:JSON.stringify({url})}),{url});
 assert.deepEqual(parseToolArguments({operation:'help'}),{});
 assert.throws(()=>parseToolArguments({operation:'open',arguments_json:'{"synthetic-private-value":'}),error=>!error.message.includes('synthetic-private-value'));
});

test('missing URL is rejected before launching a browser',async()=>{
 const controller=new BrowserController({root:tmpdir()});let started=false;
 controller.start=async()=>{started=true;throw Error('should not launch')};
 await assert.rejects(controller.run('open',parseToolArguments({operation:'open',arguments_json:'{}'})),/Missing url parameter/);
 assert.equal(started,false);
 assert.match((await controller.run('help')).notice,/arguments_json/);
});

test('real Electron browser preserves hash and snapshots a delayed SPA',{skip:!process.env.NEIWANG_TEST_ELECTRON},async()=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-spa-')),controller=new BrowserController({root,electron:process.env.NEIWANG_TEST_ELECTRON,extraArgs:JSON.parse(process.env.NEIWANG_TEST_ELECTRON_ARGS||'[]')});
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>Local SPA fixture</title></head><body><script>setTimeout(()=>{if(!location.hash)location.hash="/homeIndex";document.body.innerHTML="<button>SYNTHETIC_SPA_READY</button>"},400)</script></body></html>')});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const direct=await controller.run('open',parseToolArguments({operation:'open',arguments_json:JSON.stringify({url:base+'/#/homeIndex'})}));
  assert.equal(direct.url,base+'/#/homeIndex');assert.equal(direct.loadState,'domcontentloaded');assert.match(direct.notice,/SPA/);
  const page=controller.browser.contexts()[0].pages().find(p=>!p.url().includes('/browser-toolbar.html')&&!/^(devtools|chrome-devtools):/.test(p.url()));await page.getByRole('button',{name:'SYNTHETIC_SPA_READY'}).waitFor();
  assert.match((await controller.run('snapshot')).snapshot,/SYNTHETIC_SPA_READY/);
  await controller.run('open',{url:base+'/'});await page.getByRole('button',{name:'SYNTHETIC_SPA_READY'}).waitFor();
  assert.equal(page.url(),base+'/#/homeIndex');assert.match((await controller.run('snapshot')).snapshot,/SYNTHETIC_SPA_READY/);
 }finally{await controller.dispose();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true})}
});
test('browser toolbar exposes address, multiple pages and active-page DevTools',{skip:!process.env.NEIWANG_TEST_ELECTRON},async()=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-ui-')),controller=new BrowserController({root,electron:process.env.NEIWANG_TEST_ELECTRON,extraArgs:JSON.parse(process.env.NEIWANG_TEST_ELECTRON_ARGS||'[]')});
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>'+req.url+'</title><body>fixture</body>')});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  await controller.run('open',{url:base+'/first#/route'});const context=controller.browser.contexts()[0],toolbar=context.pages().find(p=>p.url().includes('/browser-toolbar.html')),first=context.pages().find(p=>p.url().startsWith(base));
  await toolbar.waitForFunction(url=>document.querySelector('#address').value===url,base+'/first#/route');
  assert.equal(await first.evaluate(()=>typeof window.businessBrowser),'undefined');
  await toolbar.locator('#new-tab').click();await toolbar.waitForFunction(()=>document.querySelectorAll('[role=tab]').length===2);
  for(let i=0;i<100&&!context.pages().some(p=>p.url().endsWith('/home.html'));i++)await new Promise(r=>setTimeout(r,50));
  const added=context.pages().find(p=>p.url().endsWith('/home.html'));await added.waitForLoadState('load');
  await toolbar.locator('#address').fill(base+'/second');await toolbar.locator('#address').press('Enter');
  await toolbar.waitForFunction(url=>document.querySelector('#address').value===url,base+'/second');
  for(let i=0;i<100&&!context.pages().some(p=>p.url()===base+'/second');i++)await new Promise(r=>setTimeout(r,50));
  assert.equal((await controller.run('tabs')).tabs.length,2);
  await toolbar.getByRole('tab',{name:'/first',exact:false}).click();
  await toolbar.waitForFunction(url=>document.querySelector('#address').value===url,base+'/first#/route');
  await toolbar.locator('#devtools').click();await toolbar.waitForFunction(()=>document.querySelector('#devtools').getAttribute('aria-pressed')==='true',null,{timeout:90000,polling:100});
  for(let i=0;i<100&&!context.pages().some(p=>p.url().includes('/devtools/inspector.html'));i++)await new Promise(r=>setTimeout(r,100));
  const inspector=context.pages().find(p=>p.url().includes('/devtools/inspector.html'));assert(inspector);await inspector.getByRole('tab',{name:/Network|网络/}).waitFor({timeout:60000});
  assert.equal((await controller.run('tabs')).tabs.length,2);
  await toolbar.locator('#devtools').click();await toolbar.waitForFunction(()=>document.querySelector('#devtools').getAttribute('aria-pressed')==='false',null,{polling:100});
  await toolbar.locator('#address').fill('file:///private');await toolbar.locator('#address').press('Enter');assert.match(await toolbar.locator('#error').textContent(),/http/);assert.equal(first.url(),base+'/first#/route');
  await toolbar.getByRole('button',{name:'关闭 /second',exact:true}).click();await toolbar.waitForFunction(()=>document.querySelectorAll('[role=tab]').length===1);
  await controller.run('new',{url:base+'/third'});assert.equal((await controller.run('tabs')).tabs.length,2);
 }finally{await controller.dispose();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true})}
});

test('password values are redacted from accessibility snapshots',()=>{assert.equal(redactPasswords('- textbox: synthetic-password',['synthetic-password']),'- textbox: [密码已隐藏]')});
test('escaped password forms are also redacted',()=>{const password='a"b\\c';assert.equal(redactPasswords(JSON.stringify(password).slice(1,-1),[password]),'[密码已隐藏]')});
test('browser URLs reject local protocols and mask login tokens',()=>{assert.throws(()=>httpURL('file:///private'));assert.throws(()=>httpURL('https://user:pass@example.invalid'));assert(!visibleURL('https://example.invalid/?token=synthetic&objectId=123').includes('synthetic'));assert(visibleURL('https://example.invalid/?objectId=123').includes('objectId=123'))});
test('private session bridge requires bearer, denies browser-origin requests and unregistered sites',async()=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-session-'));const controller=new BrowserController({root});
 try{await fs.mkdir(join(root,'extensions/apis/connections'),{recursive:true});await fs.writeFile(join(root,'extensions/apis/connections/fixture.json'),JSON.stringify({base_url:'https://business.example.invalid',browser_session:{driver:'playwright',allowed_origins:['https://business.example.invalid']}}));controller.browser={isConnected:()=>true,contexts:()=>[{cookies:async()=>[{name:'fixture',value:'synthetic-only'}]}],close:async()=>{}};await controller.listen();
  const r=JSON.parse(await fs.readFile(controller.runtime,'utf8')),url='http://127.0.0.1:'+r.port+'/session-cookie',body=JSON.stringify({url:'https://business.example.invalid/query'});
  assert.equal((await fetch(url,{method:'POST',body})).status,403);
  assert.equal((await fetch(url,{method:'POST',body,headers:{Authorization:'Bearer '+r.token,Origin:'https://business.example.invalid'}})).status,403);
  const reply=await fetch(url,{method:'POST',body,headers:{Authorization:'Bearer '+r.token}});assert.equal(reply.status,200);assert.equal((await reply.json()).cookie,'fixture=synthetic-only');
  assert.equal((await fetch(url,{method:'POST',body:JSON.stringify({url:'https://other.example.invalid'}),headers:{Authorization:'Bearer '+r.token}})).status,409);
 }finally{await controller.dispose();await fs.rm(root,{recursive:true,force:true})}
});
