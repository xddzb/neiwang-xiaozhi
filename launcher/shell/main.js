// DeepSeek Harness 桌面壳
// 开一个独立窗口加载本地 dsh 服务，自带 Electron 的 Chromium 内核，
// 不依赖系统浏览器。
const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const ragPolicy=require('./rag-policy.cjs');
const fullFeatures=JSON.parse(fs.readFileSync(path.join(process.env.NEIWANG_APP_ROOT,"config/app.json"),"utf8")).bundles.includes("@deepseek-ai/neiwang-business");
const deploymentBrand=JSON.parse(fs.readFileSync(path.join(process.env.NEIWANG_APP_ROOT,'config/brand.json'),'utf8'));
const desktopData=path.join(process.env.NEIWANG_DATA_DIR||path.join(process.env.NEIWANG_APP_ROOT,'data'),'desktop');
fs.mkdirSync(desktopData,{recursive:true});
app.setPath('userData',desktopData);

if(process.platform==='win32')app.setAppUserModelId(deploymentBrand.appId);
let mainWindow;
function trustedRag(event){return mainWindow && event.sender===mainWindow.webContents && event.senderFrame===mainWindow.webContents.mainFrame && new URL(event.senderFrame.url).origin===new URL(DSH_URL).origin;}
ipcMain.handle('neiwang-rag-state',event=>fullFeatures&&trustedRag(event)?ragPolicy.read():null);
ipcMain.handle('neiwang-rag-set',(event,value)=>{if(!fullFeatures||!trustedRag(event)||typeof value!=='boolean')throw Error('Denied');return ragPolicy.write(value);});
function log(event) { try { fs.appendFileSync(path.join(__dirname, '../../data/window-status.log'), new Date().toISOString()+' '+event+'\n'); } catch {} }

const DSH_URL = process.env.DSH_URL || 'http://127.0.0.1:3080/';

function createWindow() {
  const win = new BrowserWindow({
    useContentSize: true,
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: deploymentBrand.name,
    icon: path.join(__dirname,'assets/cgn-egret.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:neiwang-desktop',
      preload: path.join(__dirname,'rag-control-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = win;
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  const localOrigin = new URL(DSH_URL).origin;
  let reconnecting = false, lastReconnect = 0;
  async function reconnect() {
    if(reconnecting || Date.now()-lastReconnect<30000 || win.isDestroyed())return;
    reconnecting=true;lastReconnect=Date.now();
    let restored=false;
    try {
      // Exchange the process launch token for a fresh cookie in this window's session.
      // Never replay the failed POST, expose the token, or touch business-site cookies.
      const response=await win.webContents.session.fetch(DSH_URL,{credentials:'include',cache:'no-store'});
      restored=response.ok;await response.arrayBuffer();
    } catch {}
    reconnecting=false;
    log(restored?'local-auth-renewed':'local-auth-renew-failed');
    if(!win.isDestroyed())dialog.showMessageBox(win,{type:restored?'info':'warning',title:'本机连接',message:restored?'已重新连接本机后台，请再次点击刷新或重试。':'本机连接未恢复，请完全退出内网小智后重新打开。',detail:'没有自动重发操作，也没有清除聊天记录。'});
  }
  win.webContents.session.webRequest.onCompleted({urls:[localOrigin+'/*']},details=>{
    if(details.statusCode===401 && new URL(details.url).origin===localOrigin)void reconnect();
  });
  win.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown'&&input.control&&input.shift&&input.key.toLowerCase()==='r'){event.preventDefault();void reconnect();}
  });
  win.center();
  win.show();
  win.focus();
  log('window-created visible='+win.isVisible());
  win.once('ready-to-show', () => {win.show(); win.focus(); log('ready-to-show');});
  win.webContents.on('did-finish-load', () => log('page-loaded'));
  win.webContents.on('did-fail-load', (_event, code) => log('page-load-failed code='+code));
  win.webContents.on('render-process-gone', (_event, details) => log('renderer-exit reason='+details.reason));
  win.webContents.on('page-title-updated', event => {event.preventDefault(); win.setTitle(deploymentBrand.name);});
  win.loadURL(DSH_URL).catch(() => log('loadURL-rejected'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {mainWindow=null; app.quit();});
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
