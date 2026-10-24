'use strict';
const {app,BrowserWindow,Menu,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const profile=process.env.NEIWANG_BROWSER_PROFILE;if(!profile||!path.isAbsolute(profile))throw Error('Browser profile missing');
fs.mkdirSync(profile,{recursive:true,mode:0o700});app.setPath('userData',profile);app.disableHardwareAcceleration();
app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');app.commandLine.appendSwitch('remote-debugging-port','0');
const home=pathToFileURL(path.join(__dirname,'home.html')).href;let main,quitting=false,flushed=false;
const allowed=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password||value==='about:blank'||value===home}catch{return false}};
function wire(win){win.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault()});win.webContents.setWindowOpenHandler(({url})=>allowed(url)?{action:'allow',overrideBrowserWindowOptions:{webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}}}:{action:'deny'});win.webContents.on('did-create-window',wire);}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{main?.show();main?.focus()});
 app.whenReady().then(async()=>{
  session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.defaultSession.cookies.on('changed',()=>{void session.defaultSession.cookies.flushStore()});
  main=new BrowserWindow({title:'内网小智 · 业务浏览器',width:1280,height:850,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});wire(main);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'业务浏览器',submenu:[{label:'打开网址',accelerator:'CmdOrCtrl+L',click:()=>main.loadURL(home)},{label:'后退',accelerator:'Alt+Left',click:()=>{const w=BrowserWindow.getFocusedWindow()||main;if(w.webContents.canGoBack())w.webContents.goBack()}},{label:'刷新',accelerator:'CmdOrCtrl+R',click:()=>main.webContents.reload()},{label:'关闭浏览器',click:()=>app.quit()}]}]));
  await main.loadURL(home);process.send?.({type:'ready'});
 });
 app.on('window-all-closed',()=>app.quit());app.on('before-quit',event=>{quitting=true;if(app.isReady()&&!flushed){event.preventDefault();session.defaultSession.flushStorageData();void session.defaultSession.cookies.flushStore().finally(()=>{flushed=true;app.quit()})}});
 process.on('message',m=>{if(m?.type==='quit'){quitting=true;app.quit()}});process.on('disconnect',()=>{if(!quitting)app.quit()});
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>app.quit());
}
