const {app,BrowserWindow,Menu}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('lang','zh-CN');
require(path.join(process.env.NEIWANG_APP_ROOT,'launcher/shell/main.js'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await app.whenReady();let win,text='';for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows()[0];if(win){text=await win.webContents.executeJavaScript('document.body.innerText');if(text.includes('你说我做，随时待命'))break;}await pause(1000);}
if(!text.includes('你说我做，随时待命'))throw Error('Updated homepage headline missing: '+text.slice(0,1200));
if(!text.includes('自动化任务'))throw Error('Automation task navigation missing');
if(Menu.getApplicationMenu()!==null)throw Error('Edit menu returned');
await win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>['设置','Settings'].includes(e.getAttribute('aria-label'))||['设置','Settings'].includes(e.innerText.trim()));if(!e)throw Error('Settings missing');e.click()})()`);await pause(1800);
text=await win.webContents.executeJavaScript('document.body.innerText');
for(const label of ['技能孵化器','PDF解析大师','钉钉机器人','钉钉AI表格'])if(!text.includes(label))throw Error('Missing '+label);
await win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='技能孵化器');if(!e)throw Error('Incubator navigation missing');e.click()})()`);await pause(800);
fs.writeFileSync(process.env.R113_UI_OUTPUT,(await win.webContents.capturePage()).toPNG());
await win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='PDF解析大师');if(!e)throw Error('PDF settings missing');e.click()})()`);await pause(1500);
text=await win.webContents.executeJavaScript('document.body.innerText');if(!text.includes('本地离线 OCR'))throw Error('Local-only PDF OCR settings missing');
console.log('PASS ARM64 UI headline, task navigation, skill/PDF panels, DingTalk/table settings, no edit menu');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
