import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export const inject=['webServer','agents','agentPresets','agentDefaultModel','tools','schedule','workspaceController','skills'];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export function apply(ctx){
 const handles=[];
 ctx.webServer.register({kind:'prefix',path:'/r115-test',handler:async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  try{
   if(req.url.endsWith('/features')){
    await ctx.workspaceController.initializeDefault(new AbortController().signal);
    const handle=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd:process.env.NEIWANG_WORKSPACE_DIR,agentPreset:'standard'},agentOptions:ctx.agentDefaultModel.currentSelection(),setup:async c=>{await ctx.agentPresets.mount(c,'standard');}});handles.push(handle);
    const agent=handle.agent;await agent.whenIdle();
    const names=ctx.tools.schemas(agent).map(x=>x.name);
    for(const name of ['schedule_create','schedule_list','schedule_update','schedule_delete','skill_new','skill_validate','skill_package','skill_improve_description','dingtalk_aitable'])assert(names.includes(name),'Missing '+name);
    agent.followup({id:randomUUID(),role:'user',content:[{type:'text',text:'R115_FEATURES'}],source:{kind:'user'}});
    await agent.whenIdle();
    const file=join(process.env.NEIWANG_DATA_DIR,'dsh/skills/agent-weekly/SKILL.md');
    if(!existsSync(file))throw Error('Agent skill output missing: '+JSON.stringify(agent.session.snapshotEvents(0).slice(-8)).slice(-10000));
    const until=Date.now()+60000;let fired;
    while(Date.now()<until){fired=(await ctx.schedule.catalog()).find(x=>x.title==='R115 one-shot');if(fired?.status==='inactive'&&fired.lastDelivery)break;await delay(500);}
    assert(fired?.status==='inactive'&&fired.lastDelivery,'Timer was not durably delivered');
    await agent.whenIdle();
    const events=JSON.stringify(agent.session.snapshotEvents(0));assert(events.includes('R115_TIMER_FIRED'));assert(!names.includes('pdf_parse'),'Retired PDF parser still registered');
    writeFileSync(join(process.env.NEIWANG_DATA_DIR,'r115-session.json'),JSON.stringify({id:agent.id}));
    res.end(JSON.stringify({status:'PASS',toolNames:names.filter(n=>/schedule|skill_|pdf_parse/.test(n)),timerDelivered:true,agentSkillCreated:true,retiredPdfParserAbsent:true}));
   }else if(req.url.endsWith('/prepare-restart')){
    const {id}=JSON.parse(readFileSync(join(process.env.NEIWANG_DATA_DIR,'r115-session.json'),'utf8'));
    const record=await ctx.schedule.create(id,{title:'R115 restart recovery',prompt:'R115_RESTART_FIRED',after_seconds:15});
    res.end(JSON.stringify({status:'READY',scheduleId:record.id,sessionId:id}));
   }else if(req.url.endsWith('/restored')){
    let record;const until=Date.now()+120000;
    while(Date.now()<until){record=(await ctx.schedule.catalog()).find(x=>x.title==='R115 restart recovery');if(record?.status==='inactive'&&record.lastDelivery)break;await delay(500);}
    assert(record?.status==='inactive'&&record.lastDelivery,'Restart task not restored/delivered');
    const skill=await ctx.skills.get('agent-weekly',{cwd:process.env.NEIWANG_WORKSPACE_DIR});assert(skill?.content.includes('weekly'),'Generated skill not discoverable after restart');
    res.end(JSON.stringify({status:'PASS',persistedTaskRestored:true,coldSessionDelivered:true,generatedSkillDiscoverableAfterRestart:true}));
   }else{res.statusCode=404;res.end('{}');}
  }catch(e){res.statusCode=500;res.end(JSON.stringify({status:'FAIL',error:String(e),stack:e.stack}));}
 }});
}
