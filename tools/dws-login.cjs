// Dedicated read-only app only. Never fall back to DWS's shared OAuth application.
const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),data=process.env.NEIWANG_DATA_DIR||path.join(root,'data');
if(process.platform!=='win32'||!fs.existsSync(path.join(data,'config/dws-readonly-app.xml'))){
 console.error('Dedicated read-only application is not configured. Default broad authorization is disabled.');process.exit(2);
}
const result=spawnSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/dws-readonly-app.ps1'),'-Mode','Login'],{cwd:root,env:{...process.env,NEIWANG_DATA_DIR:data},stdio:'inherit'});
console.log('Press Enter to close.');process.stdin.resume();process.stdin.once('data',()=>process.exit(result.status??1));
