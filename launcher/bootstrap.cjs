// Deployment composition. The upstream core directory is never edited.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.NEIWANG_APP_ROOT||path.resolve(__dirname,'../..');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function packages(modules){const result=[];for(const entry of fs.readdirSync(modules,{withFileTypes:true})){if(entry.name.startsWith('.'))continue;const dir=path.join(modules,entry.name);if(entry.name.startsWith('@')){for(const child of fs.readdirSync(dir,{withFileTypes:true}))if(child.isDirectory()||child.isSymbolicLink())result.push([entry.name+'/'+child.name,path.join(dir,child.name)]);}else if(entry.isDirectory()||entry.isSymbolicLink())result.push([entry.name,dir]);}return result;}
function link(target,dest){fs.mkdirSync(path.dirname(dest),{recursive:true});try{const info=fs.lstatSync(dest);if(!info.isSymbolicLink())return;const current=path.resolve(path.dirname(dest),fs.readlinkSync(dest));if(current===path.resolve(target))return;fs.unlinkSync(dest);}catch(e){if(e.code!=='ENOENT')throw e;}fs.symlinkSync(process.platform==='win32'?path.resolve(target):path.relative(path.dirname(dest),target),dest,process.platform==='win32'?'junction':'dir');}
function decrypt(file){const e=read(file),b=Buffer.from(e.payload,'base64');if(e.format!=='NEIWANG-MODEL-1')throw Error('invalid model configuration');const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(process.env.NEIWANG_CONFIG_KEY||'', 'hex'),b.subarray(0,12));d.setAAD(Buffer.from(e.format));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString('utf8'));}
function prepare(){
 const deployment=read(path.join(root,'config/app.json'));
 const core=path.join(root,'core',deployment.coreVersion),modules=path.join(core,'node_modules'),extensions=path.join(root,'extensions/node_modules');
 const data=process.env.NEIWANG_DATA_DIR||path.join(root,'data'),home=path.join(data,'dsh');
 for(const dir of [data,home,path.join(data,'config'),path.join(data,'runtime'),path.join(root,'workspace')])fs.mkdirSync(dir,{recursive:true});
 for(const name of ['model.enc','dify.enc']){const dest=path.join(data,'config',name),source=path.join(root,'config/defaults',name);if(!fs.existsSync(dest)&&fs.existsSync(source))fs.copyFileSync(source,dest);}
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
 fs.writeFileSync(manifest,JSON.stringify(currentProfile,null,2));
 const userPatch=path.join(profile,'cordis.patch.yml');if(!fs.existsSync(userPatch))fs.writeFileSync(userPatch,'[]\n');
 const model=process.env.NEIWANG_MODEL_KEY ? {version:1,api_key:process.env.NEIWANG_MODEL_KEY,base_url:process.env.NEIWANG_MODEL_URL,default_model:process.env.NEIWANG_MODEL_ID,models:[process.env.NEIWANG_MODEL_ID]} : decrypt(path.join(data,'config/model.enc'));
 if(model.version!==1||!model.models.includes(model.default_model)||!model.api_key)throw Error('Model configuration invalid');
 const endpoint=new URL(model.base_url);if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Model endpoint invalid');
 const env={...process.env,NEIWANG_APP_ROOT:root,NEIWANG_DATA_DIR:data,NEIWANG_CONFIG_DIR:path.join(data,'config'),DSH_HOME:home,DSH_DINGTALK_STATE_DIR:path.join(data,'dingtalk-official'),DSH_TELEMETRY_DISABLED:'1',NEIWANG_MODEL_KEY:model.api_key};
 env.PATH=[process.platform==='win32'?path.join(root,'runtime/python'):path.join(root,'runtime/python/bin'),process.platform==='win32'?path.join(root,'runtime/node'):path.join(root,'runtime/node/bin'),env.PATH||''].join(path.delimiter);
 delete env.ELECTRON_RUN_AS_NODE;
 const overrides=read(path.join(root,'config/overrides.json'));
 const patches=[...overrides,
  {id:'workspace-controller',config:{documentsDirectory:process.env.NEIWANG_WORKSPACE_DIR||path.join(root,'workspace')}},
  {id:'agent-default-model',config:{provider:'neiwang',model:model.default_model}},
  {id:'llm-pi-ai',config:{providers:{neiwang:{api:'openai-completions',baseURL:model.base_url,apiKeyEnv:'NEIWANG_MODEL_KEY',models:model.models.map(id=>({id,name:id,contextWindow:deployment.contextWindow,maxTokens:deployment.maxOutputTokens}))}}}},
  {id:'turn-rewind',config:{storageDir:path.join(home,'change-ledger'),maxFileBytes:209715200,maxSnapshotBytes:1073741824,turnCheckpointMaxNewBytes:1073741824,turnCheckpointMode:'legacy'}},
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
