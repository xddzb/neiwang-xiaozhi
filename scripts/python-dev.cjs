const {spawnSync}=require('node:child_process'),path=require('node:path');
function run(script,args=[]){
 const executable=process.env.NEIWANG_BUILD_PYTHON||(process.platform==='win32'?'python':'python3');
 const result=spawnSync(executable,[path.join(__dirname,script),...args],{stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
 if(result.error)console.error('Build tooling requires Python 3.10+. Set NEIWANG_BUILD_PYTHON to its executable.');
 process.exitCode=result.status??1;
}
module.exports=run;
if(require.main===module){if(!process.argv[2])throw Error('Specify a local build script');run(process.argv[2],process.argv.slice(3));}
