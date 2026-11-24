const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {ContextModelsPatch}=require('../tools/install-context-models-patch.cjs');
const {hash}=require('../tools/offline-plugin-manager.cjs');
const repo=path.resolve(__dirname,'..');
function fixture(t){
 fs.mkdirSync(path.join(repo,'tmp'),{recursive:true});const base=fs.mkdtempSync(path.join(repo,'tmp/context-patch-'));
 const kit=path.join(base,'kit'),root=path.join(base,'app');fs.mkdirSync(kit);fs.mkdirSync(path.join(root,'config'),{recursive:true});fs.mkdirSync(path.join(root,'launcher'));
 let result=cp.spawnSync('python',[path.join(repo,'scripts/package-context-models-patch.py'),'--output',path.join(base,'kit.tar.gz')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 result=cp.spawnSync('tar',['-xzf',path.join(base,'kit.tar.gz'),'-C',kit,'--strip-components=1'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(fs.readFileSync(path.join(kit,'patch.json')));manifest.os=process.platform;manifest.arch=process.arch;fs.writeFileSync(path.join(kit,'patch.json'),JSON.stringify(manifest));
 const source=fs.readFileSync(path.join(repo,'launcher/bootstrap.cjs'),'utf8'),block=fs.readFileSync(path.join(kit,'normalization.txt'),'utf8');
 fs.writeFileSync(path.join(root,'launcher/bootstrap.cjs'),source.replace(block,''));
 fs.writeFileSync(path.join(root,'config/app.json'),JSON.stringify({version:'R11.6',coreVersion:'0.2.1-rc.3'}));
 fs.writeFileSync(path.join(root,'config/overrides.json'),JSON.stringify([{id:'ui-settings-models',disabled:true},{id:'compaction-basic',disabled:true,config:{headroomTokens:65536}},{id:'private-other',config:{keep:'synthetic'}}]));
 fs.mkdirSync(path.join(root,'data/config'),{recursive:true});fs.writeFileSync(path.join(root,'data/config/model.enc'),'synthetic-encrypted');
 const original=['launcher/bootstrap.cjs','config/overrides.json','data/config/model.enc'].map(rel=>[rel,fs.readFileSync(path.join(root,rel))]);
 const unchanged=()=>{for(const [rel,b]of original)assert.deepEqual(fs.readFileSync(path.join(root,rel)),b)};
 return {root,kit,original,unchanged,patch:options=>new ContextModelsPatch(root,kit,{stopped:()=>{},...options})};
}
test('packaged patch installs, repeats and rolls back while preserving unrelated settings',t=>{
 const f=fixture(t),p=f.patch();assert.equal(p.run('check').status,'ready');f.unchanged();assert.equal(p.run().status,'installed');
 const rows=JSON.parse(fs.readFileSync(path.join(f.root,'config/overrides.json')));assert.equal(rows.find(r=>r.id==='compaction-basic').config.headroomTokens,16384);assert.equal(rows.find(r=>r.id==='ui-settings-models').disabled,false);assert.equal(rows.find(r=>r.id==='private-other').config.keep,'synthetic');
 assert.equal(fs.readFileSync(path.join(f.root,'data/config/model.enc'),'utf8'),'synthetic-encrypted');
 assert.equal(p.run().status,'unchanged');assert.equal(p.run('rollback').status,'rolled-back');f.unchanged();assert.equal(p.run().status,'installed');
});
test('failed writes roll back and abrupt interruption remains recoverable',t=>{
 for(let stop=1;stop<=2;stop++){const f=fixture(t);let n=0;assert.throws(()=>f.patch({fault:step=>{if(step==='written'&&++n===stop)throw Error('failure')}}).run(),/failure/);f.unchanged()}
 const f=fixture(t),script=`const {ContextModelsPatch}=require(${JSON.stringify(path.join(repo,'tools/install-context-models-patch.cjs'))});new ContextModelsPatch(process.argv[1],process.argv[2],{stopped:()=>{},fault:()=>process.exit(73)}).run()`;
 const r=cp.spawnSync(process.execPath,['-e',script,f.root,f.kit]);assert.equal(r.status,73);assert.throws(()=>f.patch().run(),/中断/);assert.equal(f.patch().run('recover').status,'rolled-back');f.unchanged();
});
test('corruption, running APP, incompatible version and local edits are refused',t=>{
 const a=fixture(t);fs.appendFileSync(path.join(a.kit,'normalization.txt'),'broken');assert.throws(()=>a.patch().run(),/校验失败/);a.unchanged();
 const b=fixture(t);assert.throws(()=>b.patch({stopped:()=>{throw Error('running')}}).run(),/running/);b.unchanged();
 const c=fixture(t);fs.writeFileSync(path.join(c.root,'config/app.json'),'{}');assert.throws(()=>c.patch().run(),/仅支持/);c.unchanged();
 const d=fixture(t);d.patch().run();const file=path.join(d.root,'launcher/bootstrap.cjs');fs.appendFileSync(file,'\n// user edit');assert.throws(()=>d.patch().run('rollback'),/已修改/);assert(fs.readFileSync(file,'utf8').endsWith('// user edit'));
});
