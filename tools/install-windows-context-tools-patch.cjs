'use strict';
const fs=require('node:fs');
const {ContextToolsPatch}=require('./install-context-tools-patch.cjs');
const {safe}=require('./offline-plugin-manager.cjs');
class WindowsContextToolsPatch extends ContextToolsPatch{
 constructor(root,kit=__dirname,options={}){super(root,kit,options);this.record=safe(this.root,'config/windows-context-tools-patch-backup.json');}
 compatible(){if(process.platform!=='win32'||process.arch!=='x64')throw Error('仅支持 Windows x64');return super.compatible();}
 plan(){const previous=safe(this.root,'config/context-tools-patch-backup.json');if(fs.existsSync(previous)&&['applying','restoring'].includes(JSON.parse(fs.readFileSync(previous,'utf8')).status))throw Error('请先恢复此前中断的组合补丁');return super.plan();}
}
module.exports={WindowsContextToolsPatch};
if(require.main===module)try{console.log(JSON.stringify(new WindowsContextToolsPatch(process.argv[3]).run(process.argv[2])));console.log('Completed. Restart the app. Settings > Models > Add provider.');}catch(e){console.error(e.message);process.exitCode=1;}
