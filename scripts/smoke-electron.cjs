// Run with the built Electron executable in a graphical session (or xvfb-run).
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'neiwang-ui-smoke-'));app.setPath('userData',fixture);
app.disableHardwareAcceleration();
const timer=setTimeout(()=>{console.error('Electron sandboxed renderer smoke timed out');app.exit(1);},120000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
 await win.loadURL('data:text/html,'+encodeURIComponent('<!doctype html><html><head><title>Neiwang smoke</title></head><body>APP_RENDER_OK</body></html>'));
 assert.equal(await win.webContents.executeJavaScript('document.body.textContent'),'APP_RENDER_OK');
 console.log('PASS: hidden Electron window and sandboxed renderer initialized');clearTimeout(timer);app.exit(0);
}).catch(error=>{console.error('Electron GUI/sandbox initialization failed: '+error.message);clearTimeout(timer);app.exit(1);});
