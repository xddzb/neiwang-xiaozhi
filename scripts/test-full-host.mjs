// Loaded ONLY by test-full-integration.cjs in an isolated test instance.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
export const inject=['webServer','agents','agentPresets','agentDefaultModel','tools','workspaceController'];
export function apply(ctx){ctx.webServer.register({kind:'exact',path:'/test-full-features',handler:async(_req,res)=>{
 let bridge;
 try{
  await ctx.workspaceController.initializeDefault(new AbortController().signal);
  const lib=join(process.env.NEIWANG_APP_ROOT,'extensions/node_modules/@dingtalk-real-ai/dsh-dingtalk/lib');
  const {Bridge}=await import(pathToFileURL(join(lib,'bridge.js')));
  bridge=new Bridge(ctx.agents,{onSessionEvent(){}},new Map(),{cwd:process.env.NEIWANG_WORKSPACE_DIR,workspaceOverrides:new Map(),modelOverrides:new Map(),modelSelection:()=>ctx.agentDefaultModel.currentSelection(),log(){},onAgentMessage(){},compose:async()=>({agentPreset:'standard',setup:async agentCtx=>{await ctx.agentPresets.mount(agentCtx,'standard');}})});
  const agent=await bridge.agentFor('synthetic-full-test',process.env.NEIWANG_WORKSPACE_DIR);
  const names=ctx.tools.schemas(agent).map(row=>row.name);
  for(const name of ['dingtalk_aitable','local_python','python_package'])assert(names.includes(name),'Tool missing: '+name);
  const exec=async(code,expected)=>{
   const result=await ctx.tools.execute({agent,signal:new AbortController().signal,callId:'synthetic-'+Math.random(),name:'run_code',arguments:{code,description:'Local full-app integration verification'}});
   if(result.isError||!JSON.stringify(result).includes(expected))writeFileSync(join(process.env.NEIWANG_DATA_DIR,'tool-failure.json'),JSON.stringify(result,null,2));
   assert(!result.isError&&JSON.stringify(result).includes(expected),'Tool execution failed: '+expected);
  };
  await exec('console.log(await tools.local_python({script:"sample.py"}));','INTEGRATION_OK');
  await exec('console.log(await tools.python_package({script:"sample.py",name:"AgentPack"}));','python-dist');
  await exec('console.log(await tools.dingtalk_aitable({operation:"describe",command:"record query"}));','aitable record query');
  const {OwnerBinding,issueBindingChallenge}=await import(pathToFileURL(join(lib,'owner.js')));
  const file=join(process.env.DSH_DINGTALK_STATE_DIR,'owner.json'),challenge=issueBindingChallenge(file);
  const owner=new OwnerBinding({file,configuredOwner:'',senderAccess:'owner',allowedSenders:[],legacyAllowedSenders:[],allowedGroups:[]});
  assert.equal(owner.authorize({conversationType:'direct',senderStaffId:'synthetic-owner',text:'/bind '+challenge.code}).kind,'bound');
  res.end(JSON.stringify({status:'PASS',checks:['real standard Agent tool registration','Python tool through PTC','PyInstaller tool through PTC','DWS official schema through PTC','official DingTalk isolated binding']}));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({status:'FAIL',error:String(error)}));}
 finally{await bridge?.close();}
}});}
