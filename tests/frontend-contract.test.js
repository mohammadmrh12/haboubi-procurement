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
assert.match(app, /formName:\s*clean\(\$\("#formItemName"\)\.value\)\s*\|\|\s*item\.permanentName\s*\|\|\s*item\.name/, 'form name should default to persistent override when set');
assert.match(app, /esc\(x\.formName\s*\|\|\s*x\.name\)/, 'document item list should use shortened name when present');
assert.match(forms, /const items=\(\)=>.*name:\(c\[0\]\?\.querySelector\('\.doc-name-text'\)/, 'print packet should read the displayed material name from the document table');
assert.match(app, /data-edit-name/, 'document item list should expose a dedicated edit button');
assert.match(html, /id=\"editNameDialog\"/, 'print name editing should use a popup dialog');
assert.match(html, /id=\"savePermanentName\"/, 'popup should support per-user permanent name changes');
assert.match(html, /id=\"restoreOriginalName\"/, 'popup should support restoring original name');
assert.match(app, /bundled\.permanentName = item\.permanentName/, 'per-user name overrides should survive merging the bundled catalog');
assert.match(app, /data-edit-permanent/, 'search results should expose name editing');
assert.match(forms, /cols\.map\(k=>.*x\[k\]/, 'print tables should render fields from each document item');
assert.match(html, /app\.js\?v=\d+/, 'app asset should have an explicit cache version');
assert.match(html, /forms-addon\.js\?v=\d+/, 'forms asset should have an explicit cache version');
assert.equal(androidApp, app, 'Android app.js must match canonical app.js');
assert.equal(androidForms, forms, 'Android forms-addon.js must match canonical forms-addon.js');
assert.match(sw, /haboubi-procurement-v67/, 'service-worker cache must be versioned');
for (const asset of ['styles.css?v=64', 'app.js?v=57', 'forms-addon.js?v=50', 'catalog-seed.js?v=30', 'auth.js?v=5']) {
  assert.ok(sw.includes('./' + asset), `offline precache must include the exact versioned URL ${asset}`);
}
console.log('PASS: shortened item names, print payload, versioned offline precache, and shared Android JS parity.');

assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /<textarea id="editMaterialName"/, "long material names should use a multiline editor");

assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /textContent='تعديل'/, "history has an edit action");
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /textContent='طباعة'/, "history has a print action");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /haboubiLoadHistoryForEdit/, "history edit should load items into print page");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-edit-qty/, "print table should provide quantity editing below quantity");

assert.match(fs.readFileSync(path.join(root, "forms-addon.js"), "utf8"), /c\[2\]\?\.querySelector\('span'\)/, "print forms should extract only quantity and never the edit button label");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-add-direct/, "search results should allow direct addition to print page");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-add-direct=\"\' \+ item\.id \+ \'\">إضافة مباشرة للطباعة/, "search result should visibly render the direct-to-print button");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /أضيفت المادة إلى قائمة الطباعة/, "direct add should not force navigation to print view");
assert.match(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /direct-add-btn\{flex:0 0 100%/, "direct add should be a full-width bottom action");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-edit-name=\"\' \+ i \+ \'\">تعديل الاسم/, "print item edit button should say edit name");

assert.match(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /quantity-value\{display:block/, "quantity number should retain normal top position");
assert.match(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /doc-qty-edit-btn\{position:absolute;bottom:12px/, "quantity edit button should be anchored at cell bottom");
