const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('haboubiDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  appVersion: '1.0.0',
  catalogueUpdated: process.env.HABOUBI_CATALOG_UPDATED === '1'
}));
