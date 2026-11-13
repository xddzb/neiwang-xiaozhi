import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
process.env.DSH_TURN_REWIND_HOST_ID='a'.repeat(64);
const plugin=process.env.NEIWANG_REWIND_PLUGIN||resolve('extensions/@anionex/dsh-turn-rewind');
const {ChangeLedgerEngine}=await import(pathToFileURL(join(plugin,'lib/engine.js')));
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
  const points=await engine.list({cwd,includeTurnCheckpoints:true});assert.equal(points.length,2);
  await writeFile(join(cwd,'fixture.txt'),'manual edit after round');
  const next=await engine.createTurnCheckpoint({...args,turn:1,turnStartSeq:1});
  assert.equal(next.roundId,start.roundId+1);
  const reload=new ChangeLedgerEngine({storageDir:join(root,'ledger'),turnCheckpointMode:'legacy'});
  const persisted=await reload.list({cwd,includeTurnCheckpoints:true});
  assert.equal(persisted.find(p=>p.id===end.id).phase,'end');
 }finally{await rm(root,{recursive:true,force:true})}
});
