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
assert.match(html, /app\.js\?v=62/, 'app asset should have an explicit cache version');
assert.match(html, /forms-addon\.js\?v=\d+/, 'forms asset should have an explicit cache version');

assert.match(html, /styles\.css\?v=70/, 'updated input zoom CSS should be cache-busted');
assert.match(html, /الإصدار 1\.3\.5/, 'website download label should match the published APK version');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /official-page:last-child[\s\S]*?page-break-after: auto !important/, 'last official page must not force a trailing blank print page');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /input:not\(\[type=\"checkbox\"\]\):not\(\[type=\"radio\"\]\), textarea, select\s*\{\s*font-size: max\(16px, 1em\)/, 'all text-entry controls should avoid iOS focus zoom');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /!sessionStorage\.getItem\(marker\) \|\| localOwner!==String\(user\.id\)/, 'switching accounts must refresh local data even when a tab marker exists');
assert.match(fs.readFileSync(path.join(root, 'android-app/app/src/main/assets/www/local-updates.js'), 'utf8'), /const APP_VERSION='1\.3\.5'/, 'in-app updater version must match the installed app version');

assert.equal(androidApp, app, 'Android app.js must match canonical app.js');
assert.equal(androidForms, forms, 'Android forms-addon.js must match canonical forms-addon.js');
assert.match(sw, /haboubi-procurement-v78/, 'service-worker cache must be versioned');
for (const asset of ['styles.css?v=70', 'app.js?v=62', 'forms-addon.js?v=51', 'catalog-seed.js?v=30', 'auth.js?v=10']) {
  assert.ok(sw.includes('./' + asset), `offline precache must include the exact versioned URL ${asset}`);
}
console.log('PASS: shortened item names, print payload, versioned offline precache, and shared Android JS parity.');

assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /<textarea id="editMaterialName"/, "long material names should use a multiline editor");

assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /textContent='تعديل'/, "history has an edit action");
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /textContent='طباعة'/, "history has a print action");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /haboubiLoadHistoryForEdit/, "history edit should load items into print page");

assert.match(fs.readFileSync(path.join(root, "forms-addon.js"), "utf8"), /c\[2\]\?\.querySelector\('span'\)/, "print forms should extract only quantity and never the edit button label");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-add-direct/, "search results should allow direct addition to print page");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-add-direct=\"\' \+ item\.id \+ \'\">إضافة مباشرة للطباعة/, "search result should visibly render the direct-to-print button");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /أضيفت المادة إلى قائمة الطباعة/, "direct add should not force navigation to print view");
assert.match(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /direct-add-btn\{flex:0 0 100%/, "direct add should be a full-width bottom action");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-edit-name=\"\' \+ i \+ \'\">تعديل الاسم/, "print item edit button should say edit name");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-edit-qty/, "quantity editing remains available on the print-items form");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /data-qty-restore/, "quantity editor should offer restore-to-need action");
assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /<select id="letterYear"/, "document year should use a scrollable select");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /settings\.letterYear = \$\("#letterYear"\)\.value/, "selected year should persist in per-user settings");
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /<select name="year"/, "history editor year should use a scrollable select");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /item\.requested=expected;item\.aboveOfficialNeed=false/, "restore-to-need action should set quantity to calculated need");
assert.match(fs.readFileSync(path.join(root, "forms-addon.js"), "utf8"), /querySelector\('.quantity-value'\)\?\.textContent/, "printed quantity must exclude the quantity-edit button label");

assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /qty:item\.requested\?\?item\.qty/, "history save must persist requested quantities");
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /zeroItems\.length&&!confirm/, "history editor must confirm before saving zero quantities");
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /هذه العملية تحتوي .*مادة محفوظة بكمية صفر/, "history editor must warn when a saved operation already contains zero quantities");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /saved\.qty\?\?saved\.requested/, "history edit must restore saved quantity field");
