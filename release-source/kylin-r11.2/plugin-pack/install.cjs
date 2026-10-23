'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const pack=__dirname,root=path.resolve(pack,'..'),manifest=JSON.parse(fs.readFileSync(path.join(pack,'pack.json'),'utf8'));
function safe(base,rel){if(typeof rel!=='string'||rel.includes('\\')||path.posix.isAbsolute(rel)||rel.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Invalid pack path');const out=path.resolve(base,rel);if(!out.startsWith(base+path.sep))throw Error('Pack path escapes root');let p=path.dirname(out);while(p.length>=base.length){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Symbolic parent is not allowed');if(p===base)break;p=path.dirname(p);}return out;}
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function running(){
 if(process.platform==='win32'){
  const r=require('node:child_process').spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$r='${root.replaceAll("'","''")}'; @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -match '^(node|electron|内网小智)\\.exe$') -and $_.ProcessId -ne ${process.pid} -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($r+'\\',[StringComparison]::OrdinalIgnoreCase) }).Count`],{encoding:'utf8',windowsHide:true});
  if(r.status!==0||!/^\d+$/.test(r.stdout.trim()))throw Error('Cannot check running APP; close APP and retry');return Number(r.stdout.trim())>0;
 }
 for(const pid of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n)&&Number(n)!==process.pid))try{const exe=fs.readlinkSync('/proc/'+pid+'/exe');if(exe.startsWith(root+path.sep)&&/\/(node|electron)$/.test(exe))return true;}catch{}
 return false;
}
function install(){
 const appFile=path.join(root,'config/app.json'),app=JSON.parse(fs.readFileSync(appFile,'utf8'));
 if(app.version!==manifest.release||app.platform!==manifest.platform||process.platform!==manifest.os||process.arch!==manifest.arch)throw Error('Core release/platform does not match this plugin pack');
 if(running())throw Error('请完全退出内网小智后再安装插件。');
 const payload=path.join(pack,'payload');
 for(const file of manifest.files){const src=safe(payload,file.path),dst=safe(root,file.path);if(!fs.existsSync(src)||fs.lstatSync(src).isSymbolicLink()||digest(src)!==file.sha256)throw Error('Plugin file checksum failed: '+file.path);if(fs.existsSync(dst)&&(fs.lstatSync(dst).isSymbolicLink()||digest(dst)!==file.sha256))throw Error('Existing file differs; no files changed: '+file.path);}
 for(const link of manifest.links){const dst=safe(root,link.path);const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(link.path),link.target));safe(root,resolved);if(path.posix.isAbsolute(link.target))throw Error('Absolute link rejected');if(fs.existsSync(dst)||(()=>{try{return fs.lstatSync(dst).isSymbolicLink()}catch{return false}})()){if(!fs.lstatSync(dst).isSymbolicLink()||fs.readlinkSync(dst)!==link.target)throw Error('Link conflict');}}
 const lock=path.join(root,'config/.plugin-install.lock');const fd=fs.openSync(lock,'wx');let created=[];
 const oldApp=fs.readFileSync(appFile);const marker=path.join(root,'config/feature-pack.json');const oldMarker=fs.existsSync(marker)?fs.readFileSync(marker):null;
 try{
  for(const file of manifest.files){const src=safe(payload,file.path),dst=safe(root,file.path);if(fs.existsSync(dst))continue;fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst,fs.constants.COPYFILE_EXCL);created.push(dst);fs.chmodSync(dst,file.mode);}
  for(const link of manifest.links){const dst=safe(root,link.path);try{fs.lstatSync(dst);continue;}catch{}fs.mkdirSync(path.dirname(dst),{recursive:true});fs.symlinkSync(link.target,dst);created.push(dst);}
  const bundles=[...new Set([...app.bundles,...manifest.bundles])];
  fs.writeFileSync(marker,JSON.stringify({version:manifest.release,platform:manifest.platform,installedAt:new Date().toISOString(),bundles:manifest.bundles},null,2));
  const tmp=appFile+'.install.tmp';fs.writeFileSync(tmp,JSON.stringify({...app,bundles,edition:'full'},null,2));fs.renameSync(tmp,appFile);
  console.log('插件安装完成。已有配置、聊天、工作区和钉钉绑定数据已保留；重新启动内网小智生效。');
 }catch(error){fs.writeFileSync(appFile,oldApp);if(oldMarker)fs.writeFileSync(marker,oldMarker);else if(fs.existsSync(marker))fs.unlinkSync(marker);for(const file of created.reverse())fs.unlinkSync(file);throw error;}
 finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
try{install();}catch(error){console.error('安装失败：'+error.message);process.exitCode=1;}
