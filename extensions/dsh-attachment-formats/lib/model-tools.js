// Small DSH 0.2 adapter over the upstream attachment conversion engine.
import {defineTool} from '@deepseek-ai/dsh-tools';
import {realpath,stat,readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,basename} from 'node:path';
import {convertFile} from './index.js';
export async function parseWorkspacePdf(ctx,args,exec){
 const session=exec.agent?.session,cwd=session?.header?.cwd||session?.meta?.cwd;
 if(!cwd)throw Error('请先选择会话工作区');
 const root=await realpath(cwd),file=await realpath(resolve(root,args.path)),rel=relative(root,file);
 if(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\'))throw Error('PDF 必须位于当前工作区');
 const info=await stat(file);if(!info.isFile()||info.size>64*1024*1024)throw Error('PDF 文件无效或超过 64 MiB');
 if(exec.signal?.aborted)throw Error('cancelled');
 const bytes=await readFile(file);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('输入不是 PDF');
 const result=await convertFile(ctx,{name:basename(file),kind:'pdf',bytes},root,16000);
 if(result.kind==='images')return {ok:false,status:'ocr_incomplete',message:'无法可靠提取文字，请核对扫描质量或原始页面；未向外部服务上传。',warnings:result.warnings};
 return result;
}
export function registerPdfTool(ctx){
 ctx.tools.register(defineTool({name:'pdf_parse',description:'在本机解析当前工作区 PDF：优先文字层，扫描件使用随包中英文 OCR；长文档保存索引。全程不联网。',parameters:{path:{type:'string',required:true}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async(args,exec)=>JSON.stringify(await parseWorkspacePdf(ctx,args,exec))}));
}
