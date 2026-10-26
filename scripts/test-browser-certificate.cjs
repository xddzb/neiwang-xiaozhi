'use strict';
// Real Electron smoke test against a synthetic, self-signed loopback HTTPS service.
const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const assert=require('node:assert/strict');
const timer=setTimeout(()=>{console.error('Browser TLS fixture timed out');app.exit(1)},20000);
require(path.resolve(__dirname,'../extensions/@neiwang/browser-automation/browser-main.cjs'));
app.whenReady().then(async()=>{
  let win;
  for(let n=0;n<100;n++){
    win=BrowserWindow.getAllWindows()[0];
    if(win&&!win.webContents.isLoading()&&win.webContents.getURL().startsWith('file:'))break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert(win,'Business browser was not created');
  const preferences=win.webContents.getLastWebPreferences();
  assert.equal(preferences.sandbox,true);
  assert.equal(preferences.contextIsolation,true);
  assert.equal(preferences.nodeIntegration,false);
  assert.equal(preferences.webSecurity,true);
  await win.loadURL(process.env.NEIWANG_TEST_HTTPS_URL);
  assert.match(await win.webContents.executeJavaScript('document.body.innerText'),/SYNTHETIC_TLS_OK/);
  clearTimeout(timer);console.log('PASS: real business browser accepts self-signed HTTPS; sandbox settings preserved');app.exit(0);
}).catch(error=>{clearTimeout(timer);console.error(error.message);app.exit(1)});
