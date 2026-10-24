'use strict';
// Run only against the disposable R11.3 ARM64 validation APP, never a user APP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {Manager,hash}=require('../tools/offline-plugin-manager.cjs'),{build}=require('./build-offline-plugin.cjs');
const root=fs.realpathSync(process.argv[2]),fixtures=process.argv[3],output=fs.realpathSync(process.argv[4]);
if(!root.endsWith('/r113-test-app')||process.arch!=='arm64')throw Error('Disposable ARM64 validation APP required');
const protectedFiles=['data/config/model.enc','data/config/dify.enc','data/dingtalk-official/binding-fixture.json','workspace/upgrade-preserve-fixture.txt'];
const before=Object.fromEntries(protectedFiles.map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]));
const manager=new Manager(root),name='@neiwang/skill-incubator',target=path.join(root,'extensions/node_modules',name),source=path.join(output,'skill-source');
fs.cpSync(target,source,{recursive:true});const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json')));assert.equal(pkg.version,'1.0.0');pkg.version='1.0.1';fs.writeFileSync(path.join(source,'package.json'),JSON.stringify(pkg,null,2));
const bundle=path.join(output,'skill-offline-package');build({source,output:bundle,coreVersions:['0.2.0-rc.2'],os:'linux',arch:'arm64'});
function verifyUser(){for(const p of protectedFiles)assert.equal(hash(fs.readFileSync(path.join(root,p))),before[p],p)}
function bootstrap(){const r=spawnSync(process.execPath,[path.join(root,'launcher/bootstrap.cjs')],{encoding:'utf8',env:{...process.env,NEIWANG_APP_ROOT:root,NEIWANG_DATA_DIR:path.join(root,'data')}});assert.equal(r.status,0,r.stderr)}
function features(label){const r=spawnSync(process.execPath,[path.join(__dirname,'test-plugin-manager-probe.mjs'),root,fixtures,path.join(output,label)],{encoding:'utf8',timeout:300000});assert.equal(r.status,0,r.stderr);return r.stdout}
manager.check(bundle,{adoptExisting:true});const install=manager.install(bundle,{adoptExisting:true});assert.equal(JSON.parse(fs.readFileSync(path.join(target,'package.json'))).version,'1.0.1');bootstrap();features('upgraded');verifyUser();
manager.rollback();assert.equal(JSON.parse(fs.readFileSync(path.join(target,'package.json'))).version,'1.0.0');bootstrap();features('rolled-back');verifyUser();
const report={status:'PASS',platform:process.platform,arch:process.arch,networkIsolation:'unshare -n',realR113Retrofit:true,actualSkillUpgradeAndRollback:true,pdfTextPassedAfterBoth:true,ocrRun:false,modelRagBindingAndWorkspacePreserved:true,protectedFileCount:protectedFiles.length,transaction:install.transaction,nativeKylinTested:false};fs.writeFileSync(path.join(output,'integration-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
