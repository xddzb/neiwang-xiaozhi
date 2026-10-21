const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),config=path.join(root,'config/app.json');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const app=read(config),command=process.argv[2]||'verify';
if(command==='verify'){
 const core=path.join(root,'core',app.coreVersion),inventory=read(path.join(root,'manifests/core-sha256.json'));
 const failures=[];for(const [name,digest]of Object.entries(inventory)){try{if(crypto.createHash('sha256').update(fs.readFileSync(path.join(core,name))).digest('hex')!==digest)failures.push(name);}catch{failures.push(name);}}
 console.log(JSON.stringify({version:app.coreVersion,checked:Object.keys(inventory).length,unchanged:failures.length===0,failures},null,2));process.exitCode=failures.length?1:0;
}else if(command==='layout')console.log(JSON.stringify({core:'core/'+app.coreVersion,extensions:'extensions/node_modules',deployment:'config',userData:process.env.NEIWANG_DATA_DIR||'data',shell:'launcher',coreModified:false},null,2));
else throw Error('Usage: manage-core.cjs verify | layout. Upgrade requires a separately validated platform-specific core and a matching baseline manifest.');
