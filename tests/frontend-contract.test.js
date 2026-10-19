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
assert.match(forms, /const printableName=value=>[\s\S]*?return text\};/, 'shared print path should remove Arabic annotations and repeated dosage-form words from printed names only');
{ const vm = require('node:vm'); const helper = forms.match(/const printableName=value=>[\s\S]*?return text\};/)[0]; const ctx={}; vm.createContext(ctx); vm.runInContext(helper+';this.clean=printableName;',ctx); const source='Amphotericin lipid complex 100mg vial قاعدة اقل الاسعار (05-C00-041) (05-C00-036)'; assert.equal(ctx.clean(source), 'Amphotericin lipid complex 100mg vial', 'printed material name should omit price-rule note and linked national-code annotations'); const salbutamol='Salbutamol Nebules 0.5% w/v 20ml لامانع من اعتماد المادة الفعالة بشكل sulphate or base'; assert.ok(!/[\u0600-\u06FF]/.test(ctx.clean(salbutamol)), 'printed material names must not contain Arabic committee annotations'); assert.ok(ctx.clean(salbutamol).includes('Salbutamol Nebules 0.5% w/v 20ml'), 'scientific name and dose must remain in print'); assert.ok(source.includes('قاعدة اقل الاسعار'), 'source/database value must remain unchanged'); assert.equal(ctx.clean('Xylometazoline Hydrochloride 0.1% Nasal spray spray spray'), 'Xylometazoline Hydrochloride 0.1% Nasal spray', 'repeated dosage-form words should be collapsed in print output'); assert.equal(ctx.clean('Chlorpheniramine maleate 4mg Tablet tablet tablet'), 'Chlorpheniramine maleate 4mg Tablet', 'repeated tablet labels should be collapsed in print output'); assert.equal(ctx.clean('مشرط جراحي'), 'مشرط جراحي', 'Arabic-only scientific/material names should remain printable'); }
assert.match(app, /function printableMaterialName\(value\)[\s\S]*?return text;[\s\S]*?function printableMaterialParts\(name, dose, unit\)/, 'legacy print path should clean repeated form words and avoid appending an existing dose/unit');
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
assert.match(html, /<body class=\"auth-locked\">/, 'keep protected app content hidden while restoring the saved session');
assert.match(html, /id=\"authGate\" class=\"auth-gate auth-hidden\"/, 'avoid flashing the login gate before session restoration completes');
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
assert.match(forms, /new URL\('iraqi-ministry-health-logo\.svg',location\.href\)/, 'separate print window must use an absolute ministry-logo URL');
assert.match(forms, /querySelectorAll\('#printArea img'\)/, 'print should wait for logo images to load before opening the print dialog');
assert.match(html, /app\.js\?v=93/, 'app asset should have an explicit cache version');
assert.match(html, /forms-addon\.js\?v=96/, 'forms asset should have an explicit cache version');
assert.match(html, /نبذة عن البرنامج[\s\S]*?نظام مشتريات مستشفى الحبوبي[\s\S]*?الرمز الوطني[\s\S]*?محاضر الاستلام والتقييم[\s\S]*?تم التصميم بواسطة الصيدلاني محمد رحيم حسب[\s\S]*?mailto:mohammad\.mrh4@gmail\.com/, 'about dialog should describe the system, retain designer credit, and include contact email');
assert.match(forms, /#minutesDialog \.minutes-sign-field input\{font-size:16px!important\}/, 'committee member and chair inputs must stay at 16px on mobile to prevent iOS Safari focus zoom');
assert.match(forms, /datePartDropdown\('orderMonth','الشهر',12\)[\s\S]*?datePartDropdown\('orderDay','اليوم',31\)/, 'receipt and evaluation administrative-order dates should use month/day dropdowns');
assert.match(forms, /الجهة المرتبطة بلجنة المشتريات[\s\S]*?select\('place',getCustom\('place',places\)\)/, 'referral place field should be identified as the entity linked to the purchasing committee');
assert.match(forms, /data-expiry-part=\"day\"[\s\S]*?data-expiry-part=\"month\"[\s\S]*?data-expiry-part=\"year\"/, 'receipt and evaluation item expiry date should use separate day, month and year dropdowns');
assert.match(forms, /\['year','orderMonth','orderDay','committee','evaluationCommittee','priceCommittee','purchaseCommittee','winner'/, 'committee dropdowns must not show add-option buttons');
assert.doesNotMatch(forms.match(/if\(\['year','orderMonth'[\s\S]*?includes\(sel\.name\)\)return;/)?.[0]||'', /'place'/, 'destination dropdown must retain its add-option button');
assert.match(app, /function lockNamePickerPageScroll[\s\S]*?body\.style\.position = \"fixed\"[\s\S]*?function unlockNamePickerPageScroll/, 'saved-name picker should lock background scrolling on iOS');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#namePickerDialog \.saved-name-list\{overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain\}/, 'saved-name list should contain touch scrolling inside the modal');

assert.match(html, /styles\.css\?v=92/, 'updated input zoom CSS should be cache-busted');
assert.match(html, /الإصدار 1\.5\.5/, 'website download label should match the published APK version');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /official-page:last-child[\s\S]*?page-break-after: auto !important/, 'last official page must not force a trailing blank print page');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#printArea > \.official-page\.final-blank-page\{height:277mm!important/, 'last procurement form should use a shorter print height to avoid fractional overflow');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#printArea \.official-page:last-child,#printArea > \.official-page\.final-blank-page\{break-after:avoid-page!important;page-break-after:avoid!important/, 'last procurement form must suppress a trailing page break');
assert.match(fs.readFileSync(path.join(root, 'forms-addon.js'), 'utf8'), /new URL\('styles\.css\?v=91',location\.href\)/, 'separate print window must load current print CSS');
assert.match(fs.readFileSync(path.join(root, 'forms-addon.js'), 'utf8'), /last\.style\.setProperty\('page-break-after','avoid','important'\)/, 'print generation must explicitly suppress a trailing blank page');
assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /input:not\(\[type=\"checkbox\"\]\):not\(\[type=\"radio\"\]\), textarea, select\s*\{\s*font-size: max\(16px, 1em\)/, 'all text-entry controls should avoid iOS focus zoom');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /!sessionStorage\.getItem\(marker\)\|\|localOwner!==String\(user\.id\)\|\|revision>knownRevision/, 'switching accounts must refresh local data even when a tab marker exists');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /await syncUserData\(user\);[\s\S]*?gate\.classList\.add\('auth-hidden'\);[\s\S]*?document\.body\.classList\.remove\('auth-locked'\)/, 'app must remain locked until cloud/local startup sync is complete to avoid first-open flicker');
assert.match(fs.readFileSync(path.join(root, 'android-app/app/src/main/assets/www/local-updates.js'), 'utf8'), /const APP_VERSION='1\.5\.5'/, 'in-app updater version must match the installed app version');

assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /\.toast\{position:fixed;top:calc\(env\(safe-area-inset-top/, 'notifications should be anchored at the top safe area');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /normalizeDosageFormDuplicates\(item\.name\|\|'مادة بدون اسم'\)/, 'history list must normalize repeated dosage-form words in existing saved records');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /name:normalizeDosageFormDuplicates\(item\.formName\|\|item\.name\|\|'\'\)/, 'new history records must not save repeated dosage-form words');
{ const vm = require('node:vm'); const source = fs.readFileSync(path.join(root, 'auth.js'), 'utf8'); const helper = source.match(/function normalizeDosageFormDuplicates\(value\) \{[\s\S]*?\n\}/)[0]; const ctx = {}; vm.createContext(ctx); vm.runInContext(helper + ';this.clean=normalizeDosageFormDuplicates;', ctx); assert.equal(ctx.clean('Xylometazoline Hydrochloride 0.1% Nasal spray spray spray'), 'Xylometazoline Hydrochloride 0.1% Nasal spray'); assert.equal(ctx.clean('Chlorpheniramine maleate 4mg Tablet tablet tablet'), 'Chlorpheniramine maleate 4mg Tablet'); assert.equal(ctx.clean('Amoxicillin 500mg capsule'), 'Amoxicillin 500mg capsule'); }
assert.equal(androidApp, app, 'Android app.js must match canonical app.js');
assert.equal(androidForms, forms, 'Android forms-addon.js must match canonical forms-addon.js');
assert.match(fs.readFileSync(path.join(root, 'android-app/app/src/main/assets/www/auth.js'), 'utf8'), /window\.AndroidApp && typeof window\.AndroidApp\.apiRequest/, 'Android auth must use the bundled native API bridge');
assert.match(sw, /haboubi-procurement-v164/, 'service-worker cache must be versioned');
for (const asset of ['styles.css?v=92', 'drug-aliases.js?v=7', 'app.js?v=93', 'forms-addon.js?v=96', 'catalog-seed.js?v=31', 'auth.js?v=23']) {
  assert.ok(sw.includes('./' + asset), `offline precache must include the exact versioned URL ${asset}`);
}
const publicHtml=fs.readFileSync(path.join(root,'public-search.html'),'utf8');
const publicJs=fs.readFileSync(path.join(root,'public-search.js'),'utf8');
assert.match(publicHtml,/البحث بالاسم العلمي فقط/,'public page must explicitly limit the search field to scientific name');
assert.doesNotMatch(publicHtml,/auth\.js|loginForm|authGate/,'public search must not include login UI or auth script');
assert.match(publicJs,/Number\(item\.annual\)\/\(isDrug\?4:2\)/,'public search must calculate 3-month drug and 6-month supply needs');
assert.match(publicHtml,/catalog-seed\.js/,'public search must use the shared catalog seed');
assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/public-search\.html/,'main Settings must link to public search');
console.log('PASS: shortened item names, print payload, versioned offline precache, and shared Android JS parity.');

assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /<textarea id="editMaterialName"/, "long material names should use a multiline editor");

assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /textContent='تعديل'/, "history has an edit action");
assert.match(fs.readFileSync(path.join(root, "auth.js"), "utf8"), /textContent='طباعة'/, "history has a print action");

assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /haboubiLoadHistoryForEdit/, "history edit should load items into print page");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /requested:\(number\(saved\.qty\)\?\?number\(saved\.requested\)\?\?0\)/, "history restoration must parse grouped quantities and preserve valid nonzero values");
assert.ok(fs.readFileSync(path.join(root, "server.js"), "utf8").includes("qty:String(x.qty??x.requested??'')"), "history API must preserve explicit numeric zero without treating it as missing");

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
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /number\(saved\.qty\)\?\?number\(saved\.requested\)\?\?0/, "history edit must restore saved quantity field");

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

assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)pollRemoteData\(\);\},30000\)/, 'user data must poll for remote edits continuously');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /saveMinutePreference/, 'per-user dropdown preferences must be persisted to the cloud');
assert.match(fs.readFileSync(path.join(root, 'forms-addon.js'), 'utf8'), /saveMinutePreference\('custom:'\+key,old\)/, 'new custom dropdown options must sync across devices');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /sessionStorage\.setItem\('haboubi-sync-user-'\+currentUser\.id,'1'\)/, 'continuous sync must mark the current account after refresh');

assert.match(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), /body\.baseUpdatedAt!==undefined&&Number\(body\.baseUpdatedAt\)!==Number\(existing\?\.updatedAt\|\|0\)/, "server must reject stale writes instead of silently overwriting another device changes");
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /function mergeSyncData\(local,remote\)/, 'simultaneous device edits should be merged before retrying a save');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /err\.status=response\.status;err\.data=data/, 'client must detect revision conflicts and recover');


const expandedAliases = JSON.parse(fs.readFileSync(path.join(root, "drug-aliases.js"), "utf8").replace(/^window\.HABOUBI_DRUG_ALIASES\s*=\s*/, "").replace(/;\s*$/, ""));
const expandedAliasData = JSON.parse(fs.readFileSync(path.join(root, "drug-aliases.json"), "utf8"));
assert.ok(Object.keys(expandedAliases).length >= 2500, "expanded drug/supply/lab alias dictionary should contain at least 2500 searchable aliases");
for (const alias of ["سفترايكزون", "سفتر", "سيفترياكسون", "سرنجة", "كفوف جراحية", "شلفة", "تيوب بنفسجي", "شرائط السكر", "كواشف مختبرية"]) {
  assert.ok(expandedAliases[alias.toLowerCase()], "expanded alias dictionary should include " + alias);
}
assert.deepStrictEqual(expandedAliasData.aliases, expandedAliases, "JSON alias crosswalk must match the runtime JavaScript dictionary");
assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /drug-aliases\.js\?v=7/, "website should load the expanded alias dictionary version");
assert.match(fs.readFileSync(path.join(root, "sw.js"), "utf8"), /haboubi-procurement-v164/, "service worker cache should be invalidated for expanded aliases");
assert.match(fs.readFileSync(path.join(root, "sw.js"), "utf8"), /drug-aliases\.js\?v=7/, "service worker should cache the expanded alias dictionary version");

assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /id="printEvaluationMinutes"[\s\S]*?id="printReceiptMinutes"[\s\S]*?id="printReferralDecision"/, "print page should expose receipt, evaluation and referral decision actions beside the main preview/print button");
assert.match(forms, /minutes-item-select[\s\S]*?إدراج هذه المادة في الطباعة/, "minutes forms should allow choosing which materials to include in print");
assert.match(forms, /list\.filter\(x=>x\.selected!==false\)/, "minutes print table should include only selected materials");
assert.match(forms, /haboubiPrintMinutesFromDocument/, "minutes actions should import materials from the current print document");
assert.match(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /\.minutes-receipt-btn[\s\S]*?\.minutes-evaluation-btn[\s\S]*?\.minutes-referral-btn/, "minutes action buttons should retain their assigned yellow, blue and burgundy colors");

assert.doesNotMatch(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /haboubi-cache-reset|location\.replace\(url\.href\)/, 'initial load must not unregister caches and reload the page');
assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /haboubiRefreshFromStorage/, 'remote sync must refresh app state in place');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /setSyncStatus\('تمت مزامنة آخر التعديلات',true\);location\.reload\(\)/, 'background sync must not reload the page');
assert.match(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), /Content-Security-Policy[\s\S]*?frame-ancestors 'none'/, 'server should emit a restrictive content security policy');
assert.match(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), /function sameOriginMutation/, 'state-changing browser requests should be checked for same-origin');
assert.match(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), /AI_REQUEST_LIMIT = 12/, 'AI endpoints should have a per-user request limit');

const publicCss=fs.readFileSync(path.join(root,'public-search.css'),'utf8');
assert.match(publicHtml,/ملاحظات وتعليمات الشراء/,'public page must show purchasing guidance');
assert.match(publicHtml,/ثلاثة أشهر فقط/,'public page must state the three-month medicine limit');
assert.match(publicHtml,/ستة أشهر فقط/,'public page must state the six-month medical-supply limit');
assert.match(publicHtml,/لجنة الصيدلة والعلاج/,'public page must explain committee escalation');
assert.match(publicCss,/\.notes-panel/,'purchasing guidance must have a styled notes panel');

assert.match(fs.readFileSync(path.join(root,'public-search.js'),'utf8'),/serviceWorker\.register\('\.\/sw\.js\?v=156'\)/,'public page must request the current service worker version');

const authSource=fs.readFileSync(path.join(root,'auth.js'),'utf8');
assert.match(authSource,/Promise\.race\(\[startupTask, new Promise\(resolve => setTimeout\(resolve, 12000\)\)\]\)/,'startup screen must release the user if sync stalls');
assert.match(authSource,/AbortSignal\.timeout\(30000\)/,'API requests must have a timeout rather than hang indefinitely');
assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/auth\.js\?v=23/,'startup fix must bypass stale auth script caches');

const serverSource=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert.match(serverSource,/zlib\.gzipSync\(raw, \{ level: zlib\.constants\.Z_BEST_SPEED \}\)/,'large JSON API responses should be gzip-compressed to reduce sync transfer time');
assert.match(serverSource,/Content-Encoding.*gzip/,'compressed JSON responses must declare gzip encoding');
assert.match(fs.readFileSync(path.join(root,'auth.js'),'utf8'),/AbortSignal\.timeout\(30000\)/,'cloud data sync should tolerate slower connections');
assert.match(fs.readFileSync(path.join(root,'auth.js'),'utf8'),/استجابة غير مفهومة من الخادم \(HTTP /,'sync diagnostics should include HTTP status and response type');

const androidAuth=fs.readFileSync(path.join(root,'android-app/app/src/main/assets/www/auth.js'),'utf8');
const nativeJava=fs.readFileSync(path.join(root,'android-app/app/src/main/java/com/haboubi/procurement/MainActivity.java'),'utf8');
assert.match(nativeJava,/offline_code_hash[\s\S]*?offline_user_json/, 'Android must cache a hashed previously validated code and its account for offline login');
assert.match(nativeJava,/hashOfflineCode\(payload\.optString/,'offline login must verify a hash, not persist the raw access code');
assert.match(androidAuth,/ANDROID_LOCAL_HISTORY_KEY/, 'Android must persist history operations locally when offline');
assert.match(androidAuth,/readAndroidQueue\(\);if\(pending\.length\)/, 'Android must retry queued offline history uploads when connected');
assert.match(fs.readFileSync(path.join(root,'android-app/app/build.gradle.kts'),'utf8'),/versionCode = 51; versionName = \"1\.5\.5\"/, 'Android release version must be bumped');
