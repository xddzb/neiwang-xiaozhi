import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer,get as httpsGet} from 'node:https';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const app=process.env.NEIWANG_TEST_APP;
const moduleURL=name=>app?pathToFileURL(join(app,'extensions/node_modules/@neiwang/browser-automation',name)):new URL('../extensions/@neiwang/browser-automation/'+name,import.meta.url);
const {IsuSession,normalizeToken}=await import(moduleURL('isu-session.mjs'));
const {BrowserController}=await import(moduleURL('controller.mjs'));
const {default:isu}=await import(app?pathToFileURL(join(app,'extensions/node_modules/@deepseek-ai/neiwang-business/isu-instruments.cjs')):new URL('../extensions/@deepseek-ai/neiwang-business/isu-instruments.cjs',import.meta.url));
const exec=promisify(execFile),route='/opgview/socket.io/';
const token=(id,exp=Date.now()/1000+3600)=>Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({SID:id,exp})).toString('base64url')+'.c3ludGhldGlj';
const socketURL=(base,t)=>base+route+'?token='+encodeURIComponent(t)+'&EIO=3&transport=polling';
async function fixture(root,base){
 for(const part of ['sources','connections'])await fs.mkdir(join(root,'extensions/apis',part),{recursive:true});
 await fs.writeFile(join(root,'extensions/apis/sources/isu-instruments.json'),JSON.stringify({enabled:true,read_only:true,transport:'isu-engineio3'}));
 await fs.writeFile(join(root,'extensions/apis/connections/weekly-isu.json'),JSON.stringify({base_url:base,verify_tls:false,browser_session:{driver:'playwright',allowed_origins:[base]}}));
}
test('ISU scope, token rotation, cookie binding, ambiguity and invalidation',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-isu-unit-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const base='https://isu.example.invalid';await fixture(root,base);const session=new IsuSession(root),page={url:()=>base+'/opgview/dataView'},second={url:page.url};let sid='synthetic-page';
 const context={cookies:async()=>[{name:'OPGview8088',value:'synthetic-base'},{name:'sid',value:sid}]};
 for(const url of [socketURL('https://other.example.invalid',token('x')),socketURL(base,token('x')).replace(route,'/other'),socketURL(base,token('x')).replace('EIO=3','EIO=4')])await session.observe(url,page,context);
 await assert.rejects(session.credentials(context),/token_pending/);
 const one=token('one'),two=token('two');await session.observe(socketURL(base,'opgview-'+one),page,context);assert.equal((await session.credentials(context)).token,one);
 await session.observe(socketURL(base,two),page,context);assert.equal((await session.credentials(context)).token,two);
 await session.observe(socketURL(base,one),second,context);await assert.rejects(session.credentials(context),/ambiguous/);session.records.delete(second);
 sid='new-page';await assert.rejects(session.credentials(context),/token_pending/);await session.observe(socketURL(base,two),page,context);
 session.invalidate(two);await session.observe(socketURL(base,two),page,context);await assert.rejects(session.credentials(context),/token_pending/);
 assert.throws(()=>normalizeToken(token('expired',1)),/expired/);assert.throws(()=>normalizeToken('not-a-token'),/invalid/);
 await session.observe(socketURL(base,one).replace('https:','wss:'),page,context);assert.equal((await session.credentials(context)).token,one);
});
test('real browser ISU capture feeds Engine.IO query without credential files',{skip:!process.env.NEIWANG_TEST_ELECTRON,timeout:180000},async()=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-isu-real-')),workspace=join(root,'workspace');await fs.mkdir(workspace);
 const oldData=process.env.NEIWANG_DATA_DIR;process.env.NEIWANG_DATA_DIR=join(root,'data');
 const controller=new BrowserController({root,electron:process.env.NEIWANG_TEST_ELECTRON,extraArgs:process.platform==='linux'?['--no-sandbox','--disable-gpu']:[]});
 let server,current=token('first'),denied=false,issueToken=true,queryHits=0;const frame=s=>s.length+':'+s,pending=new Map();
 try{
  await exec(process.env.NEIWANG_TEST_OPENSSL||'openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-keyout',join(root,'key.pem'),'-out',join(root,'cert.pem')]);
  server=createServer({key:await fs.readFile(join(root,'key.pem')),cert:await fs.readFile(join(root,'cert.pem'))},(req,res)=>{
   const u=new URL(req.url,'https://localhost');
   if(u.pathname==='/login'){
    res.setHeader('Set-Cookie',['OPGview8088=synthetic-base; HttpOnly; Secure; Path=/','sid=synthetic-page; HttpOnly; Secure; Path=/']);res.setHeader('Content-Type','text/html');
    if(!issueToken){res.end('<html><body>No connection</body></html>');return}
    res.end('<html><body>ISU fixture</body><script>fetch('+JSON.stringify(route+'?token=opgview-'+current+'&EIO=3&transport=polling')+').then(()=>document.body.textContent="READY")</script></html>');return;
   }
   if(u.pathname!==route){res.writeHead(404);res.end();return}
   const supplied=u.searchParams.get('token')?.replace(/^opgview-/,'');
   if((denied&&!req.headers['user-agent'])||supplied!==current||!req.headers.cookie?.includes('OPGview8088=synthetic-base')||!req.headers.cookie?.includes('sid=synthetic-page')){res.writeHead(401);res.end('expired');return}
   if(!u.searchParams.has('sid')){const sid='socket-'+pending.size;pending.set(sid,[]);res.end(frame('0'+JSON.stringify({sid,pingInterval:25000})));return}
   const queue=pending.get(u.searchParams.get('sid'));
   if(!queue){res.writeHead(400);res.end();return}
   if(req.method==='GET'){res.end(queue.splice(0).map(frame).join('')||frame('3'));return}
   let body='';req.on('data',b=>body+=b);req.on('end',()=>{const packet=isu.frames(body)[0];if(packet==='40')queue.push('40');if(packet.startsWith('42')){const [event,params]=JSON.parse(packet.slice(2));assert.equal(event,'dataView/getPointInfo');queryHits++;queue.push('42'+JSON.stringify(['dataView/getPointInfoCB',{total:1,rows:[{PN:params.pointName,GN:'fixture',AV:42,EU:'C',DS:0,TM:123}]}]))}res.end('ok')});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='https://127.0.0.1:'+server.address().port;await fixture(root,base);
  await controller.listen();await controller.run('open',{url:base+'/login'});const page=controller.browser.contexts()[0].pages().find(p=>!p.url().includes('/browser-toolbar.html')&&!/^(devtools|chrome-devtools):/.test(p.url()));await page.getByText('READY',{exact:true}).waitFor();
  // A self-signed ISU page is allowed, but neither Node defaults nor other browser origins inherit the exception.
  await assert.rejects(new Promise((resolve,reject)=>{const req=httpsGet(base+'/login',res=>{res.resume();resolve()});req.on('error',reject)}),e=>/CERT|SELF_SIGNED|VERIFY/.test(e.code));
  const captured=await controller.isuSession.credentials(controller.browser.contexts()[0]);
  const strict=new isu.Client({...captured,verify_tls:true});try{await assert.rejects(strict.connect(),/certificate_error/)}finally{strict.close()}
  const defaults=new isu.Client({...captured,verify_tls:undefined});try{await defaults.connect()}finally{defaults.close()}
  const other=createServer({key:await fs.readFile(join(root,'key.pem')),cert:await fs.readFile(join(root,'cert.pem'))},(_req,res)=>res.end('OTHER SITE'));
  await new Promise(r=>other.listen(0,'127.0.0.1',r));
  try{await assert.rejects(controller.run('new',{url:'https://127.0.0.1:'+other.address().port+'/'}),/ERR_CERT/)}finally{await new Promise(r=>other.close(r))}
  const run=output=>isu.execute({operation:'query',params_json:'{"points":["TEST.POINT"]}',output},{signal:new AbortController().signal},root,workspace);
  const first=await run('first.json');assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.results[0].rows[0].AV,42);assert.equal(queryHits,1);assert(!JSON.stringify(first).includes(current));
  await assert.rejects(fs.access(join(root,'data/config/isu-instruments.json')));
  assert.equal(first.session_refresh.action,'reloaded');assert.equal(first.session_refresh.token_changed,false);
  current=token('rotated');const second=await run('second.json');assert.equal(second.ok,true,JSON.stringify(second));assert.equal(second.session_refresh.token_changed,true);
  await page.goto('about:blank');current=token('new-tab');const third=await run('third.json');assert.equal(third.ok,true,JSON.stringify(third));assert.equal(third.session_refresh.action,'opened');
  const connection=join(root,'extensions/apis/connections/weekly-isu.json'),cfg=JSON.parse(await fs.readFile(connection,'utf8'));cfg.browser_session.isu_realtime_url=base+'/login';await fs.writeFile(connection,JSON.stringify(cfg));
  for(const p of controller.browser.contexts()[0].pages())await p.close();controller.isuSession.lastPageURL=undefined;current=token('configured-tab');const fourth=await run('fourth.json');assert.equal(fourth.ok,true,JSON.stringify(fourth));assert.equal(fourth.session_refresh.action,'opened');
  issueToken=false;await assert.rejects(controller.isuSession.refresh(controller.browser.contexts()[0],{timeout:700}),/isu_browser_refresh_timeout/);await assert.rejects(controller.isuSession.credentials(controller.browser.contexts()[0]),/token_pending/);issueToken=true;
  denied=true;const before=queryHits;const failed=await run('denied.json');assert.equal(failed.status,'auth_required');assert.equal(queryHits,before);await assert.rejects(fs.access(join(workspace,'denied.json')));
  assert.equal((await isu.execute({operation:'session-check'},{signal:new AbortController().signal},root,workspace)).status,'isu_browser_token_pending');
  const r=JSON.parse(await fs.readFile(controller.runtime,'utf8'));const bridge='http://127.0.0.1:'+r.port+'/isu-session';
  assert.equal((await fetch(bridge,{method:'POST',body:'{}'})).status,403);assert.equal((await fetch(bridge,{method:'POST',body:'{}',headers:{Authorization:'Bearer '+r.token,Origin:base}})).status,403);
 }finally{await controller.dispose();if(server)await new Promise(r=>server.close(r));if(oldData===undefined)delete process.env.NEIWANG_DATA_DIR;else process.env.NEIWANG_DATA_DIR=oldData;await fs.rm(root,{recursive:true,force:true})}
});

test('leaf-chain validation failure is classified as certificate_error',async()=>{const {EventEmitter}=await import('node:events');const client=new isu.Client({base_url:'https://example.invalid',token:'synthetic',baseCookie:'OPGview8088=synthetic',sidCookie:'synthetic'},undefined,()=>{const r=new EventEmitter();r.setTimeout=()=>{};r.end=()=>queueMicrotask(()=>r.emit('error',Object.assign(Error('synthetic'),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'})));return r});await assert.rejects(client.req('GET'),/^Error: certificate_error$/)});

test('ISU TLS defaults are scoped, explicit true restores validation, invalid flags fail closed',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'nw-isu-tls-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fixture(root,'https://isu.example.invalid');const file=join(root,'extensions/apis/connections/weekly-isu.json'),c=JSON.parse(await fs.readFile(file,'utf8')),session=new IsuSession(root);
 delete c.verify_tls;await fs.writeFile(file,JSON.stringify(c));assert.equal((await session.config()).verify_tls,false);
 c.verify_tls=true;await fs.writeFile(file,JSON.stringify(c));assert.equal((await session.config()).verify_tls,true);
 c.verify_tls='false';await fs.writeFile(file,JSON.stringify(c));await assert.rejects(session.config(),/not_configured/);
});
