window.__ModuleLoader__.load({id:'@neiwang/brand',factory:(require)=>{
 const React=require('react'),h=React.createElement;
 const config=globalThis.__NEIWANG_BRAND__||{name:'内网小智',icon:''};
 function Mark({size=34}){return h('img',{src:config.icon,alt:'中广核白鹭',width:size,height:size,style:{objectFit:'contain'}});}
 function Name(){return h('span',{style:{fontSize:24,fontWeight:700}},config.name);}

 // ---------------------------------------------------------------------------
 // 右栏（sidebar-right）补丁：全部在运行期包装服务方法，不改内核产物。
 //   1. 文件树点文件 → 在左邻分栏打开
 //   2. html 文件 → 交给内核文档预览（而非侧边栏插件的 html 渲染器）
 //   3. 分栏一侧页签被关光 → 先放回"开始"页，避免空格被合并、分栏消失
 // ---------------------------------------------------------------------------
 const FILES_KIND='files';
 function dockPanes(layout){
  return Object.values(layout.nodes||{}).filter((node)=>node.kind==='pane'&&node.host==='dock');
 }
 function paneOfTab(layout,tabId){
  for(const node of Object.values(layout.nodes||{}))if((node.tabs||[]).includes(tabId))return node;
  return void 0;
 }
 function activeDockPaneId(layout){
  const node=layout.activePaneId===void 0?void 0:layout.nodes[layout.activePaneId];
  if(node?.kind==='pane'&&node.host==='dock')return node.id;
  return dockPanes(layout)[0]?.id;
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
 function layoutOf(sidebar,sessionId){
  try{
   return sidebar.adopted?.get(sessionId)?.store.getSnapshot().bySession[sessionId]?.layout;
  }catch{return void 0;}
 }
 // 返回调整后的 options；返回 undefined 表示已把本格里的重复页签搬走，不再走原打开路径。
 function placeInLeftPane(sidebar,address,options){
  const opts=options||{};
  if(opts.paneId!==void 0||opts.preferNewPane===true||opts.replaceTab!==void 0)return opts;
  let sessionId,actions;
  try{
   const held=sidebar.require();
   sessionId=held.sessionId;
   actions=held.actions;
  }catch{return opts;}
  const layout=layoutOf(sidebar,sessionId);
  if(layout===void 0)return opts;
  const activeId=activeDockPaneId(layout);
  const pane=activeId===void 0?void 0:layout.nodes[activeId];
  if(pane===void 0||pane.kind!=='pane'||pane.host!=='dock')return opts;
  if(!(pane.tabs||[]).some(id=>layout.tabs?.[id]?.kind===FILES_KIND))return opts;
  const leftPaneId=leftSiblingPane(layout,activeId);
  if(leftPaneId===void 0)return opts;
  const existing=Object.values(layout.tabs||{}).find(tab=>tab.contentId===address);
  const existingPane=existing===void 0?void 0:paneOfTab(layout,existing.id);
  if(existing!==void 0&&existingPane?.id===activeId&&typeof actions?.dropTab==='function'){
   try{
    actions.dropTab(sessionId,existing.id,leftPaneId,'center');
    sidebar.tabDomain?.navigate?.(sessionId,existing.id,{address,params:opts.params});
    return void 0;
   }catch{return {...opts,paneId:leftPaneId};}
  }
  return {...opts,paneId:leftPaneId};
 }
 // 关闭一格唯一的页签前，先在该格放进"开始"页，让格不空、分栏得以保留。
 function keepPaneCompanion(sidebar,sessionId,tabId){
  const layout=layoutOf(sidebar,sessionId);
  if(layout===void 0)return;
  const tab=layout.tabs?.[tabId];
  if(tab===void 0||tab.kind==='guide')return;
  const pane=paneOfTab(layout,tabId);
  if(pane===void 0||pane.host!=='dock')return;
  if((pane.tabs||[]).length!==1)return;
  if(dockPanes(layout).length<2)return;
  try{sidebar.openTabIn(sessionId,'guide',{paneId:pane.id});}catch{}
 }
 // 包装 closeTab（UI 关闭按钮与 closeIn 最终都走 store 的 actions.closeTab）。
 const patchedActions=new Map();
 function patchCloseTab(sidebar){
  const original=sidebar.actionsFor;
  function actionsFor(sessionId){
   const actions=original.call(this,sessionId);
   if(actions===void 0||typeof actions.closeTab!=='function'||patchedActions.has(actions))return actions;
   const closeTab=actions.closeTab;
   try{
    actions.closeTab=function(sid,closingTabId){
     keepPaneCompanion(sidebar,sid,closingTabId);
     return closeTab.call(this,sid,closingTabId);
    };
    patchedActions.set(actions,closeTab);
   }catch{}
   return actions;
  }
  sidebar.actionsFor=actionsFor;
  return ()=>{
   if(sidebar.actionsFor===actionsFor)sidebar.actionsFor=original;
   for(const [actions,closeTab] of patchedActions){try{actions.closeTab=closeTab;}catch{}}
   patchedActions.clear();
  };
 }
 // 包装 openResource：从文件树出发的打开改投左邻分栏。
 function patchOpenResource(sidebar){
  const original=sidebar.openResource;
  function openResource(address,options){
   const next=placeInLeftPane(this,address,options);
   if(next===void 0)return void 0;
   return original.call(this,address,next);
  }
  sidebar.openResource=openResource;
  return ()=>{if(sidebar.openResource===openResource)sidebar.openResource=original;};
 }
 // 包装候选排序：html/.htm 把内核 "text" 类型提到首位。侧边栏文件树打开前会探测
 // candidates(address)[0]，看到非 editor 类型即转交内核 openResource，于是走内核预览。
 function patchTabCandidates(tabs){
  const original=tabs.candidates;
  function candidates(address){
   const list=original.call(this,address);
   if(!Array.isArray(list)||!/\.html?$/i.test(String(address).split(/[?#]/)[0]))return list;
   const index=list.findIndex((entry)=>entry?.kind==='text');
   if(index<=0)return list;
   return [list[index],...list.filter((_,i)=>i!==index)];
  }
  tabs.candidates=candidates;
  return ()=>{if(tabs.candidates===candidates)tabs.candidates=original;};
 }
 function patchSidebarRight(sidebar){
  const undo=[];
  if(typeof sidebar.actionsFor==='function')undo.push(patchCloseTab(sidebar));
  if(typeof sidebar.openResource==='function')undo.push(patchOpenResource(sidebar));
  return ()=>{for(const restore of undo)restore();};
 }

 // ---------------------------------------------------------------------------
 // 右栏「变更」页：数据来自对话回退插件（dsh-turn-rewind）的检查点，
 //   1. 顶部：当前未保留的改动，可整体保留或回到上一个保留点
 //   2. 时间线：每一轮对话改了哪些文件、加减多少行
 //   3. 点击文件看红绿 diff，行尾可把单个文件回退/前进到该轮状态
 // ---------------------------------------------------------------------------
 const REWIND_PATH='/turn-rewind';
 const REVIEW_PATH='/turn-rewind/review';
 const CHANGES_ID='@neiwang/brand:changes';
 const CHANGES_KIND='changes';
 const CHANGES_STYLE_ID='neiwang-changes-style';
 const CHANGES_CSS=`
.nwchg-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:12px;color:var(--dsw-alias-label-primary)}
.nwchg-head{display:flex;align-items:center;gap:6px;flex:none;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.nwchg-head-title{flex:1;min-width:0;font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nwchg-btn{flex:none;height:22px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;cursor:pointer}
.nwchg-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.nwchg-btn:disabled{opacity:.45;cursor:not-allowed}
.nwchg-btn[data-tone="primary"]{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}
.nwchg-btn[data-tone="danger"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.nwchg-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:8px 10px 24px}
.nwchg-section{margin-bottom:12px}
.nwchg-section-head{display:flex;align-items:center;gap:6px;margin:0 0 4px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.nwchg-section-head strong{color:var(--dsw-alias-label-secondary);font-weight:600}
.nwchg-empty{padding:10px 2px;color:var(--dsw-alias-label-tertiary)}
.nwchg-error{margin:6px 0;padding:6px 8px;border-radius:6px;background:var(--dsw-alias-file-diff-deleted-bg);color:var(--dsw-alias-state-error-primary);word-break:break-all}
.nwchg-round{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;margin-bottom:6px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.nwchg-round-head{display:flex;align-items:center;gap:2px;padding:2px 6px 2px 0}
.nwchg-round-head:hover{background:var(--dsw-alias-interactive-bg-hover)}
.nwchg-round-toggle{display:flex;align-items:center;gap:6px;flex:1;min-width:0;padding:6px 0 6px 8px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.nwchg-group-head{display:flex;align-items:center;gap:6px;padding:7px 8px;background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l2)}
.nwchg-cp{border-top:1px solid var(--dsw-alias-border-l2)}
.nwchg-group-head + .nwchg-cp{border-top:0}
.nwchg-cp-head{display:flex;align-items:center;gap:6px;padding:5px 6px 5px 16px}
.nwchg-cp-head[data-empty="true"]{opacity:.62}
.nwchg-cp-head[data-empty="true"] .nwchg-cp-name{font-weight:500}
.nwchg-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.nwchg-dot[data-kind="user"]{background:var(--dsw-alias-state-business-primary)}
.nwchg-dot[data-kind="between"]{background:var(--dsw-alias-state-warning-primary,#d97706)}
.nwchg-cp-name{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nwchg-cp-meta{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary)}
.nwchg-seg{display:flex;align-items:center;gap:6px;width:100%;padding:3px 8px 3px 18px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.nwchg-seg:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.nwchg-seg[data-empty="true"]{cursor:default;opacity:.75}
.nwchg-seg-text{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nwchg-caret{flex:none;width:10px;color:var(--dsw-alias-label-tertiary)}
.nwchg-round-label{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nwchg-round-meta{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}
.nwchg-stat{flex:none;display:inline-flex;gap:4px;font-variant-numeric:tabular-nums;font-size:11px}
.nwchg-stat .add{color:var(--dsw-alias-state-success-primary)}
.nwchg-stat .del{color:var(--dsw-alias-state-error-primary)}
.nwchg-files{border-top:1px solid var(--dsw-alias-border-l2)}
.nwchg-file{display:flex;align-items:center;gap:4px;padding:3px 6px 3px 12px}
.nwchg-file:hover{background:var(--dsw-alias-interactive-bg-hover)}
.nwchg-file-main{display:flex;align-items:center;gap:6px;flex:1;min-width:0;padding:2px 0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.nwchg-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nwchg-kind{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary)}
.nwchg-op{flex:none;width:20px;height:20px;padding:0;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;cursor:pointer}
.nwchg-op:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.nwchg-op[data-arm="true"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);opacity:1}
.nwchg-op[data-arm="true"]:disabled{opacity:.35}
.nwchg-op:disabled{opacity:.35;cursor:not-allowed}
.nwchg-diff{margin:0;padding:2px 0 4px;border-top:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Consolas,"Courier New",monospace;font-size:11px;line-height:16px;max-height:340px;overflow:auto}
.nwchg-line{display:flex;min-width:max-content;padding-right:8px;white-space:pre}
.nwchg-line[data-k="add"]{background:var(--dsw-alias-file-diff-added-bg)}
.nwchg-line[data-k="del"]{background:var(--dsw-alias-file-diff-deleted-bg)}
.nwchg-no{flex:none;width:34px;padding-right:6px;text-align:right;color:var(--dsw-alias-label-tertiary);user-select:none}
.nwchg-sign{flex:none;width:10px;color:var(--dsw-alias-label-tertiary)}
.nwchg-text{flex:1;min-width:0}
.nwchg-note{padding:4px 12px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.nwchg-notice{flex:none;padding:0 10px 6px;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
`;
 function ensureChangesStyles(){
  if(document.getElementById(CHANGES_STYLE_ID)!==null)return;
  const style=document.createElement('style');
  style.id=CHANGES_STYLE_ID;
  style.textContent=CHANGES_CSS;
  document.head.appendChild(style);
 }
 function reviewUrl(sessionId,params){
  const query=new URLSearchParams({sessionId});
  for(const [key,value] of Object.entries(params||{})){
   if(value!==void 0&&value!==null)query.set(key,String(value));
  }
  return REVIEW_PATH+'?'+query.toString();
 }
 async function reviewJson(url,init){
  const response=await fetch(url,{cache:'no-store',headers:{accept:'application/json'},...init});
  const text=await response.text();
  let payload=null;
  try{payload=text===''?null:JSON.parse(text);}catch{payload=null;}
  if(!response.ok){
   const message=(payload&&typeof payload.error==='string'&&payload.error)||('HTTP '+response.status);
   const error=new Error(message);
   if(payload!==null&&typeof payload.code==='string')error.code=payload.code;
   throw error;
  }
  return payload;
 }
 const ERROR_TEXT={
  WORKSPACE_IN_USE:'有会话正在运行，等它结束后再试',
  WORKSPACE_LOCKED:'变更账本正被占用，请稍后重试',
  NO_CHANGES:'文件已经处于目标状态',
  PLAN_STALE:'检查点已变化，请刷新后重试',
  RESTORE_POINT_NOT_FOUND:'找不到这个检查点',
  INVALID_ARGUMENTS:'参数不合法',
  RESTORE_FAILED:'恢复失败',
 };
 function describeError(error){
  const code=error!==null&&error!==void 0&&typeof error.code==='string'?error.code:null;
  if(code!==null&&ERROR_TEXT[code]!==void 0)return ERROR_TEXT[code]+'（'+code+'）';
  return errorText(error);
 }
 const KIND_TEXT={added:'新增',deleted:'删除',modified:'修改','mode-changed':'权限','type-changed':'类型'};
 // 二进制文件不做行级比较：既读不出一行行文本，也不该把它的字节算进 +/- 统计。
 // 名单以常见图片/音视频/压缩包/可执行/文档为主，未列出的按文本处理。
 const BINARY_EXTENSIONS=new Set([
  'png','jpg','jpeg','gif','webp','bmp','ico','tif','tiff','psd','ai','heic','raw','avif',
  'mp3','mp4','wav','avi','mov','mkv','flac','ogg','m4a','webm',
  'zip','rar','7z','gz','tgz','bz2','xz','tar','jar','war',
  'exe','dll','so','dylib','bin','dat','db','sqlite','sqlite3','mdb',
  'pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp',
  'woff','woff2','ttf','otf','eot','class','pyc','o','a','lib','node','wasm',
 ]);
 function isBinaryPath(path){
  const name=String(path||'').split(/[\\/]/).pop()||'';
  const dot=name.lastIndexOf('.');
  if(dot<=0)return false;
  return BINARY_EXTENSIONS.has(name.slice(dot+1).toLowerCase());
 }
 function textLines(text){
  if(typeof text!=='string'||text==='')return [];
  return text.replace(/^\uFEFF/,'').split(/\r?\n/);
 }
 // 行级 LCS；超大文件退化成整块替换，避免卡住界面。
 function diffLines(beforeText,afterText){
  const a=textLines(beforeText),b=textLines(afterText);
  const n=a.length,m=b.length;
  const rows=[];
  let added=0,deleted=0;
  if(n*m>1500000){
   let oldNo=0,newNo=0;
   for(const line of a){rows.push({type:'del',text:line,oldNo:++oldNo});deleted+=1;}
   for(const line of b){rows.push({type:'add',text:line,newNo:++newNo});added+=1;}
   return {rows,added,deleted};
  }
  const width=m+1;
  const dp=new Int32Array((n+1)*width);
  for(let i=n-1;i>=0;i-=1){
   for(let j=m-1;j>=0;j-=1){
    dp[i*width+j]=a[i]===b[j]?dp[(i+1)*width+j+1]+1:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);
   }
  }
  let i=0,j=0,oldNo=0,newNo=0;
  while(i<n&&j<m){
   if(a[i]===b[j]){rows.push({type:'ctx',text:a[i],oldNo:++oldNo,newNo:++newNo});i+=1;j+=1;}
   else if(dp[(i+1)*width+j]>=dp[i*width+j+1]){rows.push({type:'del',text:a[i],oldNo:++oldNo});deleted+=1;i+=1;}
   else{rows.push({type:'add',text:b[j],newNo:++newNo});added+=1;j+=1;}
  }
  while(i<n){rows.push({type:'del',text:a[i],oldNo:++oldNo});deleted+=1;i+=1;}
  while(j<m){rows.push({type:'add',text:b[j],newNo:++newNo});added+=1;j+=1;}
  return {rows,added,deleted};
 }
 function diffKey(segment,path){
  return String(segment.fromId)+'|'+String(segment.toId||'')+'|'+String(path);
 }
 function changeKindText(kind){
  return KIND_TEXT[kind]||String(kind||'');
 }
 function errorText(error){
  return error&&typeof error.message==='string'?error.message:String(error);
 }
 function ChangesTab({sessionId,useTabInfo,useSessions,openSession}){
  const tabInfo=typeof useTabInfo==='function'?useTabInfo():void 0;
  const visible=tabInfo?.tab?.visible!==false;
  const [unkept,setUnkept]=React.useState(void 0);
  const [entries,setEntries]=React.useState(void 0);
  const [error,setError]=React.useState(null);
  const [notice,setNotice]=React.useState(null);
  const [busy,setBusy]=React.useState(null);
  const [confirming,setConfirming]=React.useState(false);
  const [confirmTurn,setConfirmTurn]=React.useState(null);
  const [openSegments,setOpenSegments]=React.useState(()=>new Set());
  const [openFiles,setOpenFiles]=React.useState(()=>new Set());
  const [,setTick]=React.useState(0);
  const cache=React.useRef(new Map());
  const alive=React.useRef(true);
  const loadedAt=React.useRef(0);
  const pending=React.useRef(new Set());
  const refreshing=React.useRef(null);
  const armedAt=React.useRef(0);
  const disarming=React.useRef(null);
  React.useEffect(()=>{
   alive.current=true;
   return ()=>{alive.current=false;};
  },[]);
  React.useEffect(()=>()=>{
   if(disarming.current!==null)clearTimeout(disarming.current);
  },[]);
  const bump=React.useCallback(()=>{if(alive.current)setTick((value)=>value+1);},[]);
  const refresh=React.useCallback(async()=>{
   if(refreshing.current!==null)return refreshing.current;
   const task=(async()=>{
    setError(null);
    try{
     // 变更账本对工作区加独占锁，同一会话的读请求必须串行。
     const live=await reviewJson(reviewUrl(sessionId,{}));
     const timeline=await reviewJson(reviewUrl(sessionId,{timeline:'1'}));
     if(!alive.current)return;
     loadedAt.current=Date.now();
     cache.current.clear();
     pending.current.clear();
     setUnkept(live!==null&&live.status==='ready'
      ?{checkpointId:live.checkpointId,createdAt:live.createdAt,changes:Array.isArray(live.changes)?live.changes:[]}
      :null);
     setEntries(Array.isArray(timeline?.entries)?timeline.entries:[]);
    }catch(caught){
     if(alive.current)setError(errorText(caught));
    }
   })();
   refreshing.current=task;
   try{
    await task;
   }finally{
    refreshing.current=null;
   }
  },[sessionId]);
  // 会话是否正在跑：宿主把 sessions store 作为 useSessions 注入（内核 ReviewTab
  // 也是这么读的）。部分宿主版本不给这个 props，条件调用的分支在组件生命周期内
  // 固定，不会改变 hooks 顺序。
  const running=typeof useSessions==='function'
   ?useSessions((sessions)=>sessions?.byId?.[sessionId]?.running===true)
   :false;
  const lastRunning=React.useRef(running);
  React.useEffect(()=>{
   cache.current.clear();
   pending.current.clear();
   setUnkept(void 0);
   setEntries(void 0);
   setNotice(null);
   setOpenSegments(new Set());
   setOpenFiles(new Set());
   // 确认态不能跨会话残留，否则切过去点一下就是执行。
   setConfirming(false);
   setConfirmTurn(null);
   armedAt.current=0;
   if(disarming.current!==null){clearTimeout(disarming.current);disarming.current=null;}
   // 切会话后重新对齐运行状态，避免把上一个会话的边沿算到这一个上。
   lastRunning.current=running;
   void refresh();
  },[refresh]);
  React.useEffect(()=>{
   if(!visible)return;
   if(Date.now()-loadedAt.current<1500)return;
   void refresh();
  },[visible,refresh]);
  // 对话轮次的开/关是刷新的两个自然边界，两个方向都要等一拍：开始快照在
  // pre-step 里异步抓，结束快照在 agent 转 idle 之后才落盘，抢在前面拉只能
  // 拿到上一轮的状态。
  React.useEffect(()=>{
   if(!visible)return;
   const previous=lastRunning.current;
   lastRunning.current=running;
   if(previous===running)return;
   const timer=setTimeout(()=>{if(alive.current)void refresh();},running?1500:1200);
   return ()=>clearTimeout(timer);
  },[running,visible,refresh]);
  const readContent=React.useCallback(async(checkpointId,path,current)=>{
   const params={path};
   if(current===true)params.current='1';
   else params.checkpointId=checkpointId;
   const payload=await reviewJson(reviewUrl(sessionId,params));
   return payload!==null&&typeof payload.content==='string'?payload.content:null;
  },[sessionId]);
  const ensureDiff=React.useCallback(async(segment,path)=>{
   const key=diffKey(segment,path);
   if(cache.current.has(key)||pending.current.has(key))return;
   if(isBinaryPath(path)){
    cache.current.set(key,{status:'binary'});
    return;
   }
   pending.current.add(key);
   cache.current.set(key,{status:'loading'});
   bump();
   try{
    const before=await readContent(segment.fromId,path,false);
    const after=segment.toId===null||segment.toId===void 0
     ?await readContent(null,path,true)
     :await readContent(segment.toId,path,false);
    const diff=diffLines(before,after);
    cache.current.set(key,{status:'ready',...diff});
   }catch(caught){
    cache.current.set(key,{status:'failed',error:errorText(caught)});
   }finally{
    pending.current.delete(key);
    bump();
   }
  },[readContent,bump]);
  React.useEffect(()=>{
   if(entries===void 0)return;
   let cancelled=false;
   const run=async()=>{
    const queue=unkept===null||unkept===void 0
     ?[...entries]
     :[{fromId:unkept.checkpointId,toId:null,changes:unkept.changes},...entries];
    for(const entry of queue){
     const changes=Array.isArray(entry.changes)?entry.changes:[];
     for(const change of changes){
      if(cancelled)return;
      await ensureDiff(entry,change.path);
     }
    }
   };
   void run();
   return ()=>{cancelled=true;};
  },[entries,unkept,ensureDiff]);
  const post=React.useCallback(async(body)=>{
   return reviewJson(REVIEW_PATH,{
    method:'POST',
    headers:{accept:'application/json','content-type':'application/json'},
    body:JSON.stringify(body),
   });
  },[]);
  const act=React.useCallback(async(label,run)=>{
   setBusy(label);
   setNotice(null);
   try{
    await run();
    if(!alive.current)return;
    setNotice(label+'完成');
    await refresh();
   }catch(caught){
    if(!alive.current)return;
    const code=caught!==null&&caught!==void 0&&typeof caught.code==='string'?caught.code:null;
    setNotice(code==='NO_CHANGES'?label+'：文件已处于该状态':label+'失败：'+describeError(caught));
   }finally{
    if(alive.current)setBusy(null);
   }
  },[refresh]);
  const keep=()=>{void act('确认当前状态',()=>post({sessionId,mode:'keep'}));};
  // 确认态最多保持 8 秒，避免用户离开后回来误点第二下就执行。
  const armConfirm=(clear)=>{
   if(disarming.current!==null)clearTimeout(disarming.current);
   disarming.current=setTimeout(()=>{
    disarming.current=null;
    if(!alive.current)return;
    clear();
    setNotice(null);
   },8000);
  };
  const disarmConfirm=()=>{
   if(disarming.current!==null)clearTimeout(disarming.current);
   disarming.current=null;
  };
  const revert=()=>{
   if(unkept===null||unkept===void 0)return;
   if(!confirming){setConfirming(true);armedAt.current=Date.now();armConfirm(()=>setConfirming(false));return;}
   // 双击的第二下不算确认，避免一次误触就改写工作区。
   if(Date.now()-armedAt.current<600)return;
   disarmConfirm();
   setConfirming(false);
   void act('恢复到上次检查点',()=>post({sessionId,mode:'revert',checkpointId:unkept.checkpointId}));
  };
  const restoreFile=(checkpointId,path,label)=>{
   if(checkpointId===void 0||checkpointId===null)return;
   void act(label||'恢复文件',()=>post({sessionId,mode:'restoreFile',checkpointId,path}));
  };
  // 回退对话：文件回到该轮开始前，并分叉出一个截断到那条消息的会话。
  // 时间线按工作区共享，所以节点可能属于别的会话——回退要用节点自己的
  // sessionId 去解析消息边界，而不是当前标签页的会话。
  const entryKey=(entry)=>entry.kind==='round'
   ?'round-'+String(entry.round)
   :'cp-'+String(entry.toId);
  const previewRewind=async(targetSession,messageSeq)=>{
   const payload=await reviewJson(REWIND_PATH+'?'+new URLSearchParams({
    sessionId:targetSession,
    messageSeq:String(messageSeq),
   }).toString());
   return payload!==null&&payload.status==='ready'?payload:null;
  };
  const revertTurn=async(checkpoint)=>{
   if(busy!==null)return;
   if(checkpoint.messageSeq===void 0||checkpoint.messageSeq===null){
    setNotice('这个检查点找不到对应的用户消息，无法回退对话');
    return;
   }
   const key=entryKey(checkpoint);
   const targetSession=typeof checkpoint.sessionId==='string'&&checkpoint.sessionId!==''?checkpoint.sessionId:sessionId;
   if(confirmTurn!==key){
    setNotice('正在检查回退范围…');
    let preview=null;
    try{
     preview=await previewRewind(targetSession,checkpoint.messageSeq);
    }catch(caught){
     if(!alive.current)return;
     setConfirmTurn(null);
     setNotice('无法检查回退范围：'+describeError(caught));
     return;
    }
    if(!alive.current)return;
    setConfirmTurn(key);
    armedAt.current=Date.now();
    armConfirm(()=>setConfirmTurn(null));
    const total=preview!==null&&typeof preview.totalChanges==='number'?preview.totalChanges:0;
    setNotice(total===0
     ?'再点一次「回退对话」：只截断对话，文件不动'
     :'再点一次「回退对话」：将把 '+String(total)+' 个文件恢复到这一轮之前，并新建会话');
    return;
   }
   // 双击的第二下不算确认。
   if(Date.now()-armedAt.current<600)return;
   disarmConfirm();
   setConfirmTurn(null);
   setNotice(null);
   setBusy('回退对话');
   try{
    // 执行前重新取一次预览：plan 有有效期，点击时可能已经过期。
    // 预览失败时中止，绝不退化成"只截断对话"——那会让文件停在回退后的状态。
    const preview=await previewRewind(targetSession,checkpoint.messageSeq);
    const body={sessionId:targetSession,messageSeq:checkpoint.messageSeq,mode:'messages'};
    if(preview!==null
      &&typeof preview.checkpointId==='string'
      &&typeof preview.planId==='string'
      &&typeof preview.confirmation==='string'){
     body.mode='both';
     body.checkpointId=preview.checkpointId;
     body.planId=preview.planId;
     body.confirmation=preview.confirmation;
    }
    const result=await reviewJson(REWIND_PATH,{
     method:'POST',
     headers:{accept:'application/json','content-type':'application/json'},
     body:JSON.stringify(body),
    });
    const created=result!==null&&typeof result.sessionId==='string'?result.sessionId:null;
    if(created===null){
     setNotice('回退已完成，但没有拿到新会话');
     return;
    }
    const opened=typeof openSession==='function'&&openSession(created)===true;
    setNotice(opened?'已回退对话，新会话已打开':('已回退对话，新会话：'+created));
   }catch(caught){
    setNotice('回退对话失败：'+describeError(caught));
   }finally{
    if(alive.current)setBusy(null);
   }
  };
  const toggleSegment=(id)=>{
   setOpenSegments((previous)=>{
    const next=new Set(previous);
    if(next.has(id))next.delete(id);else next.add(id);
    return next;
   });
  };
  const toggleFile=(key)=>{
   setOpenFiles((previous)=>{
    const next=new Set(previous);
    if(next.has(key))next.delete(key);else next.add(key);
    return next;
   });
  };
  const statsOf=(segment)=>{
   let added=0,deleted=0,waiting=false;
   for(const change of Array.isArray(segment.changes)?segment.changes:[]){
    if(isBinaryPath(change.path))continue;
    const entry=cache.current.get(diffKey(segment,change.path));
    if(entry===void 0||entry.status==='loading'){waiting=true;continue;}
    if(entry.status==='ready'){added+=entry.added;deleted+=entry.deleted;}
   }
   return {added,deleted,waiting};
  };
  const statNode=(added,deleted,waiting)=>{
   if(waiting&&added===0&&deleted===0)return h('span',{className:'nwchg-stat'},'…');
   return h('span',{className:'nwchg-stat'},[
    h('span',{key:'a',className:'add'},'+'+String(added)),
    h('span',{key:'d',className:'del'},'-'+String(deleted)),
   ]);
  };
  const fileRow=(segment,change,options)=>{
   const key=diffKey(segment,change.path);
   const open=openFiles.has(key);
   const binary=isBinaryPath(change.path);
   const stats=statsOf({...segment,changes:[change]});
   const ops=[];
   if(options.undo===true){
    ops.push(h('button',{
     key:'undo',type:'button',className:'nwchg-op',title:'放弃该文件的改动，恢复到上次确认',
     disabled:busy!==null,
     onClick:()=>restoreFile(segment.fromId,change.path,'放弃改动'),
    },'↺'));
   }else{
    const hasBefore=segment.fromId!==void 0&&segment.fromId!==null;
    const hasAfter=segment.toId!==void 0&&segment.toId!==null;
    ops.push(h('button',{
     key:'back',type:'button',className:'nwchg-op',title:'把该文件恢复到上一个检查点',
     disabled:!hasBefore||busy!==null,
     onClick:()=>restoreFile(segment.fromId,change.path,'回退文件'),
    },'⟲'));
    ops.push(h('button',{
     key:'forward',type:'button',className:'nwchg-op',title:hasAfter?'把该文件恢复到这个检查点':'终点是当前工作区，无需前进',
     disabled:!hasAfter||busy!==null,
     onClick:()=>restoreFile(segment.toId,change.path,'前进文件'),
    },'⟳'));
   }
   const children=[
    h('div',{key:'row',className:'nwchg-file'},[
     h('button',{
      key:'main',type:'button',className:'nwchg-file-main',
      onClick:()=>toggleFile(key),
     },[
      h('span',{key:'path',className:'nwchg-path',title:change.path},change.path),
      h('span',{key:'kind',className:'nwchg-kind'},changeKindText(change.kind)),
      binary
       ?h('span',{key:'bin',className:'nwchg-kind'},'二进制')
       :statNode(stats.added,stats.deleted,stats.waiting),
     ]),
     ...ops,
    ]),
   ];
   if(open){
    const entry=cache.current.get(key);
    if(binary){
     children.push(h('div',{key:'diff',className:'nwchg-note'},'二进制文件，不做行级比较（仍可整文件回退/前进）'));
    }else if(entry===void 0||entry.status==='loading'){
     children.push(h('div',{key:'diff',className:'nwchg-note'},'正在计算差异…'));
    }else if(entry.status==='failed'){
     children.push(h('div',{key:'diff',className:'nwchg-note'},'无法比较：'+entry.error));
    }else if(entry.rows.length===0){
     children.push(h('div',{key:'diff',className:'nwchg-note'},'两侧内容相同'));
    }else{
     const limit=1500;
     const shown=entry.rows.length>limit?entry.rows.slice(0,limit):entry.rows;
     children.push(h('div',{key:'diff',className:'nwchg-diff'},
      shown.map((row,index)=>h('div',{
       key:String(index),
       className:'nwchg-line',
       'data-k':row.type,
      },[
       h('span',{key:'n',className:'nwchg-no'},row.type==='add'?String(row.newNo):String(row.oldNo)),
       h('span',{key:'s',className:'nwchg-sign'},row.type==='add'?'+':row.type==='del'?'-':' '),
       h('span',{key:'t',className:'nwchg-text'},row.text===''?' ':row.text),
      ]))
     ));
     if(entry.rows.length>limit)children.push(h('div',{key:'more',className:'nwchg-note'},'已省略 '+(entry.rows.length-limit)+' 行'));
    }
   }
   return h('div',{key:key,className:'nwchg-file-wrap'},children);
  };
  const unkeptNode=()=>{
   if(unkept===void 0)return h('div',{className:'nwchg-empty'},'读取中…');
   if(unkept===null||unkept.changes.length===0){
    return h('div',{className:'nwchg-empty'},'没有待确认的改动');
   }
   const segment={fromId:unkept.checkpointId,toId:null,changes:unkept.changes};
   const stats=statsOf(segment);
   return h('div',{className:'nwchg-round'},[
    h('div',{key:'head',className:'nwchg-round-head'},[
     h('span',{key:'label',className:'nwchg-round-label'},'待确认的改动'),
     h('span',{key:'meta',className:'nwchg-round-meta'},unkept.changes.length+' 个文件'),
     h('span',{key:'stat'},statNode(stats.added,stats.deleted,stats.waiting)),
    ]),
    h('div',{key:'files',className:'nwchg-files'},
     unkept.changes.map((change)=>fileRow(segment,change,{undo:true}))),
   ]);
  };
  const clockOf=(value)=>{
   const stamp=typeof value==='number'?value:Number(value);
   if(!Number.isFinite(stamp)||stamp<=0)return '';
   const date=new Date(stamp);
   const pad=(part)=>String(part).padStart(2,'0');
   return pad(date.getHours())+':'+pad(date.getMinutes());
  };
  // 两类条目并列：轮次（本轮改了什么，快照区间）与检查点（自上个确认以来改了什么）。
  // 自动快照只用来界定轮次，不作为条目出现。
  const entriesNode=()=>{
   if(entries===void 0)return [h('div',{key:'loading',className:'nwchg-empty'},'读取中…')];
   if(entries.length===0)return [h('div',{key:'none',className:'nwchg-empty'},'还没有轮次或检查点')];
   return entries.map((entry,index)=>{
    const key=entryKey(entry);
    const open=openSegments.has(key);
    const changes=Array.isArray(entry.changes)?entry.changes:[];
    const stats=statsOf(entry);
    const empty=changes.length===0;
    const isRound=entry.kind==='round';
    const isBetween=entry.kind==='between';
    const endedAt=typeof entry.endedAt==='number'?entry.endedAt:null;
    const meta=isRound
     ?clockOf(entry.createdAt)
       +(endedAt!==null&&endedAt>entry.createdAt?' – '+clockOf(endedAt):(endedAt===null?' · 进行中':''))
     :clockOf(entry.createdAt);
    const name=isRound
     ?('第 '+String(entry.round)+' 轮')
     :(isBetween?'手动修改':'检查点');
    const children=[
     h('div',{key:'head',className:'nwchg-cp-head','data-empty':empty?'true':'false'},[
      h('span',{key:'dot',className:'nwchg-dot','data-kind':isRound?'turn':(isBetween?'between':'user')}),
      h('span',{key:'name',className:'nwchg-cp-name'},name),
      h('span',{key:'meta',className:'nwchg-cp-meta'},meta),
      isRound
       ?h('button',{
         key:'rewind',type:'button',className:'nwchg-op',
         'data-arm':confirmTurn===key?'true':'false',
         title:'回退对话到这一轮之前（同时恢复文件并新建会话）',
         disabled:busy!==null||entry.messageSeq===void 0||entry.messageSeq===null,
         onClick:()=>{void revertTurn(entry);},
        },confirmTurn===key?'↩!':'↩')
       :null,
     ]),
    ];
    if(changes.length>0||entry.fromId!==null){
     children.push(h('button',{
      key:'seg',type:'button',className:'nwchg-seg',
      'data-empty':empty?'true':'false',
      disabled:empty,
      onClick:()=>toggleSegment(key),
     },[
      h('span',{key:'caret',className:'nwchg-caret'},empty?'':(open?'▾':'▸')),
      h('span',{key:'text',className:'nwchg-seg-text'},
       empty?'无变化'
        :(isRound?'本轮改动：':(isBetween?'自上一轮结束：':'相对上一个检查点：'))+String(changes.length)+' 个文件'),
      h('span',{key:'stat'},statNode(stats.added,stats.deleted,stats.waiting)),
     ]));
     if(open&&empty===false){
      children.push(h('div',{key:'files',className:'nwchg-files'},
       changes.map((change)=>fileRow(entry,change,{}))));
     }
    }
    return h('div',{key:key,className:'nwchg-round'},children);
   });
  };
  const header=h('div',{key:'head',className:'nwchg-head'},[
   h('span',{key:'title',className:'nwchg-head-title'},'变更'),
   h('button',{
    key:'refresh',type:'button',className:'nwchg-btn',
    disabled:busy!==null,onClick:()=>{setNotice(null);void refresh();},
   },'刷新'),
   h('button',{
    key:'keep',type:'button',className:'nwchg-btn','data-tone':'primary',
    disabled:busy!==null||unkept===null||unkept===void 0||unkept.changes.length===0,
    title:'把当前文件状态记为新的检查点（不改动文件）',
    onClick:keep,
   },'确认'),
   h('button',{
    key:'revert',type:'button',className:'nwchg-btn','data-tone':'danger',
    disabled:busy!==null||unkept===null||unkept===void 0||unkept.changes.length===0,
    title:'把工作区文件恢复到最后一个检查点',
    onClick:revert,
   },confirming?'确认恢复':'恢复'),
  ]);
  const body=[
   error!==null?h('div',{key:'error',className:'nwchg-error'},error):null,
   h('div',{key:'unkept',className:'nwchg-section'},[
    h('div',{key:'head',className:'nwchg-section-head'},[h('strong',{key:'t'},'待确认')]),
    unkeptNode(),
   ]),
   h('div',{key:'rounds',className:'nwchg-section'},[
    h('div',{key:'head',className:'nwchg-section-head'},[h('strong',{key:'t'},'轮次与检查点')]),
    ...entriesNode(),
   ]),
  ];
  return h('div',{className:'nwchg-root','data-neiwang-changes':''},[
   header,
   notice===null?null:h('div',{key:'notice',className:'nwchg-notice'},(busy!==null?busy+'中… ': '')+notice),
   h('div',{key:'scroll',className:'nwchg-scroll'},body),
  ]);
 }
 // 页签开得多了以后，内核 tab 条的横向滚动条几乎看不见。这里把条带做细，
 // 并允许普通滚轮直接横向滚动；不改内核产物（容器本身已是 overflow-x:auto）。
 function ensureTabScrollStyles(){
  if(typeof document==='undefined')return;
  if(document.querySelector('style[data-plugin-tab-scroll]')!==null)return;
  const tag=document.createElement('style');
  tag.dataset.pluginTabScroll='';
  tag.textContent='[class*="_stripTabs_"]{overflow-x:auto;overflow-y:hidden;scroll-behavior:auto!important;scrollbar-width:thin;scrollbar-color:rgba(128,128,128,.18) transparent}'
   +'[class*="_stripTabs_"]::-webkit-scrollbar{height:2px}'
   +'[class*="_stripTabs_"]::-webkit-scrollbar-thumb{background:rgba(128,128,128,.18);border-radius:1px}'
   +'[class*="_stripTabs_"]:hover::-webkit-scrollbar-thumb{background:rgba(128,128,128,.55)}'
   +'[class*="_stripTabs_"]::-webkit-scrollbar-track{background:transparent}';
  document.head.appendChild(tag);
 }
 // 普通滚轮在页签条上直接横向滚动；触控板的横向手势仍交给原生处理。
 // 用 requestAnimationFrame 匀速推进到目标位置，避免每次事件大小不同导致忽快忽慢。
 function installTabWheelScroll(){
  if(typeof document==='undefined')return;
  if(document.documentElement.dataset.pluginTabWheel==='1')return;
  document.documentElement.dataset.pluginTabWheel='1';
  let target=null,frame=0;
  const SPEED=12;
  const animate=()=>{
   if(target===null){frame=0;return;}
   const strip=target.strip,diff=target.left-strip.scrollLeft;
   if(Math.abs(diff)<=0.5){strip.scrollLeft=target.left;target=null;frame=0;return;}
   strip.scrollLeft+=Math.sign(diff)*Math.min(Math.abs(diff),SPEED);
   frame=requestAnimationFrame(animate);
  };
  document.addEventListener('wheel',(event)=>{
   const node=event.target;
   if(!(node instanceof Element))return;
   const strip=node.closest('[class*="_stripTabs_"]');
   if(strip===null||strip.scrollWidth<=strip.clientWidth)return;
   if(Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
   const max=strip.scrollWidth-strip.clientWidth;
   const base=target!==null&&target.strip===strip?target.left:strip.scrollLeft;
   const step=Math.max(-60,Math.min(60,event.deltaY));
   target={strip,left:Math.max(0,Math.min(max,base+step))};
   if(frame===0)frame=requestAnimationFrame(animate);
   event.preventDefault();
  },{capture:true,passive:false});
 }
 function changesDefinition(){
  return {
   id:CHANGES_ID,
   kind:CHANGES_KIND,
   priority:'extension',
   title:()=>'变更',
   guide:[{
    id:'changes',
    order:20,
    title:()=>'变更',
    description:()=>'按检查点查看文件改动，红绿对比，单文件回退',
   }],
  };
 }

 return {inject:['slots','locale'],apply(ctx){
  ensureTabScrollStyles();
  installTabWheelScroll();
  // 回退/分叉后要能切到新会话：优先会话服务，其次工作区导航。
  const openSession=(sessionId)=>{
   try{
    const sessions=ctx.get?.('sessions');
    if(sessions!==void 0&&typeof sessions.open==='function'){sessions.open(sessionId);return true;}
   }catch{}
   try{
    const workspace=ctx.get?.('uiWorkspace');
    if(workspace!==void 0&&typeof workspace.openSession==='function'){workspace.openSession(sessionId);return true;}
   }catch{}
   return false;
  };
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
  ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'neiwang-rag-slot'},()=>h('div',{'data-neiwang-rag-slot':'',style:{width:'100%'}})));
  ctx.inject(['sidebarRight'],(injected)=>{
   const sidebar=injected.get('sidebarRight');
   if(sidebar===void 0)return;
   const restore=patchSidebarRight(sidebar);
   ctx.effect(()=>restore);
  });
  ctx.inject(['sidebarRightTabs'],(injected)=>{
   const tabs=injected.get('sidebarRightTabs');
   if(tabs===void 0||typeof tabs.candidates!=='function')return;
   const restore=patchTabCandidates(tabs);ctx.effect(()=>restore);
   if(typeof tabs.register!=='function')return;
   ensureChangesStyles();
   ctx.effect(()=>tabs.register(changesDefinition()),'neiwang: changes tab');
  });
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({
   name:'sidebar.right.pane.tab',
   key:CHANGES_ID,
   inject:()=>({openSession}),
  },ChangesTab));
 }};
}});
