import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const entries={
 'base list':false,'base search':false,'base get':false,'base create':true,'base update':true,'base delete':true,
 'table get':false,'table create':true,'table update':true,'table delete':true,
 'field get':false,'field create':true,'field update':true,'field delete':true,
 'record query':false,'record ids':false,'record stats':false,'record group-stats':false,'record create':true,'record update':true,'record delete':true,
 '+view-get':false,'view create':true,'+view-update':true,'view delete':true,'entity search':false,'+record-write-result':false
};
export const commands=Object.keys(entries);
export function environment(root=process.env.NEIWANG_APP_ROOT){
 const data=process.env.NEIWANG_DATA_DIR||join(root,'data'),env={...process.env};
 for(const key of Object.keys(env))if(key.startsWith('DWS_'))delete env[key];
 return {...env,DWS_CONFIG_DIR:join(data,'dws/config'),DWS_KEYCHAIN_DIR:join(data,'dws/keychain'),DWS_NO_UPDATE_CHECK:'1',DWS_LANG:'zh'};
}
export function settings(root=process.env.NEIWANG_APP_ROOT){try{return JSON.parse(readFileSync(join(process.env.NEIWANG_DATA_DIR||join(root,'data'),'config/dws.json'),'utf8'));}catch{return {profile:''};}}
export function saveSettings(value,root=process.env.NEIWANG_APP_ROOT){
 const profile=String(value.profile||'').trim();if(profile&&!/^[A-Za-z0-9_.@-]+:[A-Za-z0-9_.@-]+$/.test(profile))throw Error('请填写 profile list 返回的完整 corpId:userId。');
 const dir=join(process.env.NEIWANG_DATA_DIR||join(root,'data'),'config');mkdirSync(dir,{recursive:true});const file=join(dir,'dws.json');writeFileSync(file+'.tmp',JSON.stringify({profile},null,2),{mode:0o600});renameSync(file+'.tmp',file);return {profile};
}
const contracts=JSON.parse(readFileSync(new URL('./contracts.json',import.meta.url),'utf8'));
export function invocation(input,profile){
 const command=String(input.command||'').trim();if(!Object.hasOwn(entries,command))throw Error('不支持的AI表格命令，请先查看工具说明。');
 if(input.operation==='describe')return {args:['schema','--cli-path','aitable '+command,'--compact','--format','json'],write:false,preview:false};
 if(!/^[A-Za-z0-9_.@-]+:[A-Za-z0-9_.@-]+$/.test(profile||''))throw Error('请先在设置 → 钉钉AI表格登录并保存明确的 corpId:userId。');
 const options=JSON.parse(input.options_json||'{}');if(!options||typeof options!=='object'||Array.isArray(options))throw Error('options_json必须是JSON对象。');
 const flags=new Set(Object.keys(contracts[command].parameters||{}).filter(key=>!key.endsWith('-file')));
 const args=['aitable',...command.split(' '),'--profile',profile,'--format','json','--timeout','45'];
 for(const [key,value]of Object.entries(options)){
  if(!flags.has(key))throw Error('不允许的参数：'+key+'；请先 describe 查看该命令的参数。');
  if(typeof value==='boolean'){if(value)args.push('--'+key);}
  else if(typeof value==='string'||typeof value==='number')args.push('--'+key+'='+String(value));
  else if(value&&typeof value==='object')args.push('--'+key+'='+JSON.stringify(value));
  else throw Error('参数值无效：'+key);
 }
 const write=entries[command],preview=Boolean(write&&(input.dry_run||!input.confirmed));
 if(preview)args.push('--dry-run');else if(write)args.push('--yes');
 return {args,write,preview};
}
function scrub(value){if(Array.isArray(value))return value.map(scrub);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(^|_)(access.?token|refresh.?token|app.?secret|client.?secret|authorization|password|dek)(_|$)/i.test(k)).map(([k,v])=>[k,scrub(v)]));return value;}
export function execute(args,{signal,root=process.env.NEIWANG_APP_ROOT,timeout=65000}={}){
 const executable=join(root,'extensions/dws',process.platform==='win32'?'dws.exe':'dws');
 if(!existsSync(executable))return Promise.resolve({ok:false,status:'dws_binary_missing'});
 return new Promise(resolve=>{
  let child,stdout='',stderr='',done=false;
  const finish=result=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(result);};
  const kill=()=>{if(!child?.pid)return;if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
  const abort=()=>{kill();finish({ok:false,status:'cancelled'});};
  const timer=setTimeout(()=>{kill();finish({ok:false,status:'timeout_result_unknown',message:'如为写操作，请先查询目标数据确认结果，不要直接重试。'});},timeout);
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  child=spawn(executable,args,{env:environment(root),cwd:root,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],shell:false});
  child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{stdout+=part;if(stdout.length>2000000){kill();finish({ok:false,status:'response_too_large',message:'请减少查询limit或field-ids。写操作需查询确认结果后再决定是否重试。'});}});
  child.stderr.setEncoding('utf8');child.stderr.on('data',part=>{stderr=(stderr+part).slice(-2000);});
  child.on('error',()=>finish({ok:false,status:'dws_launch_failed'}));
  child.on('close',code=>{try{const value=scrub(JSON.parse(stdout));finish({ok:code===0,exit_code:code,result:value});}catch{finish({ok:false,exit_code:code,status:'dws_non_json_response',message:'请先 describe 核对参数，或在设置中检查登录与组织授权。'});}});
 });
}
export async function status(){const profile=settings().profile;const [auth,profiles]=await Promise.all([execute(['auth','status','--readonly','--format','json',...(profile?['--profile',profile]:[])]),execute(['profile','list','--format','json'])]);return {version:'1.0.65',profile:settings().profile,auth,profiles};}
export async function run(input,exec={}){if(input.operation==='status')return status();if(input.operation==='list')return {ok:true,commands:entries};const call=invocation(input,settings().profile);const result=await execute(call.args,{signal:exec.signal});return {...result,preview:call.preview,command:input.command,...(call.preview?{message:'这是写入预览；用户已明确授权对应目标和变更后，confirmed=true才能执行。'}:{})};}
