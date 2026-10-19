const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

test('Windows desktop keeps the shared UI and print forms, and local login/data work offline', async t => {
  const desktop = path.join(root, 'desktop');
  const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
  const main = fs.readFileSync(path.join(desktop, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(desktop, 'preload.js'), 'utf8');
  const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const printSource = fs.readFileSync(path.join(root, 'forms-addon.js'), 'utf8');
  const assetSyncSource = fs.readFileSync(path.join(desktop, 'scripts', 'sync-assets.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.equal(pkg.build.appId, 'iq.health.haboubi.procurement');
  const updateManifest = JSON.parse(fs.readFileSync(path.join(root, 'desktop-update.json'), 'utf8'));
  assert.equal(updateManifest.version, pkg.version, 'public update manifest must match the published installer version');
  assert.match(updateManifest.url, /downloads\/windows\/Haboubi-Procurement-Setup-1\.0\.6\.exe\?build=1\.0\.6-windows-print-dialog$/, 'installer URL must use a cache-busting version query');
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /https:\/\/medstock\.cinematicplus\.online\/downloads\/windows\/Haboubi-Procurement-Setup-1\.0\.6\.exe\?build=1\.0\.6-windows-print-dialog/, 'Settings should link to the new Windows installer and work from the desktop app too');
  assert.match(pkg.scripts['dist:win'], /electron-builder --win nsis --x64/);
  assert.match(main, /HABOUBI_DATA_DIR/);
  assert.match(main, /webContents\.print\(/, 'desktop must use Windows printer dialog');
  assert.match(main, /pageSize:'A4'/, 'Windows print shortcut must request A4 paper');
  assert.match(main, /desktop-update\.json/, 'desktop should check the public app-update manifest');
  assert.match(main, /تنزيل التحديث/, 'desktop should offer an update download when a newer installer is published');
  assert.match(main, /about:blank/, 'the existing print preview popup must work in Electron');
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  for (const asset of ['app.js','auth.js','styles.css','forms-addon.js','catalog-seed.js','drug-aliases.js']) {
    assert.ok(fs.existsSync(path.join(root, asset)), `shared source asset missing: ${asset}`);
  }
  assert.match(sourceHtml, /forms-addon\.js/);
  assert.match(assetSyncSource, /public-search\.html/,'desktop package should include the existing public-search page');
  assert.match(assetSyncSource, /public-search\.css/,'desktop package should include the existing public-search styles');
  assert.doesNotMatch(assetSyncSource, /data\/private/,'private production data must never be copied into the installer');
  assert.match(printSource, /window\.print\(\)/);
  assert.match(css, /@media print/);

  const port = await freePort();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'haboubi-desktop-test-'));
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    env: {...process.env, PORT:String(port), HABOUBI_DESKTOP:'1', HABOUBI_APP_ROOT:root,
      HABOUBI_DATA_DIR:path.join(temp,'private'), HABOUBI_CLOUD_URL:'http://127.0.0.1:1'},
    stdio:['ignore','pipe','pipe']
  });
  let output=''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
  const base = `http://127.0.0.1:${port}`;
  async function ready() {
    for (let i=0;i<100;i++) {
      if (child.exitCode !== null) throw new Error('local server exited: '+output);
      try { const r=await fetch(base+'/',{signal:AbortSignal.timeout(300)}); if(r.ok)return; } catch {}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error('local server did not start: '+output);
  }
  async function login(code) {
    const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,remember:true})});
    assert.equal(response.status,200);
    const cookie=(response.headers.get('set-cookie')||'').split(';')[0];
    assert.ok(cookie.startsWith('haboubi_session='));
    return cookie;
  }
  async function request(route,cookie,options={}) {
    return fetch(base+route,{...options,headers:{...(options.headers||{}),Cookie:cookie,'Content-Type':'application/json'}});
  }
  t.after(async()=>{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,1500)});fs.rmSync(temp,{recursive:true,force:true});});
  await ready();
  const user1=await login('1111');
  let response=await request('/api/data',user1);
  assert.equal(response.status,200);
  assert.equal((await response.json()).data,null);
  response=await request('/api/data',user1,{method:'PUT',body:JSON.stringify({baseUpdatedAt:0,data:{items:[{name:'Offline test material',code:'OFF-1'}],files:[],settings:{letterYear:'2026'}}})});
  assert.equal(response.status,200);
  response=await request('/api/data',user1);
  assert.equal((await response.json()).data.items[0].name,'Offline test material');
  response=await request('/api/history',user1,{method:'POST',body:JSON.stringify({kind:'تخويل',year:'2026',items:[{name:'Offline test material',code:'OFF-1',qty:'1'}]})});
  assert.equal(response.status,201);
  const user2=await login('2222');
  response=await request('/api/data',user2);
  assert.equal((await response.json()).data,null,'users must not see each other’s local data');
  response=await request('/api/history',user2);
  assert.deepEqual((await response.json()).items,[],'users must not see each other’s history');
  response=await request('/api/desktop-sync',user1,{method:'POST',body:JSON.stringify({code:'1111'})});
  assert.equal(response.status,503,'offline sync must fail safely while leaving local data usable');
  response=await request('/api/data',user1);
  assert.equal((await response.json()).data.items[0].name,'Offline test material','failed sync must not overwrite local data');
});
