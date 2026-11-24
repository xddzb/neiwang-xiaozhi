const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('businessBrowser',{action:(name,value)=>ipcRenderer.invoke('browser-action',name,value),onState:callback=>ipcRenderer.on('browser-state',(_event,state)=>callback(state)),onFocus:callback=>ipcRenderer.on('browser-focus-address',()=>callback())});
