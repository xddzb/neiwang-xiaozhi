import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export const inject=['webServer','agents','agentPresets','agentDefaultModel','tools','workspaceController'];
export function apply(ctx){ctx.webServer.register({kind:'prefix',path:'/browser-addon-test',handler:async(req,res)=>{let handle;try{
 await ctx.workspaceController.initializeDefault(new AbortController().signal);
 handle=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd:process.env.NEIWANG_WORKSPACE_DIR,agentPreset:'standard'},agentOptions:ctx.agentDefaultModel.currentSelection(),setup:async c=>{await ctx.agentPresets.mount(c,'standard')}});
 const agent=handle.agent,names=ctx.tools.schemas(agent).map(t=>t.name);assert(names.includes('business_api'));assert(names.includes('mcp__browser__automation'));assert.equal(names.filter(n=>n.startsWith('mcp__browser__')).length,1);
 const text=req.url.endsWith('/baseline')?'BROWSER_PATCH_BASELINE':'BROWSER_PATCH_COMPACT';await agent.whenIdle();agent.followup({id:randomUUID(),role:'user',content:[{type:'text',text}],source:{kind:'user'}});await agent.whenIdle();
 const events=JSON.stringify(agent.session.snapshotEvents(0));assert(events.includes('BROWSER_PATCH_DONE'));if(text.includes('COMPACT')){if(Number(process.env.NEIWANG_EXPECTED_SOURCES||15)>0)assert(events.includes('once-terms'));assert(events.includes('operations'))}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'PASS',oneBrowserTool:true,realAgentToolLoop:text.includes('COMPACT')}));
 }catch(e){res.writeHead(500);res.end(JSON.stringify({status:'FAIL',error:String(e),stack:e.stack}))}finally{await handle?.dispose()}}})}
