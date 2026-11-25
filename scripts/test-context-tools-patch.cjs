const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {ContextToolsPatch}=require('../tools/install-context-tools-patch.cjs');
const {FILES}=require('../tools/install-tool-discovery-patch.cjs');
const {hash}=require('../tools/offline-plugin-manager.cjs');
const {normalize}=require('../launcher/context-policy.cjs');
const repo=path.resolve(__dirname,'..'),modules=process.env.NEIWANG_TEST_MODULES;
const oldProfile='- id: llm-pi-ai\n  config: {providers: {custom: {apiKey: synthetic-only, models: [{id: fixture, contextWindow: 128000, maxTokens: 8192}]}}}\n- id: compaction-basic\n  config:\n    headroomTokens: 65536\n    thresholdRatio: 0.8\n    retainTokens: 16000\n    modelPolicies:\n      - provider: custom\n        model: fixture\n        headroomTokens: 65536\n        maxTokens: 65536\n';
test('profile and exact-model policy repair preserves providers; dynamic settings fail closed',{skip:!modules},()=>{
 const YAML=require(path.join(modules,'yaml')),before=YAML.parse(oldProfile),after=normalize(oldProfile,modules),parsed=YAML.parse(after);
 assert.deepEqual(parsed[0],before[0]);assert.equal(parsed[1].config.headroomTokens,16384);assert.equal(parsed[1].config.modelPolicies[0].headroomTokens,16384);assert.equal(parsed[1].config.retainTokens,undefined);assert.equal(normalize(after,modules),after);
 assert.throws(()=>normalize('- id: compaction-basic\n  config: !!js "expression"\n',modules),/动态/);
 assert.throws(()=>normalize('- id: compaction-basic\n  config: &shared {headroomTokens: 65536}\n- id: other\n  config: *shared\n',modules),/共享锚点/);
});
function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'context-tools-')),root=path.join(home,'app'),kit=path.join(home,'kit');t.after(()=>fs.rmSync(home,{recursive:true,force:true}));fs.mkdirSync(kit);
 const put=(rel,data)=>{const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
 let r=cp.spawnSync('python',[path.join(repo,'scripts/package-context-tools-patch.py'),'--output',path.join(home,'kit.tar.gz')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 r=cp.spawnSync('tar',['-xzf',path.join(home,'kit.tar.gz'),'-C',kit,'--strip-components=1'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 for(const name of ['tools-kit','context-kit']){const p=path.join(kit,name,'patch.json'),m=JSON.parse(fs.readFileSync(p));Object.assign(m,{os:process.platform,arch:process.arch});fs.writeFileSync(p,JSON.stringify(m));}
 const outer=JSON.parse(fs.readFileSync(path.join(kit,'combined.json')));for(const name of Object.keys(outer.hashes))outer.hashes[name]=hash(fs.readFileSync(path.join(kit,name)));fs.writeFileSync(path.join(kit,'combined.json'),JSON.stringify(outer));
 const rows=[];
 for(const rel of FILES){if(rel.endsWith('/catalog.mjs'))continue;let b=fs.readFileSync(path.join(repo,rel.replace('extensions/node_modules/','extensions/')));if(rel.endsWith('package.json')||rel.endsWith('package-lock.json')){const j=JSON.parse(b);j.version=rel.includes('browser-automation')?'1.4.1':'1.0.0';if(j.packages?.[''])j.packages[''].version=j.version;b=Buffer.from(JSON.stringify(j));}put(rel,b);put('plugin-pack/payload/'+rel,b);rows.push({path:rel,sha256:hash(b),mode:420});}
 put('extensions/node_modules/@neiwang/browser-automation/node_modules/playwright-core/package.json','{"version":"1.56.1"}');
 put('config/app.json',JSON.stringify({version:'R11.6',coreVersion:'0.2.1-rc.3',bundles:[],contextWindow:128000,maxOutputTokens:8192}));
 put('plugin-pack/pack.json',JSON.stringify({release:'R11.6',os:process.platform,arch:process.arch,bundles:[],files:rows}));
 let boot=fs.readFileSync(path.join(repo,'launcher/bootstrap.cjs'),'utf8');boot=boot.replace(fs.readFileSync(path.join(kit,'boot-hook.txt'),'utf8'),' // Profile user changes must win over deployment defaults, especially DingTalk account policies.\n');put('launcher/bootstrap.cjs',boot);
 put('config/overrides.json','[{"id":"compaction-basic","disabled":true}]');
 put('extensions/node_modules/@neiwang/deployment/cordis.patch.yml','- id: compaction-basic\n  disabled: false\n- id: ui-settings-general\n  config: {welcomeNoticeVersion: preserved}\n');
 put('data/config/model.enc','synthetic-preserved');
 if(modules){put('data/dsh/profiles/web/cordis.patch.yml',oldProfile);const copy=(a,b)=>{fs.mkdirSync(b,{recursive:true});for(const e of fs.readdirSync(a,{withFileTypes:true})){if(e.isDirectory())copy(path.join(a,e.name),path.join(b,e.name));else fs.copyFileSync(path.join(a,e.name),path.join(b,e.name));}};copy(path.join(modules,'yaml'),path.join(root,'core/0.2.1-rc.3/node_modules/yaml'));}
 const p=options=>new ContextToolsPatch(root,kit,{stopped:()=>{},...options});
 return {root,kit,put,p};
}
test('combined archive installs all fixes, repeats, and rolls back byte-for-byte',t=>{
 const f=fixture(t),j=f.p().plan();assert.equal(f.p().run().status,'installed');assert.equal(f.p().run().status,'unchanged');
 assert.match(fs.readFileSync(path.join(f.root,'extensions/node_modules/@neiwang/deployment/cordis.patch.yml'),'utf8'),/\.config/);
 assert.match(fs.readFileSync(path.join(f.root,'launcher/bootstrap.cjs'),'utf8'),/contextPolicy.apply/);
 f.p().run('rollback');for(const row of j.changes)assert.equal(f.p().current(row.path),row.before);assert.equal(fs.readFileSync(path.join(f.root,'data/config/model.enc'),'utf8'),'synthetic-preserved');
});
test('every combined write failure restores both subpatches; interruptions recover',t=>{
 const f=fixture(t),j=f.p().plan();
 for(let stop=1;stop<=j.changes.length;stop++){let n=0;assert.throws(()=>f.p({fault:step=>{if(step==='written'&&++n===stop)throw Error('fault')}}).run(),/fault/);for(const row of j.changes)assert.equal(f.p().current(row.path),row.before);}
 const p=f.p();p.save(j);p.write(j.changes[0],'after');assert.throws(()=>f.p().run(),/中断/);f.p().run('recover');for(const row of j.changes)assert.equal(f.p().current(row.path),row.before);
 f.p().run();f.put('data/config/model.enc','new synthetic data');f.put('launcher/context-policy.cjs','local edit');assert.throws(()=>f.p().run('rollback'),/停止回退/);assert.equal(fs.readFileSync(path.join(f.root,'data/config/model.enc'),'utf8'),'new synthetic data');
});
test('combined patch layers over previous tool/context patches and preserves their backups',t=>{
 const f=fixture(t);
 const {ToolDiscoveryPatch}=require('../tools/install-tool-discovery-patch.cjs'),{ContextModelsPatch}=require('../tools/install-context-models-patch.cjs');
 new ToolDiscoveryPatch(f.root,path.join(f.kit,'tools-kit'),{stopped:()=>{}}).run();
 new ContextModelsPatch(f.root,path.join(f.kit,'context-kit'),{stopped:()=>{}}).run();
 const names=['context-models','tool-discovery'],backups=names.map(n=>fs.readFileSync(path.join(f.root,'config/'+n+'-patch-backup.json')));
 const j=f.p().plan();f.p().run();f.p().run('rollback');for(const row of j.changes)assert.equal(f.p().current(row.path),row.before);
 names.forEach((n,i)=>assert.deepEqual(fs.readFileSync(path.join(f.root,'config/'+n+'-patch-backup.json')),backups[i]));
});
