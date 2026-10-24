// Build a portable development app for the current platform; never copy local state.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
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
function build({dependencies=path.join(source,'node_modules'),output,coreOnly=false,electronDist}={}){
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major!==24||minor<9)throw Error('Use Node.js 24.x (>=24.9.0).');
 if(!['win32','linux'].includes(process.platform))throw Error('Supported build hosts: Windows and Linux.');
 const platform=process.platform==='win32'?'Win10-x64':`Linux-${process.arch}`;
 if(process.platform==='win32'&&process.arch!=='x64')throw Error('Windows development builds require x64.');
 const dest=path.resolve(output||path.join(source,'builds',`Neiwang-Xiaozhi-${platform}-Dev`));
 if(!dest.startsWith(path.join(source,'builds')+path.sep))throw Error('--output must be a new directory inside this repository builds/ folder.');
 if(fs.existsSync(dest))throw Error('Output already exists. Keep user data safe: move it aside or use a new --output directory.');
 const corePackage=JSON.parse(fs.readFileSync(path.join(dependencies,'@deepseek-ai/dsh/package.json'),'utf8'));
 if(corePackage.version!=='0.2.1-rc.3')throw Error('Unexpected DSH version; run npm ci.');
 const electron=path.resolve(electronDist||path.join(dependencies,'electron/dist'));
 const template=JSON.parse(fs.readFileSync(path.join(source,'manifests/interface-template.json'),'utf8'));
 if(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(source,template.path))).digest('hex')!==template.sha256)throw Error('The public blank interface template has changed. Keep real interface material in the ignored internal document.');
 if(!fs.existsSync(path.join(electron,process.platform==='win32'?'electron.exe':'electron')))throw Error('Electron runtime missing; npm ci must allow the Electron install script.');
 if(fs.readFileSync(path.join(electron,'version'),'utf8').trim().replace(/^v/,'')!=='33.2.0')throw Error('Electron runtime must be 33.2.0 for this baseline.');
 const materials=path.join(source,'build-materials',`${process.platform}-${process.arch}`);
 const python=path.join(materials,process.platform==='win32'?'python/python.exe':'python/bin/python3');
 if(!coreOnly){
  if(!fs.existsSync(path.join(materials,'ready.json')))throw Error('Run npm run prepare:runtime on this target OS/CPU first.');
  const probe=spawnSync(python,['-I','-c','import sys,platform,PyInstaller,json;print(json.dumps([sys.version.split()[0],PyInstaller.__version__,platform.machine()]))'],{encoding:'utf8',windowsHide:true});
  if(probe.status!==0)throw Error('Prepared Python/PyInstaller cannot run on this host.');
  const versions=JSON.parse(probe.stdout);if(versions[0]!=='3.12.14'||versions[1]!=='6.22.3')throw Error('Prepared Python/PyInstaller version mismatch');
  if(process.platform==='linux'&&!fs.existsSync(path.join(materials,'sandbox/bwrap')))throw Error('Prepared Linux bubblewrap helper missing; rerun runtime preparation in a fresh materials directory.');
 }
 const copy=copyTree;
 fs.mkdirSync(dest,{recursive:true});
 const modules=path.join(dest,'core',corePackage.version,'node_modules');
 copyTree(dependencies,modules,p=>!['electron','.bin','.cache'].includes(path.relative(dependencies,p).split(path.sep)[0]));
 copy(path.join(source,'launcher'),path.join(dest,'launcher'));
 copy(path.join(source,'tools/offline-plugin-manager.cjs'),path.join(dest,'tools/offline-plugin-manager.cjs'));
 copy(path.join(source,'tools/manage-plugins.sh'),path.join(dest,'管理插件.sh'));
 copy(electron,path.join(dest,'launcher/electron'));
 copy(process.execPath,path.join(dest,process.platform==='win32'?'runtime/node/node.exe':'runtime/node/bin/node'));
 for(const name of ['app.json','brand.json','overrides.json','deployment.yml'])copy(path.join(source,'config',name),path.join(dest,'config',name));
 const nodeLicense=path.join(path.dirname(process.execPath),'LICENSE');
 if(fs.existsSync(nodeLicense))copy(nodeLicense,path.join(dest,'runtime/node/LICENSE'));
 const app=JSON.parse(fs.readFileSync(path.join(dest,'config/app.json'),'utf8'));
 app.platform=platform;app.bundles=['@neiwang/deployment','@neiwang/brand'];
 if(!coreOnly)app.bundles.push('@dingtalk-real-ai/dsh-dingtalk','@deepseek-ai/neiwang-dingtalk-ui','@neiwang/dws-aitable','@neiwang/python-tools','@neiwang/skill-incubator','dsh-better-sidebar','@neiwang/browser-automation');
 if(!coreOnly&&!fs.existsSync(path.join(source,'extensions/dsh-better-sidebar/lib/index.js')))throw Error('Run npm run prepare:plugins in the approved build environment first.');
 for(const name of app.bundles.filter(n=>!['@dingtalk-real-ai/dsh-dingtalk'].includes(n)))copy(path.join(source,'extensions',name),path.join(dest,'extensions/node_modules',name));
 copy(path.join(source,'config/workspace-rules.md'),path.join(dest,'workspace/AGENTS.md'));
 fs.writeFileSync(path.join(dest,'config/app.json'),JSON.stringify(app,null,2)+'\n');
 if(!coreOnly){
  const patch=path.join(dest,'extensions/node_modules/@neiwang/deployment/cordis.patch.yml');
  fs.appendFileSync(patch,'\n- id: dingtalk-channel\n  config: !!js \'JSON.parse(process.env.NEIWANG_DEPLOYMENT_CONFIG).find(row=>row.id==="dingtalk-channel").config\'\n');
  copy(path.join(source,'tools/configure-official-dingtalk.mjs'),path.join(dest,'tools/configure-official-dingtalk.mjs'));
  fs.writeFileSync(path.join(dest,'配置钉钉.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node\\node.exe" "tools\\configure-official-dingtalk.mjs"\r\npause\r\n');
  fs.writeFileSync(path.join(dest,'配置钉钉.sh'),'#!/bin/sh\nset -eu\ncd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec ./runtime/node/bin/node ./tools/configure-official-dingtalk.mjs\n',{mode:0o755});
  copy(path.join(materials,'python'),path.join(dest,'runtime/python'));
  if(process.platform==='linux')copy(path.join(materials,'sandbox'),path.join(dest,'runtime/sandbox'));
  copy(path.join(materials,'dws'),path.join(dest,'extensions/dws'));
  for(const name of ['python_tool.py','package_tool.py','dws-login.cjs','dws-readonly-app.ps1'])copy(path.join(source,'tools',name),path.join(dest,'tools',name));
  fs.writeFileSync(path.join(dest,'登录AI表格.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node\\node.exe" "tools\\dws-login.cjs"\r\n');
  fs.writeFileSync(path.join(dest,'登录AI表格.sh'),'#!/bin/sh\nset -eu\ncd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec ./runtime/node/bin/node ./tools/dws-login.cjs\n',{mode:0o755});
  const dws=path.join(dest,'extensions/dws',process.platform==='win32'?'dws.exe':'dws');
  const result=spawnSync(process.execPath,[path.join(source,'scripts/generate_dws_contracts.mjs'),dws,path.join(dest,'extensions/node_modules/@neiwang/dws-aitable/contracts.json')],{stdio:'inherit',windowsHide:true,env:{...process.env,DWS_CONFIG_DIR:path.join(source,'tmp/dws-schema/config'),DWS_KEYCHAIN_DIR:path.join(source,'tmp/dws-schema/keychain'),DWS_NO_UPDATE_CHECK:'1'}});
  if(result.status!==0)throw Error('DWS local schema generation failed; incomplete build must not be distributed.');
 }
 for(const name of ['INSTALL.md','DEVELOPMENT.md','HANDOVER.md'])copy(path.join(source,'docs',name),path.join(dest,'docs',name));
 fs.writeFileSync(path.join(dest,'开发版使用说明.md'),'# 完整开发版\n\n请阅读 [构建与使用指南](docs/DEVELOPMENT.md)，首次启动后在设置中配置自己的模型、钉钉与 AI 表格账号。\n');
 copy(path.join(source,'private-docs/内网接口文档.template.html'),path.join(dest,'private-docs/内网接口文档.template.html'));
 copy(path.join(source,'private-docs/README.md'),path.join(dest,'private-docs/README.md'));
 fs.writeFileSync(path.join(dest,'start.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node\\node.exe" "launcher\\supervisor.cjs"\r\nif errorlevel 1 pause\r\n');
 fs.writeFileSync(path.join(dest,'start.sh'),'#!/bin/sh\nset -eu\ncd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec ./runtime/node/bin/node ./launcher/supervisor.cjs\n',{mode:0o755});
 const metadata={platform,arch:process.arch,node:process.versions.node,core:corePackage.version,edition:'development',features:coreOnly?[]:['dingtalk','dws-aitable','python','pyinstaller','schedule','skill-incubator','better-sidebar']};
 fs.mkdirSync(path.join(dest,'manifests'),{recursive:true});fs.writeFileSync(path.join(dest,'manifests/development.json'),JSON.stringify(metadata,null,2));
 if(!coreOnly)copy(path.join(materials,'ready.json'),path.join(dest,'manifests/runtime-assets.json'));
 console.log('Development app built: '+dest);return dest;
}
if(require.main===module){
 const args=process.argv.slice(2),at=args.indexOf('--output'),electronAt=args.indexOf('--electron-dist');
 if(at>=0&&!args[at+1])throw Error('--output needs a new directory');
 if(electronAt>=0&&!args[electronAt+1])throw Error('--electron-dist needs a trusted matching-platform Electron directory');
 build({output:at>=0?args[at+1]:undefined,coreOnly:args.includes('--core-only'),electronDist:electronAt>=0?args[electronAt+1]:undefined});
}
module.exports={build,copyTree};
