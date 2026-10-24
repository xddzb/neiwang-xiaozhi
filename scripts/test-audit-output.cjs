const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
test('private audit mismatches never dump configuration values or document contents',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nw-audit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),app=path.join(root,'internal'),docs=path.join(root,'docs'),a=crypto.randomBytes(32),b=crypto.randomBytes(32);
 const secret='synthetic-value-must-stay-hidden',document='synthetic-document-must-stay-hidden';
 function put(base,rel,data){const file=path.join(base,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data)}
 function seal(format,key,value){const n=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,n);c.setAAD(Buffer.from(format));return JSON.stringify({format,payload:Buffer.concat([n,c.update(JSON.stringify(value)),c.final(),c.getAuthTag()]).toString('base64')})}
 put(source,'tools/model_config.py',`KEY = bytes.fromhex('${a.toString('hex')}')`);put(app,'config/defaults/.local-key',b);
 for(const [name,format]of [['model.enc','NEIWANG-MODEL-1'],['dify.enc','NEIWANG-DIFY-1']]){put(source,'data/config/'+name,seal(format,a,{api_key:secret}));put(app,'config/defaults/'+name,seal(format,b,{api_key:secret}))}
 put(docs,'内网接口文档.html',document);put(app,'offline-api-tool/内网接口文档.html',document);
 function run(){const r=cp.spawnSync(process.execPath,[path.join(__dirname,'audit-internal-release.cjs'),source,app,docs],{encoding:'utf8',windowsHide:true});assert.equal(r.status,1);const out=r.stdout+r.stderr;assert.match(out,/suppressed/);assert(!out.includes(secret));assert(!out.includes(document))}
 put(app,'config/defaults/model.enc',seal('NEIWANG-MODEL-1',b,{api_key:secret,changed:true}));run();
 put(app,'config/defaults/model.enc',seal('NEIWANG-MODEL-1',b,{api_key:secret}));put(app,'offline-api-tool/内网接口文档.html',document+'-changed');run();
});
