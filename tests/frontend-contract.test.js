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
assert.match(forms, /const items=\(\)=>.*const label=c\[0\]\?\.querySelector\('\.doc-name-text'\)/, 'print packet should read the displayed material name from the document table');
assert.match(forms, /const printableName=value=>[\s\S]*?trim\(\)\};/, 'shared print path should remove Arabic annotations from printed names only');
{ const vm = require('node:vm'); const helper = forms.match(/const printableName=value=>[\s\S]*?trim\(\)\};/)[0]; const ctx={}; vm.createContext(ctx); vm.runInContext(helper+';this.clean=printableName;',ctx); const source='Amphotericin lipid complex 100mg vial قاعدة اقل الاسعار (05-C00-041) (05-C00-036)'; assert.equal(ctx.clean(source), 'Amphotericin lipid complex 100mg vial', 'printed material name should omit price-rule note and linked national-code annotations'); const salbutamol='Salbutamol Nebules 0.5% w/v 20ml لامانع من اعتماد المادة الفعالة بشكل sulphate or base'; assert.ok(!/[\u0600-\u06FF]/.test(ctx.clean(salbutamol)), 'printed material names must not contain Arabic committee annotations'); assert.ok(ctx.clean(salbutamol).includes('Salbutamol Nebules 0.5% w/v 20ml'), 'scientific name and dose must remain in print'); assert.ok(source.includes('قاعدة اقل الاسعار'), 'source/database value must remain unchanged'); assert.equal(ctx.clean('مشرط جراحي'), 'مشرط جراحي', 'Arabic-only scientific/material names should remain printable'); }
assert.match(app, /function printableMaterialName\(value\)[\s\S]*?return text\.replace/, 'legacy print path should remove Arabic annotations from printed names only');
assert.match(forms, /قاعدة\\s\*\[اأ\]\?قل\\s\*الأسعار/, 'price-rule label should be removed from printed material names');

{
  const vm = require('node:vm');
  const start = app.indexOf('// Review metadata is derived at runtime');
  const end = app.indexOf('function search() {', start);
  assert.ok(start >= 0 && end > start, 'review grouping helpers should exist');
  const source = app.slice(start, end);
  const ctx = { state: { items: [] }, norm: value => String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const zero = {id:1,name:'Amphotericin lipid complex 100mg vial قاعدة اقل الاسعار (05-C00-041)',annual:0,kind:'drug',unit:'vial',dose:'100 mg'};
  const positive = {id:2,name:'Amphotericin lipid complex 100mg vial',annual:12,kind:'drug',unit:'vial',dose:'100 mg'};
  ctx.state.items = [zero, positive];
  assert.equal(ctx.preferredNeedRecord(zero).id, 2, 'same-spec duplicate should prefer positive need over a zero-need first record');
  assert.match(ctx.reviewAlertText(zero), /لم تُجمع الاحتياجات/, 'duplicate alert must explicitly state needs are not summed');
  assert.equal(zero.annual, 0); assert.equal(positive.annual, 12, 'original annual needs must remain unchanged');
  const different = {...positive, id:3, name:'Amphotericin lipid complex 50mg vial', dose:'50 mg', annual:5};
  ctx.state.items = [positive, different];
  assert.match(ctx.reviewAlertText(positive), /لا تُدمج تلقائياً/, 'different strength/specification must remain for review');
  assert.equal(ctx.preferredNeedRecord(positive).id, 2, 'different specification must not be merged or selected as an equivalent');
}

assert.match(app, /function needRecordsSummary\(item\)/, 'search results should show distinct need values and source rows without summing them');
assert.match(app, /\"سفيترايكزون\":\"ceftriaxone\"/, 'common Iraqi Arabic misspelling should translate to ceftriaxone');
assert.match(app, /needOnly: true/, 'continuation rows with merged name/code cells should preserve separate needs');
assert.match(app, /data-edit-name/, 'document item list should expose a dedicated edit button');
assert.match(html, /id=\"editNameDialog\"/, 'print name editing should use a popup dialog');
assert.match(html, /id=\"savePermanentName\"/, 'popup should support per-user permanent name changes');
assert.match(html, /id=\"restoreOriginalName\"/, 'popup should support restoring original name');
assert.match(app, /bundled\.permanentName = item\.permanentName/, 'per-user name overrides should survive merging the bundled catalog');
assert.match(app, /savedNeed > 0 && \(!Number\.isFinite\(bundledNeed\) \|\| bundledNeed <= 0\)/, 'a positive saved need for an exact code/name must not be discarded by a bundled zero/blank need');
assert.match(app, /const item = preferredNeedRecord\(sourceItem\)/, 'search should resolve each exact duplicate group to its preferred need record');
assert.match(app, /const candidates = new Map\(\)/, 'search should collapse exact same-code/same-spec duplicates without summing their needs');
assert.match(app, /function buildReviewIndex\(\)[\s\S]*?const specs = cores\.get\(core\)/, 'search review grouping should build a linear-time index instead of rescanning all items per result');
assert.match(app, /buildReviewIndex\(\);\s*const translatedTerms/, 'search should build its review index once before ranking candidates');
assert.match(app, /searchDebounceTimer = setTimeout\(\(\) => \{ searchDebounceTimer = null; search\(\); \}, 140\)/, 'search should debounce rapid typing to avoid blocking the UI on every keystroke');
assert.match(fs.readFileSync(path.join(root, 'android-app/app/src/main/assets/www/local-updates.js'), 'utf8'), /Number\.isFinite\(sn\)&&sn>0&&\(!Number\.isFinite\(bn\)\|\|bn<=0\)/, 'Android catalog updater should preserve positive saved need values when refreshing catalog');
assert.match(app, /data-edit-permanent/, 'search results should expose name editing');
assert.match(forms, /cols\.map\(k=>.*x\[k\]/, 'print tables should render fields from each document item');
assert.match(html, /app\.js\?v=81/, 'app asset should have an explicit cache version');
assert.match(html, /forms-addon\.js\?v=65/, 'forms asset should have an explicit cache version');

assert.match(html, /styles\.css\?v=81/, 'updated input zoom CSS should be cache-busted');
assert.match(html, /الإصدار 1\.5\.2/, 'website download label should match the published APK version');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /official-page:last-child[\s\S]*?page-break-after: auto !important/, 'last official page must not force a trailing blank print page');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#printArea > \.official-page\.final-blank-page\{height:277mm!important/, 'last procurement form should use a shorter print height to avoid fractional overflow');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#printArea \.official-page:last-child,#printArea > \.official-page\.final-blank-page\{break-after:avoid-page!important;page-break-after:avoid!important/, 'last procurement form must suppress a trailing page break');
assert.match(fs.readFileSync(path.join(root, 'forms-addon.js'), 'utf8'), /new URL\('styles\.css\?v=81',location\.href\)/, 'separate print window must load current print CSS');
assert.match(fs.readFileSync(path.join(root, 'forms-addon.js'), 'utf8'), /last\.style\.setProperty\('page-break-after','avoid','important'\)/, 'print generation must explicitly suppress a trailing blank page');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /input:not\(\[type=\"checkbox\"\]\):not\(\[type=\"radio\"\]\), textarea, select\s*\{\s*font-size: max\(16px, 1em\)/, 'all text-entry controls should avoid iOS focus zoom');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /!sessionStorage\.getItem\(marker\) \|\| localOwner!==String\(user\.id\)/, 'switching accounts must refresh local data even when a tab marker exists');
assert.match(fs.readFileSync(path.join(root, 'android-app/app/src/main/assets/www/local-updates.js'), 'utf8'), /const APP_VERSION='1\.5\.2'/, 'in-app updater version must match the installed app version');

assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /\.toast\{position:fixed;top:calc\(env\(safe-area-inset-top/, 'notifications should be anchored at the top safe area');
assert.equal(androidApp, app, 'Android app.js must match canonical app.js');
assert.equal(androidForms, forms, 'Android forms-addon.js must match canonical forms-addon.js');
assert.match(sw, /haboubi-procurement-v104/, 'service-worker cache must be versioned');
for (const asset of ['styles.css?v=81', 'drug-aliases.js?v=2', 'app.js?v=81', 'forms-addon.js?v=65', 'catalog-seed.js?v=31', 'auth.js?v=11']) {
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
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /settings\.letterYearManual === true \? settings\.letterYear : new Date\(\)\.getFullYear\(\)/, "year should default to current year unless user explicitly chose one");
assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /data-name-picker="authorized"[\s\S]*?data-name-picker="storekeeper"/, 'authorized and storekeeper inputs should have picker buttons');
assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /settings\.authorizedNames = names\.slice\(\); settings\.storekeeperNames = names\.slice\(\)/, 'saved-name lists should sync to the active user account');
assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /\.\.\.existingSettings/, 'saving general settings must preserve saved-name lists');
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /<select name="year"/, "history editor year should use a scrollable select");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /item\.requested=expected;item\.aboveOfficialNeed=false/, "restore-to-need action should set quantity to calculated need");
assert.match(fs.readFileSync(path.join(root, "forms-addon.js"), "utf8"), /querySelector\('.quantity-value'\)\?\.textContent/, "printed quantity must exclude the quantity-edit button label");

assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /qty:item\.requested\?\?item\.qty/, "history save must persist requested quantities");
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /zeroItems\.length&&!confirm/, "history editor must confirm before saving zero quantities");
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /هذه العملية تحتوي .*مادة محفوظة بكمية صفر/, "history editor must warn when a saved operation already contains zero quantities");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /saved\.qty\?\?saved\.requested/, "history edit must restore saved quantity field");

assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /function drugAliasScore[\s\S]*?latinPhoneticKey/, 'search should map brand names and phonetic Arabic spellings to generic ingredients');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /settings\.authorizedName\s*=\s*name/, 'authorized name must not be saved as a persistent field value');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /settings\.storekeeperName\s*=\s*name/, 'storekeeper name must not be saved as a persistent field value');
assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /واتعهد بوجود المادة ضمن تقدير الاحتياج/, 'legacy apology print must include requested declaration wording');
assert.match(fs.readFileSync(path.join(root, 'forms-addon.js'), 'utf8'), /واتعهد بوجود المادة ضمن تقدير الاحتياج/, 'shared apology print must include requested declaration wording');
assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /hadSavedAuthorizedName[\s\S]*?delete settings\.authorizedName[\s\S]*?scheduleDataSave/, 'legacy saved authorized-name values must be removed and synced away');
assert.match(fs.readFileSync(path.join(root, 'drug-aliases.js'), 'utf8'), /xeloda.*capecitabine/i, 'brand alias map should map Xeloda to capecitabine');

assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /renderSavedNameList\(\); namePickerDialog\.classList\.remove\("hidden"\);(?!\s*\$\("#newSavedName"\)\.focus\(\))/, 'opening the authorized/storekeeper picker must not automatically focus the text field');

assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /saved-name-action edit[\s\S]*?saved-name-action delete/, 'saved authorized/storekeeper names should expose edit and delete actions');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /\.saved-name-row\{display:flex;align-items:stretch;gap:6px;min-width:0\}/, 'saved name actions should sit alongside the name row');

assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /settings\.authorizedNames = names\.slice\(\); settings\.storekeeperNames = names\.slice\(\)/, 'adding a saved name should synchronize authorized and storekeeper lists');
