'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync,spawn}=require('node:child_process');
const {Manager,treeHash,hash,assertStopped}=require('../tools/offline-plugin-manager.cjs');
const {build}=require('./build-offline-plugin.cjs'),{setup}=require('../tools/setup-plugin-manager.cjs');
const repo=path.resolve(__dirname,'..'),managerModule=path.join(repo,'tools/offline-plugin-manager.cjs');
function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'nw-plugin-test-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const root=path.join(home,'app');
 const put=(rel,value)=>{const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof value==='string'?value:JSON.stringify(value))};
 put('config/app.json',{version:'R11.3',coreVersion:'0.2.0-rc.2',bundles:['@neiwang/brand'],port:3080});
 for(const rel of ['data/config/model.enc','data/config/dify.enc','data/config/.local-key','data/dingtalk-official/binding.json','data/dsh/profiles/web/cordis.patch.yml','workspace/document.txt','core/0.2.0-rc.2/unchanged','config/custom-settings.json'])put(rel,'synthetic-preserved:'+rel);
 fs.mkdirSync(path.join(root,'extensions/node_modules'),{recursive:true});
 const protectedBefore=protectedHash(root),manager=new Manager(root,{stopped:()=>{}});
 const pack=(version,name='@example/sample',requires={},extra={})=>{
  const source=path.join(home,'source-'+cryptoId());fs.mkdirSync(source);fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name,version,main:'index.cjs',dsh:{bundle:{patch:'./cordis.patch.yml'}},...extra}));fs.writeFileSync(path.join(source,'index.cjs'),'module.exports='+JSON.stringify(version));fs.writeFileSync(path.join(source,'cordis.patch.yml'),'[]\n');
  const output=path.join(home,'pack-'+cryptoId());build({source,output,coreVersions:['0.2.0-rc.2'],os:process.platform,arch:process.arch,requires});return output;
 };
 return {root,home,put,pack,manager,protectedBefore,verify:()=>assert.equal(protectedHash(root),protectedBefore)};
}
function cryptoId(){return require('node:crypto').randomBytes(5).toString('hex')}
function protectedHash(root){const rows=[];for(const dir of ['data','workspace','core','config']){const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name),r=path.relative(root,q).replaceAll('\\','/');if(['config/app.json','config/plugin-manager.json','config/.plugin-install.lock'].includes(r))continue;if(e.isDirectory())walk(q);else rows.push([r,hash(fs.readFileSync(q))])}};walk(path.join(root,dir))}return hash(JSON.stringify(rows.sort()))}
const edit=(pack,fn)=>{const file=path.join(pack,'plugin-package.json'),m=JSON.parse(fs.readFileSync(file));fn(m);fs.writeFileSync(file,JSON.stringify(m))};
test('offline add/upgrade, stale files removed, idempotency, repeated rollback preserve all configuration',t=>{
 const f=fixture(t),v1=f.pack('1.0.0');global.fetch=()=>{throw Error('network forbidden')};
 assert.equal(f.manager.check(v1).status,'PASS');const first=f.manager.install(v1);assert.equal(first.status,'INSTALLED');
 const target=path.join(f.root,'extensions/node_modules/@example/sample');assert.equal(require(path.join(target,'index.cjs')),'1.0.0');
 assert.equal(f.manager.install(v1).status,'UNCHANGED');const v2=f.pack('2.0.0');f.manager.install(v2);assert.equal(JSON.parse(fs.readFileSync(path.join(target,'package.json'))).version,'2.0.0');
 assert.throws(()=>f.manager.install(v1),/Downgrade/);f.manager.rollback();assert.equal(JSON.parse(fs.readFileSync(path.join(target,'package.json'))).version,'1.0.0');f.manager.rollback();assert.equal(fs.existsSync(target),false);assert.equal(f.manager.list().enabledBundles.includes('@example/sample'),false);f.verify();
});
test('upgrade replaces whole owned directory and backs up original unmanaged plugin',t=>{
 const f=fixture(t);f.put('extensions/node_modules/@example/sample/package.json',{name:'@example/sample',version:'0.9.0'});f.put('extensions/node_modules/@example/sample/obsolete.cjs','old');const target=path.join(f.root,'extensions/node_modules/@example/sample'),old=treeHash(target),p=f.pack('1.0.0');
 assert.throws(()=>f.manager.install(p),/adopt-existing/);f.manager.install(p,{adoptExisting:true});assert.equal(fs.existsSync(path.join(target,'obsolete.cjs')),false);f.manager.rollback();assert.equal(treeHash(target),old);f.verify();
});
test('reject incompatible core/CPU, bad digest, missing deps, traversal, reserved core and changed local plugin',t=>{
 const f=fixture(t);for(const mutate of [m=>m.compatibility.coreVersions=['future'],m=>m.compatibility.arch='wrong',m=>m.plugins[0].files[0].sha256='0'.repeat(64),m=>m.plugins[0].files[0].path='../data/config/model.enc',m=>m.plugins[0].name='@deepseek-ai/dsh']){const p=f.pack('1.0.0');edit(p,mutate);assert.throws(()=>f.manager.install(p))}
 assert.throws(()=>f.manager.install(f.pack('1.0.0','@example/sample',{}, {dependencies:{missing:'1.0.0'}})),/dependency/);
 const p=f.pack('1.0.0');assert.throws(()=>f.manager.install(p,{expectedSha256:'0'.repeat(64)}),/SHA256/);f.manager.install(p);f.put('extensions/node_modules/@example/sample/local-change.txt','keep');assert.throws(()=>f.manager.install(f.pack('2.0.0')),/changed locally/);assert.throws(()=>f.manager.rollback(),/modified/);f.verify();
});
test('dependency upgrades cannot break an already managed consumer',t=>{
 const f=fixture(t);f.manager.install(f.pack('1.0.0','@example/base'));f.manager.install(f.pack('1.0.0','@example/consumer',{'@example/base':['1.0.0']}));assert.throws(()=>f.manager.install(f.pack('2.0.0','@example/base')),/dependency/);f.verify();
});
for(const phase of ['prepared','backed-up','swapped','app-written','registry-written'])test('automatic failure restoration at '+phase,t=>{
 const f=fixture(t);f.manager.install(f.pack('1.0.0'));const before=treeHash(path.join(f.root,'extensions/node_modules/@example/sample')),m=new Manager(f.root,{stopped:()=>{},fault:point=>{if(point===phase)throw Error('synthetic disk failure')}});
 assert.throws(()=>m.install(f.pack('2.0.0')),/synthetic disk failure/);assert.equal(treeHash(path.join(f.root,'extensions/node_modules/@example/sample')),before);assert.equal(f.manager.list().managedPlugins['@example/sample'].version,'1.0.0');assert.equal(f.manager.recover().status,'NO_PENDING_TRANSACTION');f.verify();
});
for(const phase of ['prepared','backed-up','swapped','app-written','registry-written'])test('process interruption and explicit recovery at '+phase,t=>{
 const f=fixture(t);f.manager.install(f.pack('1.0.0'));const before=treeHash(path.join(f.root,'extensions/node_modules/@example/sample')),p=f.pack('2.0.0');
 const code=`const {Manager}=require(process.argv[1]);new Manager(process.argv[2],{stopped:()=>{},fault:p=>{if(p===process.argv[4])process.exit(73)}}).install(process.argv[3])`;
 const r=spawnSync(process.execPath,['-e',code,managerModule,f.root,p,phase],{encoding:'utf8'});assert.equal(r.status,73,r.stderr);assert.throws(()=>f.manager.install(p),/Interrupted/);assert.equal(f.manager.recover().status,'RECOVERED');assert.equal(treeHash(path.join(f.root,'extensions/node_modules/@example/sample')),before);f.verify();
});
test('startup reconciliation removes rolled-back bundle while preserving user profile settings',t=>{
 const f=fixture(t),sync=require('../launcher/plugin-profile.cjs');f.manager.install(f.pack('1.0.0'));f.manager.rollback();
 const profile={dependencies:{'@example/sample':'1.0.0','user-plugin':'1.0.0'},dsh:{profile:{bundles:['@example/sample','user-plugin']}}};sync(f.root,profile,JSON.parse(fs.readFileSync(path.join(f.root,'config/app.json'))));assert.deepEqual(profile.dsh.profile.bundles,['user-plugin']);assert.equal(profile.dependencies['user-plugin'],'1.0.0');f.verify();
});
test('multi-plugin transaction restores all directories when second replacement fails',t=>{
 const f=fixture(t);f.manager.install(f.pack('1.0.0','@example/base'));const p=f.pack('2.0.0','@example/base'),q=f.pack('1.0.0','@example/new');
 const first=JSON.parse(fs.readFileSync(path.join(p,'plugin-package.json'))),second=JSON.parse(fs.readFileSync(path.join(q,'plugin-package.json')));first.plugins.push(second.plugins[0]);fs.writeFileSync(path.join(p,'plugin-package.json'),JSON.stringify(first));fs.cpSync(path.join(q,'payload/@example/new'),path.join(p,'payload/@example/new'),{recursive:true});
 const m=new Manager(f.root,{stopped:()=>{},fault:(phase,plugin)=>{if(phase==='swapped'&&plugin.name==='@example/new')throw Error('second plugin failure')}});assert.throws(()=>m.install(p),/second plugin failure/);assert.equal(f.manager.list().managedPlugins['@example/base'].version,'1.0.0');assert.equal(fs.existsSync(path.join(f.root,'extensions/node_modules/@example/new')),false);f.verify();
});
for(const phase of ['restore-plugin','restore-app','restore-registry'])test('rollback can resume after interruption at '+phase,t=>{
 const f=fixture(t);f.manager.install(f.pack('1.0.0'));f.manager.install(f.pack('2.0.0'));
 const code=`const {Manager}=require(process.argv[1]);new Manager(process.argv[2],{stopped:()=>{},fault:p=>{if(p===process.argv[3])process.exit(73)}}).rollback()`;
 const r=spawnSync(process.execPath,['-e',code,managerModule,f.root,phase],{encoding:'utf8'});assert.equal(r.status,73,r.stderr);assert.equal(f.manager.recover().status,'RECOVERED');assert.equal(f.manager.list().managedPlugins['@example/sample'].version,'1.0.0');f.verify();
});
test('configuration changed outside manager prevents rollback rather than overwriting it',t=>{
 const f=fixture(t);f.manager.install(f.pack('1.0.0'));const app=JSON.parse(fs.readFileSync(path.join(f.root,'config/app.json')));app.port=9999;f.put('config/app.json',app);assert.throws(()=>f.manager.rollback(),/Configuration changed/);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'config/app.json'))).port,9999);f.verify();
});
test('interruption after commit finalizes the new plugin rather than reverting it',t=>{
 const f=fixture(t),p=f.pack('1.0.0');const code=`const {Manager}=require(process.argv[1]);new Manager(process.argv[2],{stopped:()=>{},fault:p=>{if(p==='committed')process.exit(73)}}).install(process.argv[3])`;
 const r=spawnSync(process.execPath,['-e',code,managerModule,f.root,p],{encoding:'utf8'});assert.equal(r.status,73,r.stderr);assert.equal(f.manager.recover().status,'COMMITTED');assert.equal(f.manager.list().managedPlugins['@example/sample'].version,'1.0.0');f.verify();
});
test('correctly hashed wrong native library and unexpected files are rejected',t=>{
 const f=fixture(t),p=f.pack('1.0.0'),payload=path.join(p,'payload/@example/sample');fs.writeFileSync(path.join(payload,'foreign.node'),'wrong architecture');edit(p,m=>m.plugins[0].files.push({path:'foreign.node',size:18,mode:0o644,sha256:hash('wrong architecture')}));assert.throws(()=>f.manager.install(p),/Native/);
 const q=f.pack('1.0.0');fs.writeFileSync(path.join(q,'payload/@example/sample/unlisted.cjs'),'unexpected');assert.throws(()=>f.manager.install(q),/unlisted/);f.verify();
});
test('retrofit is idempotent, launcher only changes hooks, guard blocks pending install',t=>{
 const f=fixture(t),kit=path.join(f.home,'kit');fs.mkdirSync(kit);for(const [source,dest]of [['tools/offline-plugin-manager.cjs','offline-plugin-manager.cjs'],['tools/setup-plugin-manager.cjs','setup-plugin-manager.cjs'],['launcher/plugin-profile.cjs','plugin-profile.cjs'],['tools/manage-plugins.sh','manage-plugins.sh']])fs.copyFileSync(path.join(repo,source),path.join(kit,dest));
 fs.writeFileSync(path.join(kit,'kit-manifest.json'),JSON.stringify({schemaVersion:1,files:fs.readdirSync(kit).map(name=>({path:name,sha256:hash(fs.readFileSync(path.join(kit,name)))}))}));
 f.put('launcher/bootstrap.cjs',fs.readFileSync(path.join(repo,'release-source/kylin-r11.3/launcher/bootstrap.cjs'),'utf8'));setup(f.root,kit,{stopped:()=>{}});const once=fs.readFileSync(path.join(f.root,'launcher/bootstrap.cjs'),'utf8');setup(f.root,kit,{stopped:()=>{}});assert.equal(fs.readFileSync(path.join(f.root,'launcher/bootstrap.cjs'),'utf8'),once);assert.equal(once.split("require('./plugin-profile.cjs').assertReady(root)").length,2);fs.appendFileSync(path.join(kit,'plugin-profile.cjs'),'corruption');assert.throws(()=>setup(f.root,kit,{stopped:()=>{}}),/checksum/);assert.equal(fs.readFileSync(path.join(f.root,'launcher/bootstrap.cjs'),'utf8'),once);const helper=require('../launcher/plugin-profile.cjs');helper.assertReady(f.root);f.put('extensions/.plugin-manager/active.json',{id:'pending'});assert.throws(()=>helper.assertReady(f.root),/安装/);f.verify();
});
test('symlink payload/target escape rejected without touching external file',{skip:process.platform==='win32'},t=>{
 const f=fixture(t),p=f.pack('1.0.0'),target=path.join(p,'payload/@example/sample/index.cjs'),outside=path.join(f.home,'outside');fs.writeFileSync(outside,'protected');fs.unlinkSync(target);fs.symlinkSync(outside,target);assert.throws(()=>f.manager.install(p),/Symbolic/);assert.equal(fs.readFileSync(outside,'utf8'),'protected');f.verify();
});
test('APP running check blocks launcher process',{skip:process.platform==='win32'},async t=>{
 const f=fixture(t);f.put('launcher/running.cjs','process.stdout.write("READY\\n");setInterval(()=>{},1000)');const child=spawn(process.execPath,[path.join(f.root,'launcher/running.cjs')],{stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject)});assert.throws(()=>assertStopped(f.root),/退出/);
});
test('different installation user is rejected before changing plugin files',{skip:!process.getuid||process.getuid()!==0},t=>{
 const f=fixture(t);fs.chownSync(path.join(f.root,'config/app.json'),65534,65534);assert.throws(()=>f.manager.install(f.pack('1.0.0')),/所属用户/);assert.equal(fs.existsSync(path.join(f.root,'config/plugin-manager.json')),false);f.verify();
});
