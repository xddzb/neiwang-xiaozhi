const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=()=>process.env.NEIWANG_APP_ROOT;
const file=()=>path.join(process.env.NEIWANG_DATA_DIR||path.join(root(),'data'),'config/rag-policy.json');
function read(){try{const v=JSON.parse(fs.readFileSync(file(),'utf8'));return {enabled:v.enabled===true};}catch(e){return e.code==='ENOENT'?{enabled:true}:{enabled:false};}}
function write(enabled){if(typeof enabled!=='boolean')throw Error('boolean required');fs.mkdirSync(path.dirname(file()),{recursive:true});const tmp=file()+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify({version:1,enabled}),{mode:0o600});fs.renameSync(tmp,file());return read();}
module.exports={read,write};
