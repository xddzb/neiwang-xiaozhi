'use strict';
// Only the compaction budget is deployment-owned. Never rewrite model providers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const POLICY={thresholdRatio:0.9,headroomTokens:16384,retainRatio:0.2,maxTokens:8192};
function normalize(text,modules){
 if(!text.includes('compaction-basic'))return text;
 const YAML=require(path.join(modules,'yaml'));
 const doc=YAML.parseDocument(text,{keepSourceTokens:true});
 if(doc.errors.length||!YAML.isSeq(doc.contents))throw Error('上下文配置不是有效 YAML 列表，未覆盖');
 let changed=false;
 for(const row of doc.contents.items){
  if(!YAML.isMap(row)||row.get('id')!=='compaction-basic')continue;
  let config=row.get('config');
  if(config===undefined){config=doc.createNode({});row.set('config',config);}
  if(!YAML.isMap(config))throw Error('压缩配置使用动态表达式，无法安全迁移，请改为普通配置');
  YAML.visit(config,{Node(_key,node){if(YAML.isAlias(node)||node.anchor)throw Error('压缩配置含共享锚点，无法安全迁移');}});
  const set=(node,key,value)=>{if(node.get(key)!==value){node.set(key,value);changed=true;}};
  set(row,'disabled',false);set(config,'auto',true);
  const fix=node=>{for(const [key,value]of Object.entries(POLICY))set(node,key,value);if(node.has('retainTokens')){node.delete('retainTokens');changed=true;}};
  fix(config);
  const models=config.get('modelPolicies');
  if(models!==undefined){if(!YAML.isSeq(models))throw Error('modelPolicies 必须是列表');for(const model of models.items){if(!YAML.isMap(model))throw Error('模型压缩策略必须是对象');fix(model);}}
 }
 return changed?doc.toString():text;
}
function apply(file,modules){
 const before=fs.readFileSync(file,'utf8'),after=normalize(before,modules);
 if(before===after)return false;
 const backup=file+'.context-policy-20261125.bak';
 if(!fs.existsSync(backup))fs.writeFileSync(backup,before,{flag:'wx',mode:0o600});
 const temp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(temp,after,{mode:0o600});fs.renameSync(temp,file);
 return true;
}
module.exports={POLICY,normalize,apply};
