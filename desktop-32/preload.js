const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('haboubiDesktop', Object.freeze({isDesktop:true,platform:process.platform,appVersion:'1.0.3',printCurrent:()=>ipcRenderer.invoke('haboubi:print-current'),rememberCode:code=>ipcRenderer.invoke('haboubi:remember-code',code),getRememberedCode:()=>ipcRenderer.invoke('haboubi:get-remembered-code')}));
