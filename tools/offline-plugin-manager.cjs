'use strict';
// Dependency-free offline transactions. Never writes user data, core or workspace.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const bytes=p=>fs.existsSync(p)?fs.readFileSync(p):null;
const exists=p=>{try{return fs.lstatSync(p)}catch(e){if(e.code==='ENOENT')return null;throw e}};
function fail(message){throw Error(message)}
function nameOK(name){return typeof name==='string'&&/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)&&!name.split('/').some(s=>s==='.'||s==='..')}
function safe(base,rel){
 if(typeof rel!=='string'||!rel||rel.includes('\\')||/[\x00-\x1f<>:"|?*]/.test(rel)||rel.split('/').some(s=>!s||s==='.'||s==='..'||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(s)))fail('Unsafe relative path');
 const out=path.resolve(base,...rel.split('/'));if(!out.startsWith(base+path.sep))fail('Path escapes installation');
 let p=base;for(const s of rel.split('/')){p=path.join(p,s);if(exists(p)?.isSymbolicLink())fail('Symbolic links are not allowed: '+rel)}
 return out;
}
function atomic(file,data){
 fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+crypto.randomUUID();
 const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 try{fs.renameSync(tmp,file)}catch(e){fs.rmSync(tmp,{force:true});throw e}
}
const writeJSON=(p,v)=>atomic(p,JSON.stringify(v,null,2)+'\n');
function inventory(base){
 const rows=[];if(!exists(base))return rows;
 function walk(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
  const rel=prefix+e.name,p=safe(base,rel),s=fs.lstatSync(p);
  if(s.isDirectory())walk(p,rel+'/');else if(s.isFile())rows.push({path:rel,sha256:hash(fs.readFileSync(p)),mode:process.platform==='win32'?0:s.mode&0o777});else fail('Only regular plugin files are supported');
 }}walk(base,'');return rows;
}
const treeHash=p=>hash(JSON.stringify(inventory(p)));
function nativeCheck(file,data,targetOS,arch){
 if(!/\.(node|so)(\.\d+)*$/.test(file))return;
 if(targetOS==='linux'){
  if(data.length<20||data.subarray(0,4).toString('hex')!=='7f454c46'||data[4]!==2||data[5]!==1||data.readUInt16LE(18)!==({arm64:183,x64:62}[arch]))fail('Native library OS/CPU mismatch: '+file);
 }else{
  if(data.length<64||data.subarray(0,2).toString()!=='MZ')fail('Native library OS mismatch');const offset=data.readUInt32LE(60);if(offset+6>data.length||data.subarray(offset,offset+4).toString('hex')!=='50450000'||data.readUInt16LE(offset+4)!==({arm64:0xaa64,x64:0x8664}[arch]))fail('Native library CPU mismatch');
 }
}
function version(v){const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v);if(!m)fail('Invalid plugin version');return m.slice(1,4).map(Number).concat(m[4]||'')}
function compare(a,b){a=version(a);b=version(b);for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;if(a[3]===b[3])return 0;if(!a[3]||!b[3])return a[3]?-1:1;const x=a[3].split('.'),y=b[3].split('.');for(let i=0;i<Math.max(x.length,y.length);i++){if(x[i]===undefined)return -1;if(y[i]===undefined)return 1;if(x[i]===y[i])continue;const n=/^\d+$/.test(x[i]),m=/^\d+$/.test(y[i]);return n&&m?(Number(x[i])>Number(y[i])?1:-1):n!==m?(n?-1:1):(x[i]>y[i]?1:-1)}return 0}
function assertStopped(root){
 if(process.platform==='win32'){
  const quoted=root.replaceAll("'","''");
  const code=`$r='${quoted}'; @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and ($_.Name -match '^(node|electron|内网小智)\\.exe$') -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($r+'\\',[StringComparison]::OrdinalIgnoreCase)) -or ($_.CommandLine -and $_.CommandLine.Contains($r+'\\launcher\\'))) }).Count`;
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true});if(r.status!==0||!/^\d+$/.test(r.stdout.trim()))fail('无法确认 APP 已退出，请关闭 APP 后重试');if(Number(r.stdout.trim()))fail('请先完全退出 APP');
 }else{
  for(const pid of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x)&&Number(x)!==process.pid)){
   try{const exe=fs.readlinkSync('/proc/'+pid+'/exe'),cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');
    if((exe.startsWith(root+path.sep)&&/\/(node|electron)$/.test(exe))||(/\/(node|electron)(\0|$)/.test(cmd)&&[root+'/launcher/',root+'/core/'].some(p=>cmd.includes(p))))fail('请先完全退出 APP');
   }catch(e){if(!['ENOENT','EACCES','EPERM','ESRCH'].includes(e.code))throw e}
  }
 }
}
class Manager{
 constructor(root,{stopped=assertStopped,fault=()=>{}}={}){
  this.root=fs.realpathSync(root);this.stopped=stopped;this.fault=fault;
  this.appFile=safe(this.root,'config/app.json');this.registryFile=safe(this.root,'config/plugin-manager.json');
  this.base=safe(this.root,'extensions/.plugin-manager');this.active=path.join(this.base,'active.json');
  this.lock=safe(this.root,'config/.plugin-install.lock');this.modules=safe(this.root,'extensions/node_modules');
 }
 registry(){const r=fs.existsSync(this.registryFile)?json(this.registryFile):{schemaVersion:1,plugins:{},managedNames:[],history:[]};if(r.schemaVersion!==1||!r.plugins||!Array.isArray(r.history)||!Array.isArray(r.managedNames))fail('Invalid installed plugin registry');return r}
 withLock(fn){
  if(process.getuid&&process.getuid()!==fs.statSync(this.appFile).uid)fail('请使用 APP 配置文件所属用户运行安装器，不要切换用户或使用 sudo');
  this.stopped(this.root);let fd;
  try{fd=fs.openSync(this.lock,'wx',0o600)}catch(e){if(e.code!=='EEXIST')throw e;const info=json(this.lock);if(info.host!==os.hostname()||!Number.isSafeInteger(info.pid))fail('Unknown installation lock; do not remove it while an installer runs');let alive=true;try{process.kill(info.pid,0)}catch(err){if(err.code==='ESRCH')alive=false}if(alive)fail('Another installer is running');fs.unlinkSync(this.lock);fd=fs.openSync(this.lock,'wx',0o600)}
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,host:os.hostname()}));fs.closeSync(fd);
  try{return fn()}finally{fs.unlinkSync(this.lock)}
 }
 target(name){if(!nameOK(name))fail('Invalid plugin name');if(name.startsWith('@deepseek-ai/'))fail('Core-owned modules cannot be changed by plugin packages');return safe(this.modules,name)}
 validate(directory,{adoptExisting=false,expectedSha256}={}){
  const source=fs.realpathSync(directory),manifestFile=safe(source,'plugin-package.json'),raw=fs.readFileSync(manifestFile),m=JSON.parse(raw),app=json(this.appFile),registry=this.registry();
  if(expectedSha256&&hash(raw)!==expectedSha256)fail('Package manifest SHA256 mismatch');
  if(m.schemaVersion!==2||m.kind!=='neiwang-offline-plugins'||!Array.isArray(m.plugins)||!m.plugins.length||m.plugins.length>100)fail('Unsupported offline plugin package');
  const c=m.compatibility;if(!c||!Array.isArray(c.coreVersions)||!c.coreVersions.includes(app.coreVersion)||c.os!==process.platform||c.arch!==process.arch||c.nodeMajor!==Number(process.versions.node.split('.')[0]))fail('Plugin core/OS/CPU/Node compatibility mismatch');
  const seen=new Set(),plans=[];
  for(const plugin of m.plugins){
   const target=this.target(plugin.name);if(seen.has(plugin.name))fail('Duplicate plugin');seen.add(plugin.name);version(plugin.version);
   const payload=safe(source,'payload/'+plugin.name);if(!exists(payload)?.isDirectory())fail('Missing plugin payload');
   if(!Array.isArray(plugin.files)||!plugin.files.length||plugin.files.length>100000)fail('Invalid plugin file list');
   const listed=new Set();let total=0;
   for(const f of plugin.files){if(typeof f.path!=='string')fail('Invalid file path');const key=f.path.toLowerCase();if(listed.has(key))fail('Duplicate/case-colliding file');listed.add(key);const p=safe(payload,f.path),s=exists(p);if(!s?.isFile()||s.nlink>1||!Number.isSafeInteger(f.size)||s.size!==f.size||!/^([a-f0-9]{64})$/.test(f.sha256)||![0o644,0o755].includes(f.mode))fail('Missing/corrupt plugin file');const data=fs.readFileSync(p);if(hash(data)!==f.sha256)fail('Missing/corrupt plugin file');nativeCheck(f.path,data,c.os,c.arch);total+=s.size}
   if(total>2*1024**3||inventory(payload).length!==plugin.files.length)fail('Oversized package or unlisted payload files');
   const pkg=json(safe(payload,'package.json'));if(pkg.name!==plugin.name||pkg.version!==plugin.version)fail('Payload name/version mismatch');
   const patch=pkg.dsh?.bundle?.patch;if(typeof patch!=='string'||!exists(safe(payload,patch.replace(/^\.\//,'')))?.isFile())fail('Missing DSH bundle patch');
   if(pkg.main&&(typeof pkg.main!=='string'||!exists(safe(payload,pkg.main.replace(/^\.\//,'')))?.isFile()))fail('Missing plugin entry point');
   if(typeof plugin.requires!=='object'||plugin.requires===null||Array.isArray(plugin.requires))fail('Invalid external dependency declarations');
   for(const [name,versions]of Object.entries(plugin.requires)){if(!nameOK(name)||!Array.isArray(versions)||!versions.length||versions.some(v=>typeof v!=='string'))fail('Invalid required dependency')}
   const installed=exists(target);if(installed&&!installed.isDirectory())fail('Existing plugin is not a regular directory');
   const old=installed?json(safe(target,'package.json')):null;const oldHash=installed?treeHash(target):null;
   if(old&&(old.name!==plugin.name||(!registry.plugins[plugin.name]&&!adoptExisting)))fail('Existing unmanaged plugin: use --adopt-existing after review');
   if(registry.plugins[plugin.name]&&(!old||registry.plugins[plugin.name].treeHash!==oldHash))fail('Installed plugin changed locally; preserve local changes before upgrading');
   if(old&&compare(plugin.version,old.version)<0)fail('Downgrade rejected; use rollback');
   plans.push({plugin,payload,target,oldHash,oldVersion:old?.version});
  }
  const future={...registry.plugins};for(const plan of plans)future[plan.plugin.name]=plan.plugin;
  const installedVersion=name=>{
   if(seen.has(name))return plans.find(p=>p.plugin.name===name).plugin.version;
   for(const base of [this.modules,path.join(this.root,'core',app.coreVersion,'node_modules')]){const p=path.join(base,...name.split('/'),'package.json');if(fs.existsSync(p)){const resolved=fs.realpathSync(p),roots=[this.modules,path.join(this.root,'core',app.coreVersion,'node_modules')].filter(fs.existsSync).map(p=>fs.realpathSync(p));if(!roots.some(root=>resolved.startsWith(root+path.sep)))fail('External dependency resolves outside APP');return json(resolved).version}}
   return null;
  };
  for(const plugin of Object.values(future))for(const [name,versions]of Object.entries(plugin.requires||{}))if(!versions.includes(installedVersion(name)))fail('Missing/incompatible external dependency: '+name);
  for(const plan of plans){const pkg=json(path.join(plan.payload,'package.json'));for(const name of Object.keys(pkg.dependencies||{})){
   if(!nameOK(name))fail('Invalid package dependency');
   if(!exists(safe(plan.payload,'node_modules/'+name+'/package.json'))&&!Object.hasOwn(plan.plugin.requires,name))fail('Offline dependency not bundled or explicitly declared: '+name);
  }}
  const required=plans.reduce((n,p)=>n+p.plugin.files.reduce((n,f)=>n+f.size,0),0)+16*1024**2,space=fs.statfsSync(this.root);
  if(required>space.bavail*space.bsize)fail('Not enough disk space to stage plugins');
  return {source,manifest:m,app,registry,plans,manifestSha256:hash(raw)};
 }
 check(directory,options){const p=this.validate(directory,options);return {status:'PASS',manifestSha256:p.manifestSha256,plugins:p.plans.map(p=>({name:p.plugin.name,from:p.oldVersion||null,to:p.plugin.version})),networkUsed:false}}
 journal(id){if(!/^[0-9TZa-z-]+$/.test(id))fail('Invalid transaction ID');const dir=safe(this.base,'transactions/'+id);return {dir,file:path.join(dir,'journal.json')}}
 ensureIdle(){if(fs.existsSync(this.active))fail('Interrupted transaction exists: run recover before installing')}
 install(directory,options={}){return this.withLock(()=>{
  this.ensureIdle();const plan=this.validate(directory,options),id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex'),tx=this.journal(id);
  fs.mkdirSync(tx.dir,{recursive:true});const j={id,status:'staging',plugins:[],beforeApp:bytes(this.appFile).toString('base64'),beforeRegistry:bytes(this.registryFile)?.toString('base64')||null};
  try{
   for(const [i,p]of plan.plans.entries()){
    const stage=path.join(tx.dir,'stage',String(i));fs.mkdirSync(stage,{recursive:true});
    for(const f of p.plugin.files){const dst=safe(stage,f.path);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(safe(p.payload,f.path),dst,fs.constants.COPYFILE_EXCL);fs.chmodSync(dst,f.mode);if(hash(fs.readFileSync(dst))!==f.sha256)fail('Staged file verification failed')}
    const newHash=treeHash(stage);if(p.oldVersion===p.plugin.version&&p.oldHash!==newHash)fail('Same version has different content; publish a new version');
    j.plugins.push({name:p.plugin.name,index:i,beforeHash:p.oldHash,afterHash:newHash});
   }
   if(j.plugins.every(p=>p.beforeHash===p.afterHash)&&j.plugins.every(p=>plan.registry.plugins[p.name])){fs.rmSync(tx.dir,{recursive:true});return {status:'UNCHANGED',plugins:j.plugins.map(p=>p.name)}}
   const registry=structuredClone(plan.registry);registry.managedNames=[...new Set([...registry.managedNames,...j.plugins.map(p=>p.name)])];
   for(const [i,p]of plan.plans.entries())registry.plugins[p.plugin.name]={version:p.plugin.version,treeHash:j.plugins[i].afterHash,requires:p.plugin.requires,transaction:id};
   registry.history.push(id);const app={...plan.app,bundles:[...new Set([...(plan.app.bundles||[]),...j.plugins.map(p=>p.name)])]};
   j.afterApp=Buffer.from(JSON.stringify(app,null,2)+'\n').toString('base64');j.afterRegistry=Buffer.from(JSON.stringify(registry,null,2)+'\n').toString('base64');j.status='applying';
   writeJSON(tx.file,j);writeJSON(this.active,{id});this.fault('prepared');
   for(const p of j.plugins){const target=this.target(p.name),backup=path.join(tx.dir,'backup',String(p.index)),stage=path.join(tx.dir,'stage',String(p.index));fs.mkdirSync(path.dirname(target),{recursive:true});fs.mkdirSync(path.dirname(backup),{recursive:true});if(p.beforeHash!==null)fs.renameSync(target,backup);this.fault('backed-up',p);fs.renameSync(stage,target);this.fault('swapped',p)}
   atomic(this.appFile,Buffer.from(j.afterApp,'base64'));this.fault('app-written');atomic(this.registryFile,Buffer.from(j.afterRegistry,'base64'));this.fault('registry-written');j.status='committed';writeJSON(tx.file,j);this.fault('committed');fs.unlinkSync(this.active);
   return {status:'INSTALLED',transaction:id,plugins:j.plugins.map(p=>p.name),restartRequired:true};
  }catch(error){if(fs.existsSync(this.active)){try{this.restore(j,tx);fs.unlinkSync(this.active)}catch(recovery){throw Error(error.message+'; 恢复未完成，请运行 recover: '+recovery.message)}}else fs.rmSync(tx.dir,{recursive:true,force:true});throw error}
 })}
 restore(j,tx,dryRun=false){
  // Preflight every location before changing anything, also after power loss.
  const same=(actual,expected,registry)=>{if(actual===expected)return true;if(!registry)return false;const normalize=value=>{const r=value?JSON.parse(Buffer.from(value,'base64')):{schemaVersion:1,plugins:{},managedNames:[],history:[]};delete r.managedNames;return JSON.stringify(r)};return normalize(actual)===normalize(expected)};
  for(const [file,before,after,isRegistry]of [[this.appFile,j.beforeApp,j.afterApp,false],[this.registryFile,j.beforeRegistry,j.afterRegistry,true]]){const current=bytes(file)?.toString('base64')||null;if(!same(current,before,isRegistry)&&!same(current,after,isRegistry))fail('Configuration changed since transaction; recovery stopped')}
  for(const p of j.plugins){const target=this.target(p.name),backup=path.join(tx.dir,'backup',String(p.index)),stage=path.join(tx.dir,'stage',String(p.index));
   if(exists(backup)&&treeHash(backup)!==p.beforeHash)fail('Backup checksum mismatch');
   const live=exists(target)?treeHash(target):null;
   if(p.beforeHash!==null&&!exists(backup)&&live!==p.beforeHash)fail('Original plugin/backup missing');
   if(live!==null&&live!==p.beforeHash&&live!==p.afterHash)fail('Plugin changed after transaction; recovery stopped');
   if(p.beforeHash===null&&exists(stage)&&live!==null)fail('Unexpected plugin collision');
  }
  if(dryRun)return;
  const managedNames=this.registry().managedNames;
  j.status='restoring';writeJSON(tx.file,j);
  for(const p of [...j.plugins].reverse()){
   const target=this.target(p.name),backup=path.join(tx.dir,'backup',String(p.index));
   if(exists(backup)){if(exists(target))fs.rmSync(target,{recursive:true});fs.renameSync(backup,target)}
   else if(p.beforeHash===null&&exists(target))fs.rmSync(target,{recursive:true});
   this.fault('restore-plugin',p);
  }
  atomic(this.appFile,Buffer.from(j.beforeApp,'base64'));this.fault('restore-app');if(j.beforeRegistry===null){if(fs.existsSync(this.registryFile))fs.unlinkSync(this.registryFile)}else atomic(this.registryFile,Buffer.from(j.beforeRegistry,'base64'));
  // Retain the managed-name ledger so bootstrap removes stale bundles on rollback.
  const old=this.registry(),unmanagedRestored=new Set(j.plugins.filter(p=>p.beforeHash!==null&&!old.plugins[p.name]&&!old.managedNames.includes(p.name)).map(p=>p.name));old.managedNames=[...new Set([...old.managedNames,...managedNames,...j.plugins.map(p=>p.name)])].filter(n=>!unmanagedRestored.has(n));writeJSON(this.registryFile,old);this.fault('restore-registry');
  j.status='rolled-back';writeJSON(tx.file,j);
 }
 recover(){return this.withLock(()=>{if(!fs.existsSync(this.active))return {status:'NO_PENDING_TRANSACTION'};const {id}=json(this.active),tx=this.journal(id),j=json(tx.file);if(j.status==='committed'){fs.unlinkSync(this.active);return {status:'COMMITTED',transaction:id}}if(j.status!=='rolled-back')this.restore(j,tx);fs.unlinkSync(this.active);return {status:'RECOVERED',transaction:id}})}
 rollback(){return this.withLock(()=>{this.ensureIdle();const registry=this.registry(),id=registry.history.at(-1);if(!id)fail('No installed transaction to roll back');const tx=this.journal(id),j=json(tx.file);if(j.status!=='committed')fail('Transaction is not committed');for(const p of j.plugins)if(!exists(this.target(p.name))||treeHash(this.target(p.name))!==p.afterHash)fail('Plugin modified after installation; rollback stopped');this.restore(j,tx,true);writeJSON(this.active,{id});this.restore(j,tx);fs.unlinkSync(this.active);return {status:'ROLLED_BACK',transaction:id,restartRequired:true}})}
 list(){const app=json(this.appFile),r=this.registry();return {coreVersion:app.coreVersion,managedPlugins:r.plugins,enabledBundles:app.bundles,pendingTransaction:fs.existsSync(this.active)?json(this.active):null,lastTransaction:r.history.at(-1)||null}}
}
function cli(args){const command=args.shift(),options={};for(let i=0;i<args.length;i++){const k=args[i];if(k==='--adopt-existing')options.adoptExisting=true;else if(['--app','--package','--sha256'].includes(k)&&args[i+1])options[k.slice(2)]=args[++i];else fail('Unknown/missing argument: '+k)}if(!options.app)fail('Usage: node offline-plugin-manager.cjs check|install|list|rollback|recover --app APP [--package DIR] [--adopt-existing] [--sha256 MANIFEST_SHA256]');const manager=new Manager(options.app),opts={adoptExisting:options.adoptExisting,expectedSha256:options.sha256};if(['install','check'].includes(command)){if(!options.package)fail('--package is required');return manager[command](options.package,opts)}if(['list','rollback','recover'].includes(command))return manager[command]();fail('Unknown command')}
module.exports={Manager,assertStopped,safe,inventory,treeHash,hash,atomic,nameOK,compare};
if(require.main===module){try{console.log(JSON.stringify(cli(process.argv.slice(2)),null,2))}catch(e){console.error('插件管理失败：'+e.message);process.exitCode=1}}
