import {defineTool} from '@deepseek-ai/dsh-tools';
export const name='neiwang-tool-catalog';
export const inject=['tools'];
import {catalog} from './catalog.mjs';
export {category,catalog} from './catalog.mjs';
export function apply(ctx){
 ctx.tools.register(defineTool({name:'tool_catalog',description:'按分类列出当前会话可用工具，或查看指定工具的完整参数。先 list 查询名称，再 describe 读取完整参数与返回值类型；返回 JSON 字符串，请 JSON.parse 后读取字段。只读，不执行业务操作。',parameters:{operation:{type:'string',required:true,enum:['list','describe']},category:{type:'string',enum:['browser','rag','business','files','agents','other']},query:{type:'string'},name:{type:'string'},offset:{type:'integer'}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},isConcurrencySafe:()=>true,execute:async(args,exec)=>JSON.stringify(catalog(ctx.tools.sdkSchemas(exec.agent),args))}));
}
