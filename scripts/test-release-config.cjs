const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {check}=require('./check-release-config.cjs');
test('Public rejects private settings, secrets and interface sources; Internal must match all inputs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'release-config-')),source=path.join(root,'source'),pub=path.join(root,'public'),internal=path.join(root,'internal');
 const put=(base,rel,b)=>{const p=path.join(base,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b)};
 try{
  const key=crypto.randomBytes(32);put(source,'config/defaults/.local-key',key);
  for(const [name,format] of [['model.enc','NEIWANG-MODEL-1'],['dify.enc','NEIWANG-DIFY-1']]){const n=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,n);c.setAAD(Buffer.from(format));put(source,'config/defaults/'+name,JSON.stringify({format,payload:Buffer.concat([n,c.update(JSON.stringify({base_url:'http://synthetic.invalid/v1',api_key:'synthetic-private-fixture'})),c.final(),c.getAuthTag()]).toString('base64')}))}
  put(source,'offline-api-tool/fixture.html','synthetic document');put(source,'plugin-pack/payload/extensions/apis/fixture.json','{}');
  fs.mkdirSync(pub);assert.equal(check('Public',pub,source).status,'PASS');
  put(pub,'tools/helper.py','synthetic-private-fixture');assert.throws(()=>check('Public',pub,source));fs.unlinkSync(path.join(pub,'tools/helper.py'));
  put(pub,'plugin-pack/payload/extensions/apis/fixture.json','{}');assert.throws(()=>check('Public',pub,source));fs.unlinkSync(path.join(pub,'plugin-pack/payload/extensions/apis/fixture.json'));
  fs.cpSync(source,internal,{recursive:true});assert.equal(check('Internal',internal,source).status,'PASS');
  put(internal,'offline-api-tool/fixture.html','changed');assert.throws(()=>check('Internal',internal,source));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
