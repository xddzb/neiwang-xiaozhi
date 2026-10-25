import {defineTool} from '@deepseek-ai/dsh-tools';
import {installScheduler,queryKnowledge,materialState,assessMaterials} from './rag-scheduler.mjs';
import isu from './isu-instruments.cjs';
import {spawn} from 'node:child_process';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {mkdirSync,statSync,copyFileSync,constants,realpathSync} from 'node:fs';
export const inject=['tools','systemPrompt'];
export const name='neiwang-business-tools';
function run(args,exec) {
 const root=process.env.NEIWANG_APP_ROOT;
 return new Promise(resolveResult=>{
  if(!root)return resolveResult(JSON.stringify({ok:false,status:'app_root_missing'}));
  if(exec.signal.aborted)return resolveResult(JSON.stringify({ok:false,status:'cancelled'}));
  const child=spawn((process.env.NEIWANG_PYTHON||join(root,process.platform==='win32'?'runtime/python/python.exe':'runtime/python/bin/python3.11')),['-I','-B','-X','utf8',join(root,'tools/tool_entry.py'),...args],{windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  let data='',done=false;
  function killTree(){if(!child.pid)return;if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}}
  const aborted=()=>{killTree();finish(JSON.stringify({ok:false,status:'cancelled'}));};
  exec.signal.addEventListener('abort',aborted,{once:true});
  const timer=setTimeout(()=>{killTree();finish(JSON.stringify({ok:false,status:'timeout'}));},330000);
  function finish(value){if(done)return;done=true;clearTimeout(timer);exec.signal.removeEventListener('abort',aborted);resolveResult(value);}
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{data+=chunk;if(data.length>1048576){killTree();finish(JSON.stringify({ok:false,status:'tool_output_too_large'}));}});
  child.stderr.resume();child.on('error',()=>finish(JSON.stringify({ok:false,status:'tool_failed_or_cancelled'})));
  child.on('close',()=>{try{const result=JSON.parse(data);const index=args.indexOf('--workspace');if(index>=0){result.workspace=args[index+1];result.workspace_defaulted=!(exec.agent?.session?.header?.cwd || exec.agent?.session?.meta?.cwd);if(result.workspace_defaulted)result.workspace_note='未取得对话工作区，使用APP下的workspace；后续读取或创建脚本请使用此目录的绝对路径。';}finish(JSON.stringify(result));}catch{finish(JSON.stringify({ok:false,status:'tool_failed'}));}});
 });
}
function workspace(exec) {
 const cwd=exec.agent?.session?.header?.cwd || exec.agent?.session?.meta?.cwd;
 if(cwd){const selected=resolve(cwd);if(!statSync(selected).isDirectory())throw new Error('所选工作区不是目录。');return selected;}
 const root=process.env.NEIWANG_APP_ROOT;
 if(!root)throw new Error('应用根目录缺失，请通过内网小智.exe启动。');
 const fallback=resolve(root,'workspace');
 mkdirSync(fallback,{recursive:true});
 if(!statSync(fallback).isDirectory())throw new Error('默认工作区不可用。');
 return fallback;
}
const output={schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]};
export function apply(ctx) {
 ctx.systemPrompt.section({name:'neiwang:visible-language',order:3300,text:'用户可见的自然语言输出统一使用简体中文，包括最终回答、进度说明、操作解释、工具结果的说明以及结果摘要。代码、命令、文件路径、接口字段、专有名词和必要的原文引用保留其原始形式，不为满足语言规则而改写可执行内容或数据。用户明确要求翻译或生成其他语言内容时，仅所要求的内容使用目标语言，其余说明仍使用中文。直接提供结论、必要的依据和可核验的操作结果，不展示内部思考过程、思维链、自我对话或反复推演；此规则约束用户可见输出，不要求改变或公开模型内部推理。子智能体面向用户的报告同样遵循此规则。'});
 installScheduler(ctx,run);
 ctx.systemPrompt.section({name:'neiwang:isu-instruments',order:3201,text:'ISU 智慧调试平台的仪表实时值使用 business_api，source 为 isu-instruments，params_json 为 {"points":["点名"],"limit":50}。这是只读子串匹配快照，不使用 RAG 缓存；先核对 PN/GN，多个匹配不能擅自选一个。报告 AV、EU、原始 DS/TM 和查询时间；采样时间过旧或质量异常不能描述为正常实时值。凭证缺失或过期应提示用户更新本机登录配置，不打印或索要聊天中的令牌。'});
 ctx.systemPrompt.section({name:'neiwang:rag-default',order:3200,text:'知识查询遵守 neiwang-rag 状态和用户开关。同聊天优先复用资料，存在明确业务知识缺口时才补充 knowledge_query；子智能体不自动重复检索；文件编辑、闲聊和自动续轮不必检索。实时业务数据使用 business_api。关闭状态禁止知识查询，不反复播报跳过状态。'});
 ctx.systemPrompt.section({name:'neiwang:pyinstaller',order:3203,text:'使用应用内置PyInstaller。打包工作区Python脚本使用python_package；Windows生成Windows程序，麒麟ARM64生成Linux ARM64程序，不能跨平台编译。先用local_python验证源脚本；打包后运行产物验收。不自动下载未知依赖。'});
 ctx.tools.register(defineTool({name:'knowledge_materials',description:'查看当前聊天及其子智能体已检索的问题、材料摘要、来源与未解决问题；assess 记录 Agent 对材料充分性的判断，不调用 Dify。',
  parameters:{operation:{type:'string',required:true,enum:['inspect','assess']},question:{type:'string'},sufficient:{type:'boolean'},reason:{type:'string'}},output,
  async execute(args,exec){return JSON.stringify(args.operation==='assess'?assessMaterials(exec.agent,args.question,args.sufficient,args.reason):materialState(exec.agent));}}));
 ctx.tools.register(defineTool({name:'knowledge_query',description:'查询已配置的 Dify 内网知识库应用，返回答案和引用摘要，完整结果保存到当前工作区。无需提供密钥。未配置时返回提示。',
  parameters:{question:{type:'string',required:true},knowledge_gap:{type:'string',required:true,description:'已有资料缺少什么：具体的条件、定义、范围或来源。先检查 knowledge_materials。'},output:{type:'string',description:'工作区内尚不存在的 JSON 文件名，可省略'}},output,
  async execute(args,exec){const result=await queryKnowledge(args.question,exec,run,args.knowledge_gap);
   if(result.ok&&result.output){
    const root=realpathSync(workspace(exec));const dest=resolve(root,args.output||`rag-${Date.now()}.json`);
    const parent=realpathSync(resolve(dest,'..'));const rel=relative(root,parent);
    if(isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../'))throw Error('输出必须在工作区内');
    copyFileSync(result.output,dest,constants.COPYFILE_EXCL);return JSON.stringify({...result,output:dest});
   }
   return JSON.stringify(result);}}));
 ctx.tools.register(defineTool({name:'business_api',description:'访问已登记的内网业务接口。先 list，再 describe；session-check 仅检查浏览器登录态；query 查询并保存结果。不会输出 Cookie 或配置密钥。',
  parameters:{operation:{type:'string',required:true,enum:['list','describe','session-check','query']},source:{type:'string'},params_json:{type:'string',description:'业务参数 JSON 对象，默认 {}'},output:{type:'string',description:'查询输出文件，需位于当前工作区，不能覆盖已有文件'}},output,
  async execute(args,exec){
   if(args.source===isu.spec.id)return JSON.stringify(await isu.execute(args,exec,process.env.NEIWANG_APP_ROOT,workspace(exec)));
   const a=['api',args.operation];if(args.source)a.push('--source',args.source);
   if(args.operation==='query')a.push('--params',args.params_json||'{}','--workspace',workspace(exec),'--output',args.output||`api-${Date.now()}.bin`);
   return run(a,exec);
  }}));
}
