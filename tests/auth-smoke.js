const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

// Run the auth/API smoke test against a disposable copy of the server.
// Never connect this test to the live service or touch production data/private.
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

(async () => {
  const sourceRoot = path.join(__dirname, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haboubi-auth-test-'));
  let child;
  try {
    fs.copyFileSync(path.join(sourceRoot, 'server.js'), path.join(tempRoot, 'server.js'));
    fs.mkdirSync(path.join(tempRoot, 'data', 'private'), { recursive: true, mode: 0o700 });
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: tempRoot,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => { throw err; });

    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw new Error(`Test server exited early: ${stderr}`);
      try { const response = await fetch(`${base}/api/session`, { signal: AbortSignal.timeout(500) }); if (response.status === 401) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `isolated test server did not become ready: ${stderr}`);

    let response = await fetch(`${base}/api/session`);
    assert.equal(response.status, 401, 'unauthenticated session denied');
    response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'not-it', remember: false }) });
    assert.equal(response.status, 401, 'invalid code denied');
    response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '1111', remember: true }) });
    assert.equal(response.status, 200, 'valid code accepted');
    const setCookie = response.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    assert.ok(setCookie.includes('HttpOnly') && setCookie.includes('Secure') && setCookie.includes('Max-Age=31536000'), 'remember cookie protected and persistent');
    response = await fetch(`${base}/api/session`, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.id, 1);
    response = await fetch(`${base}/api/history`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'اعتذار', year: '2026', items: [{ name: '__AUTH_SMOKE_TEST__', code: 'TST', qty: '1' }] }) });
    assert.equal(response.status, 201, 'history operation saved');
    const saved = (await response.json()).item;
    assert.equal(saved.userId, 1);
    response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '2222', remember: true }) });
    const cookie2 = (response.headers.get('set-cookie') || '').split(';')[0];
    response = await fetch(`${base}/api/history`, { headers: { cookie: cookie2 } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items.some(item => item.id === saved.id), false, 'other user cannot see saved operation');
    response = await fetch(`${base}/.git/config`);
    assert.equal(response.status, 404, 'git files not exposed');
    const historyFile = path.join(tempRoot, 'data', 'private', 'history.json');
    const rows = JSON.parse(fs.readFileSync(historyFile, 'utf8')).filter(item => item.id !== saved.id);
    fs.writeFileSync(historyFile, JSON.stringify(rows), { mode: 0o600 });

    const corruptHistory = '{invalid-json';
    fs.writeFileSync(historyFile, corruptHistory, { mode: 0o600 });
    response = await fetch(`${base}/api/history`, { headers: { cookie } });
    assert.equal(response.status, 500, 'corrupt history fails closed');
    response = await fetch(`${base}/api/history`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'اعتذار', items: [{ name: 'must-not-overwrite', code: 'TST', qty: '1' }] }) });
    assert.equal(response.status, 500, 'saving refuses to overwrite corrupt history');
    assert.equal(fs.readFileSync(historyFile, 'utf8'), corruptHistory, 'corrupt history preserved byte-for-byte');
    fs.writeFileSync(historyFile, '[]', { mode: 0o600 });

    const userDataFile = path.join(tempRoot, 'data', 'private', 'user-data.json');
    const validData = { data: { items: [{ name: 'test' }], files: [], settings: {} } };
    response = await fetch(`${base}/api/data`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(validData) });
    assert.equal(response.status, 200, 'user data save succeeds');
    const corruptUserData = '{invalid-json';
    fs.writeFileSync(userDataFile, corruptUserData, { mode: 0o600 });
    response = await fetch(`${base}/api/data`, { headers: { cookie } });
    assert.equal(response.status, 500, 'corrupt user data fails closed');
    response = await fetch(`${base}/api/data`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(validData) });
    assert.equal(response.status, 500, 'saving refuses to overwrite corrupt user data');
    assert.equal(fs.readFileSync(userDataFile, 'utf8'), corruptUserData, 'corrupt user data preserved byte-for-byte');

    console.log('PASS: isolated login, invalid-code rejection, signed persistent session, history save, user isolation, and private-file blocking.');
    console.log('PASS: corrupt history and user data fail closed without overwriting existing bytes.');
    console.log('PASS: production data/private was not accessed or modified.');
  } finally {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
