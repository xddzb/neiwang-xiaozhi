// Build a portable development app for the current platform; never copy local state.
const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'..');
// Explicit traversal also avoids platform-specific cpSync directory metadata failures.
function copyTree(a,b,filter=()=>true){
 if(!filter(a))return;
 const info=fs.lstatSync(a);fs.mkdirSync(path.dirname(b),{recursive:true});
 if(info.isSymbolicLink()){fs.symlinkSync(fs.readlinkSync(a),b);return;}
 if(info.isDirectory()){
  fs.mkdirSync(b,{recursive:true});for(const name of fs.readdirSync(a))copyTree(path.join(a,name),path.join(b,name),filter);
 }else{fs.copyFileSync(a,b);if(process.platform!=='win32')fs.chmodSync(b,info.mode&0o777);}
}
function build({dependencies=path.join(source,'node_modules'),output,withDingtalk=false,electronDist}={}){
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major!==24||minor<9)throw Error('Use Node.js 24.x (>=24.9.0).');
 if(!['win32','linux'].includes(process.platform))throw Error('Supported build hosts: Windows and Linux.');
 const platform=process.platform==='win32'?'Win10-x64':`Linux-${process.arch}`;
 if(process.platform==='win32'&&process.arch!=='x64')throw Error('Windows development builds require x64.');
 const dest=path.resolve(output||path.join(source,'builds',`Neiwang-Xiaozhi-${platform}-Dev`));
 if(!dest.startsWith(path.join(source,'builds')+path.sep))throw Error('--output must be a new directory inside this repository builds/ folder.');
 if(fs.existsSync(dest))throw Error('Output already exists. Keep user data safe: move it aside or use a new --output directory.');
 const corePackage=JSON.parse(fs.readFileSync(path.join(dependencies,'@deepseek-ai/dsh/package.json'),'utf8'));
 if(corePackage.version!=='0.2.0-rc.2')throw Error('Unexpected DSH version; run npm ci.');
 const electron=path.resolve(electronDist||path.join(dependencies,'electron/dist'));
 if(!fs.existsSync(path.join(electron,process.platform==='win32'?'electron.exe':'electron')))throw Error('Electron runtime missing; npm ci must allow the Electron install script.');
 if(fs.readFileSync(path.join(electron,'version'),'utf8').trim().replace(/^v/,'')!=='33.2.0')throw Error('Electron runtime must be 33.2.0 for this baseline.');
 const copy=copyTree;
 fs.mkdirSync(dest,{recursive:true});
 const modules=path.join(dest,'core',corePackage.version,'node_modules');
 copyTree(dependencies,modules,p=>!['electron','.bin','.cache'].includes(path.relative(dependencies,p).split(path.sep)[0]));
 copy(path.join(source,'launcher'),path.join(dest,'launcher'));
 copy(electron,path.join(dest,'launcher/electron'));
 copy(process.execPath,path.join(dest,process.platform==='win32'?'runtime/node/node.exe':'runtime/node/bin/node'));
 for(const name of ['app.json','brand.json','overrides.json','deployment.yml'])copy(path.join(source,'config',name),path.join(dest,'config',name));
 const nodeLicense=path.join(path.dirname(process.execPath),'LICENSE');
 if(fs.existsSync(nodeLicense))copy(nodeLicense,path.join(dest,'runtime/node/LICENSE'));
 const app=JSON.parse(fs.readFileSync(path.join(dest,'config/app.json'),'utf8'));
 app.platform=platform;app.bundles=['@neiwang/deployment','@neiwang/brand'];
 if(withDingtalk)app.bundles.push('@dingtalk-real-ai/dsh-dingtalk','@deepseek-ai/neiwang-dingtalk-ui');
 for(const name of app.bundles.filter(n=>n!=='@dingtalk-real-ai/dsh-dingtalk'))copy(path.join(source,'extensions',name),path.join(dest,'extensions/node_modules',name));
 fs.writeFileSync(path.join(dest,'config/app.json'),JSON.stringify(app,null,2)+'\n');
 if(withDingtalk){
  const patch=path.join(dest,'extensions/node_modules/@neiwang/deployment/cordis.patch.yml');
  fs.appendFileSync(patch,'\n- id: dingtalk-channel\n  config: !!js \'JSON.parse(process.env.NEIWANG_DEPLOYMENT_CONFIG).find(row=>row.id==="dingtalk-channel").config\'\n');
  copy(path.join(source,'tools/configure-official-dingtalk.mjs'),path.join(dest,'tools/configure-official-dingtalk.mjs'));
  fs.writeFileSync(path.join(dest,'配置钉钉.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node\\node.exe" "tools\\configure-official-dingtalk.mjs"\r\npause\r\n');
  fs.writeFileSync(path.join(dest,'配置钉钉.sh'),'#!/bin/sh\nset -eu\ncd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec ./runtime/node/bin/node ./tools/configure-official-dingtalk.mjs\n',{mode:0o755});
 }
 copy(path.join(source,'docs/BUILD_AND_RUN.md'),path.join(dest,'开发版使用说明.md'));
 fs.writeFileSync(path.join(dest,'start.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node\\node.exe" "launcher\\supervisor.cjs"\r\nif errorlevel 1 pause\r\n');
 fs.writeFileSync(path.join(dest,'start.sh'),'#!/bin/sh\nset -eu\ncd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec ./runtime/node/bin/node ./launcher/supervisor.cjs\n',{mode:0o755});
 const metadata={platform,arch:process.arch,node:process.versions.node,core:corePackage.version,edition:'development',withDingtalk};
 fs.mkdirSync(path.join(dest,'manifests'),{recursive:true});fs.writeFileSync(path.join(dest,'manifests/development.json'),JSON.stringify(metadata,null,2));
 console.log('Development app built: '+dest);return dest;
}
if(require.main===module){
 const args=process.argv.slice(2),at=args.indexOf('--output'),electronAt=args.indexOf('--electron-dist');
 if(at>=0&&!args[at+1])throw Error('--output needs a new directory');
 if(electronAt>=0&&!args[electronAt+1])throw Error('--electron-dist needs a trusted matching-platform Electron directory');
 build({output:at>=0?args[at+1]:undefined,withDingtalk:args.includes('--with-dingtalk'),electronDist:electronAt>=0?args[electronAt+1]:undefined});
}
module.exports={build};
