const {ipcRenderer}=require('electron');
window.addEventListener('DOMContentLoaded',async()=>{
 if(window!==window.top)return;
 let state;try{state=await ipcRenderer.invoke('neiwang-rag-state');}catch{return;}
 if(!state)return;
 const button=document.createElement('button');button.id='neiwang-rag-toggle';
 const style=document.createElement('style');
 style.textContent=`
 #neiwang-rag-toggle{position:fixed;right:24px;bottom:18px;z-index:2147483647;display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2,#e2e2e2);border-radius:12px;background:#fff;color:var(--dsw-alias-label-primary,#171719);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
 #neiwang-rag-toggle:hover{border-color:var(--dsw-alias-label-tertiary,#8b8b8b)}
 #neiwang-rag-toggle:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#547cff);outline-offset:3px}
 #neiwang-rag-toggle:disabled{opacity:.6;cursor:wait}
 #neiwang-rag-toggle .rag-status{font-size:12px;color:var(--dsw-alias-label-tertiary,#707075)}
 #neiwang-rag-toggle .rag-track{display:block;width:32px;height:18px;border-radius:9px;background:#dedee1;position:relative;flex:none}
 #neiwang-rag-toggle .rag-track:after{content:"";position:absolute;width:14px;height:14px;top:2px;left:2px;border-radius:50%;background:#fff;transition:transform .15s}
 #neiwang-rag-toggle[aria-checked=true] .rag-track{background:#171719}
 #neiwang-rag-toggle[aria-checked=true] .rag-track:after{transform:translateX(14px)}
 @media(prefers-color-scheme:dark){#neiwang-rag-toggle{background:#242426}#neiwang-rag-toggle[aria-checked=true] .rag-track{background:#8c9aff}}
 @media(prefers-reduced-motion:reduce){#neiwang-rag-toggle .rag-track:after{transition:none}}`;
 style.textContent+=`#neiwang-rag-toggle.neiwang-sidebar-rag{position:static;box-sizing:border-box;width:100%;margin:10px 0 4px;z-index:auto;justify-content:space-between;background:var(--dsw-specific-sidebar-fill,#fafafa)}[data-sidebar-collapsed=true] #neiwang-rag-toggle.neiwang-sidebar-rag{padding:8px 2px;justify-content:center}[data-sidebar-collapsed=true] #neiwang-rag-toggle.neiwang-sidebar-rag>span:not(.rag-track){display:none}`;
 document.head.append(style);
 button.setAttribute('role','switch');button.setAttribute('aria-label','RAG智能搜索');
 const label=document.createElement('span');label.textContent='RAG智能搜索';
 const status=document.createElement('span');status.className='rag-status';
 const track=document.createElement('span');track.className='rag-track';track.setAttribute('aria-hidden','true');
 button.append(label,status,track);
 const paint=s=>{status.textContent=s.enabled?'已开启':'已关闭';button.setAttribute('aria-checked',String(s.enabled));button.title='RAG智能搜索：'+(s.enabled?'按需检索':'已关闭')+'。全应用生效，影响主智能体和子智能体，重启后保留；关闭不删除历史引用。';};
 paint(state);document.body.append(button);
 const mount=()=>{const foot=document.querySelector('[class~="hHd-Xa_footArea"]');if(foot&&button.parentElement!==foot){foot.append(button);button.classList.add('neiwang-sidebar-rag');}};
 const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});mount();
 button.onclick=async()=>{button.disabled=true;try{state=await ipcRenderer.invoke('neiwang-rag-set',!state.enabled);paint(state);}finally{button.disabled=false;}};
 ipcRenderer.on('neiwang-rag-state',(_e,s)=>{state=s;paint(s);});
});
