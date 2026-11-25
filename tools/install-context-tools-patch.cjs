'use strict';
const fs=require('node:fs'),path=require('node:path');
const {ToolDiscoveryPatch}=require('./install-tool-discovery-patch.cjs');
const {ContextModelsPatch}=require('./install-context-models-patch.cjs');
const {safe,hash}=require('./offline-plugin-manager.cjs');
const PROFILE='data/dsh/profiles/web/cordis.patch.yml',DEPLOY='extensions/node_modules/@neiwang/deployment/cordis.patch.yml';
const EXTRA=['launcher/bootstrap.cjs','launcher/context-policy.cjs','config/overrides.json',PROFILE,DEPLOY];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
class ContextToolsPatch extends ToolDiscoveryPatch{
 constructor(root,kit=__dirname,options={}){super(root,kit,options);this.options=options;this.allowed=new Set([...this.allowed,...EXTRA]);this.record=safe(this.root,'config/context-tools-patch-backup.json');}
 plan(){
  const manifest=read(safe(this.kit,'combined.json'));
  if(manifest.kind!=='context-tools-20261125')throw Error('组合补丁类型不匹配');
  for(const [name,digest]of Object.entries(manifest.hashes))if(hash(fs.readFileSync(safe(this.kit,name)))!==digest)throw Error('组合补丁校验失败');
  if(process.env.NEIWANG_DATA_DIR&&path.resolve(process.env.NEIWANG_DATA_DIR)!==path.join(this.root,'data'))throw Error('检测到自定义数据目录，请使用匹配该目录的补丁；未修改文件');
  for(const name of ['context-models','tool-discovery','preview-notice']){const f=safe(this.root,'config/'+name+'-patch-backup.json');if(fs.existsSync(f)&&['applying','restoring'].includes(read(f).status))throw Error('请先恢复此前中断的补丁');}
  const tool=new ToolDiscoveryPatch(this.root,path.join(this.kit,'tools-kit'),this.options);
  const context=new ContextModelsPatch(this.root,path.join(this.kit,'context-kit'),this.options);
  const changes=[...tool.plan().changes,...context.plan().changes];
  const add=(rel,after)=>{const before=this.current(rel);changes.push({path:rel,before,after:Buffer.from(after).toString('base64'),mode:before===null?0o600:fs.statSync(safe(this.root,rel)).mode&0o777});};
  const boot=changes.find(r=>r.path==='launcher/bootstrap.cjs');
  this.current(boot.path);this.current('config/overrides.json');
  let text=Buffer.from(boot.after,'base64').toString('utf8').replaceAll('\r\n','\n');
  const hook=fs.readFileSync(safe(this.kit,'boot-hook.txt'),'utf8');
  if(!text.includes(hook)){
   const anchor=' // Profile user changes must win over deployment defaults, especially DingTalk account policies.\n';
   if(text.split(anchor).length!==2)throw Error('启动器用户配置段不兼容');
   text=text.replace(anchor,hook);
  }
  boot.after=Buffer.from(text).toString('base64');
  add('launcher/context-policy.cjs',fs.readFileSync(safe(this.kit,'context-policy.cjs')));
  // The old context-only patch did not repair a deployment bundle lacking config.
  const pack=read(safe(this.root,'plugin-pack/pack.json'));
  if(pack.files.some(r=>r.path===DEPLOY)||this.manager.registry().plugins['@neiwang/deployment']||fs.existsSync(safe(this.root,'plugin-pack/payload/'+DEPLOY)))throw Error('部署插件为独立托管版本，未覆盖');
  const deploy=Buffer.from(this.current(DEPLOY),'base64').toString('utf8').replaceAll('\r\n','\n');
  const re=/^- id: compaction-basic\n(?:(?!^- id:)[\s\S])*/m;
  const block=fs.readFileSync(safe(this.kit,'deployment-block.yml'),'utf8');
  if((deploy.match(/^- id: compaction-basic$/gm)||[]).length>1)throw Error('重复的部署压缩配置');
  const existing=deploy.match(re)?.[0].trim();
  const accepted=[block.trim(),block.split('\n').filter(line=>!line.startsWith('  config:')).join('\n').trim(),'- id: compaction-basic\n  disabled: false','- id: compaction-basic\n  disabled: true'];
  if(existing&&!accepted.includes(existing))throw Error('部署压缩项包含其他定制，未覆盖');
  add(DEPLOY,re.test(deploy)?deploy.replace(re,block):deploy+(deploy.endsWith('\n')?'':'\n')+block);
  const profile=this.current(PROFILE);
  if(profile!==null){const {normalize}=require(safe(this.kit,'context-policy.cjs'));add(PROFILE,normalize(Buffer.from(profile,'base64').toString('utf8'),path.join(this.root,'core/0.2.1-rc.3/node_modules')));}
  if(new Set(changes.map(r=>r.path)).size!==changes.length)throw Error('补丁重复写入目标');
  return {version:1,status:'applying',changes,sha256:hash(JSON.stringify(changes))};
 }
}
module.exports={ContextToolsPatch};
if(require.main===module)try{console.log(JSON.stringify(new ContextToolsPatch(process.argv[3]).run(process.argv[2])));console.log('完成。重启后检查 data/runtime/context-policy.json；128000/8192 时常规压缩点约 80.8%。');}catch(e){console.error(e.message);process.exitCode=1;}
