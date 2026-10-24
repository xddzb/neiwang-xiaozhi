// Transpile the pinned, dependency-free upstream core; no package installs.
const fs=require('node:fs'),path=require('node:path'),{stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'../extensions/@neiwang/skill-incubator');
for(const folder of ['lib','tools']){
 fs.mkdirSync(path.join(root,'lib',folder),{recursive:true});
 for(const name of fs.readdirSync(path.join(root,'upstream-source',folder))){
  if(!name.endsWith('.ts'))continue;
  const input=fs.readFileSync(path.join(root,'upstream-source',folder,name),'utf8');
  let output=stripTypeScriptTypes(input,{mode:'transform'}).replace(/(from\s+['"][^'"]+)\.ts(['"])/g,'$1.mjs$2');
  if(name==='fs-adapter.ts')output=output.replace(/export function makeHostFs\([^]*$/, "export function makeHostFs(ctx, signal) { if(signal?.aborted)throw Error('cancelled'); const local=ctx?.get?.('neiwang-scoped-fs'); if(!local)throw Error('scoped skill filesystem required'); return local; }\n");
  fs.writeFileSync(path.join(root,'lib',folder,name.replace(/\.ts$/,'.mjs')),output);
 }
}
console.log('Compiled pinned skill creator core');
