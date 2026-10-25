const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..');
function fixture(){
 const base=path.join(repo,'tmp');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'feature-boot-'));
 for(const d of ['launcher','config','extensions/node_modules','core/0.2.1-rc.3/node_modules','plugin-pack/payload/extensions/node_modules/fixture'])fs.mkdirSync(path.join(root,d),{recursive:true});
 for(const n of ['bootstrap.cjs','plugin-profile.cjs'])fs.copyFileSync(path.join(repo,'launcher',n),path.join(root,'launcher',n));
 fs.copyFileSync(path.join(repo,'config/overrides.json'),path.join(root,'config/overrides.json'));
 const app={version:'fixture',platform:process.platform,coreVersion:'0.2.1-rc.3',edition:'core',bundles:[]};fs.writeFileSync(path.join(root,'config/app.json'),JSON.stringify(app));
 const bytes=Buffer.from('{"name":"fixture","version":"1.0.0"}'),rel='extensions/node_modules/fixture/package.json';fs.writeFileSync(path.join(root,'plugin-pack/payload',rel),bytes);
 fs.writeFileSync(path.join(root,'plugin-pack/pack.json'),JSON.stringify({release:'fixture',platform:process.platform,os:process.platform,arch:process.arch,bundles:['fixture'],links:[],files:[{path:rel,mode:420,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}]}));
 fs.copyFileSync(path.join(repo,'scripts/install-feature-pack.cjs'),path.join(root,'plugin-pack/install.cjs'));
 return root;
}
function prepare(root){const keys=['NEIWANG_APP_ROOT','NEIWANG_DATA_DIR','NEIWANG_MODEL_ID','NEIWANG_MODEL_KEY','NEIWANG_MODEL_URL'],saved=keys.map(k=>process.env[k]);for(const k of keys)delete process.env[k];process.env.NEIWANG_APP_ROOT=root;
 try{return require(path.join(root,'launcher/bootstrap.cjs')).prepare()}finally{keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i]})}
}
test('two archives first boot enables offline features and preserves user files across restart',()=>{
 const root=fixture(),protectedFiles=['data/config/dify.enc','data/config/rag-policy.json','data/dingtalk-official/owner.json','workspace/existing.txt'];
 for(const rel of protectedFiles){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),'synthetic existing user data')}
 const p=prepare(root);assert.equal(p.deployment.edition,'full');assert(p.deployment.bundles.includes('fixture'));
 for(const rel of protectedFiles)assert.equal(fs.readFileSync(path.join(root,rel),'utf8'),'synthetic existing user data');
 const marker=fs.readFileSync(path.join(root,'config/feature-pack.json'));prepare(root);assert.deepEqual(fs.readFileSync(path.join(root,'config/feature-pack.json')),marker);
 assert(JSON.parse(fs.readFileSync(path.join(p.profile,'package.json'))).dsh.profile.bundles.includes('fixture'));
});
test('missing offline pack blocks startup with an actionable message',()=>{const root=fixture();fs.unlinkSync(path.join(root,'plugin-pack/install.cjs'));assert.throws(()=>prepare(root),/同版本 Core 与 Plugins/);assert(!fs.existsSync(path.join(root,'data')))});
test('corrupt local pack cannot enable a partial APP or replace configuration',()=>{const root=fixture(),config=fs.readFileSync(path.join(root,'config/app.json'));fs.appendFileSync(path.join(root,'plugin-pack/payload/extensions/node_modules/fixture/package.json'),'corrupt');assert.throws(()=>prepare(root),/checksum failed/);assert.deepEqual(fs.readFileSync(path.join(root,'config/app.json')),config);assert(!fs.existsSync(path.join(root,'extensions/node_modules/fixture')))});
test('explicit recovery resumes an abandoned first install without replacing a copied file',()=>{
 const root=fixture(),file='extensions/node_modules/fixture/package.json',dst=path.join(root,file);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,'plugin-pack/payload',file),dst);const original=fs.readFileSync(dst);
 fs.writeFileSync(path.join(root,'config/.plugin-install.lock'),'');assert.throws(()=>prepare(root),/首次插件安装/);
 require(path.join(root,'plugin-pack/install.cjs')).recover();assert.deepEqual(fs.readFileSync(dst),original);assert.equal(prepare(root).deployment.edition,'full');
});
test('recovery refuses a live installer and retains its lock and registration',()=>{
 const root=fixture(),lock=path.join(root,'config/.plugin-install.lock'),value=JSON.stringify({pid:process.pid});fs.writeFileSync(lock,value);
 assert.throws(()=>require(path.join(root,'plugin-pack/install.cjs')).recover(),/进程仍在运行/);assert.equal(fs.readFileSync(lock,'utf8'),value);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'config/app.json'))).edition,'core');
});
test('recovery refuses a damaged owner record without discarding evidence',()=>{
 const root=fixture(),lock=path.join(root,'config/.plugin-install.lock');fs.writeFileSync(lock,'{invalid');
 assert.throws(()=>require(path.join(root,'plugin-pack/install.cjs')).recover(),/安装锁损坏/);assert.equal(fs.readFileSync(lock,'utf8'),'{invalid');
});
