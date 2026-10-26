window.__ModuleLoader__.load({id:'@neiwang/brand',factory:(require)=>{
 const React=require('react'),h=React.createElement;
 const config=globalThis.__NEIWANG_BRAND__||{name:'内网小智',icon:''};
 function Mark({size=34}){return h('img',{src:config.icon,alt:'中广核白鹭',width:size,height:size,style:{objectFit:'contain'}});}
 function Name(){return h('span',{style:{fontSize:24,fontWeight:700}},config.name);}
 // 右栏文件树点击文件时，改为在左邻分栏打开。运行期包装 sidebarRight.openResource，
 // 不改内核产物；布局从服务实例公开的 adopted store 读取。
 const FILES_KIND='files';
 function activeDockPaneId(layout){
  const node=layout.activePaneId===void 0?void 0:layout.nodes[layout.activePaneId];
  if(node?.kind==='pane'&&node.host==='dock')return node.id;
  for(const id of Object.keys(layout.nodes||{})){const n=layout.nodes[id];if(n.kind==='pane'&&n.host==='dock')return id;}
  return void 0;
 }
 function leftSiblingPane(layout,activeId){
  const chain=[];
  const walk=(id)=>{
   const node=layout.nodes?.[id];
   if(node===void 0)return false;
   if(node.kind==='pane')return node.id===activeId;
   for(let i=0;i<(node.children||[]).length;i+=1){
    if(walk(node.children[i])){chain.push({node,index:i});return true;}
   }
   return false;
  };
  if(!walk(layout.rootId))return void 0;
  for(const {node,index} of chain){
   if(node.axis!=='row'||index===0)continue;
   let sibling=layout.nodes[node.children[index-1]];
   while(sibling?.kind==='split'&&(sibling.children||[]).length>0)sibling=layout.nodes[sibling.children[sibling.children.length-1]];
   if(sibling?.kind==='pane'&&sibling.host==='dock')return sibling.id;
  }
  return void 0;
 }
 // 返回调整后的 options；返回 undefined 表示已把本格里的重复页签搬走，不再走原打开路径。
 function placeInLeftPane(sidebar,address,options){
  const opts=options||{};
  if(opts.paneId!==void 0||opts.preferNewPane===true||opts.replaceTab!==void 0)return opts;
  let sessionId,actions,layout;
  try{
   const held=sidebar.require();
   sessionId=held.sessionId;
   actions=held.actions;
   layout=sidebar.adopted?.get(sessionId)?.store.getSnapshot().bySession[sessionId]?.layout;
  }catch{return opts;}
  if(layout===void 0)return opts;
  const activeId=activeDockPaneId(layout);
  const pane=activeId===void 0?void 0:layout.nodes[activeId];
  if(pane===void 0||pane.kind!=='pane'||pane.host!=='dock')return opts;
  if(!(pane.tabs||[]).some(id=>layout.tabs?.[id]?.kind===FILES_KIND))return opts;
  const leftPaneId=leftSiblingPane(layout,activeId);
  if(leftPaneId===void 0)return opts;
  const existing=Object.values(layout.tabs||{}).find(tab=>tab.contentId===address);
  const existingPane=existing===void 0?void 0:Object.values(layout.nodes||{}).find(node=>node.kind==='pane'&&(node.tabs||[]).includes(existing.id));
  if(existing!==void 0&&existingPane?.id===activeId&&typeof actions?.dropTab==='function'){
   try{
    actions.dropTab(sessionId,existing.id,leftPaneId,'center');
    sidebar.tabDomain?.navigate?.(sessionId,existing.id,{address,params:opts.params});
    return void 0;
   }catch{return {...opts,paneId:leftPaneId};}
  }
  return {...opts,paneId:leftPaneId};
 }
 return {inject:['slots','locale'],apply(ctx){
  ctx.effect(()=>{
   const locale=ctx.locale,original=locale.translate;
   function translate(ns,key,params){
    if(ns==='conversation'&&key==='hero.headline'&&/^zh(?:-|$)/i.test(locale.getLocale().active))return '你说我做，随时待命';
    return original.call(this,ns,key,params);
   }
   locale.translate=translate;
   return ()=>{if(locale.translate===translate)locale.translate=original;};
  });
  ctx.slots.inject('sidebar.brand.mark',()=>ctx.slots.register({name:'sidebar.brand.mark'},Mark));
  ctx.slots.inject('sidebar.brand.name',()=>ctx.slots.register({name:'sidebar.brand.name'},Name));
  ctx.slots.inject('conversation.hero.brand.mark',()=>ctx.slots.register({name:'conversation.hero.brand.mark'},Mark));
  // Stable host slot: the isolated preload owns IPC and the switch DOM.
  // No renderer receives Node access or model/RAG credentials.
  ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action'},()=>h('div',{'data-neiwang-rag-slot':'',style:{width:'100%'}})));
  // 文件树在左邻分栏打开：包装公开的 openResource，卸载时还原。
  ctx.inject(['sidebarRight'],(injected)=>{
   const sidebar=injected.get('sidebarRight');
   if(sidebar===void 0||typeof sidebar.openResource!=='function')return;
   const original=sidebar.openResource;
   function openResource(address,options){
    const next=placeInLeftPane(this,address,options);
    if(next===void 0)return void 0;
    return original.call(this,address,next);
   }
   sidebar.openResource=openResource;
   ctx.effect(()=>()=>{if(sidebar.openResource===openResource)sidebar.openResource=original;});
  });
 }};
}});
