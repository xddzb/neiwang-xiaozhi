import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
export const inject=['webServer','agents','agentPresets','agentDefaultModel','tools','workspaceController'];
export function apply(ctx){ctx.webServer.register({kind:'exact',path:'/test-modular',handler:async(req,res)=>{
 let handle,unsubscribe,timer;
 try{
  await ctx.workspaceController.initializeDefault(new AbortController().signal);
  handle=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd:process.env.NEIWANG_WORKSPACE_DIR,agentPreset:'standard'},agentOptions:ctx.agentDefaultModel.currentSelection(),setup:async c=>{await ctx.agentPresets.mount(c,'standard');}});
  const agent=handle.agent,names=ctx.tools.schemas(agent).map(t=>t.name),full=process.env.TEST_MODULAR_FULL==='1';
  for(const name of ['business_api','python_package','dingtalk_aitable'])assert.equal(names.includes(name),full,name);
  assert(!names.some(n=>n.startsWith('mcp__browser__')));
  await agent.whenIdle();
  for(const text of ['创建测试文件','修改测试文件']){
   agent.followup({id:randomUUID(),role:'user',content:[{type:'text',text}],source:{kind:'user'}});
   await Promise.race([agent.whenIdle(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Agent turn timed out')),120000);})]);clearTimeout(timer);
  }
  if(!existsSync(join(process.env.NEIWANG_WORKSPACE_DIR,'r8-diff.txt')))throw Error('Tool file missing; recent synthetic session events: '+JSON.stringify(agent.session.snapshotEvents(0).slice(-10)));
  assert.equal(readFileSync(join(process.env.NEIWANG_WORKSPACE_DIR,'r8-diff.txt'),'utf8'),'alpha\ngamma\n');
  res.end(JSON.stringify({status:'PASS',edition:full?'full':'core',reviewSessionId:agent.id,checks:['Real standard Agent model tool loop','Local file write/read/edit','Optional tools correctly enabled or absent','Business browser absent']}));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({status:'FAIL',error:String(error),stack:error.stack}));}
 finally{clearTimeout(timer);unsubscribe?.();await handle?.dispose();}
}});}
