'use strict';
const {app,BrowserWindow,WebContentsView,Menu,session,ipcMain,clipboard}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const profile=process.env.NEIWANG_BROWSER_PROFILE;if(!profile||!path.isAbsolute(profile))throw Error('Browser profile missing');
fs.mkdirSync(profile,{recursive:true,mode:0o700});app.setPath('userData',profile);app.disableHardwareAcceleration();
// Certificate exception is limited to the configured, read-only ISU origin.
app.on('certificate-error',(event,_contents,url,_error,_certificate,callback)=>{
 event.preventDefault();void import('./isu-session.mjs').then(async({IsuSession})=>{const c=await new IsuSession(process.env.NEIWANG_APP_ROOT).config();callback(c.verify_tls===false&&new URL(url).origin===c.origin)}).catch(()=>callback(false));
});
app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');app.commandLine.appendSwitch('remote-debugging-port','0');
const home=pathToFileURL(path.join(__dirname,'home.html')).href,toolbar=pathToFileURL(path.join(__dirname,'browser-toolbar.html')).href;
const prefs={sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true};
let main,active,quitting=false,flushed=false;const tabs=[];
const allowed=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password||value==='about:blank'||value===home}catch{return false}};
const current=()=>tabs.find(t=>t.id===active);
function publish(){if(!main||main.isDestroyed())return;const t=current();main.webContents.send('browser-state',{active,tabs:tabs.map(t=>({id:t.id,title:t.view.webContents.getTitle()||'新页面',url:t.view.webContents.getURL()})),url:t?.view.webContents.getURL()||'',devtools:inspectorWindows.has(t?.id)});}
function layout(){if(!main||main.isDestroyed())return;const [width,height]=main.getContentSize();for(const t of tabs){t.view.setBounds({x:0,y:92,width,height:Math.max(1,height-92)});t.view.setVisible(t.id===active)}}
function select(id){if(!tabs.some(t=>t.id===id))return;active=id;layout();current()?.view.webContents.focus();publish()}
const inspectorWindows=new Map();
async function devtools(){const c=current()?.view.webContents;if(!c)return;const existing=inspectorWindows.get(c.id);if(existing&&!existing.isDestroyed()){existing.close();return}
 const win=new BrowserWindow({title:'业务页面 · 开发者工具',width:1100,height:760,webPreferences:prefs});inspectorWindows.set(c.id,win);win.setMenu(null);
 win.on('closed',()=>{inspectorWindows.delete(c.id);publish()});c.once('destroyed',()=>{if(!win.isDestroyed())win.close()});publish();
 try{
  const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];if(!/^\d+$/.test(port))throw Error('Invalid local debug port');
  c.debugger.attach('1.3');let target;try{target=(await c.debugger.sendCommand('Target.getTargetInfo')).targetInfo.targetId}finally{if(!c.isDestroyed()&&c.debugger.isAttached())c.debugger.detach()}
  if(!win.isDestroyed())await win.loadURL('http://127.0.0.1:'+port+'/devtools/inspector.html?ws=127.0.0.1:'+port+'/devtools/page/'+encodeURIComponent(target));
 }catch{if(!win.isDestroyed())win.close()}
}
function address(){main?.webContents.focus();main?.webContents.send('browser-focus-address')}
function createTab(url='about:blank'){
 if(!allowed(url)||quitting||!main||main.isDestroyed()||tabs.length>=20)return;
 const view=new WebContentsView({webPreferences:prefs}),c=view.webContents,t={id:c.id,view};tabs.push(t);main.contentView.addChildView(view);
 c.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault()});c.on('will-redirect',(e,url)=>{if(!allowed(url))e.preventDefault()});
 c.setWindowOpenHandler(({url})=>{if(allowed(url))setImmediate(()=>createTab(url));return {action:'deny'}});

 for(const event of ['did-navigate','did-navigate-in-page','page-title-updated','did-stop-loading','devtools-opened','devtools-closed'])c.on(event,publish);
 c.on('destroyed',()=>{if(main&&!main.isDestroyed())main.contentView.removeChildView(view);const i=tabs.indexOf(t);if(i>=0)tabs.splice(i,1);if(!quitting&&main&&!main.isDestroyed()){if(!tabs.length)createTab(home);else select(tabs.at(-1).id)}});
 select(t.id);void c.loadURL(url).catch(()=>publish());return t;
}
function closeTab(id){const t=tabs.find(t=>t.id===id);if(t)t.view.webContents.close()}
ipcMain.handle('browser-action',(event,action,value)=>{
 if(!main||event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||event.sender.getURL()!==toolbar)throw Error('Forbidden browser action');
 const c=current()?.view.webContents;
 if(action==='state'){publish();return true}
 if(action==='new'){createTab(home);return true}
 if(action==='select'){select(value);return true}
 if(action==='close'){closeTab(value);return true}
 if(action==='navigate'){if(typeof value!=='string'||!allowed(value)||!/^https?:/.test(value))return false;void c?.loadURL(value).catch(()=>publish());return true}
 if(action==='back'&&c?.canGoBack())c.goBack();
 else if(action==='forward'&&c?.canGoForward())c.goForward();
 else if(action==='reload')c?.reload();
 else if(action==='devtools')devtools();
 else if(action==='copy')clipboard.writeText(c?.getURL()||'');
 return true;
});
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{main?.show();main?.focus()});
 app.whenReady().then(async()=>{
  session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.defaultSession.cookies.on('changed',()=>{void session.defaultSession.cookies.flushStore()});
  main=new BrowserWindow({title:'内网小智 · 业务浏览器',width:1280,height:850,minWidth:760,minHeight:480,webPreferences:{...prefs,preload:path.join(__dirname,'browser-toolbar-preload.cjs')}});
  main.webContents.on('will-navigate',e=>e.preventDefault());main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  main.on('resize',layout);main.on('closed',()=>{for(const t of [...tabs])if(!t.view.webContents.isDestroyed())t.view.webContents.close()});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'业务浏览器',submenu:[{label:'新建页面',accelerator:'CmdOrCtrl+T',click:()=>createTab(home)},{label:'地址栏',accelerator:'CmdOrCtrl+L',click:address},{label:'复制当前链接',click:()=>clipboard.writeText(current()?.view.webContents.getURL()||'')},{label:'刷新',accelerator:'CmdOrCtrl+R',click:()=>current()?.view.webContents.reload()},{label:'开发者工具',accelerator:'F12',click:devtools},{label:'开发者工具（备用快捷键）',accelerator:'CmdOrCtrl+Shift+I',click:devtools},{label:'关闭当前页面',accelerator:'CmdOrCtrl+W',click:()=>closeTab(active)},{label:'退出浏览器',click:()=>app.quit()}]}]));
  await main.loadURL(toolbar);createTab(home);process.send?.({type:'ready'});
 });
 app.on('window-all-closed',()=>app.quit());app.on('before-quit',event=>{quitting=true;if(app.isReady()&&!flushed){event.preventDefault();session.defaultSession.flushStorageData();void session.defaultSession.cookies.flushStore().finally(()=>{flushed=true;app.quit()})}});
 process.on('message',m=>{if(m?.type==='open-page'&&!quitting&&app.isReady())createTab('about:blank');if(m?.type==='quit'){quitting=true;app.quit()}});
 process.on('disconnect',()=>{if(!quitting)app.quit()});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>app.quit());
}
