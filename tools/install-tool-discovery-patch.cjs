'use strict';
// A narrowly allowlisted delta for our two extensions; never updates official core.
const fs=require('node:fs'),path=require('node:path');
const {Manager,safe,atomic,hash,inventory,treeHash}=require('./offline-plugin-manager.cjs');
const BROWSER='@neiwang/browser-automation',CATALOG='@deepseek-ai/neiwang-tool-catalog';
const prefix=n=>'extensions/node_modules/'+n+'/';
const FILES=[...['index.mjs','compact.mjs','client.js','package.json','package-lock.json'].map(n=>prefix(BROWSER)+n),...['index.mjs','catalog.mjs','package.json','cordis.patch.yml'].map(n=>prefix(CATALOG)+n)];
const destinations=p=>[p,'plugin-pack/payload/'+p];
const ALLOWED=new Set([...FILES.flatMap(destinations),'config/app.json','plugin-pack/pack.json','config/plugin-manager.json']);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
class ToolDiscoveryPatch{
 constructor(root,kit=__dirname,options={}){this.manager=new Manager(root,options);this.root=this.manager.root;this.kit=fs.realpathSync(kit);this.fault=options.fault||(()=>{});this.record=safe(this.root,'config/tool-discovery-patch-backup.json');}
 current(rel){const p=safe(this.root,rel);if(!fs.existsSync(p))return null;const s=fs.lstatSync(p);if(!s.isFile()||s.nlink>1)throw Error('拒绝非普通文件或硬链接：'+rel);return fs.readFileSync(p).toString('base64');}
 save(j){atomic(this.record,JSON.stringify(j,null,2)+'\n');}
 load(){if(!fs.existsSync(this.record))return null;const j=read(this.record);if(j.version!==1||!Array.isArray(j.changes)||new Set(j.changes.map(r=>r.path)).size!==j.changes.length||j.changes.some(r=>!ALLOWED.has(r.path)||!Number.isInteger(r.mode))||hash(JSON.stringify(j.changes))!==j.sha256)throw Error('补丁备份损坏');return j;}
 write(row,side){const p=safe(this.root,row.path),value=row[side];if(value===null){if(fs.existsSync(p))fs.unlinkSync(p);}else{atomic(p,Buffer.from(value,'base64'));fs.chmodSync(p,row.mode);}}
 compatible(){const app=read(this.manager.appFile);if(app.version!=='R11.6'||app.coreVersion!=='0.2.1-rc.3')throw Error('仅支持 R11.6 / 0.2.1-rc.3，未修改文件');return app;}
 plan(){
  const app=this.compatible(),m=read(safe(this.kit,'patch.json'));
  if(m.kind!=='tool-discovery-20261124'||m.os!==process.platform||m.arch!==process.arch||m.nodeMajor!==Number(process.versions.node.split('.')[0]))throw Error('补丁与系统、CPU 或 Node 不匹配');
  if(!Array.isArray(m.files)||m.files.length!==FILES.length||new Set(m.files.map(f=>f.path)).size!==FILES.length||m.files.some(f=>!FILES.includes(f.path)))throw Error('补丁文件清单不匹配');
  for(const name of ['install-tool-discovery-patch.cjs','offline-plugin-manager.cjs'])if(hash(fs.readFileSync(safe(this.kit,name)))!==m.support?.[name])throw Error('安装器校验失败');
  for(const f of m.files)if(hash(fs.readFileSync(safe(this.kit,'payload/'+f.path)))!==f.sha256)throw Error('补丁文件校验失败');
  for(const [name,version] of [[BROWSER,'1.4.2'],[CATALOG,'1.0.1']]){const pkg=read(safe(this.kit,'payload/'+prefix(name)+'package.json'));if(pkg.name!==name||pkg.version!==version)throw Error('补丁插件版本不匹配');}
  const browser=read(safe(this.root,prefix(BROWSER)+'package.json'));
  if(browser.name!==BROWSER||!['1.4.1','1.4.2'].includes(browser.version))throw Error('需要浏览器插件 1.4.1 或 1.4.2；旧版请先核对交付包');
  const catalogPath=prefix(CATALOG)+'package.json',catalogExists=this.current(catalogPath)!==null;
  if(catalogExists){const p=read(safe(this.root,catalogPath));if(p.name!==CATALOG||!['1.0.0','1.0.1'].includes(p.version))throw Error('工具目录版本不兼容');}
  if(read(safe(this.root,prefix(BROWSER)+'node_modules/playwright-core/package.json')).version!=='1.56.1')throw Error('需要随包 Playwright 1.56.1');
  const pack=read(safe(this.root,'plugin-pack/pack.json'));
  if(pack.release!=='R11.6'||pack.os!==m.os||pack.arch!==m.arch||!Array.isArray(pack.files)||!Array.isArray(pack.bundles)||!Array.isArray(app.bundles))throw Error('需要完整离线插件包及清单');
  const registry=this.manager.registry(),changes=[];
  for(const name of [BROWSER,CATALOG])if(registry.plugins[name]&&registry.plugins[name].treeHash!==treeHash(safe(this.root,prefix(name).slice(0,-1))))throw Error('已登记插件存在本地修改，未覆盖');
  const add=(rel,bytes)=>{const p=safe(this.root,rel),before=this.current(rel);changes.push({path:rel,before,after:bytes.toString('base64'),mode:before===null?0o644:fs.statSync(p).mode&0o777});};
  for(const f of m.files){
   const [live,payload]=destinations(f.path),before=this.current(live),packed=this.current(payload),rows=pack.files.filter(r=>r.path===live),data=fs.readFileSync(safe(this.kit,'payload/'+live));
   const mayAdd=live===prefix(CATALOG)+'catalog.mjs'||(!catalogExists&&live.startsWith(prefix(CATALOG)));
   if(before===null){if(!mayAdd||packed!==null||rows.length)throw Error('运行/载荷文件缺失：'+live);pack.files.push({path:live,sha256:f.sha256,mode:0o644});}
   else{if(rows.length!==1||before!==packed||hash(Buffer.from(before,'base64'))!==rows[0].sha256)throw Error('运行副本、载荷或清单不一致：'+live);rows[0].sha256=f.sha256;}
   add(live,data);add(payload,data);
  }
  app.bundles=[...new Set([...app.bundles,CATALOG])];pack.bundles=[...new Set([...pack.bundles,CATALOG])];
  add('config/app.json',Buffer.from(JSON.stringify(app,null,2)+'\n'));add('plugin-pack/pack.json',Buffer.from(JSON.stringify(pack,null,2)+'\n'));
  let changedRegistry=false;
  for(const name of [BROWSER,CATALOG])if(registry.plugins[name]){
   const items=inventory(safe(this.root,prefix(name).slice(0,-1)));
   for(const row of changes.filter(r=>r.path.startsWith(prefix(name)))){const rel=row.path.slice(prefix(name).length),item=items.find(i=>i.path===rel),value={path:rel,sha256:hash(Buffer.from(row.after,'base64')),mode:process.platform==='win32'?0:row.mode};if(item)Object.assign(item,value);else items.push(value);}
   items.sort((a,b)=>{const x=a.path.split('/'),y=b.path.split('/');for(let i=0;i<Math.min(x.length,y.length);i++){const c=x[i].localeCompare(y[i],'en');if(c)return c;}return x.length-y.length;});
   registry.plugins[name]={...registry.plugins[name],version:name===BROWSER?'1.4.2':'1.0.1',treeHash:hash(JSON.stringify(items))};changedRegistry=true;
  }
  if(changedRegistry)add('config/plugin-manager.json',Buffer.from(JSON.stringify(registry,null,2)+'\n'));
  return {version:1,status:'applying',changes,sha256:hash(JSON.stringify(changes))};
 }
 restore(j){for(const r of j.changes){const v=this.current(r.path);if(v!==r.before&&v!==r.after)throw Error('文件在补丁后被修改，停止回退：'+r.path);}j.status='restoring';this.save(j);for(const r of [...j.changes].reverse()){this.write(r,'before');this.fault('restored',r.path);}j.status='rolled-back';this.save(j);return {status:'rolled-back'};}
 run(action='install'){return this.manager.withLock(()=>{
  this.manager.ensureIdle();this.compatible();const old=this.load();
  for(const name of ['isu-tls-patch-state.json','isu-session-patch-state.json','isu-refresh-patch-state.json','isu-browser-ui-patch-state.json','browser-url-patch-state.json']){const file=safe(this.root,'extensions/.plugin-manager/'+name);if(fs.existsSync(file)&&['applying','restoring'].includes(read(file).status))throw Error('其他补丁尚未恢复，请先完成恢复');}
  if(action==='rollback'||action==='recover')return old&&old.status!=='rolled-back'?this.restore(old):{status:'unchanged'};
  if(!['check','install'].includes(action))throw Error('未知操作');
  if(old&&['applying','restoring'].includes(old.status))throw Error('上次安装中断，请先运行恢复补丁');
  if(old?.status==='installed'){for(const r of old.changes)if(this.current(r.path)!==r.after)throw Error('已安装文件被修改，未覆盖');return {status:'unchanged'};}
  const j=this.plan();if(action==='check')return {status:'ready',coreVersion:'0.2.1-rc.3'};this.save(j);
  try{for(const r of j.changes){this.write(r,'after');this.fault('written',r.path);}for(const r of j.changes)if(this.current(r.path)!==r.after)throw Error('写后校验失败');
   for(const name of [BROWSER,CATALOG]){const registered=this.manager.registry().plugins[name];if(registered&&treeHash(safe(this.root,prefix(name).slice(0,-1)))!==registered.treeHash)throw Error('插件登记散列不一致');}
   j.status='installed';this.save(j);return {status:'installed',restartRequired:true,coreVersion:'0.2.1-rc.3'};
  }catch(e){this.restore(j);throw e;}
 });}
}
module.exports={ToolDiscoveryPatch,FILES,BROWSER,CATALOG};
if(require.main===module)try{console.log(JSON.stringify(new ToolDiscoveryPatch(process.argv[3]).run(process.argv[2])));console.log('操作完成，请重新启动内网小智。');}catch(e){console.error(e.message);process.exitCode=1;}
