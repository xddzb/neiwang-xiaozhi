// Deployment composition. The upstream core directory is never edited.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.NEIWANG_APP_ROOT||path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function packages(modules){const result=[];for(const entry of fs.readdirSync(modules,{withFileTypes:true})){if(entry.name.startsWith('.'))continue;const dir=path.join(modules,entry.name);if(entry.name.startsWith('@')){for(const child of fs.readdirSync(dir,{withFileTypes:true}))if(child.isDirectory()||child.isSymbolicLink())result.push([entry.name+'/'+child.name,path.join(dir,child.name)]);}else if(entry.isDirectory()||entry.isSymbolicLink())result.push([entry.name,dir]);}return result;}
function link(target,dest){fs.mkdirSync(path.dirname(dest),{recursive:true});try{const info=fs.lstatSync(dest);if(!info.isSymbolicLink())return;const current=path.resolve(path.dirname(dest),fs.readlinkSync(dest));if(current===path.resolve(target))return;fs.unlinkSync(dest);}catch(e){if(e.code!=='ENOENT')throw e;}fs.symlinkSync(process.platform==='win32'?path.resolve(target):path.relative(path.dirname(dest),target),dest,process.platform==='win32'?'junction':'dir');}
function prepare(){
 require('./plugin-profile.cjs').assertReady(root);
 // The two offline archives form one APP. Verify/install the local pack before
 // constructing its profile, in this process so the running-process guard holds.
 const initial=read(path.join(root,'config/app.json'));
 if(initial.edition==='core'){
  const installer=path.join(root,'plugin-pack/install.cjs');
  if(!fs.existsSync(installer))throw Error('缺少离线插件包。请将同版本 Core 与 Plugins 解压到同一目录后重新启动。');
  const install=require(installer).install;
  if(typeof install!=='function')throw Error('插件安装器版本不匹配，请使用同版本 Core 与 Plugins。');
  install();
 }
 const deployment=read(path.join(root,'config/app.json'));
 const core=path.join(root,'core',deployment.coreVersion),modules=path.join(core,'node_modules'),extensions=path.join(root,'extensions/node_modules');
 const data=process.env.NEIWANG_DATA_DIR||path.join(root,'data'),home=path.join(data,'dsh');
 for(const dir of [data,home,path.join(data,'config'),path.join(data,'runtime'),path.join(root,'workspace')])fs.mkdirSync(dir,{recursive:true});
 const defaults=path.join(root,'config/defaults');
 if(fs.existsSync(defaults)){
  const keyFile=path.join(data,'config/.local-key'),seedKeyFile=path.join(defaults,'.local-key');
  if(!fs.existsSync(keyFile)){
   if(['model.enc','dify.enc'].some(n=>fs.existsSync(path.join(data,'config',n))))throw Error('Existing encrypted configuration has no local key');
   if(fs.existsSync(seedKeyFile))fs.copyFileSync(seedKeyFile,keyFile,fs.constants.COPYFILE_EXCL);
  }
  for(const name of fs.readdirSync(defaults)){
   const source=path.join(defaults,name),dest=path.join(data,'config',name);
   if(name==='.local-key'||!fs.statSync(source).isFile()||fs.existsSync(dest))continue;
   let raw=fs.readFileSync(source);
   if(['model.enc','dify.enc'].includes(name)){
    const seedKey=fs.readFileSync(seedKeyFile),key=fs.readFileSync(keyFile);
    if(!seedKey.equals(key)){
     const e=JSON.parse(raw),b=Buffer.from(e.payload,'base64'),d=crypto.createDecipheriv('aes-256-gcm',seedKey,b.subarray(0,12));d.setAAD(Buffer.from(e.format));d.setAuthTag(b.subarray(-16));
     const plain=Buffer.concat([d.update(b.subarray(12,-16)),d.final()]),n=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,n);c.setAAD(Buffer.from(e.format));
     raw=Buffer.from(JSON.stringify({format:e.format,payload:Buffer.concat([n,c.update(plain),c.final(),c.getAuthTag()]).toString('base64')}));
    }
   }
   fs.writeFileSync(dest,raw,{flag:'wx',mode:0o600});
  }
 }
 for(const [name,source]of packages(modules))link(source,path.join(extensions,name));
 const profile=path.join(home,'profiles/web');fs.mkdirSync(profile,{recursive:true});
 for(const [name,source]of packages(extensions))link(source,path.join(profile,'node_modules',name));
 const manifest=path.join(profile,'package.json');
 if(!fs.existsSync(manifest)){
   const bundles=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app',...deployment.bundles];
   const dependencies={};for(const name of deployment.bundles)dependencies[name]=read(path.join(extensions,name,'package.json')).version;
   fs.writeFileSync(manifest,JSON.stringify({name:'neiwang-web-profile',private:true,dependencies,dsh:{profile:{bundles}}},null,2));
 }
 const currentProfile=read(manifest);
 const expectedBundles=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app',...deployment.bundles];
 currentProfile.dependencies=currentProfile.dependencies||{};
 for(const name of deployment.bundles)currentProfile.dependencies[name]=read(path.join(extensions,name,'package.json')).version;
 currentProfile.dsh=currentProfile.dsh||{};currentProfile.dsh.profile=currentProfile.dsh.profile||{};
 currentProfile.dsh.profile.bundles=[...new Set([...expectedBundles,...(currentProfile.dsh.profile.bundles||[])])];
 require('./plugin-profile.cjs')(root,currentProfile,deployment);
 fs.writeFileSync(manifest,JSON.stringify(currentProfile,null,2));
 const userPatch=path.join(profile,'cordis.patch.yml');if(!fs.existsSync(userPatch))fs.writeFileSync(userPatch,'[]\n');
 // 会话回退插件目前只声明到 0.2.1-rc.2；按用户要求在当前运行时授予精确版本豁免，升级内核后自动失效。
 if(deployment.bundles.includes('@anionex/dsh-turn-rewind')){
  const manifestFile=path.join(extensions,'@anionex/dsh-turn-rewind/package.json');
  if(!fs.existsSync(manifestFile))throw Error('Turn rewind bundle is declared but its package is missing; run npm run prepare:plugins.');
  const file=path.join(profile,'compatibility.json'),grants=fs.existsSync(file)?read(file):{};
  const key='@anionex/dsh-turn-rewind@'+read(manifestFile).version;
  grants[key]=[...new Set([...(grants[key]||[]),deployment.coreVersion])];
  fs.writeFileSync(file,JSON.stringify(grants,null,2)+'\n');
 }
 // User Models settings own credentials and provider choices. No seed credential is required.
 const fields=['NEIWANG_MODEL_KEY','NEIWANG_MODEL_URL','NEIWANG_MODEL_ID'];
 const supplied=fields.some(key=>Boolean(process.env[key]));
 let model;
 if(supplied){
  if(!fields.every(key=>Boolean(process.env[key])))throw Error('Provide all NEIWANG_MODEL_* values, or clear all three and configure Models in the app.');
  const endpoint=new URL(process.env.NEIWANG_MODEL_URL);
  if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Model endpoint invalid');
  model={api_key:process.env.NEIWANG_MODEL_KEY,base_url:process.env.NEIWANG_MODEL_URL,default_model:process.env.NEIWANG_MODEL_ID,models:[process.env.NEIWANG_MODEL_ID]};
 }
 const env={...process.env,NEIWANG_APP_ROOT:root,NEIWANG_DATA_DIR:data,NEIWANG_CONFIG_DIR:path.join(data,'config'),DSH_HOME:home,DSH_DINGTALK_STATE_DIR:path.join(data,'dingtalk-official'),DSH_TELEMETRY_DISABLED:'1'};
 env.PATH=[...(process.platform==='linux'?[path.join(root,'runtime/sandbox')]:[]),process.platform==='win32'?path.join(root,'runtime/python'):path.join(root,'runtime/python/bin'),process.platform==='win32'?path.join(root,'runtime/node'):path.join(root,'runtime/node/bin'),env.PATH||''].join(path.delimiter);
 delete env.ELECTRON_RUN_AS_NODE;
 if(!model&&fs.existsSync(path.join(data,'config/model.enc'))){
  const e=read(path.join(data,'config/model.enc'));if(e.format!=='NEIWANG-MODEL-1')throw Error('Unsupported model configuration');
  const b=Buffer.from(e.payload,'base64'),key=fs.readFileSync(path.join(data,'config/.local-key')),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(e.format));d.setAuthTag(b.subarray(-16));model=JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]));
  if(model.version!==1||!model.api_key||!model.models?.includes(model.default_model))throw Error('Invalid model configuration');
  const url=new URL(model.base_url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Invalid model endpoint');
 }
 if(model)env.NEIWANG_MODEL_KEY=model.api_key;
 const overrides=read(path.join(root,'config/overrides.json'));
 const patches=[...overrides,
  {id:'workspace-controller',config:{documentsDirectory:process.env.NEIWANG_WORKSPACE_DIR||path.join(root,'workspace')}},
  {id:'agent-default-model',config:model?{provider:'neiwang',model:model.default_model}:{provider:'deepseek-official',model:'deepseek-flash'}},
  {id:'llm-pi-ai',config:model?{providers:{neiwang:{api:'openai-completions',baseURL:model.base_url,apiKeyEnv:'NEIWANG_MODEL_KEY',models:model.models.map(id=>({id,name:id,contextWindow:deployment.contextWindow,maxTokens:deployment.maxOutputTokens}))}}}:{}} ,
  ...(deployment.bundles.includes('@anionex/dsh-turn-rewind')?[{id:'turn-rewind',config:{storageDir:path.join(home,'change-ledger'),maxFileBytes:209715200,maxSnapshotBytes:1073741824,turnCheckpointMaxNewBytes:1073741824,turnCheckpointMode:'legacy'}}]:[]),
  {id:'dingtalk-channel',config:{workspace:path.join(root,'workspace/dingtalk'),markdownTitle:deployment.name}},
  {id:'office-to-pdf',config:{fontDirectories:process.platform==='win32'?[path.join(root,'extensions/office-fonts'),path.join(env.WINDIR||'C:/Windows','Fonts')]:[path.join(root,'extensions/office-fonts'),'/usr/share/fonts','/usr/local/share/fonts']}}
 ];
 // Profile user changes must win over deployment defaults, especially DingTalk account policies.
 const patchFile=path.join(data,'runtime/deployment.patch.json');
 fs.writeFileSync(patchFile,JSON.stringify(patches,null,2),{mode:0o600});
 env.NEIWANG_DEPLOYMENT_PATCH=patchFile;
 env.NEIWANG_DEPLOYMENT_CONFIG=JSON.stringify(patches);
 const node=process.platform==='win32'?path.join(root,'runtime/node/node.exe'):path.join(root,'runtime/node/bin/node');
 const electron=process.platform==='win32'?path.join(root,'launcher/electron/electron.exe'):path.join(root,'launcher/electron/electron');
 return {root,core,modules,extensions,data,home,profile,node,electron,env,patchFile,cli:path.join(modules,'@deepseek-ai/dsh/lib/bin.js'),deployment};
}
module.exports={prepare,root};
if(require.main===module){const p=prepare();console.log(JSON.stringify({status:'ready',coreVersion:p.deployment.coreVersion,profile:p.profile}));}
