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
