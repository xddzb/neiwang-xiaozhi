'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {BrowserPatch,FILES,NAME}=require('../tools/install-browser-url-patch.cjs');
const {hash,treeHash}=require('../tools/offline-plugin-manager.cjs');
const repo=path.resolve(__dirname,'..'),prefix='extensions/node_modules/'+NAME+'/';
function fixture(t,{registered=true}={}){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'nw-browser-delta-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const root=path.join(home,'app'),kit=path.join(home,'kit');fs.mkdirSync(kit);
 const put=(base,rel,data)=>{const file=path.join(base,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);fs.chmodSync(file,0o640)};
 const files=[];for(const name of FILES){const data=fs.readFileSync(path.join(repo,'extensions/@neiwang/browser-automation',name));put(kit,'payload/'+name,data);files.push({path:name,sha256:hash(data)});
  const before=name==='package.json'?Buffer.from(JSON.stringify({name:NAME,version:'1.0.0'})):Buffer.from('original '+name+'\n');
  put(root,prefix+name,before);put(root,'plugin-pack/payload/'+prefix+name,before);
 }
 const support=[];for(const name of ['install-browser-url-patch.cjs','offline-plugin-manager.cjs']){const data=fs.readFileSync(path.join(repo,'tools',name));put(kit,name,data);support.push({path:name,sha256:hash(data)})}
 put(kit,'patch.json',JSON.stringify({schemaVersion:1,kind:'neiwang-browser-url-delta',id:'browser-url-1.0.1',compatibility:{os:process.platform,arch:process.arch,nodeMajor:24,coreVersions:['0.2.1-rc.3']},files,support}));
 put(root,'config/app.json',JSON.stringify({version:'R11.6',coreVersion:'0.2.1-rc.3',bundles:[NAME]}));
 put(root,prefix+'node_modules/playwright-core/package.json',JSON.stringify({version:'1.56.1'}));put(root,prefix+'custom-keep.txt','synthetic custom plugin file');
 put(root,'plugin-pack/pack.json',JSON.stringify({release:'R11.6',os:process.platform,arch:process.arch,files:FILES.map(name=>({path:prefix+name,mode:0o640,sha256:hash(fs.readFileSync(path.join(root,prefix+name)))})),links:[]}));
 if(registered)put(root,'config/plugin-manager.json',JSON.stringify({schemaVersion:1,plugins:{[NAME]:{version:'1.0.0',treeHash:treeHash(path.resolve(root,prefix)),requires:{},transaction:'earlier'}},managedNames:[NAME],history:['earlier']}));
 const protectedFiles=['config/app.json','data/config/model.enc','data/config/dify.enc','data/config/.local-key','data/config/rag-policy.json','data/dingtalk-official/owner.json','data/business-browser/Cookies','workspace/important.txt','extensions/apis/connections/user.json','tools/api_tool.py',prefix+'custom-keep.txt',prefix+'node_modules/playwright-core/package.json'];
 for(const name of protectedFiles.filter(x=>x!=='config/app.json'&&!x.startsWith(prefix)))put(root,name,'SYNTHETIC_PRIVATE_KEEP:'+name);
 const snapshot=Object.fromEntries([...protectedFiles,...FILES.flatMap(name=>[prefix+name,'plugin-pack/payload/'+prefix+name]),'plugin-pack/pack.json',...(registered?['config/plugin-manager.json']:[])].map(rel=>[rel,fs.readFileSync(path.join(root,rel))]));
 const assertOriginal=()=>{for(const [rel,data]of Object.entries(snapshot))assert.deepEqual(fs.readFileSync(path.join(root,rel)),data,rel)};
 const assertProtected=()=>{for(const rel of protectedFiles)assert.deepEqual(fs.readFileSync(path.join(root,rel)),snapshot[rel],rel)};
 return {root,kit,put,assertOriginal,assertProtected,patch:(options={})=>new BrowserPatch(root,kit,{stopped:()=>{},...options})};
}
test('delta updates both copies, manifest and registered hash; repeat and rollback preserve private state',t=>{
 const f=fixture(t),p=f.patch();assert.equal(p.check().status,'PASS');f.assertOriginal();assert.equal(p.install().status,'INSTALLED');f.assertProtected();
 for(const file of FILES)assert.deepEqual(fs.readFileSync(path.join(f.root,prefix,file)),fs.readFileSync(path.join(f.root,'plugin-pack/payload',prefix,file)));
 const manifest=JSON.parse(fs.readFileSync(path.join(f.root,'plugin-pack/pack.json')));for(const row of manifest.files)assert.equal(hash(fs.readFileSync(path.join(f.root,row.path))),row.sha256);
 const registry=JSON.parse(fs.readFileSync(path.join(f.root,'config/plugin-manager.json')));assert.equal(registry.plugins[NAME].treeHash,treeHash(path.resolve(f.root,prefix)));assert.equal(registry.plugins[NAME].version,'1.0.1');
 assert.equal(p.install().status,'UNCHANGED');assert.equal(p.rollback().status,'ROLLED_BACK');f.assertOriginal();assert.equal(p.rollback().status,'UNCHANGED');
});
test('unmanaged existing plugin is preserved as unmanaged after patch and rollback',t=>{const f=fixture(t,{registered:false}),p=f.patch();p.install();assert(!fs.existsSync(path.join(f.root,'config/plugin-manager.json')));p.rollback();f.assertOriginal()});
test('every interrupted write is rolled back before reporting ordinary failure',t=>{
 for(let at=1;at<=14;at++){const f=fixture(t);let count=0;const p=f.patch({fault:step=>{if(step==='written'&&++count===at)throw Error('synthetic failure')}});assert.throws(()=>p.install(),/synthetic failure/);f.assertOriginal();assert.equal(p.recover().status,'NO_PENDING_PATCH')}
});
test('corrupt kit and diverging runtime/payload are refused before any mutation',t=>{
 const a=fixture(t);fs.appendFileSync(path.join(a.kit,'payload/controller.mjs'),'broken');assert.throws(()=>a.patch().install(),/校验失败/);a.assertOriginal();
 const b=fixture(t,{registered:false});fs.appendFileSync(path.join(b.root,prefix+'controller.mjs'),'user change');assert.throws(()=>b.patch().install(),/不一致/);b.assertProtected();
});
test('wrong core, OS, live app and links cannot be patched',t=>{
 const a=fixture(t);const file=path.join(a.kit,'patch.json'),m=JSON.parse(fs.readFileSync(file));m.compatibility.coreVersions=['unsupported'];fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>a.patch().install(),/不匹配/);a.assertOriginal();
 const b=fixture(t);assert.throws(()=>b.patch({stopped:()=>{throw Error('APP running')}}).install(),/APP running/);b.assertOriginal();
});
test('symbolic links cannot be patched',{skip:process.platform==='win32'},t=>{const c=fixture(t),link=path.join(c.root,prefix+'controller.mjs');fs.unlinkSync(link);fs.symlinkSync(path.join(c.root,'workspace/important.txt'),link);assert.throws(()=>c.patch().install(),/links|链接/i);c.assertProtected()});
test('later user edits stop rollback before it changes any other file',t=>{
 const f=fixture(t),p=f.patch();p.install();const manifest=fs.readFileSync(path.join(f.root,'plugin-pack/pack.json'));fs.appendFileSync(path.join(f.root,prefix+'index.mjs'),'user change');assert.throws(()=>p.rollback(),/已被修改/);assert.deepEqual(fs.readFileSync(path.join(f.root,'plugin-pack/pack.json')),manifest);f.assertProtected();
});
test('abrupt process exit leaves a recoverable transaction; reinstall succeeds',t=>{
 const f=fixture(t);const program=`const {BrowserPatch}=require(${JSON.stringify(path.join(repo,'tools/install-browser-url-patch.cjs'))});new BrowserPatch(process.argv[1],process.argv[2],{stopped:()=>{},fault:s=>{if(s==='written')process.exit(73)}}).install()`;
 const result=cp.spawnSync(process.execPath,['-e',program,f.root,f.kit],{encoding:'utf8'});assert.equal(result.status,73,result.stderr);
 assert.throws(()=>f.patch().install(),/中断/);assert.equal(f.patch().recover().status,'RECOVERED');f.assertOriginal();f.patch().install();f.assertProtected();
});
test('interrupted rollback remains recoverable and corrupted backups are rejected',t=>{
 const f=fixture(t);f.patch().install();assert.throws(()=>f.patch({fault:s=>{if(s==='restored')throw Error('restore stopped')}}).rollback(),/restore stopped/);assert.equal(f.patch().recover().status,'RECOVERED');f.assertOriginal();
 const g=fixture(t),p=g.patch();p.install();const {file,j}=p.journal();j.changes[0].before='Y29ycnVwdA==';fs.writeFileSync(file,JSON.stringify(j));assert.throws(()=>p.rollback(),/备份损坏/);g.assertProtected();
});
