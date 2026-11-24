// Exercise target-platform packages without contacting external services.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
async function main(){
 const app=path.resolve(process.argv[2]),version=JSON.parse(fs.readFileSync(path.join(app,'config/app.json'),'utf8')).coreVersion;
 const core=path.join(app,'core',version),load=createRequire(path.join(core,'package.json'));
 const sharp=load('sharp'),png=await sharp({create:{width:2,height:2,channels:3,background:'#112233'}}).png().toBuffer();assert.equal(png.subarray(1,4).toString(),'PNG');
 assert.equal(typeof load('koffi').load,'function');load('node-addon-require-builtin');
 const rg=path.join(core,'node_modules/@vscode',`ripgrep-${process.platform}-${process.arch}`,'bin',process.platform==='win32'?'rg.exe':'rg');
 const search=spawnSync(rg,['--version'],{encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(search.status,0,search.error?.message||search.stderr);
 const pty=load('node-pty');let output='';
 await new Promise((resolve,reject)=>{
  const child=pty.spawn(process.platform==='win32'?(process.env.ComSpec||'cmd.exe'):'/bin/sh',process.platform==='win32'?['/d','/c','echo CORE_PTY_OK']:['-c','printf CORE_PTY_OK'],{cols:80,rows:24,env:process.env});
  const timer=setTimeout(()=>{child.kill();reject(Error('PTY timed out'))},60000);
  child.onData(data=>{output+=data});child.onExit(({exitCode})=>{clearTimeout(timer);exitCode===0?resolve():reject(Error('PTY exit '+exitCode))});
 });assert.ok(output.includes('CORE_PTY_OK'));
 console.log(JSON.stringify({status:'PASS',core:version,platform:process.platform+'-'+process.arch,checks:['sharp image processing','koffi native loader','builtin addon loader','ripgrep executable','PTY shell execution']}));
}
// ConPTY can retain a worker after the child exit; this standalone probe owns it.
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
