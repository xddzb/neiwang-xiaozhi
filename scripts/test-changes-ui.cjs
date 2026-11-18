const fs=require('node:fs'),path=require('node:path');
const {app,BrowserWindow}=require('electron');
app.disableHardwareAcceleration();
require(path.join(process.env.NEIWANG_APP_ROOT,'launcher/shell/main.js'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const visible=`e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})`;
let win;
async function pick(labels){return win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('button,[role=button],[role=menuitem],[role=treeitem]')].filter(${visible}).find(e=>${JSON.stringify(labels)}.some(t=>(e.innerText||'').trim().split(String.fromCharCode(10))[0]===t||e.getAttribute('aria-label')===t||e.getAttribute('title')===t));if(e)e.click();return !!e})()`)}
async function waitFor(fn,label,tries=180){for(let i=0;i<tries;i++){if(await fn())return;await delay(500)}throw Error(label)}
async function fail(e){
 fs.writeFileSync(process.env.BROWSER_UI_OUTPUT+'.error.txt',String(e.stack||e));
 if(win){fs.writeFileSync(process.env.BROWSER_UI_OUTPUT+'.diagnostic.json',JSON.stringify(await win.webContents.executeJavaScript(`({text:document.body.innerText,buttons:[...document.querySelectorAll('button')].filter(${visible}).map(e=>({text:e.innerText,label:e.getAttribute('aria-label'),title:e.title}))})`),null,2));fs.writeFileSync(process.env.BROWSER_UI_OUTPUT+'.failure.png',(await win.webContents.capturePage()).toPNG())}
 console.error(e);app.exit(1);
}
(async()=>{
 await app.whenReady();
 await waitFor(async()=>{
  win=BrowserWindow.getAllWindows()[0];if(!win)return false;
  return win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('button,[role=button],[role=treeitem]')].filter(${visible}).find(e=>/BROWSER_PATCH/.test(e.innerText||'')&&(e.innerText||'').length<250);if(e)e.click();return !!e})()`);
 },'Stored synthetic conversation missing');
 await delay(2000);
 await win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('[data-sidebar-right-expand]')].filter(${visible})[0];if(e)e.click()})()`);
 if(!await win.webContents.executeJavaScript(`!![...document.querySelectorAll('[data-sidebar-right-guide-entry="changes"]')].filter(${visible}).length`)) await waitFor(()=>pick(['新标签页','New tab']),'Visible new-tab control missing');
 await waitFor(()=>win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('[data-sidebar-right-guide-entry="changes"]')].filter(${visible})[0];if(e)e.click();return !!e})()`),'Visible changes entry missing');
 console.log('PASS opened visible changes guide entry');
 await waitFor(()=>win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('[data-neiwang-changes]')].filter(${visible})[0];return !!e&&!e.querySelector('.nwchg-error')&&!e.innerText.includes('读取中')&&/第 \\d+ 轮/.test(e.innerText)})()`),'Changes view did not load persisted rounds',240);
 fs.writeFileSync(process.env.BROWSER_UI_OUTPUT.replace('.png','-changes.png'),(await win.webContents.capturePage()).toPNG());
 console.log('PASS visible changes pane loaded actual persisted rounds');
 if(!await pick(['设置','Settings'])){
  if(!await pick(['Account menu','账户菜单','账号菜单']))throw Error('Account menu missing');
  await waitFor(()=>pick(['设置','Settings','偏好设置','Preferences']),'Settings control missing');
 }
 await waitFor(()=>pick(['业务浏览器与接口']),'Browser settings section missing');
 await waitFor(()=>win.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify('已登记接口源：'+process.env.NEIWANG_EXPECTED_SOURCES)})&&document.body.innerText.includes('精简工具提示词')`),'Browser settings did not load source count',180);
 fs.writeFileSync(process.env.BROWSER_UI_OUTPUT,(await win.webContents.capturePage()).toPNG());
 console.log('PASS visible browser settings loaded actual source count');app.exit(0);
})().catch(fail);
