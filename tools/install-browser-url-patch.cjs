'use strict';
// Delta transaction: shared manager lock/process checks, no downloads or user-data writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Manager,safe,atomic,hash,treeHash}=require('./offline-plugin-manager.cjs');
const NAME='@neiwang/browser-automation',PREFIX='extensions/node_modules/'+NAME+'/';
const FILES=['controller.mjs','index.mjs','compact.mjs','browser-main.cjs','package.json','package-lock.json'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const current=p=>fs.existsSync(p)?fs.readFileSync(p).toString('base64'):null;
const store=(p,v,mode)=>{if(v===null){if(fs.existsSync(p))fs.unlinkSync(p)}else{atomic(p,Buffer.from(v,'base64'));if(mode!==undefined)fs.chmodSync(p,mode)}};
class BrowserPatch{
 constructor(root,kit=__dirname,options={}){
  this.manager=new Manager(root,options);this.root=this.manager.root;this.kit=fs.realpathSync(kit);this.fault=options.fault||(()=>{});
  this.state=safe(this.root,'extensions/.plugin-manager/browser-url-patch-state.json');
 }
 verify(){
  const m=read(path.join(this.kit,'patch.json')),c=m.compatibility,app=read(this.manager.appFile);
  if(m.kind!=='neiwang-browser-url-delta'||m.schemaVersion!==1||m.id!=='browser-url-1.0.1'||!c||c.os!==process.platform||c.arch!==process.arch||c.nodeMajor!==Number(process.versions.node.split('.')[0])||!Array.isArray(c.coreVersions)||!c.coreVersions.includes(app.coreVersion))throw Error('补丁与内核/系统/CPU/Node不匹配，未修改文件');
  if(!Array.isArray(m.files)||m.files.length!==FILES.length||new Set(m.files.map(x=>x.path)).size!==FILES.length||m.files.some(x=>!FILES.includes(x.path)))throw Error('Invalid delta inventory');
  if(!Array.isArray(m.support)||m.support.length!==2||new Set(m.support.map(x=>x.path)).size!==2||m.support.some(x=>!['install-browser-url-patch.cjs','offline-plugin-manager.cjs'].includes(x.path)))throw Error('Invalid installer inventory');
  for(const f of [...m.files,...m.support]){const p=safe(this.kit,FILES.includes(f.path)?'payload/'+f.path:f.path);if(!fs.lstatSync(p).isFile()||hash(fs.readFileSync(p))!==f.sha256)throw Error('补丁文件校验失败，未修改APP');}
  const pkg=read(path.join(this.kit,'payload/package.json'));if(pkg.name!==NAME||pkg.version!=='1.0.1')throw Error('Unexpected browser package');
  return m;
 }
 stateData(){return fs.existsSync(this.state)?read(this.state):null}
 journal(){const state=this.stateData();if(!state||!/^browser-url-[A-Za-z0-9-]+$/.test(state.transaction))throw Error('没有可恢复的浏览器补丁记录');const file=safe(this.root,'extensions/.plugin-manager/transactions/'+state.transaction+'/browser-journal.json'),j=read(file);
  const allowed=new Set([...FILES.flatMap(name=>[PREFIX+name,'plugin-pack/payload/'+PREFIX+name]),'plugin-pack/pack.json','config/plugin-manager.json']);
  if(!Array.isArray(j.changes)||hash(JSON.stringify(j.changes))!==j.changesSha256||j.transaction!==state.transaction||new Set(j.changes.map(x=>x.path)).size!==j.changes.length||j.changes.some(row=>!allowed.has(row.path)))throw Error('补丁备份损坏，未恢复任何文件');return {file,j};}
 preflightRestore(j){for(const row of j.changes){const value=current(safe(this.root,row.path));if(value!==row.before&&value!==row.after)throw Error('补丁后文件已被修改，已停止回退/恢复：'+row.path)}}
 restore(file,j,status){
  this.preflightRestore(j);atomic(file,JSON.stringify({...j,status:'restoring'},null,2));atomic(this.state,JSON.stringify({transaction:j.transaction,status:'restoring'},null,2));
  for(const row of [...j.changes].reverse()){store(safe(this.root,row.path),row.before,row.mode);this.fault('restored',row.path)}
  atomic(file,JSON.stringify({...j,status},null,2));atomic(this.state,JSON.stringify({transaction:j.transaction,status},null,2));
 }
 check(){return this.manager.withLock(()=>{this.manager.ensureIdle();return this.plan().result})}
 plan(){
  const manifest=this.verify(),previous=this.stateData();
  if(previous&&['applying','restoring'].includes(previous.status))throw Error('补丁安装曾中断，请先运行恢复补丁.sh');
  if(previous?.status==='installed'){
   const {j}=this.journal();for(const row of j.changes)if(current(safe(this.root,row.path))!==row.after)throw Error('已安装补丁的文件发生变化，请先核查，未覆盖');
   return {result:{status:'UNCHANGED',version:'1.0.1',networkUsed:false}};
  }
  const packFile=safe(this.root,'plugin-pack/pack.json'),pack=read(packFile),runtime=safe(this.root,PREFIX+'package.json'),pkg=read(runtime);
  if(pkg.name!==NAME||!['1.0.0','1.0.1'].includes(pkg.version)||!Array.isArray(pack.files)||pack.release!==read(this.manager.appFile).version||pack.os!==manifest.compatibility.os||pack.arch!==manifest.compatibility.arch)throw Error('需要已安装完整插件包且具有本地payload的兼容APP');
  if(read(safe(this.root,PREFIX+'node_modules/playwright-core/package.json')).version!=='1.56.1')throw Error('需要已有离线Playwright 1.56.1；本补丁不下载依赖');
  const registry=this.manager.registry(),registered=registry.plugins[NAME];
  if(registered&&registered.treeHash!==treeHash(this.manager.target(NAME)))throw Error('已登记插件存在本地修改，请先保留并核查，未覆盖');
  const changes=[];
  for(const f of manifest.files){
   const rel=PREFIX+f.path,payloadRel='plugin-pack/payload/'+rel,live=safe(this.root,rel),payload=safe(this.root,payloadRel),rows=pack.files.filter(x=>x.path===rel);
   if(rows.length!==1||!fs.lstatSync(live).isFile()||!fs.lstatSync(payload).isFile()||fs.lstatSync(live).isSymbolicLink()||fs.lstatSync(payload).isSymbolicLink())throw Error('运行/载荷文件缺失或存在链接，未修改：'+f.path);
   const before=fs.readFileSync(live),packed=fs.readFileSync(payload);
   if(!before.equals(packed)||hash(packed)!==rows[0].sha256)throw Error('运行副本、载荷或原清单不一致，未覆盖：'+f.path);
   const after=fs.readFileSync(safe(this.kit,'payload/'+f.path)).toString('base64');
   if(pkg.version==='1.0.1'&&before.toString('base64')!==after)throw Error('相同插件版本内容不同，未覆盖');
   for(const relpath of [rel,payloadRel])changes.push({path:relpath,before:before.toString('base64'),after,mode:fs.statSync(safe(this.root,relpath)).mode&0o777});
   rows[0].sha256=f.sha256;
  }
  const afterPack=Buffer.from(JSON.stringify(pack,null,2)+'\n').toString('base64');changes.push({path:'plugin-pack/pack.json',before:current(packFile),after:afterPack,mode:fs.statSync(packFile).mode&0o777});
  if(registered){
   // Compute the future tree from the current inventory without copying dependencies.
   const {inventory}=require('./offline-plugin-manager.cjs');const items=inventory(this.manager.target(NAME));
   for(const item of items){const replacement=manifest.files.find(f=>f.path===item.path);if(replacement)item.sha256=replacement.sha256}
   registry.plugins[NAME]={...registered,version:'1.0.1',treeHash:hash(JSON.stringify(items))};
   changes.push({path:'config/plugin-manager.json',before:current(this.manager.registryFile),after:Buffer.from(JSON.stringify(registry,null,2)+'\n').toString('base64'),mode:fs.statSync(this.manager.registryFile).mode&0o777});
  }
  return {changes,result:{status:'PASS',from:pkg.version,to:'1.0.1',files:manifest.files.length,copies:2,networkUsed:false,userConfigurationUntouched:true}};
 }
 install(){return this.manager.withLock(()=>{
  this.manager.ensureIdle();const plan=this.plan();if(plan.result.status==='UNCHANGED')return plan.result;
  const transaction='browser-url-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
  const base=safe(this.root,'extensions/.plugin-manager/transactions/'+transaction),file=path.join(base,'browser-journal.json');
  const j={schemaVersion:1,transaction,status:'applying',changes:plan.changes,changesSha256:hash(JSON.stringify(plan.changes))};
  // Every original byte is recorded before the first APP file is changed.
  atomic(file,JSON.stringify(j,null,2));atomic(this.state,JSON.stringify({transaction,status:'applying'},null,2));
  try{
   this.fault('prepared');for(const row of j.changes){store(safe(this.root,row.path),row.after,row.mode);this.fault('written',row.path)}
   for(const row of j.changes)if(current(safe(this.root,row.path))!==row.after)throw Error('补丁写后校验失败');
   const registered=this.manager.registry().plugins[NAME];if(registered&&treeHash(this.manager.target(NAME))!==registered.treeHash)throw Error('插件登记散列不一致');
   atomic(file,JSON.stringify({...j,status:'installed'},null,2));this.fault('committed');atomic(this.state,JSON.stringify({transaction,status:'installed'},null,2));
   return {...plan.result,status:'INSTALLED',transaction,restartRequired:true};
  }catch(error){try{this.restore(file,j,'recovered')}catch(recovery){throw Error(error.message+'；恢复未完成，请运行恢复补丁.sh：'+recovery.message)}throw error}
 })}
 rollback(){return this.manager.withLock(()=>{this.manager.ensureIdle();const {file,j}=this.journal(),state=this.stateData();if(['rolled-back','recovered'].includes(state.status))return {status:'UNCHANGED'};this.restore(file,j,'rolled-back');return {status:'ROLLED_BACK',userConfigurationUntouched:true,restartRequired:true}})}
 recover(){return this.manager.withLock(()=>{this.manager.ensureIdle();const state=this.stateData();if(!state||['rolled-back','recovered','installed'].includes(state.status))return {status:'NO_PENDING_PATCH'};const {file,j}=this.journal();this.restore(file,j,'recovered');return {status:'RECOVERED',userConfigurationUntouched:true}})}
}
module.exports={BrowserPatch,FILES,NAME};
if(require.main===module)try{const [command,root]=process.argv.slice(2);if(!root||!['check','install','rollback','recover'].includes(command))throw Error('Usage: node install-browser-url-patch.cjs check|install|rollback|recover APP');console.log(JSON.stringify(new BrowserPatch(root)[command](),null,2))}catch(error){console.error('浏览器补丁失败：'+error.message);process.exitCode=1}
