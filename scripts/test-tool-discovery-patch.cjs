const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ToolDiscoveryPatch,FILES,BROWSER,CATALOG}=require('../tools/install-tool-discovery-patch.cjs');
const {hash,treeHash}=require('../tools/offline-plugin-manager.cjs');
const repo=path.resolve(__dirname,'..'),prefix=n=>'extensions/node_modules/'+n+'/';
function fixture(t,missing=false){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'tool-discovery-patch-')),root=path.join(home,'app'),kit=path.join(home,'kit');t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const put=(base,rel,data)=>{const p=path.join(base,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
 const rows=[],files=[];
 for(const rel of FILES){const data=fs.readFileSync(path.join(repo,rel.replace('extensions/node_modules/','extensions/')));put(kit,'payload/'+rel,data);files.push({path:rel,sha256:hash(data)});
  if(rel===prefix(CATALOG)+'catalog.mjs'||missing&&rel.startsWith(prefix(CATALOG)))continue;
  let before=data;if(rel.endsWith('package.json')||rel.endsWith('package-lock.json')){const j=JSON.parse(data);j.version=rel.startsWith(prefix(BROWSER))?'1.4.1':'1.0.0';if(j.packages?.[''])j.packages[''].version=j.version;before=Buffer.from(JSON.stringify(j));}
  for(const dest of [rel,'plugin-pack/payload/'+rel])put(root,dest,before);rows.push({path:rel,sha256:hash(before),mode:0o644});
 }
 put(root,prefix(BROWSER)+'node_modules/playwright-core/package.json',{version:'1.56.1'});
 put(root,'config/app.json',{version:'R11.6',coreVersion:'0.2.1-rc.3',bundles:[BROWSER],keep:'settings'});
 put(root,'plugin-pack/pack.json',{release:'R11.6',os:process.platform,arch:process.arch,bundles:[BROWSER],files:rows});
 const plugins={[BROWSER]:{version:'1.4.1',treeHash:treeHash(path.resolve(root,prefix(BROWSER))),requires:{}}};
 if(!missing)plugins[CATALOG]={version:'1.0.0',treeHash:treeHash(path.resolve(root,prefix(CATALOG))),requires:{}};
 put(root,'config/plugin-manager.json',{schemaVersion:1,managedNames:Object.keys(plugins),plugins,history:[]});
 for(const rel of ['data/config/model.enc','data/chat.txt','extensions/apis/connections/private.json','core/official.txt'])put(root,rel,'synthetic preserved');
 const support={};for(const name of ['install-tool-discovery-patch.cjs','offline-plugin-manager.cjs']){const data=fs.readFileSync(path.join(repo,'tools',name));put(kit,name,data);support[name]=hash(data);}
 put(kit,'patch.json',{kind:'tool-discovery-20261124',os:process.platform,arch:process.arch,nodeMajor:24,files,support});
 const before=new Map();for(const rel of [...FILES.flatMap(p=>[p,'plugin-pack/payload/'+p]),'config/app.json','plugin-pack/pack.json','config/plugin-manager.json']){const p=path.join(root,rel);before.set(rel,fs.existsSync(p)?fs.readFileSync(p):null);}
 return {root,kit,put,patch:options=>new ToolDiscoveryPatch(root,kit,{stopped:()=>{},...options}),restored(){for(const [rel,b]of before){const p=path.join(root,rel);if(b===null)assert(!fs.existsSync(p),rel);else assert.deepEqual(fs.readFileSync(p),b,rel);}},protected(){for(const rel of ['data/config/model.enc','data/chat.txt','extensions/apis/connections/private.json','core/official.txt'])assert.equal(fs.readFileSync(path.join(root,rel),'utf8'),'synthetic preserved');}};
}
test('updates both copies and managed hashes; installs missing catalog; repeat and rollback preserve data',t=>{
 for(const missing of [false,true]){const f=fixture(t,missing);assert.equal(f.patch().run('check').status,'ready');assert.equal(f.patch().run().status,'installed');assert.equal(f.patch().run().status,'unchanged');
  const app=JSON.parse(fs.readFileSync(path.join(f.root,'config/app.json')));assert(app.bundles.includes(CATALOG));assert.equal(app.coreVersion,'0.2.1-rc.3');
  for(const rel of FILES)assert.deepEqual(fs.readFileSync(path.join(f.root,rel)),fs.readFileSync(path.join(f.root,'plugin-pack/payload',rel)));
  f.protected();f.patch().run('rollback');f.restored();f.protected();assert.equal(f.patch().run().status,'installed');
 }
});
test('each failed write restores original bytes and missing files',t=>{
 const count=fixture(t,true).patch().plan().changes.length;
 for(let n=1;n<=count;n++){const f=fixture(t,true);let calls=0;assert.throws(()=>f.patch({fault:stage=>{if(stage==='written'&&++calls===n)throw Error('fault')}}).run(),/fault/);f.restored();f.protected();}
});
test('corrupt kit, diverging payload, unsupported core and later edits are rejected',t=>{
 let f=fixture(t);fs.appendFileSync(path.join(f.kit,'payload',FILES[0]),'changed');assert.throws(()=>f.patch().run(),/校验/);f.restored();
 f=fixture(t,true);fs.appendFileSync(path.join(f.root,'plugin-pack/payload',FILES[0]),'changed');assert.throws(()=>f.patch().run(),/不一致/);
 f=fixture(t);f.put(f.root,'config/app.json',{version:'R11.6',coreVersion:'0.2.2-rc.5'});assert.throws(()=>f.patch().run(),/仅支持/);
 f=fixture(t);f.patch().run();fs.appendFileSync(path.join(f.root,FILES[0]),'local edit');assert.throws(()=>f.patch().run('rollback'),/停止回退/);f.protected();
});
test('an interrupted transaction is recoverable and a live app blocks installation',t=>{
 const f=fixture(t,true),p=f.patch(),j=p.plan();p.save(j);p.write(j.changes[0],'after');assert.throws(()=>f.patch().run(),/上次安装中断/);f.patch().run('recover');f.restored();
 assert.throws(()=>new ToolDiscoveryPatch(f.root,f.kit,{stopped:()=>{throw Error('live app')}}).run(),/live app/);
});
