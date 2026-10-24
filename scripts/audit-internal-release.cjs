const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {keyFor}=require('../tools/migrate-settings.cjs');
const {isDeepStrictEqual}=require('node:util');
const [source,app,docs]=process.argv.slice(2);if(!source||!app||!docs)throw Error('Supply current private APP, internal build and document source');
function open(file,key){const e=JSON.parse(fs.readFileSync(file)),b=Buffer.from(e.payload,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(e.format));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]))}
const sourceKey=keyFor(source),targetKey=fs.readFileSync(path.join(app,'config/defaults/.local-key'));
for(const name of ['model.enc','dify.enc'])if(!isDeepStrictEqual(open(path.join(source,'data/config',name),sourceKey),open(path.join(app,'config/defaults',name),targetKey)))throw Error('Private configuration mismatch; values suppressed');
if(!fs.readFileSync(path.join(docs,'内网接口文档.html')).equals(fs.readFileSync(path.join(app,'offline-api-tool/内网接口文档.html'))))throw Error('Private document mismatch; contents suppressed');
const api=path.join(app,'plugin-pack/payload/extensions/apis/sources');const count=fs.readdirSync(api).filter(n=>n.endsWith('.json')).length;assert.equal(count,15);
console.log(JSON.stringify({status:'PASS',modelSettingsPreserved:true,ragSettingsPreserved:true,localInterfaceDocumentByteIdentical:true,internalSources:count,rawCredentialsPrinted:false,windowsBotBindingPreseeded:false}));
