'use strict';
// Read-only release gate. Never print organization values, document names or keys.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function settings(root){const base=fs.existsSync(path.join(root,'data/config/model.enc'))?'data/config':'config/defaults';const dir=path.join(root,base),key=fs.readFileSync(path.join(dir,'.local-key'));return Object.fromEntries(['model.enc','dify.enc'].map(name=>{const e=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')),b=Buffer.from(e.payload,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(e.format));d.setAuthTag(b.subarray(-16));return [name,JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString())]}))}
function tree(root){const out=new Map();function walk(dir,rel=''){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())continue;const r=rel?rel+'/'+e.name:e.name,p=path.join(dir,e.name);if(e.isDirectory())walk(p,r);else if(e.isFile())out.set(r,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'))}}walk(root);return out}
function apiRoot(root){return path.join(root,fs.existsSync(path.join(root,'extensions/apis'))?'extensions/apis':'plugin-pack/payload/extensions/apis')}
function check(edition,app,source){
 const expected=settings(source);
 if(edition==='Internal'){
  assert.deepEqual(settings(app),expected);
  for(const [from,to] of [[path.join(source,'offline-api-tool'),path.join(app,'offline-api-tool')],[apiRoot(source),apiRoot(app)]]){const a=tree(from),b=tree(to);assert(a.size>0);assert.deepEqual(b,a)}
 }else{
  assert.equal(edition,'Public');
  for(const rel of ['config/defaults','data','offline-api-tool','extensions/apis','plugin-pack/payload/extensions/apis'])assert.equal(tree(path.join(app,rel)).size,0);
  // Check exact sensitive configuration values, including non-IP internal hostnames.
  const needles=[];function collect(v,k=''){if(typeof v==='string'&&v.length>=8&&(/key|secret|token|url|endpoint|host/i.test(k))&&!/^https:\/\/api\.deepseek\.com(?:\/|$)/.test(v))needles.push(Buffer.from(v));else if(v&&typeof v==='object')for(const [n,x] of Object.entries(v))collect(x,n)}collect(expected);
  function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink()||['core','runtime','node_modules','electron','.git'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else if(e.isFile()&&/\.(?:py|[cm]?js|json|ya?ml|txt|md|html|enc)$/.test(e.name)){const b=fs.readFileSync(p);assert(!needles.some(n=>b.includes(n)))}}}scan(app);
 }
 return {status:'PASS',edition,configurationValuesPrinted:false,organizationConfigMatches:edition==='Internal',interfaceDocumentsMatch:edition==='Internal',publicPrivateDataAbsent:edition==='Public'};
}
module.exports={check,settings,tree};
if(require.main===module){try{const [edition,app,source]=process.argv.slice(2);assert(app&&source);console.log(JSON.stringify(check(edition,path.resolve(app),path.resolve(source))))}catch{console.error('发布配置隔离检查失败；未输出配置、密钥或文档内容。');process.exitCode=1}}
