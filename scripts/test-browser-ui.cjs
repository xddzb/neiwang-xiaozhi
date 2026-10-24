const fs=require('node:fs'),path=require('node:path');
process.on('uncaughtException',fail);
const {app,BrowserWindow,Menu}=require('electron');
app.disableHardwareAcceleration();
require(path.join(process.env.NEIWANG_APP_ROOT,'launcher/shell/main.js'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fail(error){fs.writeFileSync(process.env.BROWSER_UI_OUTPUT+'.error.txt',String(error.stack||error));console.error(error);app.exit(1)}
async function click(win,labels,selector='button'){
 return win.webContents.executeJavaScript(`(()=>{const labels=${JSON.stringify(labels)},list=[...document.querySelectorAll(${JSON.stringify(selector)})];if(labels.includes('更多'))list.reverse();const b=list.find(e=>labels.includes((e.innerText||'').trim())||labels.includes(e.getAttribute('aria-label')));if(b)b.click();return !!b})()`);
}
(async()=>{
 await app.whenReady();let win,ready=false;
 for(let i=0;i<100;i++){
  win=BrowserWindow.getAllWindows()[0];
  if(win){ready=await win.webContents.executeJavaScript(`!!document.querySelector('[data-dsh-better-sidebar]') || !![...document.querySelectorAll('button')].find(e=>['设置','Settings'].includes(e.getAttribute('aria-label')))`);if(ready)break}
  await delay(1000);
 }
 if(!ready)throw Error('Main UI not ready');
 if(Menu.getApplicationMenu()!==null)throw Error('Edit menu returned');
 const home=await win.webContents.executeJavaScript(`({text:document.body.innerText,sidebar:!!document.querySelector('[data-dsh-better-sidebar]'),title:document.title})`);
 if(!home.text.includes('你说我做')||home.text.includes('预览版')||home.title!=='内网小智')throw Error('Home branding mismatch');
 if(process.env.NEIWANG_EXPECT_SIDEBAR==='1'&&(!home.sidebar||home.text.includes('PDF解析大师')))throw Error('Sidebar/parser mismatch');
 fs.writeFileSync(process.env.BROWSER_UI_OUTPUT.replace('.png','-home.png'),(await win.webContents.capturePage()).toPNG());
 if(!await click(win,['设置','Settings'])){
  if(!await click(win,['更多','More']))throw Error('More menu missing');
  await delay(500);
  if(!await click(win,['设置','Settings','偏好设置','Preferences'],'*'))throw Error('Settings menu missing: '+await win.webContents.executeJavaScript('document.body.innerText.slice(-1800)'));
 }
 await delay(1000);
 if(!await click(win,['业务浏览器与接口']))throw Error('Browser settings entry missing');
 await delay(1500);
 const text=await win.webContents.executeJavaScript('document.body.innerText');
 if(!text.includes('已登记接口源：'+(process.env.NEIWANG_EXPECTED_SOURCES||15))||!text.includes('精简工具提示词'))throw Error('Browser configuration UI mismatch');
 fs.writeFileSync(process.env.BROWSER_UI_OUTPUT,(await win.webContents.capturePage()).toPNG());
 console.log('PASS actual homepage branding, sidebar, no Edit/preview badge, browser configuration and source count');
 app.exit(0);
})().catch(fail);
