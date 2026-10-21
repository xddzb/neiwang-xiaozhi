const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const platform=process.platform==='win32'?'Win10-x64':`Linux-${process.arch}`;
const root=path.resolve(__dirname,'../builds',`Neiwang-Xiaozhi-${platform}-Dev`);
if(!fs.existsSync(path.join(root,'launcher/supervisor.cjs')))throw Error('Run npm run build first. For custom --output builds, use their start.cmd/start.sh.');
const child=spawn(process.execPath,[path.join(root,'launcher/supervisor.cjs')],{cwd:root,stdio:'inherit',env:{...process.env,NEIWANG_APP_ROOT:root}});
child.on('error',()=>{console.error('Unable to launch development app.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
