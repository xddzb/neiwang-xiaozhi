'use strict';
// Run on the approved build machine; source must already contain offline dependencies.
const fs=require('node:fs'),path=require('node:path');
const {hash,inventory,nameOK}=require('../tools/offline-plugin-manager.cjs');
function build({source,output,coreVersions,os,arch,requires={}}){
 source=fs.realpathSync(source);output=path.resolve(output);if(output===source||output.startsWith(source+path.sep))throw Error('Output must be outside plugin source');if(fs.existsSync(output))throw Error('Output already exists');
 const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));if(!nameOK(pkg.name)||!pkg.version)throw Error('Invalid plugin identity');
 if(!Array.isArray(coreVersions)||!coreVersions.length||!['linux','win32'].includes(os)||!['arm64','x64'].includes(arch))throw Error('Explicit core versions and target OS/CPU required');
 const files=inventory(source).map(f=>({...f,size:fs.statSync(path.join(source,f.path)).size,mode:fs.statSync(path.join(source,f.path)).mode&0o111?0o755:0o644}));
 const manifest={schemaVersion:2,kind:'neiwang-offline-plugins',compatibility:{coreVersions,os,arch,nodeMajor:24},plugins:[{name:pkg.name,version:pkg.version,requires,files}]};
 const payload=path.join(output,'payload',pkg.name);fs.mkdirSync(payload,{recursive:true});
 for(const f of files){const target=path.join(payload,f.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,f.path),target);fs.chmodSync(target,f.mode)}
 const data=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(path.join(output,'plugin-package.json'),data);fs.writeFileSync(path.join(output,'plugin-package.json.sha256'),hash(data)+'  plugin-package.json\n');return manifest;
}
module.exports={build};
if(require.main===module){try{const opts={};const args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){if(!['--source','--output','--core','--os','--arch','--requires'].includes(args[i])||!args[i+1])throw Error('Usage: --source DIR --output NEW_DIR --core VERSION --os linux --arch arm64 [--requires JSON_FILE]');opts[args[i].slice(2)]=args[i+1]}const m=build({...opts,coreVersions:opts.core?.split(','),requires:opts.requires?JSON.parse(fs.readFileSync(opts.requires,'utf8')):{}});console.log(JSON.stringify({status:'BUILT',plugins:m.plugins.map(p=>({name:p.name,version:p.version,files:p.files.length}))}))}catch(e){console.error(e.message);process.exitCode=1}}
