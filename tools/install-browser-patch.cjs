'use strict';
// Additive application-side adapter migration; never touches model/RAG/binding data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Manager,safe,atomic,hash}=require('./offline-plugin-manager.cjs');
const {setup}=require('./setup-plugin-manager.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const HOOK=`    # NEIWANG_PLAYWRIGHT_SESSION_V1
    if settings.get('driver') == 'playwright':
        try:
            import importlib.util
            import sys as _browser_sys
            _browser_sys.dont_write_bytecode = True
            from pathlib import Path as _BrowserPath
            _file = _BrowserPath(__file__).resolve().parents[1]/'extensions/node_modules/@neiwang/browser-automation/session_adapter.py'
            _spec = importlib.util.spec_from_file_location('_neiwang_playwright_session', _file)
            _adapter = importlib.util.module_from_spec(_spec)
            _spec.loader.exec_module(_adapter)
            return _adapter.cookie_header(settings, url)
        except Exception:
            raise SessionError('playwright_session_unavailable: 请在业务浏览器重新登录') from None
`;
function verifyKit(kit){const manifest=read(safe(kit,'patch-manifest.json'));if(manifest.schemaVersion!==1)throw Error('Invalid patch manifest');for(const f of manifest.files){const p=safe(kit,f.path);if(!fs.statSync(p).isFile()||hash(fs.readFileSync(p))!==f.sha256)throw Error('Patch checksum failed: '+f.path)}}
function stateFile(manager){return safe(manager.root,'extensions/.plugin-manager/browser-sources-state.json')}
function restoreSources(manager,state){
 const adapter=safe(manager.root,'tools/browser_session.py');const current=fs.existsSync(adapter)?fs.readFileSync(adapter):null;
 if(current&&hash(current)!==state.adapter.afterHash&&(!state.adapter.before||hash(current)!==hash(Buffer.from(state.adapter.before,'base64'))))throw Error('Session adapter changed locally; preserve it before recovery');
 // User-edited source/connection files are always retained, including newly entered tokens.
 for(const file of state.brandFiles||[]){const p=safe(manager.root,file.path);if(!fs.existsSync(p)||(hash(fs.readFileSync(p))!==file.afterHash&&hash(fs.readFileSync(p))!==hash(Buffer.from(file.before,'base64'))))throw Error('Brand adapter changed locally; preserve it before recovery')}
 const kept=[];for(const file of state.created){const p=safe(manager.root,file.path);if(!fs.existsSync(p))continue;if(hash(fs.readFileSync(p))===file.sha256)fs.unlinkSync(p);else kept.push(file.path)}
 if(state.adapter.before===null){if(fs.existsSync(adapter))fs.unlinkSync(adapter)}else atomic(adapter,Buffer.from(state.adapter.before,'base64'));
 for(const file of state.brandFiles||[])atomic(safe(manager.root,file.path),Buffer.from(file.before,'base64'));
 atomic(stateFile(manager),JSON.stringify({...state,status:'rolled-back',keptModified:kept},null,2));return kept;
}
function planSources(manager,kit){
 const creations=[],sourceRoot=path.join(kit,'sources/extensions/apis');
 for(const kind of ['sources','connections','plans']){const folder=path.join(sourceRoot,kind);if(!fs.existsSync(folder))continue;for(const name of fs.readdirSync(folder)){
  if(!/^[a-zA-Z0-9_-]{1,64}\.json$/.test(name))throw Error('Invalid source filename');const rel='extensions/apis/'+kind+'/'+name,p=safe(manager.root,rel),data=fs.readFileSync(safe(sourceRoot,kind+'/'+name));JSON.parse(data);if(!fs.existsSync(p))creations.push({path:rel,sha256:hash(data),data});
 }}
 const adapter=safe(manager.root,'tools/browser_session.py'),before=fs.existsSync(adapter)?fs.readFileSync(adapter):null;
 let code=(before||fs.readFileSync(path.join(kit,'legacy-browser-session.py'))).toString('utf8');
 const anchor='def cookie_header(settings, url, unprotect=None):';if(!code.includes('NEIWANG_PLAYWRIGHT_SESSION_V1')){if(code.split(anchor).length!==2)throw Error('Unknown browser session adapter; no user file was overwritten');code=code.replace(anchor,anchor+'\n'+HOOK)}
 const rel='launcher/shell/rag-control-preload.cjs',preload=safe(manager.root,rel),original=fs.readFileSync(preload),brand=fs.readFileSync(path.join(kit,'brand-ui.js'),'utf8'),mark='// NEIWANG_BRAND_UI_V1';
 const updated=original.toString('utf8').includes(mark)?original:Buffer.from(brand+'\n'+mark+'\n'+original.toString('utf8'));
 const brandFiles=[{path:rel,before:original.toString('base64'),afterHash:hash(updated),data:updated}];
 return {creations,brandFiles,adapter:{before:before?.toString('base64')||null,afterHash:hash(code),code}};
}
function install(root,kit,{stopped}={}){
 verifyKit(kit);setup(root,kit,{stopped});const manager=new Manager(root,{stopped});
 manager.withLock(()=>{manager.ensureIdle();const file=stateFile(manager);if(fs.existsSync(file)&&read(file).status==='applying')restoreSources(manager,read(file));planSources(manager,kit)});
 const result=manager.install(path.join(kit,'plugin'),{adoptExisting:true});
 try{return manager.withLock(()=>{
  const file=stateFile(manager);if(fs.existsSync(file)&&read(file).status==='applied')return {status:'UNCHANGED',restartRequired:true};
  const plan=planSources(manager,kit),state={schemaVersion:1,status:'applying',pluginTransaction:result.transaction||manager.list().lastTransaction,brandFiles:plan.brandFiles.map(({data,...f})=>f),created:plan.creations.map(({path,sha256})=>({path,sha256})),adapter:{before:plan.adapter.before,afterHash:plan.adapter.afterHash}};atomic(file,JSON.stringify(state,null,2));
  try{for(const f of plan.brandFiles)atomic(safe(manager.root,f.path),f.data);for(const f of plan.creations){const p=safe(manager.root,f.path);fs.mkdirSync(path.dirname(p),{recursive:true});const fd=fs.openSync(p,'wx',0o600);try{fs.writeFileSync(fd,f.data);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}atomic(safe(manager.root,'tools/browser_session.py'),plan.adapter.code);atomic(file,JSON.stringify({...state,status:'applied'},null,2));return {status:'INSTALLED',createdSourceFiles:state.created.length,restartRequired:true,userConfigurationUntouched:true}}catch(e){restoreSources(manager,state);throw e}
 })}catch(e){if(result.status==='INSTALLED')manager.rollback();throw e}
}
function rollback(root,{stopped}={}){const manager=new Manager(root,{stopped});const file=stateFile(manager);const state=read(file);if(state.status==='rolled-back')return {status:'UNCHANGED'};if(manager.list().lastTransaction!==state.pluginTransaction)throw Error('请先回退之后安装的插件事务，再回退本补丁');manager.withLock(()=>{const p=safe(manager.root,'tools/browser_session.py');if(fs.existsSync(p)&&hash(fs.readFileSync(p))!==state.adapter.afterHash)throw Error('Session adapter changed locally; rollback stopped');for(const f of state.brandFiles||[]){const p=safe(manager.root,f.path);if(!fs.existsSync(p)||hash(fs.readFileSync(p))!==f.afterHash)throw Error('Brand adapter changed locally; rollback stopped')}});manager.rollback();return manager.withLock(()=>({status:'ROLLED_BACK',keptModifiedSources:restoreSources(manager,state),userDataKept:true,restartRequired:true}))}
module.exports={install,rollback,planSources,restoreSources,HOOK};
if(require.main===module){try{const [command,root]=process.argv.slice(2);if(!root||!['install','rollback'].includes(command))throw Error('Usage: install-browser-patch.cjs install|rollback APP');console.log(JSON.stringify(command==='install'?install(root,__dirname):rollback(root),null,2))}catch(e){console.error('浏览器补丁失败：'+e.message);process.exitCode=1}}
