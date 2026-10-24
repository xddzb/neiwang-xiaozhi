import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BrowserController,httpURL,visibleURL,redactPasswords} from '../extensions/@neiwang/browser-automation/controller.mjs';
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
