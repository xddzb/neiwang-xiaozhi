import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:https';
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
 let server,current=token('first'),denied=false,queryHits=0;const frame=s=>s.length+':'+s,pending=new Map();
 try{
  await exec(process.env.NEIWANG_TEST_OPENSSL||'openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-keyout',join(root,'key.pem'),'-out',join(root,'cert.pem')]);
  server=createServer({key:await fs.readFile(join(root,'key.pem')),cert:await fs.readFile(join(root,'cert.pem'))},(req,res)=>{
   const u=new URL(req.url,'https://localhost');
   if(u.pathname==='/login'){
    res.setHeader('Set-Cookie',['OPGview8088=synthetic-base; HttpOnly; Secure; Path=/','sid=synthetic-page; HttpOnly; Secure; Path=/']);res.setHeader('Content-Type','text/html');
    res.end('<html><body>ISU fixture</body><script>fetch('+JSON.stringify(route+'?token=opgview-'+current+'&EIO=3&transport=polling')+').then(()=>document.body.textContent="READY")</script></html>');return;
   }
   if(u.pathname!==route){res.writeHead(404);res.end();return}
   const supplied=u.searchParams.get('token')?.replace(/^opgview-/,'');
   if(denied||supplied!==current||!req.headers.cookie?.includes('OPGview8088=synthetic-base')||!req.headers.cookie?.includes('sid=synthetic-page')){res.writeHead(401);res.end('expired');return}
   if(!u.searchParams.has('sid')){const sid='socket-'+pending.size;pending.set(sid,[]);res.end(frame('0'+JSON.stringify({sid,pingInterval:25000})));return}
   const queue=pending.get(u.searchParams.get('sid'));
   if(!queue){res.writeHead(400);res.end();return}
   if(req.method==='GET'){res.end(queue.splice(0).map(frame).join('')||frame('3'));return}
   let body='';req.on('data',b=>body+=b);req.on('end',()=>{const packet=isu.frames(body)[0];if(packet==='40')queue.push('40');if(packet.startsWith('42')){const [event,params]=JSON.parse(packet.slice(2));assert.equal(event,'dataView/getPointInfo');queryHits++;queue.push('42'+JSON.stringify(['dataView/getPointInfoCB',{total:1,rows:[{PN:params.pointName,GN:'fixture',AV:42,EU:'C',DS:0,TM:123}]}]))}res.end('ok')});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='https://127.0.0.1:'+server.address().port;await fixture(root,base);
  await controller.listen();await controller.run('open',{url:base+'/login'});const page=controller.browser.contexts()[0].pages()[0];await page.getByText('READY',{exact:true}).waitFor();
  const run=output=>isu.execute({operation:'query',params_json:'{"points":["TEST.POINT"]}',output},{signal:new AbortController().signal},root,workspace);
  const first=await run('first.json');assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.results[0].rows[0].AV,42);assert.equal(queryHits,1);assert(!JSON.stringify(first).includes(current));
  await assert.rejects(fs.access(join(root,'data/config/isu-instruments.json')));
  current=token('rotated');await controller.run('open',{url:base+'/login'});await page.getByText('READY',{exact:true}).waitFor();const second=await run('second.json');assert.equal(second.ok,true,JSON.stringify(second));
  denied=true;const before=queryHits;const failed=await run('denied.json');assert.equal(failed.status,'auth_required');assert.equal(queryHits,before);await assert.rejects(fs.access(join(workspace,'denied.json')));
  assert.equal((await run('again.json')).status,'isu_browser_token_pending');
  const r=JSON.parse(await fs.readFile(controller.runtime,'utf8'));const bridge='http://127.0.0.1:'+r.port+'/isu-session';
  assert.equal((await fetch(bridge,{method:'POST',body:'{}'})).status,403);assert.equal((await fetch(bridge,{method:'POST',body:'{}',headers:{Authorization:'Bearer '+r.token,Origin:base}})).status,403);
 }finally{await controller.dispose();if(server)await new Promise(r=>server.close(r));if(oldData===undefined)delete process.env.NEIWANG_DATA_DIR;else process.env.NEIWANG_DATA_DIR=oldData;await fs.rm(root,{recursive:true,force:true})}
});
