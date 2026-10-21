import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {collectDoctorReport} from '../../@dingtalk-real-ai/dsh-dingtalk/lib/doctor-report.js';
import {loadWebProfileConfig} from '../../@dingtalk-real-ai/dsh-dingtalk/lib/setup-state.js';
import {OwnerBinding,issueBindingChallenge} from '../../@dingtalk-real-ai/dsh-dingtalk/lib/owner.js';
export const name='neiwang-dingtalk-ui';
export const inject=['connection','webServer'];
export function apply(ctx){
  let lastLaunch=0;
  const connection=ctx.connection;
  const handle=async(endpoint,payload,signal,peer)=>{
    if(!peer || signal.aborted)return {ok:false,error:{code:'unavailable',message:'本机连接不可用'}};
    if(payload && Object.keys(payload).length)return {ok:false,error:{code:'bad-request',message:'不接受额外参数'}};
    if(endpoint==='status'){
      const report=await collectDoctorReport({dshHome:process.env.DSH_HOME,stateDir:process.env.DSH_DINGTALK_STATE_DIR,mode:'offline'});
      return {ok:true,value:{version:'0.10.2',report}};
    }
    if(endpoint==='binding.generate'){
      const profile=await loadWebProfileConfig(process.env.DSH_HOME);
      const account=profile.accounts.find(a=>a.id==='default');
      const file=join(process.env.DSH_DINGTALK_STATE_DIR,'owner.json');
      const binding=new OwnerBinding({file,configuredOwner:account?.ownerStaffId||profile.ownerStaffId||'',senderAccess:'owner',allowedSenders:[],legacyAllowedSenders:[],allowedGroups:[]});
      if(binding.status().bound)return {ok:true,value:{bound:true}};
      const challenge=issueBindingChallenge(file);
      return {ok:true,value:{bound:false,command:'/bind '+challenge.code,expiresAt:challenge.expiresAt}};
    }
    if(endpoint==='setup'){
      if(Date.now()-lastLaunch<5000)return {ok:true,value:{opened:true}};
      const root=process.env.NEIWANG_APP_ROOT;
      const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','start','"钉钉官方连接器配置"','cmd.exe','/d','/k','配置钉钉.cmd'],{cwd:root,windowsHide:true,stdio:'ignore'});
      child.on('error',()=>{});child.unref();lastLaunch=Date.now();
      return {ok:true,value:{opened:true}};
    }
    return {ok:false,error:{code:'bad-request',message:'未知操作'}};
  };
  ctx.webServer.register({kind:'prefix',path:'/neiwang-dingtalk',handler:async(req,res)=>{
    const admission=connection.admit(req);
    if(admission.rejection){res.writeHead(admission.rejection);res.end();return;}
    if(req.method!=='POST'){res.writeHead(405);res.end();return;}
    if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.writeHead(415);res.end();return;}
    try{
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw Error('large body');}
      const message=JSON.parse(raw);
      const endpoint=new URL(req.url,'http://localhost').pathname.slice('/neiwang-dingtalk/'.length);
      if(message.type!=='client-request'||typeof message.rpcId!=='string'||message.method!==endpoint)throw Error('invalid request');
      if(endpoint==='binding.generate'&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){res.writeHead(403);res.end();return;}
      const result=await handle(endpoint,message.payload,new AbortController().signal,connection.operator);
      res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({type:'server-response',rpcId:message.rpcId,result}));
    }catch{res.writeHead(400);res.end('Invalid local configuration request');}
  }});
}
