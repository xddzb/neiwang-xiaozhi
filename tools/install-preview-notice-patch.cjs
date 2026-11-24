'use strict';
const fs=require('node:fs'),path=require('node:path');
const {ContextModelsPatch}=require('./install-context-models-patch.cjs');
const {safe,hash}=require('./offline-plugin-manager.cjs');
const TARGET='extensions/node_modules/@neiwang/deployment/cordis.patch.yml';
const BLOCK='- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: "2026-09-28.1"\n';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
class PreviewNoticePatch extends ContextModelsPatch{
 constructor(root,kit=__dirname,options={}){
  super(root,kit,options);this.allowed=[TARGET];this.record=safe(this.root,'config/preview-notice-patch-backup.json');
 }
 plan(){
  this.compatible();const m=read(path.join(this.kit,'patch.json'));
  if(m.kind!=='preview-notice-20261124'||m.os!==process.platform||m.arch!==process.arch||m.nodeMajor!==Number(process.versions.node.split('.')[0]))throw Error('补丁与系统/CPU/Node 不匹配');
  for(const name of ['install-preview-notice-patch.cjs','install-context-models-patch.cjs','offline-plugin-manager.cjs'])if(hash(fs.readFileSync(safe(this.kit,name)))!==m.hashes[name])throw Error('补丁文件校验失败');
  const registry=this.manager.registry();
  if(registry.plugins['@neiwang/deployment']||fs.existsSync(safe(this.root,'plugin-pack/payload/'+TARGET)))throw Error('检测到独立托管的部署插件，未覆盖，请使用匹配的完整构建');
  const pack=safe(this.root,'plugin-pack/pack.json');
  if(fs.existsSync(pack)&&read(pack).files?.some(r=>r.path===TARGET))throw Error('部署文件属于插件载荷，未修改');
  const client=safe(this.root,'core/0.2.1-rc.3/node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js');
  if(!/const WELCOME_NOTICE_VERSION = "2026-09-28\.1";/.test(fs.readFileSync(client,'utf8')))throw Error('预览说明版本不匹配，未修改官方核心');
  const target=safe(this.root,TARGET),before=fs.readFileSync(target),text=before.toString('utf8').replaceAll('\r\n','\n');
  let after=text;
  if(/^- id: ui-settings-general\s*$/m.test(text)){
   if(!text.includes(BLOCK))throw Error('已有自定义通用设置部署项，未覆盖');
  }else after=text+(text.endsWith('\n')?'':'\n')+BLOCK;
  const changes=[{path:TARGET,before:before.toString('base64'),after:Buffer.from(before.includes(Buffer.from('\r\n'))?after.replaceAll('\n','\r\n'):after).toString('base64'),mode:fs.statSync(target).mode&0o777}];
  return {version:1,status:'applying',changes,sha256:hash(JSON.stringify(changes))};
 }
}
module.exports={PreviewNoticePatch,BLOCK,TARGET};
if(require.main===module){try{console.log(JSON.stringify(new PreviewNoticePatch(process.argv[3]).run(process.argv[2])));console.log('操作完成。请重新启动内网小智；手动模型 API 入口保持可用。')}catch(e){console.error(e.message);process.exitCode=1}}
