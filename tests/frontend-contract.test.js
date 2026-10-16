const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const forms = fs.readFileSync(path.join(root, 'forms-addon.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const androidApp = fs.readFileSync(path.join(root, 'android-app/app/src/main/assets/www/app.js'), 'utf8');
const androidForms = fs.readFileSync(path.join(root, 'android-app/app/src/main/assets/www/forms-addon.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(app, /id="formItemName"/, 'item details should expose an editable form name');
assert.match(app, /formName:\s*clean\(\$\("#formItemName"\)\.value\)\s*\|\|\s*item\.name/, 'form name should default to original name');
assert.match(app, /esc\(x\.formName\s*\|\|\s*x\.name\)/, 'document item list should use shortened name when present');
assert.match(forms, /const items=\(\)=>.*doc-name-edit.*name:\(edit\?\.value/, 'print packet should read the edited material name from the document table');
assert.match(forms, /cols\.map\(k=>.*x\[k\]/, 'print tables should render fields from each document item');
assert.match(html, /app\.js\?v=\d+/, 'app asset should have an explicit cache version');
assert.match(html, /forms-addon\.js\?v=\d+/, 'forms asset should have an explicit cache version');
assert.equal(androidApp, app, 'Android app.js must match canonical app.js');
assert.equal(androidForms, forms, 'Android forms-addon.js must match canonical forms-addon.js');
assert.match(sw, /haboubi-procurement-v43/, 'service-worker cache must be versioned');
for (const asset of ['styles.css?v=47', 'app.js?v=47', 'forms-addon.js?v=44', 'catalog-seed.js?v=30', 'auth.js?v=2']) {
  assert.ok(sw.includes('./' + asset), `offline precache must include the exact versioned URL ${asset}`);
}
console.log('PASS: shortened item names, print payload, versioned offline precache, and shared Android JS parity.');
