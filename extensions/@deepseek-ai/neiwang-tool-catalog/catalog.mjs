export function category(name){
 if(name.startsWith('mcp__browser__'))return 'browser';
 if(name.startsWith('knowledge_'))return 'rag';
 if(name==='business_api'||name==='dingtalk_aitable')return 'business';
 if(/python|file|read|write|edit|bash|shell|search|directory/.test(name))return 'files';
 if(/subagent|workflow|goal|task/.test(name))return 'agents';
 return 'other';
}
export function catalog(schemas,args){
 const rows=schemas.filter(s=>!['run_code','tool_catalog'].includes(s.name)).sort((a,b)=>a.name.localeCompare(b.name));
 if(args.operation==='describe'){
  const row=rows.find(s=>s.name===args.name);
  return row?{ok:true,tool:row}:{ok:false,error:'unknown_or_unavailable_tool',hint:'list 返回当前会话可用的工具；请使用准确名称。'};
 }
 if(!args.category&&!args.query)return {categories:Object.entries(rows.reduce((out,s)=>{const c=category(s.name);out[c]=(out[c]||0)+1;return out;},{})).map(([name,count])=>({name,count})),hint:'按 category 列出工具，再用 describe 查询完整参数。'};
 const query=(args.query||'').toLowerCase().slice(0,200);
 const matched=rows.filter(s=>(!args.category||category(s.name)===args.category)&&(!query||(s.name+' '+(s.description||'')).toLowerCase().includes(query)));
 const offset=Math.max(0,Math.floor(args.offset||0));
 return {tools:matched.slice(offset,offset+20).map(s=>({name:s.name,description:(s.description||'').slice(0,240)})),total:matched.length,next:offset+20<matched.length?offset+20:null};
}
