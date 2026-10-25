const fs=require('node:fs'),path=require('node:path');
process.on('uncaughtException',fail);
const {app,BrowserWindow,Menu}=require('electron');
app.disableHardwareAcceleration();
require(path.join(process.env.NEIWANG_APP_ROOT,'launcher/shell/main.js'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fail(error){fs.writeFileSync(process.env.BROWSER_UI_OUTPUT+'.error.txt',String(error.stack||error));console.error(error);app.exit(1)}
async function click(win,labels,selector='button'){
 return win.webContents.executeJavaScript(`(()=>{const labels=${JSON.stringify(labels)},list=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.matches('button,[role=menuitem]')&&e.getClientRects().length);if(labels.includes('更多'))list.reverse();const b=list.find(e=>labels.includes((e.innerText||'').trim().split(String.fromCharCode(10))[0])||labels.includes(e.getAttribute('aria-label')));if(b)b.click();return !!b})()`);
}
(async()=>{
 await app.whenReady();let win,ready=false;
 for(let i=0;i<100;i++){
  win=BrowserWindow.getAllWindows()[0];
  if(win){ready=await win.webContents.executeJavaScript(`!!document.querySelector('[data-dsh-better-sidebar]') || !![...document.querySelectorAll('button')].find(e=>['设置','Settings'].includes(e.getAttribute('aria-label')))`);if(ready)break}
  await delay(1000);
 }
 if(!ready)throw Error('Main UI not ready');
 if(process.platform==='linux')await delay(15000);
 if(Menu.getApplicationMenu()!==null)throw Error('Edit menu returned');
 const home=await win.webContents.executeJavaScript(`({text:document.body.innerText,sidebar:!!document.querySelector('[data-dsh-better-sidebar]'),title:document.title})`);
 if(!home.text.includes('你说我做')||home.text.includes('预览版')||home.title!=='内网小智')throw Error('Home branding mismatch');
 if(process.env.NEIWANG_EXPECT_SIDEBAR==='1'&&(!home.sidebar||home.text.includes('PDF解析大师')))throw Error('Sidebar/parser mismatch');
 const toggle=await win.webContents.executeJavaScript(`(async()=>{const b=document.querySelector('#neiwang-rag-toggle');if(!b)return {found:false};const before=b.getAttribute('aria-checked');b.click();for(let i=0;i<100&&b.disabled;i++)await new Promise(r=>setTimeout(r,30));const changed=b.getAttribute('aria-checked')!==before;b.click();for(let i=0;i<100&&b.disabled;i++)await new Promise(r=>setTimeout(r,30));return {found:true,changed,restored:b.getAttribute('aria-checked')===before}})()`);
 if(!toggle.found||!toggle.changed||!toggle.restored)throw Error('RAG switch missing or not functional: '+JSON.stringify(toggle));
 fs.writeFileSync(process.env.BROWSER_UI_OUTPUT.replace('.png','-home.png'),(await win.webContents.capturePage()).toPNG());
 if(process.env.NEIWANG_REWIND_UI==='1'){
  let selected=false;
  for(let i=0;i<60;i++){
   selected=await win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('button,[role=button],[role=treeitem]')].find(e=>e.getClientRects().length&&/BROWSER_PATCH/.test(e.innerText||'')&&(e.innerText||'').length<250);if(e)e.click();return !!e})()`);
   if(selected)break;await delay(500);
  }
  if(!selected)throw Error('Synthetic conversation not shown in sidebar: '+await win.webContents.executeJavaScript('document.body.innerText.slice(-4000)'));
  let present=false;for(let i=0;i<80;i++){present=await win.webContents.executeJavaScript(`!!document.querySelector('.dcl-rewind-trigger')`);if(present)break;await delay(500)}
  if(!present)throw Error('Rewind action absent in real conversation');
  await win.webContents.executeJavaScript(`document.querySelector('.dcl-rewind-trigger').click()`);
  let dialog=false;for(let i=0;i<60;i++){dialog=await win.webContents.executeJavaScript(`!!document.querySelector('.dcl-rewind-dialog')`);if(dialog)break;await delay(500)}
  if(!dialog)throw Error('Rewind preview dialog absent');
  let dialogText='',choices=false;
  for(let i=0;i<180;i++){dialogText=await win.webContents.executeJavaScript(`document.querySelector('.dcl-rewind-dialog').innerText`);choices=/只回溯消息|messages only/i.test(dialogText);if(choices)break;await delay(500)}
  if(!choices)throw Error('Rewind choices absent: '+dialogText);
  await delay(750); // Capture after preview data and its transition have painted.
  fs.writeFileSync(process.env.BROWSER_UI_OUTPUT.replace('.png','-rewind.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('.dcl-rewind-option')].find(e=>/只回溯消息|messages only/i.test(e.innerText));if(!e)throw Error('Messages-only choice absent');e.click()})()`);
  let applyReady=false;for(let i=0;i<80;i++){applyReady=await win.webContents.executeJavaScript(`!![...document.querySelectorAll('.dcl-rewind-dialog button')].find(e=>!e.disabled&&/只回溯消息|messages only/i.test(e.innerText))`);if(applyReady)break;await delay(500)}
  if(!applyReady)throw Error('Messages-only confirmation did not become ready');
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.dcl-rewind-dialog button')].find(e=>!e.disabled&&/只回溯消息|messages only/i.test(e.innerText)).click()`);
  let draft=false;for(let i=0;i<180;i++){draft=await win.webContents.executeJavaScript(`[...document.querySelectorAll('textarea,input,[contenteditable=true]')].some(e=>(e.value||e.innerText||'').includes('BROWSER_PATCH_BASELINE_KEEP'))`);if(draft)break;await delay(500)}
  if(!draft)throw Error('Rewind did not open the new conversation with the original prompt as a draft');
  fs.writeFileSync(process.env.BROWSER_UI_OUTPUT.replace('.png','-rewind-result.png'),(await win.webContents.capturePage()).toPNG());
  await delay(500);
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('[data-sidebar-right-expand]')].find(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');if(b)b.click()})()`);
  await delay(1000);await click(win,['文件','Files']);
  let listed=false;for(let i=0;i<80;i++){listed=await win.webContents.executeJavaScript(`document.body.innerText.includes('rewind-fixture.txt')`);if(listed)break;await delay(500)}
  if(!listed)throw Error('Sidebar file tree did not show the synthetic workspace file');
  await delay(750);
  fs.writeFileSync(process.env.BROWSER_UI_OUTPUT.replace('.png','-sidebar.png'),(await win.webContents.capturePage()).toPNG());
 }
 if(!await click(win,['设置','Settings'])){
  if(!await click(win,['更多','More']))throw Error('More menu missing');
  await delay(500);
  if(!await click(win,['设置','Settings','偏好设置','Preferences'],'*'))throw Error('Settings menu missing: '+await win.webContents.executeJavaScript('document.body.innerText.slice(-1800)'));
 }
 let settingsReady=false;
 for(let i=0;i<120;i++){if(await click(win,['业务浏览器与接口'])){settingsReady=true;break}await delay(500)}
 if(!settingsReady){fs.writeFileSync(process.env.BROWSER_UI_OUTPUT+'.dom.json',JSON.stringify(await win.webContents.executeJavaScript(`({text:document.body.innerText,buttons:[...document.querySelectorAll('button')].map(e=>({text:e.innerText,label:e.getAttribute('aria-label'),title:e.title}))})`),null,2));throw Error('Browser settings entry missing')}
 await delay(1500);
 const text=await win.webContents.executeJavaScript('document.body.innerText');
 if(!text.includes('已登记接口源：'+(process.env.NEIWANG_EXPECTED_SOURCES||15))||!text.includes('精简工具提示词'))throw Error('Browser configuration UI mismatch');
 fs.writeFileSync(process.env.BROWSER_UI_OUTPUT,(await win.webContents.capturePage()).toPNG());
 console.log('PASS actual homepage branding, sidebar, no Edit/preview badge, browser configuration and source count');
 app.exit(0);
})().catch(fail);
