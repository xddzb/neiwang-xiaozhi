const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
test('source, lock and deployment use the same supported core and PTC executor',()=>{
 const version=read('package.json').dependencies['@deepseek-ai/dsh'],lock=read('package-lock.json');
 assert.equal(version,'0.2.2-rc.5');assert.equal(read('config/app.json').coreVersion,version);
 assert.equal(lock.packages[''].dependencies['@deepseek-ai/dsh'],version);
 assert.equal(lock.packages['node_modules/@deepseek-ai/dsh'].version,version);
 assert.equal(read('config/overrides.json').find(v=>v.id==='tools').config.mode,undefined);
 for(const name of ['config/deployment.yml','extensions/@neiwang/deployment/cordis.patch.yml']){
  const text=fs.readFileSync(path.join(root,name),'utf8');
  assert.match(text,/- id: tool-executor-native\s+disabled: true/);
  assert.match(text,/- id: tool-executor-ptc\s+disabled: false/);
  assert.match(text,/welcomeNoticeVersion: "2026-09-28.1"/);
 }
 assert.ok(read('extensions/@anionex/dsh-turn-rewind/package.json').peerDependencies['@deepseek-ai/dsh-settings'].includes(version));
 for(const name of ['scripts/build-dev.cjs','scripts/build-release.py','scripts/build-r115-release.py','scripts/verify-r115-release.py']){
  const text=fs.readFileSync(path.join(root,name),'utf8');assert.ok(text.includes(version));assert.ok(!text.includes('0.2.1-rc.3'));
 }
});
