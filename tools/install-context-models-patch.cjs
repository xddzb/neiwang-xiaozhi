'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Manager,safe,atomic,hash}=require('./offline-plugin-manager.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const ALLOWED=['launcher/bootstrap.cjs','config/overrides.json'];
class ContextModelsPatch{
 constructor(root,kit=__dirname,options={}){
  this.manager=new Manager(root,options);this.root=this.manager.root;this.kit=fs.realpathSync(kit);this.fault=options.fault||(()=>{});
  this.record=safe(this.root,'config/context-models-patch-backup.json');
 }
 load(){
  if(!fs.existsSync(this.record))return null;
  const j=read(this.record);
  if(j.version!==1||hash(JSON.stringify(j.changes))!==j.sha256||j.changes.length!==2||j.changes.some((r,i)=>r.path!==ALLOWED[i]||!Number.isInteger(r.mode)))throw Error('补丁备份损坏，未修改文件');
  return j;
 }
 save(j){atomic(this.record,JSON.stringify(j,null,2)+'\n')}
 write(row,which){const p=safe(this.root,row.path);atomic(p,Buffer.from(row[which],'base64'));fs.chmodSync(p,row.mode)}
 compatible(){const app=read(this.manager.appFile);if(app.version!=='R11.6'||app.coreVersion!=='0.2.1-rc.3')throw Error('仅支持 R11.6 / 0.2.1-rc.3，未修改文件')}
 plan(){
  this.compatible();
  const manifest=read(path.join(this.kit,'patch.json'));
  if(manifest.kind!=='context-models-20261123'||manifest.os!==process.platform||manifest.arch!==process.arch||manifest.nodeMajor!==Number(process.versions.node.split('.')[0]))throw Error('补丁与系统、CPU 或 Node 不匹配');
  for(const name of ['normalization.txt','policies.json','install-context-models-patch.cjs','offline-plugin-manager.cjs'])if(hash(fs.readFileSync(safe(this.kit,name)))!==manifest.hashes[name])throw Error('补丁文件校验失败');
  const block=fs.readFileSync(path.join(this.kit,'normalization.txt'),'utf8');
  const policies=read(path.join(this.kit,'policies.json'));
  if(policies.length!==2||policies[0].id!=='ui-settings-models'||policies[1].id!=='compaction-basic')throw Error('补丁策略不匹配');
  const changes=ALLOWED.map(rel=>{const p=safe(this.root,rel),s=fs.lstatSync(p);if(!s.isFile())throw Error('需要常规文件');const before=fs.readFileSync(p);return {path:rel,before:before.toString('base64'),after:'',mode:s.mode&0o777}});
  const source=Buffer.from(changes[0].before,'base64').toString('utf8'),lf=source.replaceAll('\r\n','\n');
  const start=" const overrides=read(path.join(root,'config/overrides.json'));\n",end=' const patches=[...overrides,';
  const a=lf.indexOf(start),b=lf.indexOf(end,a+start.length);
  if(a<0||b<0||lf.indexOf(start,a+1)>=0||lf.indexOf(end,b+1)>=0)throw Error('启动器结构不兼容，未修改文件');
  const old=lf.slice(a+start.length,b);
  if(!manifest.acceptedBlocks.includes(hash(old)))throw Error('此启动器配置段有其他修改，未覆盖');
  const after=lf.slice(0,a+start.length)+block+lf.slice(b);
  changes[0].after=Buffer.from(source.includes('\r\n')?after.replaceAll('\n','\r\n'):after).toString('base64');
  const rows=JSON.parse(Buffer.from(changes[1].before,'base64').toString('utf8').replace(/^\uFEFF/,''));
  for(const policy of policies){const indices=rows.flatMap((r,i)=>r.id===policy.id?[i]:[]);if(indices.length>1)throw Error('部署配置项重复，未修改');if(indices.length)rows[indices[0]]={...rows[indices[0]],...policy};else rows.push(policy)}
  changes[1].after=Buffer.from(JSON.stringify(rows,null,2)+'\n').toString('base64');
  return {version:1,status:'applying',changes,sha256:hash(JSON.stringify(changes))};
 }
 restore(j,status){
  for(const row of j.changes){const value=fs.readFileSync(safe(this.root,row.path)).toString('base64');if(value!==row.before&&value!==row.after)throw Error('补丁后文件已修改，停止回退以保护修改')}
  j.status='restoring';this.save(j);
  for(const row of [...j.changes].reverse()){this.write(row,'before');this.fault('restored',row.path)}
  j.status=status;this.save(j);return {status};
 }
 run(action='install'){return this.manager.withLock(()=>{
  this.manager.ensureIdle();this.compatible();const previous=this.load();
  if(action==='rollback'||action==='recover')return previous&&previous.status!=='rolled-back'?this.restore(previous,'rolled-back'):{status:'unchanged'};
  if(!['install','check'].includes(action))throw Error('未知操作');
  if(previous&&['applying','restoring'].includes(previous.status))throw Error('上次安装中断，请先双击恢复补丁');
  if(previous?.status==='installed'){
   for(const row of previous.changes)if(fs.readFileSync(safe(this.root,row.path)).toString('base64')!==row.after)throw Error('已安装文件发生变化，未覆盖');
   return {status:'unchanged'};
  }
  const j=this.plan();if(action==='check')return {status:'ready'};
  this.save(j);
  try{for(const row of j.changes){this.write(row,'after');this.fault('written',row.path)}
   for(const row of j.changes)if(fs.readFileSync(safe(this.root,row.path)).toString('base64')!==row.after)throw Error('写后校验失败');
   j.status='installed';this.save(j);return {status:'installed'};
  }catch(error){this.restore(j,'rolled-back');throw error}
 })}
}
module.exports={ContextModelsPatch};
if(require.main===module){try{const result=new ContextModelsPatch(process.argv[3]).run(process.argv[2]);console.log(JSON.stringify(result));console.log('操作完成。安装成功后请重新启动内网小智。')}catch(e){console.error(e.message);process.exitCode=1}}
