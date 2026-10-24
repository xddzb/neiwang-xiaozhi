import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const [root,work]=process.argv.slice(2).map(p=>resolve(p));await fs.mkdir(work,{recursive:true});
const {BrowserController}=await import(pathToFileURL(join(root,'extensions/node_modules/@neiwang/browser-automation/controller.mjs')));
let submissions=0,authorizedRequests=0;
const server=createServer((req,res)=>{
 if(req.url==='/login'){res.setHeader('Set-Cookie','fixture_session=synthetic-login; HttpOnly; Path=/; Max-Age=3600');res.end('<h1>登录成功</h1>');return}
 if(req.url.startsWith('/api/query')){if(!req.headers.cookie?.includes('fixture_session=synthetic-login')){res.writeHead(401);res.end('{}');return}authorizedRequests++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,items:[{id:42,title:'ARM64 local fixture'}]}));return}
 if(req.url.startsWith('/submit')){submissions++;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>已提交测试数据</h1>');return}
 if(req.url==='/frame'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<label>嵌套字段<input id="inside"></label>');return}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>ARM64 业务测试</h1><form action="/submit"><label>名称<input id="name"></label><label>密码<input type="password" value="never-print-this-fixture"></label><select id="state"><option value="new">新建</option><option value="done">完成</option></select><button id="save">提交</button></form><iframe title="嵌套页面" src="/frame"></iframe><div style="height:1500px">可滚动区域</div>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const connection=join(root,'extensions/apis/connections/browser-fixture.json'),spec=join(root,'extensions/apis/sources/browser-fixture.json');
await fs.writeFile(connection,JSON.stringify({base_url:origin,auth_mode:'none',token:'',headers:{},browser_session:{driver:'playwright',allowed_origins:[origin]}}));await fs.writeFile(spec,JSON.stringify({enabled:true,connection:'browser-fixture',read_only:true,method:'GET',path:'/api/query',parameters:{},response_type:'json'}));
let controller=new BrowserController({root,data:join(work,'data'),extraArgs:['--no-sandbox','--disable-gpu']});
function trace(controller){const run=controller.run.bind(controller);controller.run=(operation,...args)=>{console.log('CHECK '+operation);return run(operation,...args)}}
trace(controller);
try{
 await controller.listen();await controller.run('open',{url:origin});let snapshot=await controller.run('snapshot');assert(snapshot.snapshot.includes('ARM64'));assert(!JSON.stringify(snapshot).includes('never-print-this-fixture'));const input=snapshot.controls.find(c=>c.label==='名称'||c.tag==='input'&&c.type!=='password');assert(input);
 await controller.run('fill',{selector:input.selector,value:'麒麟离线填写'});await controller.run('select',{selector:'#state',value:'done'});await controller.run('fill',{frame_selector:'iframe',selector:'#inside',value:'iframe readback'});const frame=await controller.run('snapshot',{frame_selector:'iframe'});assert(frame.snapshot.includes('iframe readback'));
 await assert.rejects(()=>controller.run('fill',{selector:'input[type=password]',value:'no'}),/亲自/);assert.equal((await controller.run('click',{selector:'#save'})).status,'needs_confirmation');assert.equal(submissions,0);await controller.run('screenshot',{filename:'arm64-browser.png'},work);await controller.run('scroll',{y:500});await controller.run('click',{selector:'#save',confirmed:true});assert.equal(submissions,1);
 await controller.run('open',{url:origin+'/login'});
 const runPython=args=>new Promise((resolve,reject)=>{const p=spawn(join(root,'runtime/python/bin/python3.11'),args,{env:{...process.env,NEIWANG_APP_ROOT:root,NEIWANG_DATA_DIR:join(work,'data'),PYTHONHOME:join(root,'runtime/python'),LD_LIBRARY_PATH:join(root,'runtime/python/lib')},stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code===0?resolve(JSON.parse(out)):reject(Error(err||out)))});
 const result=await runPython(['-I','-B','-X','utf8',join(root,'tools/tool_entry.py'),'api','query','--source','browser-fixture','--workspace',work,'--output','api-fixture.json']);assert.equal(result.ok,true);assert(!JSON.stringify(result).includes('synthetic-login'));assert.equal(JSON.parse(await fs.readFile(join(work,'api-fixture.json'),'utf8')).items[0].id,42);assert.equal(authorizedRequests,1);
 await controller.dispose();controller=new BrowserController({root,data:join(work,'data'),extraArgs:['--no-sandbox','--disable-gpu']});await controller.listen();await controller.run('open',{url:origin+'/login'});assert(await controller.cookieHeader(origin+'/api/query'));const report={status:'PASS',platform:process.platform,arch:process.arch,offlineDependencies:true,navigation:true,snapshotRefs:true,fillAndSelect:true,iframe:true,screenshot:true,scroll:true,confirmationGuard:true,passwordNotExposed:true,legacyApiWithBrowserSession:true,loopbackOnly:true,testOnlyElectronFlags:['--no-sandbox','--disable-gpu'],realOrganizationServicesTested:false,nativeKylinTested:false};await fs.writeFile(join(work,'browser-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await controller.dispose();await new Promise(r=>server.close(r));await fs.unlink(connection);await fs.unlink(spec)}
