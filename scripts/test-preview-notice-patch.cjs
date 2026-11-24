const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {PreviewNoticePatch,BLOCK,TARGET}=require('../tools/install-preview-notice-patch.cjs');
const repo=path.resolve(__dirname,'..');
function fixture(){
 fs.mkdirSync(path.join(repo,'tmp'),{recursive:true});const base=fs.mkdtempSync(path.join(repo,'tmp/preview-patch-')),kit=path.join(base,'kit'),root=path.join(base,'app');fs.mkdirSync(kit);
 const put=(rel,data)=>{const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data)};
 let r=cp.spawnSync('python',[path.join(repo,'scripts/package-preview-notice-patch.py'),'--output',path.join(base,'kit.tar.gz')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 r=cp.spawnSync('tar',['-xzf',path.join(base,'kit.tar.gz'),'-C',kit,'--strip-components=1']);assert.equal(r.status,0);
 const m=JSON.parse(fs.readFileSync(path.join(kit,'patch.json')));m.os=process.platform;m.arch=process.arch;fs.writeFileSync(path.join(kit,'patch.json'),JSON.stringify(m));
 put('config/app.json',JSON.stringify({version:'R11.6',coreVersion:'0.2.1-rc.3'}));
 put(TARGET,'# keep deployment comment\n- id: ui-settings-models\n  disabled: false\n');
 put('core/0.2.1-rc.3/node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js','const WELCOME_NOTICE_VERSION = "2026-09-28.1";');
 put('data/config/model.enc','synthetic-encrypted');put('data/dsh/profiles/web/cordis.patch.yml','# custom providers\n[]\n');
 const original=fs.readFileSync(path.join(root,TARGET));
 return {root,kit,put,original,patch:opts=>new PreviewNoticePatch(root,kit,{stopped:()=>{},...opts})};
}
test('preview patch suppresses default notice, preserves settings, repeats and rolls back',()=>{
 const f=fixture(),p=f.patch();assert.equal(p.run('check').status,'ready');assert.deepEqual(fs.readFileSync(path.join(f.root,TARGET)),f.original);
 assert.equal(p.run().status,'installed');assert(fs.readFileSync(path.join(f.root,TARGET),'utf8').endsWith(BLOCK));assert.equal(p.run().status,'unchanged');
 assert.equal(fs.readFileSync(path.join(f.root,'data/config/model.enc'),'utf8'),'synthetic-encrypted');assert.equal(fs.readFileSync(path.join(f.root,'data/dsh/profiles/web/cordis.patch.yml'),'utf8'),'# custom providers\n[]\n');
 p.run('rollback');assert.deepEqual(fs.readFileSync(path.join(f.root,TARGET)),f.original);
});
test('interrupted writes restore original and later edits prevent rollback',()=>{
 const f=fixture();assert.throws(()=>f.patch({fault:step=>{if(step==='written')throw Error('failure')}}).run(),/failure/);assert.deepEqual(fs.readFileSync(path.join(f.root,TARGET)),f.original);
 f.patch().run();fs.appendFileSync(path.join(f.root,TARGET),'# user edit\n');assert.throws(()=>f.patch().run('rollback'),/已修改/);
});
test('unknown notice version, running app and tampered kit are refused',()=>{
 const a=fixture();a.put('core/0.2.1-rc.3/node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js','unknown');assert.throws(()=>a.patch().run(),/版本不匹配/);
 const b=fixture();assert.throws(()=>b.patch({stopped:()=>{throw Error('running')}}).run(),/running/);
 const c=fixture();fs.appendFileSync(path.join(c.kit,'install-preview-notice-patch.cjs'),'bad');assert.throws(()=>c.patch().run(),/校验失败/);
});
test('source builds carry the same default without disabling Models',()=>{
 for(const file of ['config/deployment.yml','extensions/@neiwang/deployment/cordis.patch.yml'])assert(fs.readFileSync(path.join(repo,file),'utf8').replaceAll('\r\n','\n').includes(BLOCK));
 const rows=JSON.parse(fs.readFileSync(path.join(repo,'config/overrides.json')));assert.equal(rows.find(r=>r.id==='ui-settings-models').disabled,false);
});
