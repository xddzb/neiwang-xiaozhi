const {app,BrowserWindow,Menu}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('lang','zh-CN');
require(path.join(process.env.NEIWANG_APP_ROOT,'launcher/shell/main.js'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await app.whenReady();await pause(1500);const win=BrowserWindow.getAllWindows()[0];if(!win)throw Error('No native window');
 const font=require('node:child_process').execFileSync('fc-match',['--format','%{family}',':charset=4e2d'],{encoding:'utf8'});if(!font.includes('Noto Sans CJK'))throw Error('Bundled Chinese UI font not selected: '+font);
 let ready=false;for(let i=0;i<90;i++){ready=await win.webContents.executeJavaScript('Boolean(document.querySelector(\'img[alt="中广核白鹭"]\'))');if(ready)break;await pause(1000);}if(!ready)throw Error('Brand UI missing');
 if(Menu.getApplicationMenu().items.map(x=>x.label).join(',')!=='编辑')throw Error('Unexpected menu');
 for(let i=0;i<60;i++){const clicked=await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>['设置','Settings'].includes(e.getAttribute('aria-label'))||['设置','Settings'].includes(e.innerText.trim()));if(!b)return false;b.click();return true;})()`);if(clicked)break;await pause(500);}
 await pause(1500);const full=process.env.TEST_MODULAR_FULL==='1';let text=await win.webContents.executeJavaScript('document.body.innerText');
 if(full){if(!text.includes('钉钉机器人')||!text.includes('钉钉AI表格'))throw Error('Optional settings missing');
 await win.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='钉钉AI表格');if(!e)throw Error('Missing AI table button');e.click()})()`);await pause(2000);
 }else if(text.includes('钉钉机器人')||text.includes('钉钉AI表格'))throw Error('Optional settings present before installation');
 const png=await win.webContents.capturePage();fs.writeFileSync(path.resolve('outputs/R10-ARM64-'+(full?'full':'core')+'.png'),png.toPNG());console.log('PASS ARM64 desktop, brand, native menu and optional settings');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
