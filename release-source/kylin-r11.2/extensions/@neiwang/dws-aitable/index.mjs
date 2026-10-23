import {defineTool} from '@deepseek-ai/dsh-tools';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {commands,run,status,saveSettings,environment} from './runner.mjs';
export const inject=['tools','systemPrompt','connection','webServer'];
export function openLogin(){
 const root=process.env.NEIWANG_APP_ROOT,script=join(root,'tools/dws-login.cjs');
 if(process.platform==='win32'){const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','start','"钉钉 AI 表格授权"','cmd.exe','/d','/k','登录AI表格.cmd'],{cwd:root,env:environment(root),windowsHide:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};}
 const terminal=['/usr/bin/x-terminal-emulator','/usr/bin/mate-terminal','/usr/bin/xterm'].find(existsSync);if(!terminal)return {ok:false,message:'请在APP目录执行 bash 登录AI表格.sh'};
 const child=spawn(terminal,['-e',process.execPath,script],{cwd:root,env:environment(root),detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};
}
export function apply(ctx){
 ctx.systemPrompt.section({name:'neiwang:dws-aitable',order:3202,text:'钉钉AI表格使用 dingtalk_aitable 工具。先status核对明确账号与组织；describe按完整command查看官方本机Schema，不猜字段或ID。先查询Base、数据表和字段再操作记录；零匹配或多匹配须消歧。写操作仅在用户已明确授权目标与变更后使用confirmed=true；删除先说明对象和影响并取得确认。写入后查询读回；超时、部分成功和未知结果不得自动重试写入。不输出任何凭据。普通在线电子表格、宜搭不在本工具范围。'});
 ctx.tools.register(defineTool({name:'dingtalk_aitable',description:'通过随APP内置的官方DWS操作钉钉AI表格，支持Base、数据表、字段、记录和视图。不是普通Excel/宜搭工具。登录入口：设置→钉钉AI表格。',parameters:{operation:{type:'string',enum:['status','list','describe','run'],required:true},command:{type:'string',enum:commands},options_json:{type:'string',description:'按describe返回的官方Schema填写参数JSON，键使用CLI长参数名且不含--，如{"base-id":"...","table-id":"...","limit":20}。对象值自动序列化JSON。'},confirmed:{type:'boolean',description:'用户已明确授权本次目标和写入；否则仅预览。'},dry_run:{type:'boolean',description:'预览写操作，不写远端。'}},output:{schema:{type:'string'},render:(_a,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>JSON.stringify(await run(args,exec))}));
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
   else if(endpoint==='login'){result=Date.now()-lastLogin<5000?{ok:true}:openLogin();lastLogin=Date.now();}
   else throw Error('unknown operation');
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({type:'server-response',rpcId:message.rpcId,result}));
  }catch{res.writeHead(400);res.end('Invalid local AI-table request');}
 }});
}
