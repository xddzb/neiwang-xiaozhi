// Application branding only. Runs before the frontend modules, in the isolated preload.
(() => {
 if (window !== window.top || window.__neiwangBrandUI) return;
 window.__neiwangBrandUI = true;
 const style = document.createElement('style');
 style.id = 'neiwang-brand-ui';
 style.textContent = `
 [data-dsh-boot] > div > :first-child{font-size:32px!important;line-height:1.35!important;font-weight:700!important;letter-spacing:normal!important}
 [data-neiwang-boot-subtitle]{font-size:18px!important;line-height:1.6!important;font-weight:400!important;letter-spacing:normal!important}
 .pXSMma_previewBadge{display:none!important}
 .pXSMma_titleGroup{flex-direction:column!important;gap:8px!important}
 .pXSMma_titleGroup::before{content:'内网小智';font-size:32px;line-height:1.35;font-weight:700}
 .pXSMma_titleGroup>span:first-child{font-size:18px!important;line-height:1.6!important;font-weight:400!important}
 `;
 function paint() {
  if (!style.isConnected && document.head) document.head.append(style);
  if (/^(?:DeepSeek\s+)?Harness$/i.test(document.title.trim())) document.title = '内网小智';
  const boot = document.querySelector('[data-dsh-boot]');
  if (boot) {
   const card = boot.firstElementChild, mark = card?.firstElementChild;
   if (mark && mark.textContent !== '内网小智') mark.textContent = '内网小智';
   // Keep the original spinner, progress and failure diagnostics intact.
   if (card && !card.querySelector('[data-neiwang-boot-subtitle]')) {
    const sub = document.createElement('div');sub.dataset.neiwangBootSubtitle = '';
    sub.textContent = '你说我做';mark.after(sub);
   }
  }
  for (const group of document.querySelectorAll('.pXSMma_titleGroup')) {
   if (group.getAttribute('aria-label') !== '内网小智，你说我做') group.setAttribute('aria-label','内网小智，你说我做');
   const subtitle = group.firstElementChild;
   if (subtitle && subtitle.textContent !== '你说我做') subtitle.textContent = '你说我做';
  }
 }
 const observer = new MutationObserver(paint);
 observer.observe(document,{childList:true,subtree:true,characterData:true});paint();
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
})();

// NEIWANG_BRAND_UI_V1
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
 button.setAttribute('role','switch');button.setAttribute('aria-label','检索增强开关');
 const label=document.createElement('span');label.textContent='检索增强开关';
 const status=document.createElement('span');status.className='rag-status';
 const track=document.createElement('span');track.className='rag-track';track.setAttribute('aria-hidden','true');
 button.append(label,status,track);
 const paint=s=>{status.textContent=s.enabled?'已开启':'已关闭';button.setAttribute('aria-checked',String(s.enabled));button.title='检索增强开关：'+(s.enabled?'按需检索':'已关闭')+'。全应用生效，影响主智能体和子智能体，重启后保留；关闭不删除历史引用。';};
 paint(state);document.body.append(button);
 const mount=()=>{const foot=document.querySelector('[class~="hHd-Xa_footArea"]');if(foot&&button.parentElement!==foot){foot.append(button);button.classList.add('neiwang-sidebar-rag');}};
 const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});mount();
 button.onclick=async()=>{button.disabled=true;try{state=await ipcRenderer.invoke('neiwang-rag-set',!state.enabled);paint(state);}finally{button.disabled=false;}};
 ipcRenderer.on('neiwang-rag-state',(_e,s)=>{state=s;paint(s);});
});
