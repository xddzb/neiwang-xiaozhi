// Compare public build materials against private source credentials without printing them.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {keyFor}=require('../tools/migrate-settings.cjs');
const [source,...apps]=process.argv.slice(2);if(!source||!apps.length)throw Error('Supply private source and public APP folders');
const key=keyFor(source),secrets=[key.toString('hex')];
for(const name of ['model.enc','dify.enc']){
 const e=JSON.parse(fs.readFileSync(path.join(source,'data/config',name))),b=Buffer.from(e.payload,'base64');
 const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(e.format));d.setAuthTag(b.subarray(-16));
 const value=JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]));if(value.api_key)secrets.push(value.api_key);
}
let checked=0;for(const root of apps){
 function walk(base,rel=''){for(const e of fs.readdirSync(base,{withFileTypes:true})){
  const name=rel+e.name,p=path.join(base,e.name);if(e.isSymbolicLink())continue;
  if(['core','runtime'].includes(name)||name==='launcher/electron')continue;
  if(name==='data'||name==='config/defaults'||name==='offline-api-tool')throw Error('Private path in public APP: '+name);
  if(e.isDirectory())walk(p,name+'/');else if(e.isFile()){
   const bytes=fs.readFileSync(p);for(const secret of secrets)if(bytes.includes(Buffer.from(secret)))throw Error('Private credential found in public file: '+name);
   checked++;
  }
 }}walk(root);
}
console.log(JSON.stringify({status:'PASS',apps:apps.length,checkedFiles:checked,privateModelAndRagKeysAbsent:true,sharedLegacyEncryptionKeyAbsent:true,liveDataAbsent:true}));
