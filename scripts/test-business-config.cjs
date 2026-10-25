const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load}=require('../extensions/@deepseek-ai/neiwang-business/isu-instruments.cjs');
function fixture(t){
 const base=path.join(__dirname,'../tmp');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'isu-config-'));
 const old=process.env.NEIWANG_DATA_DIR;process.env.NEIWANG_DATA_DIR=path.join(root,'selected-data');t.after(()=>{if(old===undefined)delete process.env.NEIWANG_DATA_DIR;else process.env.NEIWANG_DATA_DIR=old});
 const file=path.join(process.env.NEIWANG_DATA_DIR,'config/isu-instruments.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 const credentials={token:'synthetic-token',baseCookie:'OPGview8088=synthetic',sidCookie:'synthetic'};fs.writeFileSync(file,JSON.stringify(credentials));
 const connection=path.join(root,'extensions/apis/connections/weekly-isu.json');fs.mkdirSync(path.dirname(connection),{recursive:true});
 return {root,file,connection,credentials};
}
test('legacy credentials reuse the private endpoint and retain their original bytes',t=>{const f=fixture(t),before=fs.readFileSync(f.file);fs.writeFileSync(f.connection,JSON.stringify({base_url:'https://synthetic.example.invalid'}));assert.equal(load(f.root).base_url,'https://synthetic.example.invalid');assert.deepEqual(fs.readFileSync(f.file),before);assert(!fs.existsSync(path.join(f.root,'data')))});
test('an explicit local endpoint wins over deployment defaults',t=>{const f=fixture(t);fs.writeFileSync(f.file,JSON.stringify({...f.credentials,base_url:'https://override.example.invalid'}));fs.writeFileSync(f.connection,JSON.stringify({base_url:'https://synthetic.example.invalid'}));assert.equal(load(f.root).base_url,'https://override.example.invalid')});
test('empty Public definitions and unsafe endpoints cannot send credentials',t=>{const f=fixture(t);assert.throws(()=>load(f.root),/isu_endpoint_missing/);for(const base_url of ['http://synthetic.example.invalid','https://user:password@synthetic.example.invalid','https://synthetic.example.invalid/?query=1']){fs.writeFileSync(f.connection,JSON.stringify({base_url}));assert.throws(()=>load(f.root),/isu_endpoint_invalid/)} });
