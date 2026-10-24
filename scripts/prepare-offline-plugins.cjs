// Connected build-machine preparation only. Runtime installation never downloads.
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),plugin=path.join(root,'extensions/dsh-better-sidebar');
function run(file,args,options={}){const r=cp.spawnSync(file,args,{cwd:plugin,encoding:'utf8',windowsHide:true,...options});if(r.status!==0)throw Error((r.stderr||r.stdout||'command failed').slice(-2000));return r.stdout}
async function prepare(){
 if(Number(process.versions.node.split('.')[0])!==24)throw Error('Use Node.js 24.x');
 const npm=process.env.npm_execpath;if(!npm||!fs.existsSync(npm))throw Error('Run through npm run prepare:plugins');
 const upstream=JSON.parse(fs.readFileSync(path.join(plugin,'upstream.json'),'utf8'));
 const url=new URL(upstream.tarball);if(url.origin!=='https://registry.npmjs.org'||upstream.version!=='0.28.0')throw Error('Unexpected plugin source');
 const response=await fetch(url);if(!response.ok)throw Error('Pinned artifact download failed');const bytes=Buffer.from(await response.arrayBuffer());
 if('sha512-'+crypto.createHash('sha512').update(bytes).digest('base64')!==upstream.integrity)throw Error('Pinned artifact integrity mismatch');
 fs.mkdirSync(path.join(root,'tmp'),{recursive:true});const temp=fs.mkdtempSync(path.join(root,'tmp/sidebar-assets-')),archive=path.join(temp,'plugin.tgz');fs.writeFileSync(archive,bytes);
 const names=run('tar',['-tzf',archive]);if(names.split(/\r?\n/).filter(Boolean).some(n=>!n.startsWith('package/')||n.split('/').includes('..')))throw Error('Unsafe artifact paths');
 run('tar',['-xzf',archive,'-C',temp]);const pkg=path.join(temp,'package'),meta=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8'));
 if(meta.name!=='dsh-better-sidebar'||meta.version!==upstream.version)throw Error('Artifact identity mismatch');
 for(const name of ['lib','locale','src']){const target=path.join(plugin,name);fs.rmSync(target,{recursive:true,force:true});fs.cpSync(path.join(pkg,name),target,{recursive:true})}
 for(const name of ['LICENSE','icon.svg','cordis.patch.yml'])fs.copyFileSync(path.join(pkg,name),path.join(plugin,name));
 run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund']);
 run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(root,'extensions/@neiwang/browser-automation')});
 console.log('Prepared pinned offline sidebar 0.28.0 and Playwright dependencies; no PDF parser');
}
if(require.main===module)prepare().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={prepare};
