// Run in the approved connected build environment, never at APP runtime.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),plugin=path.join(root,'extensions/dsh-attachment-formats');
if(Number(process.versions.node.split('.')[0])!==24)throw Error('Use Node.js 24.x');
const npm=process.env.npm_execpath;
if(!npm||!fs.existsSync(npm))throw Error('Run through npm run prepare:plugins');
function run(file,args,options={}){const r=cp.spawnSync(file,args,{cwd:plugin,encoding:'utf8',windowsHide:true,...options});if(r.status!==0)throw Error((r.stderr||r.stdout||'command failed').slice(-3000));return r.stdout;}
run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(root,'extensions/@neiwang/browser-automation')});
run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund']);
const temp=fs.mkdtempSync(path.join(root,'tmp/plugin-assets-'));
const dataDir=path.join(plugin,'vendor/tessdata');fs.mkdirSync(dataDir,{recursive:true});
const assets=[];
for(const lang of ['eng','chi_sim']){
 const info=JSON.parse(run(process.execPath,[npm,'pack',`@tesseract.js-data/${lang}@1.0.0`,'--ignore-scripts','--json','--pack-destination',temp]))[0];
 const archive=path.join(temp,info.filename),digest=crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64');
 if(info.integrity!=='sha512-'+digest)throw Error('OCR resource integrity mismatch');
 run('tar',['-xzf',archive,'-C',temp,`package/4.0.0_best_int/${lang}.traineddata.gz`]);
 const file=path.join(temp,'package/4.0.0_best_int',lang+'.traineddata.gz');fs.copyFileSync(file,path.join(dataDir,lang+'.traineddata.gz'));
 assets.push({name:info.name,version:info.version,integrity:info.integrity,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
}
fs.writeFileSync(path.join(plugin,'vendor/assets.json'),JSON.stringify({languages:assets,node:process.versions.node,platform:process.platform,arch:process.arch},null,2));
console.log('Prepared offline PDF dependencies, canvas, WASM and bilingual OCR data for this platform');
