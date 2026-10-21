const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{spawn,spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),original=path.resolve(process.argv[2]||'');
assert(process.argv[2],'Usage: node scripts/test-full-integration.cjs builds/<full-app>');
fs.mkdirSync(path.join(repo,'tmp'),{recursive:true});const fixture=fs.mkdtempSync(path.join(repo,'tmp/full-integration-'));
// Test a disposable composition so the verified APP remains fresh and safe to package.
const root=path.join(fixture,'app');fs.mkdirSync(root);
const {copyTree}=require('./build-dev.cjs');
const link=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.symlinkSync(from,to,process.platform==='win32'?'junction':'dir');};
for(const name of ['core','runtime','launcher'])link(path.join(original,name),path.join(root,name));
copyTree(path.join(original,'config'),path.join(root,'config'));
const bundles=JSON.parse(fs.readFileSync(path.join(root,'config/app.json'),'utf8')).bundles;
for(const name of bundles.filter(v=>v!=='@dingtalk-real-ai/dsh-dingtalk'))copyTree(path.join(original,'extensions/node_modules',name),path.join(root,'extensions/node_modules',name));
link(path.join(original,'extensions/dws'),path.join(root,'extensions/dws'));
copyTree(path.join(original,'tools'),path.join(root,'tools'));
const work=path.join(fixture,'workspace');fs.mkdirSync(work);fs.writeFileSync(path.join(work,'sample.py'),'print("INTEGRATION_OK")\n');
Object.assign(process.env,{NEIWANG_APP_ROOT:root,NEIWANG_DATA_DIR:fixture,NEIWANG_WORKSPACE_DIR:work});
for(const key of ['NEIWANG_MODEL_KEY','NEIWANG_MODEL_URL','NEIWANG_MODEL_ID'])delete process.env[key];
const p=require(path.join(root,'launcher/bootstrap.cjs')).prepare(),patch=path.join(fixture,'patch.json');
fs.writeFileSync(patch,JSON.stringify([{insert:[{id:'full-integration-test',name:pathToFileURL(path.join(__dirname,'test-full-host.mjs')).href}]}]));
let child,log='';
function stop(){if(!child?.pid)return;if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else{try{process.kill(-child.pid,'SIGTERM');}catch{}}}
(async()=>{try{
 const url=await new Promise((done,fail)=>{
  const timer=setTimeout(()=>fail(Error('Backend startup timed out')),240000);
  child=spawn(p.node,[p.cli,'web','--patch',patch,'--no-open','--port','0'],{cwd:work,env:p.env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  const read=chunk=>{log=(log+chunk.toString()).slice(-100000);const hit=log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);if(hit){clearTimeout(timer);done(hit[0]);}};
  child.stdout.on('data',read);child.stderr.on('data',read);child.on('error',error=>{clearTimeout(timer);fail(error);});child.on('exit',code=>{clearTimeout(timer);fail(Error('Backend exited '+code));});
 });
 const endpoint=new URL('/test-full-features',url);
 const admission=await fetch(url,{redirect:'manual'});
 const cookie=admission.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert(cookie,'Local test authentication failed');
 const response=await fetch(endpoint,{headers:{Cookie:cookie},signal:AbortSignal.timeout(300000)}),result=await response.json();assert.equal(result.status,'PASS',JSON.stringify(result));console.log(JSON.stringify(result));
 }catch(error){fs.writeFileSync(path.join(fixture,'backend.log'),log.replace(/token=[A-Za-z0-9_-]+/g,'token=[REDACTED]'));console.error('FAIL: '+error.message+'; local fixture '+fixture);process.exitCode=1;}
 finally{stop();}
})();
