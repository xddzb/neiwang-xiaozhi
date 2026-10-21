import {defineTool} from '@deepseek-ai/dsh-tools';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {commands,run,status,saveSettings,environment} from './runner.mjs';
export const inject=['tools','systemPrompt','connection','webServer'];
export async function openLogin(){
 const root=process.env.NEIWANG_APP_ROOT,script=join(root,'tools/dws-login.cjs');
 if(!existsSync(join(process.env.NEIWANG_DATA_DIR||join(root,'data'),'config/dws-readonly-app.xml')))return {ok:false,message:'请先配置专用只读应用；默认DWS广泛授权入口已停用。'};
 if(process.platform==='win32'){
  const quote=value=>"'"+value.replace(/'/g,"''")+"'";
  const node=join(root,'runtime/node/node.exe');
  const command='$ErrorActionPreference="Stop"; Start-Process -FilePath '+quote(node)+' -ArgumentList '+quote('"'+script+'"')+' -WindowStyle Normal -WorkingDirectory '+quote(root);
  const encoded=Buffer.from(command,'utf16le').toString('base64');
  return await new Promise(resolve=>{
   const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{cwd:root,env:environment(root),windowsHide:true,stdio:'ignore'});
   child.once('error',()=>resolve({ok:false,message:'无法启动授权窗口，请在APP目录运行登录AI表格.cmd。'}));
   child.once('exit',code=>resolve(code===0?{ok:true}:{ok:false,message:'授权窗口启动失败，请在APP目录运行登录AI表格.cmd。'}));
  });
 }
 const terminal=['/usr/bin/x-terminal-emulator','/usr/bin/mate-terminal','/usr/bin/xterm'].find(existsSync);if(!terminal)return {ok:false,message:'请在APP目录执行 bash 登录AI表格.sh'};
 const child=spawn(terminal,['-e',process.execPath,script],{cwd:root,env:environment(root),detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};
}
export function apply(ctx){
 ctx.systemPrompt.section({name:'neiwang:dws-aitable',order:3202,text:'钉钉AI表格仅允许读取。先status、describe核对账号和参数。禁止新增、修改、删除、导入、权限变更；即使confirmed=true也不得写入。不得通过shell、Python、直接CLI或其他工具绕过只读限制。使用用户明确提供的表格，先获取字段再查询记录；不得猜测人员、组织或表格ID。人员姓名转换需要额外权限时向用户索取明确ID，不扩大授权。不输出凭据。'});
 ctx.tools.register(defineTool({name:'dingtalk_aitable',description:'通过随APP内置的官方DWS操作钉钉AI表格，仅读取Base、数据表、字段、记录和视图，写入已禁用。不是普通Excel/宜搭工具。登录入口：设置→钉钉AI表格。',parameters:{operation:{type:'string',enum:['status','list','describe','run'],required:true},command:{type:'string',enum:commands},options_json:{type:'string',description:'按describe返回的官方Schema填写参数JSON，键使用CLI长参数名且不含--，如{"base-id":"...","table-id":"...","limit":20}。对象值自动序列化JSON。'},confirmed:{type:'boolean',description:'用户已明确授权本次目标和写入；否则仅预览。'},dry_run:{type:'boolean',description:'预览写操作，不写远端。'}},output:{schema:{type:'string'},render:(_a,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>JSON.stringify(await run(args,exec))}));
 const connection=ctx.connection;let lastLogin=0;
 ctx.webServer.register({kind:'prefix',path:'/neiwang-aitable',handler:async(req,res)=>{
  const admission=connection.admit(req);if(admission.rejection){res.writeHead(admission.rejection);res.end();return;}
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.writeHead(415);res.end();return;}
  try{
   let body='';for await(const part of req){body+=part;if(body.length>16384)throw Error('body too large');}
   const message=JSON.parse(body),endpoint=new URL(req.url,'http://localhost').pathname.slice('/neiwang-aitable/'.length);
   if(message.type!=='client-request'||typeof message.rpcId!=='string'||message.method!==endpoint)throw Error('invalid RPC');
   if(endpoint!=='status'&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){res.writeHead(403);res.end();return;}
   let result;
   if(endpoint==='status')result={ok:true,value:await status()};
   else if(endpoint==='save'){try{result={ok:true,value:saveSettings(message.payload)};}catch(e){result={ok:false,message:e.message};}}
   else if(endpoint==='login'){result=Date.now()-lastLogin<5000?{ok:true}:await openLogin();lastLogin=Date.now();}
   else throw Error('unknown operation');
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({type:'server-response',rpcId:message.rpcId,result}));
  }catch{res.writeHead(400);res.end('Invalid local AI-table request');}
 }});
}
