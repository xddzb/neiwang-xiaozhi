const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const p=require('./bootstrap.cjs').prepare();
// Deployment defaults are a bundle layer; user profile overrides remain last.
const backend=spawn(p.node,[p.cli,'web','--no-open','--port',String(p.deployment.port||3080)],{cwd:path.join(p.root,'workspace'),env:p.env,detached:process.platform!=='win32',windowsHide:true,stdio:['ignore','pipe','pipe']});
let windowProcess,closing=false,buffer='';
function kill(child){if(!child?.pid||child.exitCode!==null)return;if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else{try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}}}
function stop(code){if(closing)return;closing=true;clearTimeout(timer);kill(windowProcess);kill(backend);setTimeout(()=>process.exit(code),800);}
const timer=setTimeout(()=>{fs.writeFileSync(path.join(p.data,'startup-error.txt'),'本机后台启动超时，请运行本机自检。');stop(1);},120000);
function consume(chunk){if(windowProcess||closing)return;buffer=(buffer+chunk.toString()).slice(-32000);const hit=buffer.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);if(!hit)return;clearTimeout(timer);windowProcess=spawn(p.electron,[path.join(p.root,'launcher/shell')],{cwd:p.root,env:{...p.env,DSH_URL:hit[0]},detached:process.platform!=='win32',windowsHide:true,stdio:'ignore'});buffer='';windowProcess.on('error',()=>stop(1));windowProcess.on('exit',code=>stop(code||0));}
backend.stdout.on('data',consume);backend.stderr.on('data',consume);backend.on('error',()=>stop(1));backend.on('exit',code=>stop(code||0));process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
