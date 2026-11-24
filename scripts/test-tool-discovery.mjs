import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactAssembly,COMPACT_SDK} from '../extensions/@neiwang/browser-automation/compact.mjs';
import {catalog} from '../extensions/@deepseek-ai/neiwang-tool-catalog/catalog.mjs';
const assembly=()=>({sections:[{name:'tools:sdk',text:'```ts\ninterface ToolArgsMap { real_tool: {required_field:string} }\n```'},{name:'approval',text:'approval required'}],tools:[{name:'run_code'}]});
test('missing or unknown scoped catalog preserves the complete real SDK',()=>{
 for(const schemas of [undefined,[],[{name:'other_tool'}]]){
  const a=assembly(),r=compactAssembly(a,schemas);assert.equal(r.assembly,a);assert.equal(r.metrics.removedChars,0);assert.equal(r.metrics.reason,'catalog_unavailable');assert.equal(r.metrics.compacted,false);
 }
});
test('visible catalog compacts only SDK and documents executable calls, schemas and string results',()=>{
 const a=assembly(),r=compactAssembly(a,[{name:'tool_catalog'}]);assert.equal(r.metrics.compacted,true);assert.equal(r.assembly.sections[1],a.sections[1]);assert.equal(r.assembly.tools,a.tools);
 for(const term of ['required/properties/enum','JSON.parse','description','try/catch','不重放整个程序'])assert.ok(COMPACT_SDK.includes(term));
 const native={sections:[{name:'policy',text:'unchanged'}],tools:[{name:'bash'}]};assert.equal(compactAssembly(native,[{name:'tool_catalog'}]).assembly,native);
});
test('catalog retains nested required parameters and return schema, scoped absence stays unavailable',()=>{
 const tool={name:'nested_tool',description:'full description',parameters:{type:'object',required:['arguments_json'],properties:{arguments_json:{type:'string'}}},output:{type:'string'}};
 assert.deepEqual(catalog([tool],{operation:'describe',name:'nested_tool'}).tool,tool);
 assert.equal(catalog([],{operation:'describe',name:'nested_tool'}).error,'unknown_or_unavailable_tool');
 const listed=catalog([tool,{name:'no_description'}],{operation:'list',query:'tool'});assert.equal(listed.tools[0].name,'nested_tool');
});
test('catalog pagination is stable and never lists its own transport as a business tool',()=>{
 const tools=Array.from({length:25},(_,i)=>({name:'file_'+String(i).padStart(2,'0'),description:'read file'}));tools.push({name:'run_code'},{name:'tool_catalog'});
 const first=catalog(tools,{operation:'list',category:'files'}),last=catalog(tools,{operation:'list',category:'files',offset:first.next});assert.equal(first.tools.length,20);assert.equal(last.tools.length,5);assert.equal(last.next,null);assert.equal(first.total,25);
});
