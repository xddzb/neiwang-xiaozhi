// Synthetic acceptance only, loaded into an isolated APP via --patch.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const inject=['webServer','agents','agentPresets','agentDefaultModel','tools','workspaceController','workspaceRegistry','sessionQuery','changeLedger'];
export function apply(ctx){ctx.webServer.register({kind:'prefix',path:'/restored-test',handler:async(req,res)=>{
 res.setHeader('Content-Type','application/json');let handle;
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.endsWith('/inspect')){
   const stored=await ctx.sessionQuery.readSession(url.searchParams.get('id'));
   res.end(JSON.stringify({status:'PASS',events:stored.events}));return;
  }
  await ctx.workspaceController.initializeDefault(new AbortController().signal);
  const workspace=ctx.workspaceRegistry.list()[0];assert(workspace,'default workspace absent');const cwd=workspace.path;
  handle=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd,agentPreset:'standard'},agentOptions:ctx.agentDefaultModel.currentSelection(),setup:async c=>{await ctx.agentPresets.mount(c,'standard')}});
  const agent=handle.agent;await agent.whenIdle();
  await ctx.workspaceRegistry.get(workspace.id).attachSession(agent.id);
  const names=ctx.tools.schemas(agent).map(t=>t.name);
  for(const n of ['knowledge_query','knowledge_materials','business_api','tool_catalog','local_python','python_package','mcp__browser__automation'])assert.equal(names.filter(x=>x===n).length,1,'missing or duplicate '+n);
  const base=join(process.env.NEIWANG_APP_ROOT,'extensions/node_modules/@deepseek-ai/neiwang-business');
  const rag=await import(pathToFileURL(join(base,'rag-scheduler.mjs'))),policy=(await import(pathToFileURL(join(base,'rag-policy.cjs')))).default;
  let calls=0;const run=async()=>{calls++;return JSON.stringify({ok:true,answer:'synthetic evidence',citations:[]})},exec={agent,signal:new AbortController().signal};
  policy.write(false);assert.equal((await rag.queryKnowledge('synthetic topic',exec,run,'synthetic missing definition')).status,'rag_disabled');assert.equal(calls,0);
  policy.write(true);assert((await rag.queryKnowledge('synthetic topic',exec,run,'synthetic missing definition')).ok);
  const child={id:randomUUID(),session:{header:{origin:'subagent',parentSession:agent.id}}};
  assert((await rag.queryKnowledge('synthetic topic',{...exec,agent:child},run,'synthetic missing definition')).reused);assert.equal(calls,1);
  policy.write(false);assert.equal((await rag.queryKnowledge('synthetic topic',exec,run,'synthetic missing definition')).status,'rag_disabled');policy.write(true);
  const userFile=join(cwd,'rewind-fixture.txt');writeFileSync(userFile,'synthetic original');
  writeFileSync(join(cwd,'python-runtime-fixture.py'),"import sys\nprint('PYTHON_RUNTIME_OK', sys.version.split()[0])\n");
  for(const text of ['BROWSER_PATCH_BASELINE_KEEP','BROWSER_PATCH_BASELINE_REMOVE']){
   agent.followup({id:randomUUID(),role:'user',content:[{type:'text',text}],source:{kind:'user'}});await agent.whenIdle();
  }
  const events=agent.session.snapshotEvents(0),target=events.find(e=>e.type==='user/message'&&JSON.stringify(e.data).includes('BASELINE_REMOVE'));
  assert(target,'second turn absent');assert(events.some(e=>e.type==='assistant/message'),'model response absent');
  assert(JSON.stringify(events).includes('knowledge_gap'),'real Agent catalog/tool loop absent');
  assert(JSON.stringify(events).includes('PYTHON_RUNTIME_OK'),'bundled Python was not executed through the real Agent');
  const turn=events.findLast(e=>e.type==='turn/start'&&e.seq<target.seq).data.turn;
  let checkpoint;const deadline=Date.now()+60000;
  while(Date.now()<deadline){try{checkpoint=await ctx.changeLedger.findTurnCheckpoint({cwd,sessionId:agent.id,turn})}catch(e){if(e.code!=='WORKSPACE_LOCKED')throw e}if(checkpoint)break;await new Promise(r=>setTimeout(r,500))}
  assert(checkpoint,'durable checkpoint absent');
  writeFileSync(userFile,'synthetic current');
  res.end(JSON.stringify({status:'PASS',sessionId:agent.id,messageSeq:target.seq,ragDisabledMakesNoRequest:true,childReusesParentMaterials:true,oneRegistrationPerTool:true,userFile,originalEvents:events.length,sourceContent:readFileSync(userFile,'utf8')}));
 }catch(e){res.writeHead(500);res.end(JSON.stringify({status:'FAIL',error:String(e),stack:e.stack}))}finally{await handle?.dispose()}
}})}
