'use strict';
// Compile the reviewed local sources, never substitute the upstream compiled lib.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'extensions/@anionex/dsh-turn-rewind');
function copy(from,to){
 if(fs.statSync(from).isDirectory()){fs.mkdirSync(to,{recursive:true});for(const name of fs.readdirSync(from))copy(path.join(from,name),path.join(to,name))}
 else{fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,fs.readFileSync(from))}
}
function compile(work){
 const run=args=>{const r=cp.spawnSync(process.execPath,args,{cwd:work,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stdout+r.stderr)};
 const tsc=path.join(work,'node_modules/typescript/bin/tsc');
 run([tsc,'-p','tsconfig.json','--noEmit','false','--rootDir','src','--outDir','lib','--declaration','--declarationDir','lib/types','--noEmitOnError']);
 fs.writeFileSync(path.join(work,'tsconfig.client.json'),JSON.stringify({compilerOptions:{target:'ES2022',lib:['ES2022','DOM'],module:'CommonJS',moduleResolution:'Node',jsx:'react-jsx',esModuleInterop:true,strict:true,skipLibCheck:true,rootDir:'src/client',outDir:'.client-build',noEmitOnError:true},include:['src/client/**/*']}));
 run([tsc,'-p','tsconfig.client.json']);
 const client=fs.readFileSync(path.join(work,'.client-build/index.js'),'utf8');
 fs.writeFileSync(path.join(work,'lib/client.js'),'window.__ModuleLoader__.load({ id: "@anionex/dsh-turn-rewind", factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;\n'+client+'\nreturn module.exports; } });\n');
 const files={};
 function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())scan(p);else files[path.relative(work,p).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}}
 scan(path.join(work,'src'));for(const name of ['package-lock.json','tsconfig.json'])files[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(work,name))).digest('hex');
 fs.writeFileSync(path.join(work,'lib/build-source.json'),JSON.stringify({compiler:require(path.join(work,'node_modules/typescript/package.json')).version,files},null,2));
}
async function prepare(npm){
 fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
 const work=fs.mkdtempSync(path.join(root,'tmp/rewind-local-'));
 for(const name of ['src','package.json','package-lock.json','tsconfig.json'])copy(path.join(source,name),path.join(work,name));
 const run=(cwd,args)=>{const r=cp.spawnSync(process.execPath,[npm,...args],{cwd,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stdout+r.stderr)};
 run(work,['ci','--include=dev','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund']);compile(work);
 fs.rmSync(path.join(source,'lib'),{recursive:true,force:true});copy(path.join(work,'lib'),path.join(source,'lib'));
 run(source,['ci','--omit=dev','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund']);
}
module.exports={compile,prepare};
if(require.main===module)prepare(process.env.npm_execpath||process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1});
