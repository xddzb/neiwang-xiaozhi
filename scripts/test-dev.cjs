const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..');
function fixture(){
 const parent=path.join(repo,'tmp');fs.mkdirSync(parent,{recursive:true});
 const root=fs.mkdtempSync(path.join(parent,'dev-test-'));
 fs.mkdirSync(path.join(root,'launcher'));fs.copyFileSync(path.join(repo,'launcher/bootstrap.cjs'),path.join(root,'launcher/bootstrap.cjs'));
 fs.mkdirSync(path.join(root,'config'));for(const name of ['app.json','overrides.json'])fs.copyFileSync(path.join(repo,'config',name),path.join(root,'config',name));
 const app=JSON.parse(fs.readFileSync(path.join(root,'config/app.json')));app.bundles=[];fs.writeFileSync(path.join(root,'config/app.json'),JSON.stringify(app));
 fs.mkdirSync(path.join(root,'core',app.coreVersion,'node_modules'),{recursive:true});fs.mkdirSync(path.join(root,'extensions/node_modules'),{recursive:true});
 return {root,bootstrap:require(path.join(root,'launcher/bootstrap.cjs'))};
}
function withoutModelEnv(fn){
 const keys=['NEIWANG_MODEL_KEY','NEIWANG_MODEL_URL','NEIWANG_MODEL_ID','NEIWANG_APP_ROOT','NEIWANG_DATA_DIR'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const key of keys)delete process.env[key];
 try{return fn();}finally{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
}
test('first boot needs no model seed and enables model settings',()=>withoutModelEnv(()=>{
 const {root,bootstrap}=fixture(),p=bootstrap.prepare();assert.equal(p.root,root);
 const patches=JSON.parse(fs.readFileSync(p.patchFile));
 for(const id of ['ui-settings-models','llm-deepseek','llm-deepseek-account','compaction-basic'])assert.equal(patches.find(v=>v.id===id).disabled,false);
 assert.deepEqual(patches.find(v=>v.id==='llm-pi-ai').config,{});
 assert.equal(patches.find(v=>v.id==='agent-default-model').config.provider,'deepseek-official');
 assert.equal(fs.existsSync(path.join(root,'data/config/model.enc')),false);
 const user=path.join(p.profile,'cordis.patch.yml'),content='# user-owned settings\n[]\n';fs.writeFileSync(user,content);bootstrap.prepare();assert.equal(fs.readFileSync(user,'utf8'),content);
}));
test('partial environment model configuration is rejected clearly',()=>withoutModelEnv(()=>{
 const {bootstrap}=fixture();process.env.NEIWANG_MODEL_ID='test-model';assert.throws(()=>bootstrap.prepare(),/Provide all NEIWANG_MODEL/);
}));
test('complete explicit environment adds a default provider',()=>withoutModelEnv(()=>{
 const {bootstrap}=fixture();Object.assign(process.env,{NEIWANG_MODEL_ID:'test-model',NEIWANG_MODEL_URL:'https://example.invalid/v1',NEIWANG_MODEL_KEY:'synthetic-test-value'});
 const p=bootstrap.prepare(),patches=JSON.parse(fs.readFileSync(p.patchFile));assert.equal(patches.find(v=>v.id==='agent-default-model').config.model,'test-model');
 assert.equal(patches.find(v=>v.id==='llm-pi-ai').config.providers.neiwang.apiKeyEnv,'NEIWANG_MODEL_KEY');assert.equal(fs.readFileSync(p.patchFile,'utf8').includes('synthetic-test-value'),false);
}));
