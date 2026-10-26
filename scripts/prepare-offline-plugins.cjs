// Connected build-machine preparation only. Runtime installation never downloads.
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sidebar=path.join(root,'extensions/dsh-better-sidebar'),attachment=path.join(root,'extensions/dsh-attachment-formats');
function run(file,args,options={}){const r=cp.spawnSync(file,args,{cwd:options.cwd||sidebar,encoding:'utf8',windowsHide:true,env:{...process.env,npm_config_cache:path.join(root,'tmp/npm-plugins-cache')},...options});if(r.status!==0)throw Error((r.stderr||r.stdout||'command failed').slice(-2000));return r.stdout}
async function prepare(){
 if(Number(process.versions.node.split('.')[0])!==24)throw Error('Use Node.js 24.x');
 const npm=process.env.npm_execpath;if(!npm||!fs.existsSync(npm))throw Error('Run through npm run prepare:plugins');
 const upstream=JSON.parse(fs.readFileSync(path.join(sidebar,'upstream.json'),'utf8'));
 const url=new URL(upstream.tarball);if(url.origin!=='https://registry.npmjs.org'||upstream.version!=='0.28.0')throw Error('Unexpected plugin source');
 const response=await fetch(url);if(!response.ok)throw Error('Pinned artifact download failed');const bytes=Buffer.from(await response.arrayBuffer());
 if('sha512-'+crypto.createHash('sha512').update(bytes).digest('base64')!==upstream.integrity)throw Error('Pinned artifact integrity mismatch');
 fs.mkdirSync(path.join(root,'tmp'),{recursive:true});const temp=fs.mkdtempSync(path.join(root,'tmp/sidebar-assets-')),archive=path.join(temp,'plugin.tgz');fs.writeFileSync(archive,bytes);
 const names=run('tar',['-tzf',archive]);if(names.split(/\r?\n/).filter(Boolean).some(n=>!n.startsWith('package/')||n.split('/').includes('..')))throw Error('Unsafe artifact paths');
 run('tar',['-xzf',archive,'-C',temp]);const pkg=path.join(temp,'package'),meta=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8'));
 if(meta.name!=='dsh-better-sidebar'||meta.version!==upstream.version)throw Error('Artifact identity mismatch');
 for(const name of ['lib','locale','src']){const target=path.join(sidebar,name);fs.rmSync(target,{recursive:true,force:true});fs.cpSync(path.join(pkg,name),target,{recursive:true})}
 for(const name of ['LICENSE','icon.svg','cordis.patch.yml'])fs.copyFileSync(path.join(pkg,name),path.join(sidebar,name));
 run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund']);
 run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(root,'extensions/@neiwang/browser-automation')});
 prepareAttachment(npm);
 await prepareRewind(npm);
 console.log('Prepared pinned offline sidebar 0.28.0, Playwright dependencies, attachment formats with bilingual OCR data and turn-rewind');
}
function prepareAttachment(npm){
 run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:attachment});
 const temp=fs.mkdtempSync(path.join(root,'tmp/attach-assets-')),dataDir=path.join(attachment,'vendor/tessdata');fs.mkdirSync(dataDir,{recursive:true});
 const assets=[];
 for(const lang of ['eng','chi_sim']){
  const info=JSON.parse(run(process.execPath,[npm,'pack',`@tesseract.js-data/${lang}@1.0.0`,'--ignore-scripts','--json','--pack-destination',temp],{cwd:attachment}))[0];
  const archive=path.join(temp,info.filename),digest=crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64');
  if(info.integrity!=='sha512-'+digest)throw Error('OCR resource integrity mismatch');
  run('tar',['-xzf',archive,'-C',temp,`package/4.0.0_best_int/${lang}.traineddata.gz`],{cwd:attachment});
  const file=path.join(temp,'package/4.0.0_best_int',lang+'.traineddata.gz');fs.copyFileSync(file,path.join(dataDir,lang+'.traineddata.gz'));
  assets.push({name:info.name,version:info.version,integrity:info.integrity,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
 }
 fs.writeFileSync(path.join(attachment,'vendor/assets.json'),JSON.stringify({languages:assets,node:process.versions.node,platform:process.platform,arch:process.arch},null,2));
}
async function prepareRewind(npm){
 const dest=path.join(root,'extensions/@anionex/dsh-turn-rewind'),pin=JSON.parse(fs.readFileSync(path.join(dest,'upstream.json'),'utf8'));
 if(pin.version!=='0.3.10'||pin.tarball!=='https://registry.npmjs.org/@anionex/dsh-turn-rewind/-/dsh-turn-rewind-0.3.10.tgz')throw Error('Unexpected rewind artifact');
 const response=await fetch(pin.tarball);if(!response.ok)throw Error('Rewind artifact download failed');const bytes=Buffer.from(await response.arrayBuffer());
 if('sha512-'+crypto.createHash('sha512').update(bytes).digest('base64')!==pin.integrity)throw Error('Rewind integrity mismatch');
 fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
 const temp=fs.mkdtempSync(path.join(root,'tmp/rewind-assets-')),file=path.join(temp,'plugin.tgz');fs.writeFileSync(file,bytes);
 const names=run('tar',['-tzf',file]);if(names.split(/\r?\n/).filter(Boolean).some(n=>!n.startsWith('package/')||n.split('/').includes('..')))throw Error('Unsafe rewind artifact');
 run('tar',['-xzf',file,'-C',temp]);
 require('./build-dev.cjs').copyTree(path.join(temp,'package/lib'),path.join(dest,'lib'));
 run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund'],{cwd:dest});
}
if(require.main===module)prepare().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={prepare,prepareRewind};
