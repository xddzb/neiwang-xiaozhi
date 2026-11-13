'use strict';
// Delta transaction: shared manager lock/process checks, no downloads or user-data writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Manager,safe,atomic,hash,treeHash}=require('./offline-plugin-manager.cjs');
const NAME='@neiwang/browser-automation', BUSINESS='@deepseek-ai/neiwang-business';
const PREFIX='extensions/node_modules/'+NAME+'/';
const GROUPS={
 [NAME]:['controller.mjs','index.mjs','compact.mjs','browser-main.cjs','package.json','package-lock.json','session_adapter.py','session-auth.mjs','isu-session.mjs','browser-toolbar.html','browser-toolbar.js','browser-toolbar-preload.cjs'],
 [BUSINESS]:['index.mjs','isu-instruments.cjs','isu-browser-session.cjs']
};
const FILES=[...Object.entries(GROUPS).flatMap(([name,files])=>files.map(f=>'extensions/node_modules/'+name+'/'+f)),'tools/api_tool.py','tools/browser_session.py'];
const NEW=new Set([PREFIX+'browser-toolbar.html',PREFIX+'browser-toolbar.js',PREFIX+'browser-toolbar-preload.cjs',PREFIX+'session-auth.mjs',PREFIX+'isu-session.mjs','extensions/node_modules/'+BUSINESS+'/isu-browser-session.cjs']);
const destinations=rel=>rel.startsWith('extensions/')?[rel,'plugin-pack/payload/'+rel]:[rel];
const pluginRoot=(root,name)=>safe(root,'extensions/node_modules/'+name);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const current=p=>fs.existsSync(p)?fs.readFileSync(p).toString('base64'):null;
const store=(p,v,mode)=>{if(v===null){if(fs.existsSync(p))fs.unlinkSync(p)}else{atomic(p,Buffer.from(v,'base64'));if(mode!==undefined)fs.chmodSync(p,mode)}};
class IsuPatch{
 constructor(root,kit=__dirname,options={}){
  this.manager=new Manager(root,options);this.root=this.manager.root;this.kit=fs.realpathSync(kit);this.fault=options.fault||(()=>{});
  this.state=safe(this.root,'extensions/.plugin-manager/isu-tls-patch-state.json');
 }
 verify(){
  const m=read(path.join(this.kit,'patch.json')),c=m.compatibility,app=read(this.manager.appFile);
  if(m.kind!=='neiwang-isu-session-delta'||m.schemaVersion!==1||m.id!=='isu-session-1.4.1'||!c||c.os!==process.platform||c.arch!==process.arch||c.nodeMajor!==Number(process.versions.node.split('.')[0])||!c.coreVersions?.includes(app.coreVersion)||app.version!=='R11.6')throw Error('补丁与内核/系统/CPU/Node不匹配，未修改文件');
  if(!Array.isArray(m.files)||m.files.length!==FILES.length||new Set(m.files.map(x=>x.path)).size!==FILES.length||m.files.some(x=>!FILES.includes(x.path)))throw Error('Invalid delta inventory');
  const support=['install-isu-session-patch.cjs','offline-plugin-manager.cjs'];
  if(!Array.isArray(m.support)||m.support.length!==2||new Set(m.support.map(x=>x.path)).size!==2||m.support.some(x=>!support.includes(x.path)))throw Error('Invalid installer inventory');
  for(const f of [...m.files,...m.support]){const p=safe(this.kit,FILES.includes(f.path)?'payload/'+f.path:f.path);if(!fs.lstatSync(p).isFile()||hash(fs.readFileSync(p))!==f.sha256)throw Error('补丁文件校验失败，未修改APP')}
  const pkg=read(safe(this.kit,'payload/'+PREFIX+'package.json'));if(pkg.name!==NAME||pkg.version!=='1.4.1')throw Error('Unexpected browser package');
  return m;
 }
 stateData(){return fs.existsSync(this.state)?read(this.state):null}
 journal(){const state=this.stateData();if(!state||!/^isu-tls-[A-Za-z0-9-]+$/.test(state.transaction))throw Error('没有可恢复的浏览器补丁记录');const file=safe(this.root,'extensions/.plugin-manager/transactions/'+state.transaction+'/isu-journal.json'),j=read(file);
  const allowed=new Set([...FILES.flatMap(destinations),'plugin-pack/pack.json','config/plugin-manager.json','extensions/apis/connections/weekly-isu.json']);
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
  if(fs.existsSync(this.manager.active))throw Error('存在其他插件事务，请先完成其恢复');
  const priorState=safe(this.root,'extensions/.plugin-manager/isu-session-patch-state.json');
  if(fs.existsSync(priorState)&&['applying','restoring'].includes(read(priorState).status))throw Error('旧ISU补丁安装中断，请先恢复');
  const refreshState=safe(this.root,'extensions/.plugin-manager/isu-refresh-patch-state.json');
  if(fs.existsSync(refreshState)&&['applying','restoring'].includes(read(refreshState).status))throw Error('自动刷新补丁安装中断，请先使用旧补丁恢复');
  const uiState=safe(this.root,'extensions/.plugin-manager/isu-browser-ui-patch-state.json');
  if(fs.existsSync(uiState)&&['applying','restoring'].includes(read(uiState).status))throw Error('浏览器增强补丁安装中断，请先使用旧补丁恢复');
  const oldState=safe(this.root,'extensions/.plugin-manager/browser-url-patch-state.json');
  if(fs.existsSync(oldState)&&['applying','restoring'].includes(read(oldState).status))throw Error('旧浏览器补丁安装中断，请先使用旧补丁恢复');
  if(previous&&['applying','restoring'].includes(previous.status))throw Error('补丁安装曾中断，请先运行恢复补丁.sh');
  if(previous?.status==='installed'){
   const {j}=this.journal();for(const row of j.changes)if(current(safe(this.root,row.path))!==row.after)throw Error('已安装补丁的文件发生变化，请先核查，未覆盖');
   return {result:{status:'UNCHANGED',version:'1.4.1',networkUsed:false}};
  }
  const packFile=safe(this.root,'plugin-pack/pack.json'),pack=read(packFile),pkg=read(safe(this.root,PREFIX+'package.json'));
  if(pkg.name!==NAME||!['1.0.0','1.0.1','1.2.0','1.3.0','1.4.0','1.4.1'].includes(pkg.version)||!Array.isArray(pack.files)||pack.release!=='R11.6'||pack.os!==manifest.compatibility.os||pack.arch!==manifest.compatibility.arch)throw Error('需要已安装完整插件包且具有本地payload的兼容APP');
  if(read(safe(this.root,PREFIX+'node_modules/playwright-core/package.json')).version!=='1.56.1')throw Error('需要已有离线Playwright 1.56.1；本补丁不下载依赖');
  const connection=read(safe(this.root,'extensions/apis/connections/weekly-isu.json')),source=read(safe(this.root,'extensions/apis/sources/isu-instruments.json'));
  let origin;try{const u=new URL(connection.base_url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error();origin=u.origin}catch{throw Error('已有ISU连接地址不兼容，未修改配置')}
  if(connection.browser_session?.driver!=='playwright'||!connection.browser_session.allowed_origins?.includes(origin)||source.enabled!==true||source.read_only!==true||source.transport!=='isu-engineio3'||(source.connection&&source.connection!=='weekly-isu'))throw Error('需要已有ISU只读接口与内置浏览器连接配置；补丁不覆盖接口或连接配置');
  const registry=this.manager.registry(),changes=[];let changed=false;
  if(manifest.page_url){
   let u;try{u=new URL(manifest.page_url);if(u.origin!==origin||u.username||u.password||u.pathname==='/opgview/socket.io/'||[...u.searchParams.keys()].some(k=>/token|ticket|secret|password|authorization|session|^code$/i.test(k))||/token|ticket|secret|password|authorization/i.test(u.hash))throw Error()}catch{throw Error('实时页面地址不符合现有ISU连接范围')}
   if(connection.browser_session.isu_realtime_url!==u.href){const rel='extensions/apis/connections/weekly-isu.json',file=safe(this.root,rel);connection.browser_session.isu_realtime_url=u.href;changes.push({path:rel,before:current(file),after:Buffer.from(JSON.stringify(connection,null,2)+'\n').toString('base64'),mode:fs.statSync(file).mode&0o777});changed=true}
  }
  for(const name of Object.keys(GROUPS)){const r=registry.plugins[name];if(r&&r.treeHash!==treeHash(pluginRoot(this.root,name)))throw Error('已登记插件存在本地修改，请先保留并核查，未覆盖')}
  for(const f of manifest.files){
   const paths=destinations(f.path),before=current(safe(this.root,f.path)),after=fs.readFileSync(safe(this.kit,'payload/'+f.path)).toString('base64');
   if(paths.length===2){
    const packed=current(safe(this.root,paths[1])),rows=pack.files.filter(x=>x.path===f.path);
    if(before===null){if(!NEW.has(f.path)||packed!==null||rows.length)throw Error('运行/载荷文件缺失，未修改：'+f.path);pack.files.push({path:f.path,sha256:f.sha256,mode:0o644})}
    else{if(rows.length!==1||before!==packed||hash(Buffer.from(packed,'base64'))!==rows[0].sha256)throw Error('运行副本、载荷或原清单不一致，未覆盖：'+f.path);rows[0].sha256=f.sha256}
   }else if(before===null||!Array.isArray(f.allowedBefore)||!f.allowedBefore.includes(hash(Buffer.from(before,'base64'))))throw Error('工具文件并非支持的基线或存在本地修改，未覆盖：'+f.path);
   if(pkg.version==='1.4.1'&&before!==after)throw Error('相同插件版本内容不同，未覆盖');
   if(before!==after)changed=true;
   for(const rel of paths){const p=safe(this.root,rel),stat=fs.existsSync(p)?fs.lstatSync(p):null;if(stat&&(!stat.isFile()||stat.nlink>1))throw Error('拒绝非普通文件或硬链接：'+rel);changes.push({path:rel,before:current(p),after,mode:stat?stat.mode&0o777:0o644})}
  }
  if(!changed)return {result:{status:'UNCHANGED',version:'1.4.1',networkUsed:false}};
  changes.push({path:'plugin-pack/pack.json',before:current(packFile),after:Buffer.from(JSON.stringify(pack,null,2)+'\n').toString('base64'),mode:fs.statSync(packFile).mode&0o777});
  let registryChanged=false;
  for(const name of Object.keys(GROUPS))if(registry.plugins[name]){
   const {inventory}=require('./offline-plugin-manager.cjs'),items=inventory(pluginRoot(this.root,name)),prefix='extensions/node_modules/'+name+'/';
   for(const f of manifest.files.filter(f=>f.path.startsWith(prefix))){const rel=f.path.slice(prefix.length),item=items.find(x=>x.path===rel);if(item)item.sha256=f.sha256;else items.push({path:rel,sha256:f.sha256,mode:process.platform==='win32'?0:0o644})}
   items.sort((a,b)=>{const x=a.path.split('/'),y=b.path.split('/');for(let i=0;i<Math.min(x.length,y.length);i++){const c=x[i].localeCompare(y[i],'en');if(c)return c}return x.length-y.length});
   registry.plugins[name]={...registry.plugins[name],version:name===NAME?'1.4.1':read(safe(this.root,prefix+'package.json')).version,treeHash:hash(JSON.stringify(items))};registryChanged=true;
  }
  if(registryChanged)changes.push({path:'config/plugin-manager.json',before:current(this.manager.registryFile),after:Buffer.from(JSON.stringify(registry,null,2)+'\n').toString('base64'),mode:fs.statSync(this.manager.registryFile).mode&0o777});
  return {changes,result:{status:'PASS',from:pkg.version,to:'1.4.1',files:manifest.files.length,networkUsed:false,userConfigurationUntouched:!changes.some(x=>x.path==='extensions/apis/connections/weekly-isu.json'),pageEntryConfigured:!!manifest.page_url}};
 }
 install(){return this.manager.withLock(()=>{
  this.manager.ensureIdle();const plan=this.plan();if(plan.result.status==='UNCHANGED')return plan.result;
  const transaction='isu-tls-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
  const base=safe(this.root,'extensions/.plugin-manager/transactions/'+transaction),file=path.join(base,'isu-journal.json');
  const j={schemaVersion:1,transaction,status:'applying',changes:plan.changes,changesSha256:hash(JSON.stringify(plan.changes))};
  // Every original byte is recorded before the first APP file is changed.
  atomic(file,JSON.stringify(j,null,2));atomic(this.state,JSON.stringify({transaction,status:'applying'},null,2));
  try{
   this.fault('prepared');for(const row of j.changes){store(safe(this.root,row.path),row.after,row.mode);this.fault('written',row.path)}
   for(const row of j.changes)if(current(safe(this.root,row.path))!==row.after)throw Error('补丁写后校验失败');
   for(const name of Object.keys(GROUPS)){const registered=this.manager.registry().plugins[name];if(registered&&treeHash(pluginRoot(this.root,name))!==registered.treeHash)throw Error('插件登记散列不一致')}
   atomic(file,JSON.stringify({...j,status:'installed'},null,2));this.fault('committed');atomic(this.state,JSON.stringify({transaction,status:'installed'},null,2));
   return {...plan.result,status:'INSTALLED',transaction,restartRequired:true};
  }catch(error){try{this.restore(file,j,'recovered')}catch(recovery){throw Error(error.message+'；恢复未完成，请运行恢复补丁.sh：'+recovery.message)}throw error}
 })}
 rollback(){return this.manager.withLock(()=>{this.manager.ensureIdle();const {file,j}=this.journal(),state=this.stateData();if(['rolled-back','recovered'].includes(state.status))return {status:'UNCHANGED'};this.restore(file,j,'rolled-back');return {status:'ROLLED_BACK',userConfigurationRestored:true,restartRequired:true}})}
 recover(){return this.manager.withLock(()=>{this.manager.ensureIdle();const state=this.stateData();if(!state||['rolled-back','recovered','installed'].includes(state.status))return {status:'NO_PENDING_PATCH'};const {file,j}=this.journal();this.restore(file,j,'recovered');return {status:'RECOVERED',userConfigurationRestored:true}})}
}
module.exports={IsuPatch,FILES,NAME,BUSINESS,NEW};
if(require.main===module)try{const [command,root]=process.argv.slice(2);if(!root||!['check','install','rollback','recover'].includes(command))throw Error('Usage: node install-isu-session-patch.cjs check|install|rollback|recover APP');console.log(JSON.stringify(new IsuPatch(root)[command](),null,2))}catch(error){console.error('ISU补丁失败：'+error.message);process.exitCode=1}
