'use strict';
// Remove only formerly managed bundles; retain user profile and all user settings.
const fs=require('node:fs'),path=require('node:path');
module.exports=function syncPluginProfile(root,profile,deployment){
 const file=path.join(root,'config/plugin-manager.json');if(!fs.existsSync(file))return;
 const registry=JSON.parse(fs.readFileSync(file,'utf8'));if(registry.schemaVersion!==1||!Array.isArray(registry.managedNames))throw Error('Invalid plugin registry');
 const retired=new Set(registry.managedNames.filter(name=>!deployment.bundles.includes(name)));
 profile.dsh.profile.bundles=profile.dsh.profile.bundles.filter(name=>!retired.has(name));
 for(const name of retired)delete profile.dependencies[name];
};
module.exports.assertReady=function(root){
 if(fs.existsSync(path.join(root,'config/.plugin-install.lock'))||fs.existsSync(path.join(root,'extensions/.plugin-manager/active.json')))throw Error('插件安装正在进行或上次安装中断；请先关闭安装器并运行 管理插件.sh recover');
};
