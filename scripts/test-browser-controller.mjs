import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {BrowserController,httpURL,visibleURL,redactPasswords,parseToolArguments} from '../extensions/@neiwang/browser-automation/controller.mjs';

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
 const root=await fs.mkdtemp(join(tmpdir(),'nw-spa-')),controller=new BrowserController({root,electron:process.env.NEIWANG_TEST_ELECTRON});
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>Local SPA fixture</title></head><body><script>setTimeout(()=>{if(!location.hash)location.hash="/homeIndex";document.body.innerHTML="<button>SYNTHETIC_SPA_READY</button>"},400)</script></body></html>')});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const direct=await controller.run('open',parseToolArguments({operation:'open',arguments_json:JSON.stringify({url:base+'/#/homeIndex'})}));
  assert.equal(direct.url,base+'/#/homeIndex');assert.equal(direct.loadState,'domcontentloaded');assert.match(direct.notice,/SPA/);
  const page=controller.browser.contexts()[0].pages()[0];await page.getByRole('button',{name:'SYNTHETIC_SPA_READY'}).waitFor();
  assert.match((await controller.run('snapshot')).snapshot,/SYNTHETIC_SPA_READY/);
  await controller.run('open',{url:base+'/'});await page.getByRole('button',{name:'SYNTHETIC_SPA_READY'}).waitFor();
  assert.equal(page.url(),base+'/#/homeIndex');assert.match((await controller.run('snapshot')).snapshot,/SYNTHETIC_SPA_READY/);
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
