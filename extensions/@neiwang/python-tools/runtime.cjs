// Resolve only the shipped runtime; Linux releases and development builds can
// carry different Python minors. Never fall back to a system installation.
const fs=require('node:fs'),path=require('node:path');
function pythonExecutable(root,platform=process.platform){
 const folder=path.join(root,'runtime/python');
 let candidates;
 if(platform==='win32')candidates=[path.join(folder,'python.exe')];
 else{
  const bin=path.join(folder,'bin');let names=[];
  try{names=fs.readdirSync(bin).filter(n=>/^python3\.\d+$/.test(n)).sort((a,b)=>Number(b.slice(8))-Number(a.slice(8)))}catch(e){if(e.code!=='ENOENT')throw e}
  candidates=['python3',...names].map(n=>path.join(bin,n));
 }
 for(const file of candidates)try{if(fs.statSync(file).isFile())return file}catch(e){if(e.code!=='ENOENT')throw e}
 throw Error('应用内置Python运行时缺失，请检查匹配的平台安装包。');
}
module.exports={pythonExecutable};
