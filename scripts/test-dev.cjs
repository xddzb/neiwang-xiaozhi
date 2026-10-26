const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..');
test('sidebar file opens in the left pane, explicit targets and unloading are preserved',()=>{
 const vm=require('node:vm'),cleanups=[],opened=[];let plugin;
 vm.runInNewContext(fs.readFileSync(path.join(repo,'extensions/@neiwang/brand/client.js'),'utf8'),{
  window:{__ModuleLoader__:{load:definition=>{plugin=definition.factory(()=>({createElement:()=>null}))}}}
 });
 const layout={rootId:'split',activePaneId:'right',nodes:{split:{kind:'split',axis:'row',children:['left','right']},left:{id:'left',kind:'pane',host:'dock',tabs:[]},right:{id:'right',kind:'pane',host:'dock',tabs:['files']}},tabs:{files:{id:'files',kind:'files'}}};
 const moves=[],sidebar={openResource:function(address,options){opened.push({address,options});return 'opened'},
  require:()=>({sessionId:'fixture',actions:{dropTab:(...args)=>moves.push(args)}}),
  adopted:new Map([['fixture',{store:{getSnapshot:()=>({bySession:{fixture:{layout}}})}}]])};
 const original=sidebar.openResource;
 plugin.apply({locale:{translate:()=>''},slots:{inject:()=>{}},effect:fn=>{const cleanup=fn();if(typeof cleanup==='function')cleanups.push(cleanup)},inject:(_names,fn)=>fn({get:()=>sidebar})});
 assert.equal(sidebar.openResource('file:fixture'), 'opened');assert.equal(opened.at(-1).options.paneId,'left');
 sidebar.openResource('file:explicit',{paneId:'right'});assert.equal(opened.at(-1).options.paneId,'right');
 layout.tabs.existing={id:'existing',contentId:'file:existing'};layout.nodes.right.tabs.push('existing');
 sidebar.openResource('file:existing');assert.equal(moves[0][2],'left');assert.equal(opened.length,2);
 for(const cleanup of cleanups.reverse())cleanup();assert.equal(sidebar.openResource,original);
});
function fixture(){
 const parent=path.join(repo,'tmp');fs.mkdirSync(parent,{recursive:true});
 const root=fs.mkdtempSync(path.join(parent,'dev-test-'));
 fs.mkdirSync(path.join(root,'launcher'));fs.copyFileSync(path.join(repo,'launcher/bootstrap.cjs'),path.join(root,'launcher/bootstrap.cjs'));
 fs.copyFileSync(path.join(repo,'launcher/plugin-profile.cjs'),path.join(root,'launcher/plugin-profile.cjs'));
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
 const user=path.join(p.profile,'cordis.patch.yml'),content='# user-owned settings\n- id: ui-settings-general\n  config: {"welcomeNoticeVersion":"keep-me"}\n';fs.writeFileSync(user,content);
 bootstrap.prepare();const userText=fs.readFileSync(user,'utf8');
 assert.equal(userText.startsWith(content),true);
 assert.match(userText,/- id: llm-pi-ai/);
 assert.match(userText,/- id: agent-default-model/);
 bootstrap.prepare();assert.equal(fs.readFileSync(user,'utf8'),userText);
}));
test('partial environment model configuration is rejected clearly',()=>withoutModelEnv(()=>{
 const {bootstrap}=fixture();process.env.NEIWANG_MODEL_ID='test-model';assert.throws(()=>bootstrap.prepare(),/Provide all NEIWANG_MODEL/);
}));

test('model settings retain explicit user providers and commented empty patches stay valid',()=>withoutModelEnv(()=>{
 const {bootstrap}=fixture(),p=bootstrap.prepare(),file=path.join(p.profile,'cordis.patch.yml');
 const content='# user-owned settings\n- id: llm-pi-ai\n  config: {"providers":{"custom":{}}}\n- id: agent-default-model\n  config: {"provider":"custom","model":"chosen"}\n';
 fs.writeFileSync(file,content);bootstrap.prepare();assert.equal(fs.readFileSync(file,'utf8'),content);
 fs.writeFileSync(file,'# user-owned comment\n[]\n');bootstrap.prepare();const updated=fs.readFileSync(file,'utf8');
 assert(updated.includes('# user-owned comment'));assert(!/^\s*\[\]\s*$/m.test(updated));
 assert.equal((updated.match(/- id: llm-pi-ai/g)||[]).length,1);
 assert.equal((updated.match(/- id: agent-default-model/g)||[]).length,1);
 bootstrap.prepare();assert.equal(fs.readFileSync(file,'utf8'),updated);
}));
test('complete explicit environment adds a default provider',()=>withoutModelEnv(()=>{
 const {bootstrap}=fixture();Object.assign(process.env,{NEIWANG_MODEL_ID:'test-model',NEIWANG_MODEL_URL:'https://example.invalid/v1',NEIWANG_MODEL_KEY:'synthetic-test-value'});
 const p=bootstrap.prepare(),patches=JSON.parse(fs.readFileSync(p.patchFile));assert.equal(patches.find(v=>v.id==='agent-default-model').config.model,'test-model');
 assert.equal(patches.find(v=>v.id==='llm-pi-ai').config.providers.neiwang.apiKeyEnv,'NEIWANG_MODEL_KEY');assert.equal(fs.readFileSync(p.patchFile,'utf8').includes('synthetic-test-value'),false);
}));

test('Internal first boot loads seeds and missing RAG uses existing key without replacing model',()=>withoutModelEnv(()=>{
 const {root,bootstrap}=fixture(),crypto=require('node:crypto'),seed=path.join(root,'config/defaults');fs.mkdirSync(seed);
 const key=crypto.randomBytes(32);fs.writeFileSync(path.join(seed,'.local-key'),key);
 function encode(value,format){const nonce=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,nonce);c.setAAD(Buffer.from(format));return JSON.stringify({format,payload:Buffer.concat([nonce,c.update(JSON.stringify(value)),c.final(),c.getAuthTag()]).toString('base64')})}
 fs.writeFileSync(path.join(seed,'model.enc'),encode({version:1,base_url:'http://synthetic.invalid/v1',api_key:'synthetic-private-fixture',models:['fixture'],default_model:'fixture'},'NEIWANG-MODEL-1'));
 fs.writeFileSync(path.join(seed,'dify.enc'),encode({base_url:'http://rag.synthetic.invalid/v1',api_key:'synthetic-rag-fixture'},'NEIWANG-DIFY-1'));
 let p=bootstrap.prepare();assert.equal(p.env.NEIWANG_MODEL_KEY,'synthetic-private-fixture');assert(!fs.readFileSync(p.patchFile,'utf8').includes('synthetic-private-fixture'));
 const dir=path.join(root,'data/config'),model=fs.readFileSync(path.join(dir,'model.enc')),rag=fs.readFileSync(path.join(dir,'dify.enc'));
 const {convert}=require('../tools/migrate-settings.cjs'),userKey=crypto.randomBytes(32);fs.writeFileSync(path.join(dir,'.local-key'),userKey);fs.writeFileSync(path.join(dir,'model.enc'),convert(model,key,userKey));fs.unlinkSync(path.join(dir,'dify.enc'));
 const original=fs.readFileSync(path.join(dir,'model.enc'));p=bootstrap.prepare();assert.deepEqual(fs.readFileSync(path.join(dir,'model.enc')),original);assert.deepEqual(fs.readFileSync(path.join(dir,'.local-key')),userKey);
 const restored=JSON.parse(convert(fs.readFileSync(path.join(dir,'dify.enc')),userKey,key)),b=Buffer.from(restored.payload,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(restored.format));d.setAuthTag(b.subarray(-16));assert.deepEqual(JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()])),{base_url:'http://rag.synthetic.invalid/v1',api_key:'synthetic-rag-fixture'});
 assert.equal(p.env.NEIWANG_MODEL_KEY,'synthetic-private-fixture');
}));
