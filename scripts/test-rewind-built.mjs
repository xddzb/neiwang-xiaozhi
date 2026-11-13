import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
process.env.DSH_TURN_REWIND_HOST_ID='a'.repeat(64);
const plugin=process.env.NEIWANG_REWIND_PLUGIN||resolve('extensions/@anionex/dsh-turn-rewind');
const {ChangeLedgerEngine}=await import(pathToFileURL(join(plugin,'lib/engine.js')));
const {TurnCheckpointCoordinator}=await import(pathToFileURL(join(plugin,'lib/rewind-host.js')));
test('a rapid followup waits for the previous closing snapshot instead of losing its checkpoint',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'rewind-coordinator-'));
 let enterClose,releaseClose;
 const entered=new Promise(r=>{enterClose=r}),gate=new Promise(r=>{releaseClose=r});
 const events=[{type:'turn/start',seq:0,data:{turn:0}}],points=[],handlers={},statusHandlers={};
 let locked=false;
 const engine={config:{turnCheckpointTimeoutMs:60000},
  async createTurnCheckpoint(args){if(locked)throw Object.assign(new Error('workspace locked'),{code:'WORKSPACE_LOCKED'});const p={...args,id:'point-'+points.length,kind:'turn',roundId:1};points.push(p);return p},
  async findTurnCheckpoint(){locked=true;enterClose();await gate;locked=false;return points[0]},
  async list(){return points},
 };
 const agent={id:'session',session:{id:'session',header:{cwd},snapshotEvents:()=>events},ctx:{on:(name,fn)=>{statusHandlers[name]=fn}}};
 const ctx={on:(name,fn)=>{handlers[name]=fn},get:()=>({list:()=>[agent]}),logger:{warn:()=>{}}};
 const coordinator=new TurnCheckpointCoordinator(engine);coordinator.install(ctx);
 const signal=new AbortController().signal;
 try{
  await handlers['agent/pre-step']({agent,turn:0,step:1,signal},async()=>{});
  await handlers['tools/execute']({agent,signal},async()=>{});
  statusHandlers['agent/status']({status:'idle'});await entered;
  events.push({type:'turn/start',seq:1,data:{turn:1}});
  await handlers['agent/pre-step']({agent,turn:1,step:1,signal},async()=>{});
  // Give the new opening capture time to contend with the closing capture.
  await new Promise(r=>setTimeout(r,100));releaseClose();
  await handlers['tools/execute']({agent,signal},async()=>{});
  assert(points.some(p=>p.turn===0&&p.phase==='end'));
  assert(points.some(p=>p.turn===1&&p.phase!=='end'),JSON.stringify(coordinator.state('session',1)));
 }finally{releaseClose();await rm(cwd,{recursive:true,force:true})}
});
test('compiled runtime preserves start/end snapshots and allocates the next workspace round',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rewind-compiled-'));
 try{
  const cwd=join(root,'workspace');await mkdir(cwd);await writeFile(join(cwd,'fixture.txt'),'initial');
  const engine=new ChangeLedgerEngine({storageDir:join(root,'ledger'),turnCheckpointMode:'legacy',turnCheckpointTimeoutMs:60000});
  const args={cwd,sessionId:'synthetic-session',turn:0,turnStartSeq:0};
  const start=await engine.createTurnCheckpoint(args);
  assert.equal(typeof start.roundId,'number');
  const end=await engine.createTurnCheckpoint({...args,phase:'end',roundId:start.roundId});
  assert.notEqual(end.id,start.id);assert.equal(end.phase,'end');assert.equal(end.roundId,start.roundId);
  assert.equal((await engine.findTurnCheckpoint(args)).id,start.id);
  const points=await engine.list({cwd,includeTurnCheckpoints:true});assert.equal(points.length,2);
  await writeFile(join(cwd,'fixture.txt'),'manual edit after round');
  const next=await engine.createTurnCheckpoint({...args,turn:1,turnStartSeq:1});
  assert.equal(next.roundId,start.roundId+1);
  const reload=new ChangeLedgerEngine({storageDir:join(root,'ledger'),turnCheckpointMode:'legacy'});
  const persisted=await reload.list({cwd,includeTurnCheckpoints:true});
  assert.equal(persisted.find(p=>p.id===end.id).phase,'end');
 }finally{await rm(root,{recursive:true,force:true})}
});
