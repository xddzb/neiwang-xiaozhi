'use strict';
// One-time, credential-free retrofit for the already shipped R11.3 launcher.
const fs=require('node:fs'),path=require('node:path');
const {Manager,atomic,safe,hash}=require('./offline-plugin-manager.cjs');
function setup(root,kit,{stopped}={}){
 kit=fs.realpathSync(kit);const manifest=JSON.parse(fs.readFileSync(safe(kit,'kit-manifest.json'),'utf8'));
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.files))throw Error('Invalid retrofit kit manifest');
 for(const required of ['offline-plugin-manager.cjs','setup-plugin-manager.cjs','plugin-profile.cjs','manage-plugins.sh'])if(!manifest.files.some(row=>row.path===required))throw Error('Incomplete retrofit kit');
 for(const row of manifest.files)if(hash(fs.readFileSync(safe(kit,row.path)))!==row.sha256)throw Error('Retrofit kit checksum failed');
 const manager=new Manager(root,stopped?{stopped}:{});return manager.withLock(()=>{
  const app=JSON.parse(fs.readFileSync(manager.appFile,'utf8'));if(!['R11.3','R11.3-dev'].includes(app.version))throw Error('This retrofit supports R11.3 only; no core update is performed');
  manager.ensureIdle();const bootstrap=safe(manager.root,'launcher/bootstrap.cjs'),original=fs.readFileSync(bootstrap,'utf8'),hook=" require('./plugin-profile.cjs')(root,currentProfile,deployment);",anchor=' fs.writeFileSync(manifest,JSON.stringify(currentProfile,null,2));';
  const guard=" require('./plugin-profile.cjs').assertReady(root);";
  if((!original.includes(hook)&&original.split(anchor).length!==2)||(!original.includes(guard)&&original.split('function prepare(){').length!==2))throw Error('Unknown launcher; no files changed');
  const targets=[['tools/offline-plugin-manager.cjs',path.join(kit,'offline-plugin-manager.cjs')],['launcher/plugin-profile.cjs',path.join(kit,'plugin-profile.cjs')],['管理插件.sh',path.join(kit,'manage-plugins.sh')]];
  const changes=targets.map(([rel,source])=>{const file=safe(manager.root,rel);return {file,before:fs.existsSync(file)?fs.readFileSync(file):null,after:fs.readFileSync(source)}});
  let updated=original.includes(hook)?original:original.replace(anchor,hook+'\n'+anchor);if(!updated.includes(guard))updated=updated.replace('function prepare(){','function prepare(){\n'+guard);
  changes.push({file:bootstrap,before:Buffer.from(original),after:Buffer.from(updated)});
  const backup=safe(manager.root,'extensions/.plugin-manager/setup-backup');fs.mkdirSync(backup,{recursive:true});
  if(!fs.existsSync(path.join(backup,'bootstrap.cjs')))atomic(path.join(backup,'bootstrap.cjs'),original);
  try{for(const c of changes)atomic(c.file,c.after);if(process.platform!=='win32')fs.chmodSync(path.join(manager.root,'管理插件.sh'),0o755)}catch(e){for(const c of changes.reverse()){if(c.before===null)fs.rmSync(c.file,{force:true});else atomic(c.file,c.before)}throw e}
  return {status:'READY',appVersion:app.version,userConfigurationUntouched:true};
 });
}
module.exports={setup};
if(require.main===module){try{if(!process.argv[2])throw Error('Supply APP directory');console.log(JSON.stringify(setup(process.argv[2],__dirname)))}catch(e){console.error('接入失败：'+e.message);process.exitCode=1}}
