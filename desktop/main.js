const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('node:path');
const net = require('node:net');

const PRODUCT_NAME = 'نظام مشتريات مستشفى الحبوبي';
let mainWindow;
let serverReady = false;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}
async function waitForServer(url, childServerReady) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(1000)});
      if (response.ok) return;
    } catch {}
    if (childServerReady()) await new Promise(resolve => setTimeout(resolve, 180));
    else await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('لم يبدأ الخادم المحلي خلال المهلة المحددة');
}

async function refreshCatalogOverrides(dataDir) {
  const dir = path.join(dataDir, 'catalog-overrides');
  let changed = false;
  await Promise.all(['catalog-seed.js', 'drug-aliases.js'].map(async name => {
    try {
      const response = await fetch('https://medstock.cinematicplus.online/' + name + '?desktop-start=' + Date.now(), {signal:AbortSignal.timeout(3000)});
      if (!response.ok) return;
      const bytes = Buffer.from(await response.arrayBuffer());
      const max = name === 'catalog-seed.js' ? 6*1024*1024 : 2*1024*1024;
      const text = bytes.toString('utf8');
      const valid = name === 'catalog-seed.js' ? text.includes('HABOUBI_DEFAULT_CATALOG') : text.includes('HABOUBI_DRUG_ALIASES');
      if (!valid || bytes.length > max) return;
      const target = path.join(dir, name);
      let identical = false;
      try { identical = require('node:crypto').timingSafeEqual(require('node:crypto').createHash('sha256').update(bytes).digest(), require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(target)).digest()); } catch {}
      if (identical) return;
      require('node:fs').mkdirSync(dir, {recursive:true, mode:0o700});
      const temp = target + '.tmp'; require('node:fs').writeFileSync(temp, bytes, {mode:0o600}); require('node:fs').renameSync(temp, target); changed = true;
    } catch {}
  }));
  return changed;
}

function compareVersions(left, right) {
  const a=String(left||'0').split('.').map(x=>Number.parseInt(x,10)||0), b=String(right||'0').split('.').map(x=>Number.parseInt(x,10)||0);
  for(let i=0;i<Math.max(a.length,b.length);i++){const diff=(a[i]||0)-(b[i]||0);if(diff)return diff;}
  return 0;
}
async function checkForAppUpdate() {
  try {
    const response=await fetch('https://medstock.cinematicplus.online/desktop-update.json?check='+Date.now(),{signal:AbortSignal.timeout(4000),cache:'no-store'});
    if(!response.ok)return;
    const update=await response.json();
    if(!/^\d+(?:\.\d+){1,3}$/.test(String(update.version||''))||compareVersions(update.version,app.getVersion())<=0)return;
    if(typeof update.url!=='string'||!update.url.startsWith('https://medstock.cinematicplus.online/downloads/windows/'))return;
    const choice=await dialog.showMessageBox(mainWindow,{type:'info',title:PRODUCT_NAME,message:'يتوفر تحديث جديد للنظام',detail:`الإصدار الحالي: ${app.getVersion()}\nالإصدار الجديد: ${update.version}\n${String(update.notes||'').slice(0,500)}`,buttons:['تنزيل التحديث','لاحقاً'],defaultId:0,cancelId:1,noLink:true});
    if(choice.response===0)shell.openExternal(update.url).catch(()=>{});
  } catch {}
}

async function createWindow() {
  const assets = app.isPackaged ? path.join(process.resourcesPath, 'app-assets') : path.join(__dirname, 'assets');
  const dataDir = path.join(app.getPath('userData'), 'data', 'private');
  require('node:fs').mkdirSync(dataDir, {recursive:true, mode:0o700});
  process.env.HABOUBI_CATALOG_UPDATED = await refreshCatalogOverrides(dataDir) ? '1' : '0';
  const port = await freePort();
  process.env.PORT = String(port);
  process.env.HABOUBI_DESKTOP = '1';
  process.env.HABOUBI_APP_ROOT = assets;
  process.env.HABOUBI_DATA_DIR = dataDir;
  process.env.HABOUBI_CLOUD_URL = 'https://medstock.cinematicplus.online';
  // The existing HTTP server is started in Electron's main process, so the same
  // web UI and API routes work offline without bundling production/private data.
  require(path.join(assets, 'server.js'));
  // Use localhost so Chromium treats the local origin as trustworthy for the existing Secure session cookie.
  const baseUrl = `http://localhost:${port}`;
  await waitForServer(baseUrl, () => true);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1050,
    minHeight: 720,
    show: false,
    title: PRODUCT_NAME,
    autoHideMenuBar: true,
    backgroundColor: '#f4f7f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    if (url === 'about:blank' || url.startsWith(baseUrl + '/') || url === baseUrl) {
      return {action: 'allow', overrideBrowserWindowOptions: {
        width: 1000, height: 900, autoHideMenuBar: true,
        webPreferences: {contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}
      }};
    }
    if (url.startsWith('https://') || url.startsWith('mailto:')) shell.openExternal(url).catch(()=>{});
    return {action:'deny'};
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(baseUrl)) {
      event.preventDefault();
      if (url.startsWith('https://') || url.startsWith('mailto:')) shell.openExternal(url).catch(()=>{});
    }
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) console.error('App page failed to load', {code, description, url});
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === 'p') {
      event.preventDefault();
      mainWindow.webContents.print({silent:false, printBackground:true, color:true, pageSize:'A4', margins:{marginType:'default'}}, (success, failureReason) => {
        if (!success && failureReason) console.error('Print failed:', failureReason);
      });
    }
  });
  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.maximize(); checkForAppUpdate(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(baseUrl);
  serverReady = true;
}

app.setName(PRODUCT_NAME);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(showStartupError); });
function showStartupError(error) {
  console.error(error);
  dialog.showErrorBox(PRODUCT_NAME, 'تعذر تشغيل النظام المحلي. لم تُحذف أي بيانات.\n\n' + String(error?.message || error));
  app.quit();
}
app.whenReady().then(() => createWindow().catch(showStartupError));
