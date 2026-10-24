import {defineTool} from '@deepseek-ai/dsh-tools';
import * as fs from 'node:fs/promises';
import {resolve,join,relative,sep,dirname,isAbsolute} from 'node:path';
import {skillNewTool} from './lib/tools/skill-new.mjs';
import {skillValidateTool} from './lib/tools/skill-validate.mjs';
import {skillPackageTool} from './lib/tools/skill-package.mjs';
import {skillImproveDescriptionTool} from './lib/tools/skill-improve-description.mjs';
import {OutputDirSkillSource} from './lib/lib/provider.mjs';
export const inject=['tools','skills','systemPrompt'];
export const name='neiwang-skill-incubator';
export function skillRoot(){return resolve(process.env.DSH_HOME||join(process.env.NEIWANG_APP_ROOT,'data/dsh'),'skills');}
export async function safePath(value,root=skillRoot()){
 const path=resolve(value),rel=relative(root,path);
 if(isAbsolute(rel)||rel.startsWith('..'+sep)||rel==='..')throw Error('技能路径必须位于本机技能库');
 // Windows different volumes produce an absolute relative() result.
 if(resolve(root,rel)!==path)throw Error('技能路径必须位于本机技能库');
 let cursor=root;
 for(const part of ['',...rel.split(sep).filter(Boolean)]){
  if(part)cursor=join(cursor,part);
  try{if((await fs.lstat(cursor)).isSymbolicLink())throw Error('技能库不接受符号链接');}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return path;
}
export function scopedFs(root=skillRoot()){
 return {
  async stat(p){p=await safePath(p,root);try{const s=await fs.lstat(p);return {type:s.isFile()?'file':s.isDirectory()?'dir':'other',size:s.size};}catch(e){if(e.code==='ENOENT')return undefined;throw e;}},
  async readText(p){p=await safePath(p,root);if((await fs.stat(p)).size>2097152)throw Error('技能文件过大');return fs.readFile(p,'utf8');},
  async writeText(p,text){p=await safePath(p,root);if(Buffer.byteLength(text)>2097152)throw Error('技能文件过大');await fs.mkdir(dirname(p),{recursive:true});await fs.writeFile(p,text,{mode:0o600});},
  async writeBin(p,data){p=await safePath(p,root);if(data.length>16777216)throw Error('技能包过大');await fs.mkdir(dirname(p),{recursive:true});await fs.writeFile(p,data,{flag:'wx',mode:0o600});},
  async listDir(p){p=await safePath(p,root);const names=await fs.readdir(p);if(names.length>500)throw Error('技能目录条目过多');return names;},
  async mkdirp(p){await fs.mkdir(await safePath(p,root),{recursive:true});},
  async remove(){throw Error('孵化器不自动删除技能');}
 };
}
const specs=[skillNewTool,skillValidateTool,skillPackageTool,skillImproveDescriptionTool];
export async function invoke(specName,args={},signal){
 if(signal?.aborted)throw Error('cancelled');
 const root=skillRoot();await fs.mkdir(root,{recursive:true});
 for(const key of ['path','outDir','outputDir'])if(args[key])await safePath(args[key],root);
 if(args.goal?.length>32000||args.usage?.length>16000)throw Error('技能描述过长');
 const spec=specs.find(s=>s.name===specName);if(!spec)throw Error('unknown skill operation');
 if(specName==='skill_new'&&args.confirm){
  const {buildSkillDraft}=await import('./lib/lib/draft.mjs');const draft=buildSkillDraft(args.goal,args);
  try{await fs.access(join(root,draft.name,'SKILL.md'));throw Error('同名技能已存在，请先读取并选择新名称');}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const context={get(key){if(key==='skill-creator/config')return {outputDir:root,customSkillDirs:[root]};if(key==='neiwang-scoped-fs')return scopedFs(root);return undefined;}};
 return spec.run(context,args,signal);
}
export function apply(ctx){
 const root=skillRoot(),local=scopedFs(root);let invalidate=()=>{};
 ctx.skills.registerProvider(control=>{
  invalidate=control.invalidate;
  const source=new OutputDirSkillSource(local,[root]);
  function candidate(row){return {...row,provider:'neiwang-incubator',invocation:{modelInvocable:true,userInvocable:true},locator:row.name,resourceBase:{kind:'directory',path:row.dir}};}
  return {name:'neiwang-incubator',async list(){return (await source.list()).map(candidate);},async get(c){const row=await source.get(c.locator);return row?{...row,provider:'neiwang-incubator',invocation:{modelInvocable:true,userInvocable:true}}:undefined;}};
 });
 ctx.systemPrompt.section({name:'neiwang:incubator',order:3206,text:'技能孵化器：先用 skill_new 预览流程，用户明确要求保存后 confirm=true。生成技能是草稿，必须用业务样例验证；不自动运行脚本或扩大权限。skill_validate 校验格式，skill_package 打包，skill_improve_description 默认预览，commit=true 才保存。所有路径限制于本机 DSH_HOME/skills。PTC 模式请经 run_code 调用这些工具。'});
 for(const spec of specs)ctx.tools.register(defineTool({name:spec.name,description:spec.description,parameters:spec.parameters,output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(args,exec){const result=await invoke(spec.name,args,exec.signal);invalidate();return JSON.stringify(result);}}));
}
