import {defineTool} from '@deepseek-ai/dsh-tools';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {statSync} from 'node:fs';
export const inject=['tools','systemPrompt'];
function workspace(exec){
 const p=resolve(exec.agent?.session?.header?.cwd||exec.agent?.session?.meta?.cwd||join(process.env.NEIWANG_APP_ROOT,'workspace'));
 if(!statSync(p).isDirectory())throw Error('请选择可写工作区');return p;
}
function run(tool,args,exec){
 const root=process.env.NEIWANG_APP_ROOT;
 const executable=join(root,process.platform==='win32'?'runtime/python/python.exe':'runtime/python/bin/python3');
 return new Promise(done=>{
  if(exec.signal.aborted)return done(JSON.stringify({ok:false,status:'cancelled'}));
  let output='',ended=false;
  const child=spawn(executable,['-I','-B','-X','utf8',join(root,'tools',tool),...args],{cwd:workspace(exec),windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  const kill=()=>{if(!child.pid)return;if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else{try{process.kill(-child.pid,'SIGKILL');}catch{}}};
  const finish=value=>{if(ended)return;ended=true;clearTimeout(timer);exec.signal.removeEventListener('abort',abort);done(JSON.stringify(value));};
  const abort=()=>{kill();finish({ok:false,status:'cancelled'});};
  const timer=setTimeout(()=>{kill();finish({ok:false,status:'timeout'});},330000);
  exec.signal.addEventListener('abort',abort,{once:true});
  child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{output+=part;if(output.length>1048576){kill();finish({ok:false,status:'output_too_large'});}});
  child.stderr.resume();child.on('error',()=>finish({ok:false,status:'python_launch_failed'}));
  child.on('close',()=>{try{finish(JSON.parse(output));}catch{finish({ok:false,status:'python_invalid_result'});}});
 });
}
const output={schema:{type:'string'},render:(_a,value)=>[{type:'text',text:value}]};
export function apply(ctx){
 ctx.systemPrompt.section({name:'neiwang:python',order:3203,text:'local_python 执行用户授权的工作区 Python 脚本；python_package 用内置 PyInstaller 6.22.3 打包。脚本按用户权限执行，不是安全沙箱。先验证脚本再打包，并运行产物验收；只能生成当前操作系统和架构的程序，不自动下载未知依赖。Linux 打包需要系统 binutils。'});
 ctx.tools.register(defineTool({name:'local_python',description:'用 APP 内置 Python 执行当前工作区中用户授权的 .py 脚本。',parameters:{script:{type:'string',required:true},args_json:{type:'string'}},output,execute(args,exec){return run('python_tool.py',['--workspace',workspace(exec),'--script',args.script,'--args',args.args_json||'[]'],exec);}}));
 ctx.tools.register(defineTool({name:'python_package',description:'用内置 PyInstaller 将工作区脚本打包为当前平台程序，不覆盖同名产物。',parameters:{script:{type:'string',required:true},name:{type:'string'},onefile:{type:'boolean'},hidden_imports_json:{type:'string'}},output,execute(args,exec){const a=['--workspace',workspace(exec),'--script',args.script,'--hidden-imports',args.hidden_imports_json||'[]'];if(args.name)a.push('--name',args.name);if(args.onefile)a.push('--onefile');return run('package_tool.py',a,exec);}}));
}
