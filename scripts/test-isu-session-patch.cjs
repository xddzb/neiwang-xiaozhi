'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {IsuPatch,FILES,NAME,BUSINESS,NEW}=require('../tools/install-isu-session-patch.cjs');
const {hash,treeHash}=require('../tools/offline-plugin-manager.cjs');
const repo=path.resolve(__dirname,'..'),prefix=n=>'extensions/node_modules/'+n+'/';
function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'isu-patch-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const root=path.join(home,'app'),kit=path.join(home,'kit'),put=(base,rel,data)=>{const p=path.join(base,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);fs.chmodSync(p,0o640)};
 const rows=[],originals=new Map(),files=[];
 for(const rel of FILES){
  const source=rel.replace('extensions/node_modules/','extensions/');let data=fs.readFileSync(path.join(repo,source));
  // This transaction suite targets the frozen 1.4.1 ISU patch, not today's plugin release.
  if([prefix(NAME)+'package.json',prefix(NAME)+'package-lock.json'].includes(rel)){
   const pkg=JSON.parse(data);pkg.version='1.4.1';if(pkg.packages?.[''])pkg.packages[''].version='1.4.1';data=Buffer.from(JSON.stringify(pkg));
  }
  put(kit,'payload/'+rel,data);
  const row={path:rel,sha256:hash(data)};let before=Buffer.from('// original '+rel+'\n');
  if(rel===prefix(NAME)+'package.json')before=Buffer.from(JSON.stringify({name:NAME,version:'1.0.1'}));
  if(rel.startsWith('tools/'))row.allowedBefore=[hash(before),hash(data)];files.push(row);
  for(const dest of rel.startsWith('extensions/')?[rel,'plugin-pack/payload/'+rel]:[rel]){originals.set(dest,NEW.has(rel)?null:before);if(!NEW.has(rel))put(root,dest,before)}
  if(rel.startsWith('extensions/')&&!NEW.has(rel))rows.push({path:rel,sha256:hash(before),mode:0o640});
 }
 put(root,prefix(BUSINESS)+'package.json',JSON.stringify({name:BUSINESS,version:'1.1.0'}));
 put(root,prefix(NAME)+'node_modules/playwright-core/package.json',JSON.stringify({version:'1.56.1'}));
 put(root,prefix(NAME)+'nested/z.txt','keep');put(root,prefix(NAME)+'nested-file.txt','keep');
 put(root,'config/app.json',JSON.stringify({version:'R11.6',coreVersion:'0.2.1-rc.3'}));
 put(root,'plugin-pack/pack.json',JSON.stringify({release:'R11.6',os:process.platform,arch:process.arch,files:rows,links:[]}));
 put(root,'extensions/apis/connections/weekly-isu.json',JSON.stringify({base_url:'https://isu.example.invalid',browser_session:{driver:'playwright',allowed_origins:['https://isu.example.invalid']}}));
 put(root,'extensions/apis/sources/isu-instruments.json',JSON.stringify({enabled:true,read_only:true,transport:'isu-engineio3'}));
 put(root,'config/plugin-manager.json',JSON.stringify({schemaVersion:1,history:['old'],managedNames:[NAME,BUSINESS],plugins:Object.fromEntries([NAME,BUSINESS].map(n=>[n,{version:n===NAME?'1.0.1':'1.1.0',treeHash:treeHash(path.resolve(root,prefix(n))),requires:{},transaction:'old'}]))}));
 const protectedFiles=['config/app.json','extensions/apis/connections/weekly-isu.json','extensions/apis/sources/isu-instruments.json','data/business-browser/Cookies','data/config/model.enc','data/config/isu-instruments.json','data/dingtalk-official/owner.json','workspace/keep.txt'];
 for(const rel of protectedFiles){if(!fs.existsSync(path.join(root,rel)))put(root,rel,'SYNTHETIC_PRIVATE_KEEP');originals.set(rel,fs.readFileSync(path.join(root,rel)))}
 for(const rel of ['plugin-pack/pack.json','config/plugin-manager.json'])originals.set(rel,fs.readFileSync(path.join(root,rel)));
 const support=['install-isu-session-patch.cjs','offline-plugin-manager.cjs'].map(name=>{const data=fs.readFileSync(path.join(repo,'tools',name));put(kit,name,data);return {path:name,sha256:hash(data)}});
 put(kit,'patch.json',JSON.stringify({schemaVersion:1,kind:'neiwang-isu-session-delta',id:'isu-session-1.4.1',compatibility:{os:process.platform,arch:process.arch,nodeMajor:24,coreVersions:['0.2.1-rc.3']},files,support}));
 const assertOriginal=()=>{for(const [rel,data]of originals)if(data===null)assert(!fs.existsSync(path.join(root,rel)),rel);else assert.deepEqual(fs.readFileSync(path.join(root,rel)),data,rel)};
 const assertProtected=()=>{for(const rel of protectedFiles)assert.deepEqual(fs.readFileSync(path.join(root,rel)),originals.get(rel),rel)};
 return {root,kit,put,assertOriginal,assertProtected,patch:(options={})=>new IsuPatch(root,kit,{stopped:()=>{},...options})};
}
test('install both plugin copies and tools, register new files, preserve configuration, repeat and rollback',t=>{
 const f=fixture(t),p=f.patch();assert.equal(p.check().status,'PASS');f.assertOriginal();assert.equal(p.install().status,'INSTALLED');f.assertProtected();assert.equal(p.install().status,'UNCHANGED');
 const pack=JSON.parse(fs.readFileSync(path.join(f.root,'plugin-pack/pack.json')));
 for(const rel of FILES){assert.deepEqual(fs.readFileSync(path.join(f.root,rel)),fs.readFileSync(path.join(f.kit,'payload',rel)));if(rel.startsWith('extensions/')){assert.deepEqual(fs.readFileSync(path.join(f.root,rel)),fs.readFileSync(path.join(f.root,'plugin-pack/payload',rel)));assert.equal(pack.files.find(x=>x.path===rel).sha256,hash(fs.readFileSync(path.join(f.root,rel))))}}
 const registry=JSON.parse(fs.readFileSync(path.join(f.root,'config/plugin-manager.json')));for(const n of [NAME,BUSINESS])assert.equal(registry.plugins[n].treeHash,treeHash(path.resolve(f.root,prefix(n))));
 assert.equal(p.rollback().status,'ROLLED_BACK');f.assertOriginal();assert.equal(p.rollback().status,'UNCHANGED');p.install();f.assertProtected();
});
test('every interrupted application write restores old bytes and removes new files',t=>{
 for(let at=1;at<=34;at++){const f=fixture(t);let count=0;assert.throws(()=>f.patch({fault:step=>{if(step==='written'&&++count===at)throw Error('synthetic fault')}}).install(),/synthetic fault/);f.assertOriginal()}
});
test('modified tools, mismatched plugin copies, corrupt patch and incompatible ISU configuration are rejected',t=>{
 const a=fixture(t);fs.appendFileSync(path.join(a.root,'tools/api_tool.py'),'local');assert.throws(()=>a.patch().install(),/基线|修改/);a.assertProtected();
 const b=fixture(t);fs.appendFileSync(path.join(b.kit,'payload',FILES[0]),'corrupt');assert.throws(()=>b.patch().install(),/校验/);b.assertOriginal();
 const c=fixture(t);fs.appendFileSync(path.join(c.root,FILES[0]),'local');assert.throws(()=>c.patch().install(),/本地修改|不一致/);c.assertProtected();
 const d=fixture(t);d.put(d.root,'extensions/apis/connections/weekly-isu.json','{}');assert.throws(()=>d.patch().install(),/连接地址/);
 const e=fixture(t);assert.throws(()=>e.patch({stopped:()=>{throw Error('APP running')}}).install(),/APP running/);e.assertOriginal();
});
test('process termination and interrupted rollback remain recoverable; edited files block rollback',t=>{
 const f=fixture(t),program=`const {IsuPatch}=require(${JSON.stringify(path.join(repo,'tools/install-isu-session-patch.cjs'))});new IsuPatch(process.argv[1],process.argv[2],{stopped:()=>{},fault:s=>{if(s==='written')process.exit(73)}}).install()`;
 assert.equal(cp.spawnSync(process.execPath,['-e',program,f.root,f.kit]).status,73);assert.throws(()=>f.patch().install(),/中断/);assert.equal(f.patch().recover().status,'RECOVERED');f.assertOriginal();
 f.patch().install();assert.throws(()=>f.patch({fault:s=>{if(s==='restored')throw Error('restore stopped')}}).rollback(),/restore stopped/);assert.equal(f.patch().recover().status,'RECOVERED');f.assertOriginal();
 f.patch().install();fs.appendFileSync(path.join(f.root,'tools/api_tool.py'),'local');assert.throws(()=>f.patch().rollback(),/已被修改/);f.assertProtected();
});
test('symlinks cannot redirect patch writes',{skip:process.platform==='win32'},t=>{const f=fixture(t),p=path.join(f.root,'tools/api_tool.py');fs.unlinkSync(p);fs.symlinkSync(path.join(f.root,'workspace/keep.txt'),p);assert.throws(()=>f.patch().install(),/links|链接/i);f.assertProtected()});

test('page URL provisioning preserves other connection fields and rollback restores it',t=>{
 const f=fixture(t),file=path.join(f.kit,'patch.json'),m=JSON.parse(fs.readFileSync(file));m.page_url='https://isu.example.invalid/#/realtime';fs.writeFileSync(file,JSON.stringify(m));
 const cfile=path.join(f.root,'extensions/apis/connections/weekly-isu.json'),before=JSON.parse(fs.readFileSync(cfile));before.verify_tls=false;fs.writeFileSync(cfile,JSON.stringify(before));const raw=fs.readFileSync(cfile);
 const p=f.patch();p.install();const after=JSON.parse(fs.readFileSync(cfile));assert.equal(after.verify_tls,false);assert.equal(after.browser_session.isu_realtime_url,m.page_url);assert.equal(p.install().status,'UNCHANGED');p.rollback();assert.deepEqual(fs.readFileSync(cfile),raw);
 m.page_url='https://other.example.invalid/#/realtime';fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>p.install(),/页面地址/);assert.deepEqual(fs.readFileSync(cfile),raw);
});
