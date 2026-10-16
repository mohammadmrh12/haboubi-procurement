/* Haboubi procurement prototype — Arabic RTL */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { items: [], files: [], selected: null, documentItems: [], settings: {}, aiTerms: [] };
const pages = {
  search: ["البحث", "ابحث بالاسم العلمي أو الوصف أو الرمز الوطني، ثم راجع الاحتياج قبل إنشاء المستند."],
  documents: ["الطباعة", ""],
  procurement: ["استمارات المشتريات", "نماذج مراحل الشراء الحكومية من طلب الشراء إلى المورد وقسم العقود."],
  database: ["قاعدة البيانات", "استيراد ملازم 2026 ومراجعة سلامة البيانات ومصادرها."],
  settings: ["الإعدادات", "تخصيص معلومات الجهة والمستندات."]
};
const STORAGE_DATA = "haboubiDataV2";
const STORAGE_SETTINGS = "haboubiSettings";
function populateYearSelect(select, selectedYear) {
  if (!select || typeof select.replaceChildren !== "function" || typeof document.createElement !== "function") return;
  const current = Number(selectedYear) || Number(select.value) || new Date().getFullYear();
  select.replaceChildren();
  for (let year = 2000; year <= 2100; year++) {
    const option = document.createElement("option"); option.value = String(year); option.textContent = String(year); select.append(option);
  }
  select.value = String(Math.min(2100, Math.max(2000, current)));
}
populateYearSelect(document.querySelector("#letterYear"), new Date().getFullYear());

function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}
function clean(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function norm(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function number(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/[٬,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function fmt(value) { return Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 }); }
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function codeHeaderScore(value) {
  const h = norm(value);
  if (!h) return 0;
  if (h.includes("old code") || h.includes("old national code") || h.includes("رمز قديم")) return -50;
  if (h.includes("new national code")) return 150;
  if (h.includes("national code")) return 140;
  if (h.includes("new code")) return 130;
  if (h === "code" || h === "الكود" || h === "الرمز الوطني") return 100;
  if (h.includes("code") || h.includes("رمز") || h.includes("الرقم الرمزي")) return 50;
  return 0;
}
function nameHeaderScore(value) {
  const h = norm(value);
  if (!h) return 0;
  if (["items","item","المادة","اسم المادة","اسم الدواء","drug name","item name"].includes(h)) return 110;
  if (h.includes("items") || h === "item") return 105;
  if (h.includes("المادة") || h.includes("اسم الدواء")) return 100;
  if (["نبيذه اساسي","نبيذة اساسي","نبيذه ثانوي","نبيذة ثانوي","مواد نبيذه","مواد نبيذة اساسي"].some(x => h.includes(norm(x)))) return 85;
  if (h === "description" || h === "drug") return 60;
  return 0;
}
function annualHeaderScore(value) {
  const h = norm(value);
  if (!h.includes("احتياج") && !h.includes("annual need") && !h.includes("annual requirement") && !h.includes("requirement")) return 0;
  let score = 20;
  if (h.includes("2026")) score += 100;
  if (h.includes("عام")) score += 10;
  if (["2023","2024","2025"].some(y => h.includes(y))) score -= 80;
  if (h.includes("مصروف")) score -= 100;
  if (h.includes("اعداد") || h.includes("patient")) score -= 60;
  return score;
}
function unitHeaderScore(value) {
  const h = norm(value);
  return h.includes("وحدة القياس") || h.includes("وحدة قياس") || h.includes("unit dose") || h === "unit" ? 70 : 0;
}
function isCodeValue(value) {
  const s = clean(value);
  return /^[A-Za-z0-9]{1,6}[-/][A-Za-z0-9]{2,}[-/][A-Za-z0-9]{2,}$/.test(s) ||
    /^\d{1,3}[A-Za-z]?$/.test(s) || /^[A-Z]{2,5}\d{2,}$/.test(s);
}
function chooseCodeColumn(rows, headerIndex, headers) {
  const candidates = [];
  headers.forEach((h, j) => {
    const hScore = codeHeaderScore(h);
    const values = rows.slice(headerIndex + 1, headerIndex + 121)
      .map(r => clean(r[j])).filter(Boolean);
    const patterns = values.filter(v => isCodeValue(v) && !/^\d{1,3}[A-Z]?$/i.test(v)).length;
    const official = values.filter(v => /^[A-Za-z]{2,5}-(DE|RE|DS|RS|C|A|B|00)/i.test(v)).length;
    const score = hScore + patterns * 1.3 + official * 1.5 - j * 0.01;
    if (hScore > 0 || patterns >= 2) candidates.push({ score, j, h, patterns });
  });
  if (!candidates.length) return -1;
  candidates.sort((a,b) => b.score - a.score);
  const best = candidates[0];
  if (norm(best.h).includes("الرقم الرمزي") && best.j > 0) {
    const left = best.j - 1;
    const count = rows.slice(headerIndex + 1, headerIndex + 121)
      .filter(r => left < r.length && isCodeValue(r[left]) && !/^\d{1,3}[A-Z]?$/i.test(clean(r[left]))).length;
    if (count >= Math.max(1, best.patterns - 1)) return left;
  }
  return best.j;
}
function chooseNameColumn(rows, headerIndex, headers, codeColumn) {
  const candidates = [];
  headers.forEach((h, j) => {
    if (j === codeColumn) return;
    const hn = norm(h);
    const excluded = ["unit","وحدة القياس","note","ملاحظ","priority","اولوية","احتياج","need","old code","مصروف","level","المستوى","dose","استطباب"].some(x => hn.includes(norm(x)));
    const hScore = excluded ? -100 : nameHeaderScore(h);
    const values = rows.slice(headerIndex + 1, headerIndex + 121).map(r => clean(r[j])).filter(Boolean);
    const descriptions = values.filter(v => v.length > 3 && (v.includes(" ") || /[A-Za-z\u0600-\u06ff]{4}/.test(v)) && !isCodeValue(v)).length;
    const score = hScore + Math.min(descriptions, 60) * 1.2 - j * 0.01;
    if (values.length) candidates.push({ score, j });
  });
  if (!candidates.length) return -1;
  candidates.sort((a,b) => b.score - a.score);
  return candidates[0].j;
}
function detectColumns(rows) {
  let best = null;
  for (let ri = 0; ri < Math.min(rows.length, 30); ri++) {
    const headers = (rows[ri] || []).map(v => clean(v));
    const code = chooseCodeColumn(rows, ri, headers);
    const name = chooseNameColumn(rows, ri, headers, code);
    if (code < 0 || name < 0 || code === name) continue;
    const cScore = codeHeaderScore(headers[code]);
    const nScore = nameHeaderScore(headers[name]);
    const populated = rows.slice(ri + 1, ri + 50).filter(r => clean(r[code]) && clean(r[name])).length;
    const score = cScore + nScore + Math.min(populated, 40) * 2;
    if (!best || score > best.score) best = { score, headerRow: ri, headers, code, name };
  }
  if (!best) return null;
  const annualCandidates = [];
  for (let ri = Math.max(0, best.headerRow - 3); ri < Math.min(rows.length, best.headerRow + 2); ri++) {
    (rows[ri] || []).forEach((value, j) => {
      if (j === best.code) return;
      let score = annualHeaderScore(value);
      if (score <= 0) return;
      if (codeHeaderScore(best.headers[j]) > 0) score -= 200;
      annualCandidates.push({ score, distance: Math.abs(ri - best.headerRow), j });
    });
  }
  annualCandidates.sort((a,b) => b.score - a.score || a.distance - b.distance || a.j - b.j);
  const findMulti = fn => {
    const scored = [];
    for (let ri = Math.max(0, best.headerRow - 3); ri < Math.min(rows.length, best.headerRow + 2); ri++) {
      (rows[ri] || []).forEach((value,j) => {
        if (j === best.code || j === best.name) return;
        const score = fn(value);
        if (score > 0) scored.push({ j, score, distance: Math.abs(ri - best.headerRow) });
      });
    }
    scored.sort((a,b) => b.score - a.score || a.distance - b.distance || a.j - b.j);
    return scored.length ? scored[0].j : -1;
  };
  return {
    headerRow: best.headerRow, headers: best.headers, code: best.code, name: best.name,
    unit: findMulti(unitHeaderScore), annual: annualCandidates.length ? annualCandidates[0].j : -1,
    priority: findMulti(h => /priority|الاولوية/.test(norm(h)) ? 60 : 0),
    note: findMulti(h => /note|ملاحظ/.test(norm(h)) ? 60 : 0),
    dose: findMulti(h => /unit dose|الجرعة/.test(norm(h)) ? 60 : 0)
  };
}
function inferKind(filename, sheet) {
  const s = norm(filename + " " + sheet);
  return ["السرطاني","الادوية","الادويه","drug","pharma","oncology"].some(x => s.includes(norm(x))) ? "drug" : "supply";
}
function shouldSkipRow(item) {
  if (!item.name || item.name.length < 2 || item.name.length > 400) return true;
  if (/^(items|item|المادة|اسم المادة|new code|national code|code)$/i.test(norm(item.name))) return true;
  if (/^\d{1,2}[A-Z]{0,3}$/i.test(item.code) && !item.unit && item.annual === null) return true;
  if (!item.code && !item.unit && item.annual === null) return true;
  if (!item.code && isCodeValue(item.name)) return true;
  return false;
}
function sameItemKey(item) {
  const code = norm(item.code).replace(/\s/g, "");
  const name = norm(item.name);
  return code ? code + "|" + name : "no-code|" + name + "|" + norm(item.source);
}
function sourcePriority(item) {
  let score = (item.annual !== null ? 100 : 0) + (item.code ? 30 : 0) + (item.unit ? 10 : 0);
  const sh = norm(item.sheet);
  if (sh.includes("احتياج 2026")) score += 20;
  if (sh.includes("اعداد")) score -= 10;
  if (sh.includes("مصروف 2023")) score -= 50;
  return score;
}
function mergeItem(existing, incoming) {
  const sources = [...(existing.sources || [{ source: existing.source, sheet: existing.sheet, row: existing.row }])];
  const nextSource = { source: incoming.source, sheet: incoming.sheet, row: incoming.row };
  if (!sources.some(s => s.source === nextSource.source && s.sheet === nextSource.sheet && s.row === nextSource.row)) sources.push(nextSource);
  const keepIncoming = sourcePriority(incoming) > sourcePriority(existing);
  const result = keepIncoming ? { ...incoming } : { ...existing };
  result.sources = sources;
  if (!result.note && incoming.note) result.note = incoming.note;
  if (!result.unit && incoming.unit) result.unit = incoming.unit;
  if (!result.priority && incoming.priority) result.priority = incoming.priority;
  if (result.annual === null && incoming.annual !== null) result.annual = incoming.annual;
  result.review = !result.code || result.annual === null;
  return result;
}
function parseWorkbook(file, workbook) {
  const parsed = [];
  let skipped = 0, sheetsRead = 0;
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    // Excel files sometimes claim the entire 1,048,576-row sheet is used although only a few cells contain data.
    // Restrict conversion to the last cell that actually has a value to avoid huge memory/time costs.
    let range = ws["!ref"];
    if (range) {
      let maxRow = -1, maxCol = -1;
      for (const address of Object.keys(ws)) {
        if (address[0] === "!") continue;
        const cell = ws[address];
        if (!cell || cell.v == null || clean(cell.v) === "") continue;
        const point = XLSX.utils.decode_cell(address);
        if (point.r > maxRow) maxRow = point.r;
        if (point.c > maxCol) maxCol = point.c;
      }
      if (maxRow >= 0 && maxCol >= 0) range = `A1:${XLSX.utils.encode_cell({ r: maxRow, c: maxCol })}`;
    }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, ...(range ? { range } : {}) });
    if (!rows.length) continue;
    const c = detectColumns(rows);
    if (!c) continue;
    sheetsRead++;
    for (let r = c.headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const get = i => i >= 0 && i < row.length ? clean(row[i]) : "";
      const rawNeed = get(c.annual);
      const parsedNumber = number(rawNeed);
      const item = {
        name: get(c.name), code: get(c.code), unit: get(c.unit), annual: parsedNumber,
        needRaw: rawNeed, priority: get(c.priority), note: get(c.note), dose: get(c.dose),
        source: file.name, sheet: sheetName, row: r + 1, kind: inferKind(file.name, sheetName),
        review: false, sources: [{ source: file.name, sheet: sheetName, row: r + 1 }]
      };
      item.review = !item.code || item.annual === null;
      if (shouldSkipRow(item)) { skipped++; continue; }
      parsed.push(item);
    }
  }
  return { items: parsed, skipped, sheetsRead };
}
function computeDuplicates() {
  const map = new Map();
  for (const item of state.items) {
    if (!item.code) continue;
    const k = norm(item.code).replace(/\s/g, "");
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map.entries()].filter(([,items]) => items.length > 1)
    .map(([code,items]) => ({ code, items }));
}
function refreshStats() {
  const duplicates = computeDuplicates();
  const review = state.items.filter(x => x.review || !x.code || x.annual === null).length;
  $("#statItems").textContent = fmt(state.items.length);
  $("#statFiles").textContent = fmt(state.files.length);
  $("#statReview").textContent = fmt(review);
  $("#statDuplicates").textContent = fmt(duplicates.length);
  $("#dbStatus").textContent = state.items.length ? fmt(state.items.length) + " مادة محملة" : "قاعدة البيانات غير مستوردة";
  $(".status-dot").style.background = state.items.length ? "#239b68" : "#d9a441";
  const report = $("#duplicateReport");
  if (report) {
    report.textContent = duplicates.length
      ? "تحتاج مراجعة " + duplicates.length + " رمزاً مكرراً:\n" + duplicates.slice(0, 80).map(d => d.code + " — " + d.items.map(i => i.name + " [" + i.source + " / " + i.sheet + "]").join(" ؛ ")).join("\n")
      : "لا توجد رموز مكررة في البيانات المحملة حالياً.";
  }
}
function persistData() {
  try {
    localStorage.setItem(STORAGE_DATA, JSON.stringify({ items: state.items, files: state.files }));
    if (window.haboubiAuth && window.haboubiAuth.user) window.haboubiAuth.scheduleDataSave({ items: state.items, files: state.files, settings: state.settings || {} });
    return true;
  } catch (error) {
    toast("تعذر حفظ البيانات محلياً. صدّر نسخة JSON قبل متابعة الاستيراد.");
    return false;
  }
}
async function restoreData() {
  let data = null;
  const showBootStatus = message => { const status = $('#dbStatus'); if (status) status.textContent = message; const results = $('#results'); if (results && !state.items.length) results.innerHTML = '<div class="empty-state"><strong>' + message + '</strong><p>أعد تحميل الصفحة. إذا استمرت المشكلة أرسل لقطة شاشة من تبويب قاعدة البيانات.</p></div>'; };
  showBootStatus('جارٍ تحميل قاعدة البيانات المدمجة…');
  try {
    const raw = localStorage.getItem(STORAGE_DATA) || localStorage.getItem("haboubiData");
    if (raw) data = JSON.parse(raw);
  } catch (_) { data = null; }
  // The embedded catalog is the authoritative default. Use it whenever there is
  // no usable saved catalog; this works offline and inside the Android APK.
  let embedded = null;
  try { const updated = JSON.parse(localStorage.getItem('haboubiRemoteCatalogV1') || 'null'); if (updated && Array.isArray(updated.items) && updated.items.length) embedded = updated; } catch (_) {}
  if (!embedded) embedded = window.HABOUBI_DEFAULT_CATALOG;
  if (!embedded || !Array.isArray(embedded.items) || !embedded.items.length) {
    try { const response = await fetch('./catalog-seed.json?v=20', { cache: 'no-store' }); if (response.ok) embedded = await response.json(); } catch (_) {}
  }
  const savedItems = data && Array.isArray(data.items) ? data.items : [];
  if (embedded && Array.isArray(embedded.items) && embedded.items.length) {
    // Always include every bundled default item, even when this browser already
    // has an older/partial local database. Keep additional user-imported records.
    const merged = [...embedded.items];
    const signature = item => [String(item.code || '').trim().toLowerCase(), String(item.name || '').trim().toLowerCase()].join('|');
    const defaultBySignature = new Map(merged.map(item => [signature(item), item]));
    const seen = new Set(defaultBySignature.keys());
    for (const item of savedItems) {
      const key = signature(item), bundled = defaultBySignature.get(key);
      // Preserve user-specific name overrides even when the item itself comes from the bundled catalog.
      if (bundled && item.permanentName) bundled.permanentName = item.permanentName;
      if (!seen.has(key)) { merged.push(item); seen.add(key); }
    }
    const fileMap = new Map();
    for (const file of [...(embedded.files || []), ...((data && data.files) || [])]) {
      const key = String(file.name || file.source || JSON.stringify(file));
      if (!fileMap.has(key)) fileMap.set(key, file);
    }
    data = { items: merged, files: [...fileMap.values()] };
    try { localStorage.setItem(STORAGE_DATA, JSON.stringify(data)); } catch (_) { /* Embedded catalog remains available in memory. */ }
  } else if (!savedItems.length) {
    console.error('Haboubi bundled catalog missing or empty.');
    data = { items: [], files: [] };
  }
  state.items = Array.isArray(data.items) ? data.items : [];
  state.files = Array.isArray(data.files) ? data.files : [];
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}"); } catch (_) {}
  state.settings = settings;
  Object.entries(settings).forEach(([key,value]) => { const el = $("#" + key); if (el && key !== "letterYear") el.value = value; });
  const authorizedNameInput = $("#authorizedName"); if (authorizedNameInput) authorizedNameInput.value = "";
  const hadSavedAuthorizedName = Object.prototype.hasOwnProperty.call(settings, "authorizedName");
  if (hadSavedAuthorizedName) { delete settings.authorizedName; try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); } catch (_) {} }
  const storekeeperNameInput = $("#storekeeperName"); if (storekeeperNameInput && settings.storekeeperName) storekeeperNameInput.value = settings.storekeeperName;
  const yearSelect = $("#letterYear");
  if (yearSelect) {
    populateYearSelect(yearSelect, settings.letterYearManual === true ? settings.letterYear : new Date().getFullYear());
  }
  const pharmacyHeadInput = $("#pharmacyHeadName");
  if (pharmacyHeadInput && (!pharmacyHeadInput.value.trim() || pharmacyHeadInput.value.trim() === "الدكتور احمد صبحي خضير")) {
    pharmacyHeadInput.value = "علي شكري العبادي";
    state.settings.pharmacyHeadName = "علي شكري العبادي";
    try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(state.settings)); } catch (_) {}
  }
  state.items = state.items.map((item,index) => ({ ...item, id: index + 1, sources: item.sources || [{ source:item.source, sheet:item.sheet, row:item.row }] }));
  if (hadSavedAuthorizedName && window.haboubiAuth?.user) window.haboubiAuth.scheduleDataSave({ items: state.items, files: state.files, settings });
  renderDocItems(); refreshStats();
  if (state.items.length) { const results = $('#results'); if (results && !$('#searchInput').value.trim()) results.innerHTML = '<div class="empty-state"><div class="empty-icon">⌕</div><strong>قاعدة البيانات جاهزة</strong><p>تم تحميل ' + fmt(state.items.length) + ' مادة. اكتب اسم المادة أو الرمز الوطني للبحث.</p></div>'; }
}

function latinPhoneticKey(value) {
  return norm(value).replace(/[أإآٱا]/g,"a").replace(/ب/g,"b").replace(/[تط]/g,"t").replace(/[ثسص]/g,"s").replace(/[ج]/g,"j").replace(/[حخ]/g,"h").replace(/[دض]/g,"d").replace(/[ذزظ]/g,"z").replace(/ر/g,"r").replace(/ش/g,"sh").replace(/ع/g,"").replace(/غ/g,"g").replace(/[فقكق]/g,"k").replace(/ل/g,"l").replace(/م/g,"m").replace(/ن/g,"n").replace(/[هحة]/g,"h").replace(/و/g,"o").replace(/ي/g,"i").replace(/ئ/g,"i").replace(/ؤ/g,"o").replace(/ء/g,"").replace(/x/g,"z").replace(/ph/g,"f").replace(/ck/g,"k").replace(/qu/g,"k").replace(/c/g,"k").replace(/[aeiouy\s]/g,"").replace(/(.)\1+/g,"$1");
}
const drugAliasLookupCache = new Map();
function drugAliasEntries(query) {
  const source = window.HABOUBI_DRUG_ALIASES || {}, q = norm(query), phonetic = latinPhoneticKey(query);
  const cacheKey = q + "|" + phonetic;
  if (drugAliasLookupCache.has(cacheKey)) return drugAliasLookupCache.get(cacheKey);
  const matches = [];
  for (const [brand, generics] of Object.entries(source)) {
    const b = norm(brand);
    if (!b) continue;
    if (b === q || (q.length >= 4 && b.startsWith(q)) || (phonetic.length >= 3 && latinPhoneticKey(brand) === phonetic)) matches.push({brand, generics, exact:b===q || latinPhoneticKey(brand)===phonetic});
  }
  const result = matches.sort((a,b)=>Number(b.exact)-Number(a.exact));
  if (drugAliasLookupCache.size > 80) drugAliasLookupCache.clear();
  drugAliasLookupCache.set(cacheKey, result);
  return result;
}
const DRUG_GENERIC_EQUIVALENTS = {
  paracetamol:["acetaminophen"], acetaminophen:["paracetamol"], frusemide:["furosemide"], furosemide:["frusemide"],
  salbutamol:["albuterol"], albuterol:["salbutamol"], adrenaline:["epinephrine"], epinephrine:["adrenaline"],
  noradrenaline:["norepinephrine"], norepinephrine:["noradrenaline"], aciclovir:["acyclovir"], acyclovir:["aciclovir"],
  valaciclovir:["valacyclovir"], valacyclovir:["valaciclovir"], levothyroxine:["thyroxine"], thyroxine:["levothyroxine"],
  coamoxiclav:["amoxicillin clavulanic acid","amoxicillin clavulanate"], "amoxicillin clavulanate":["coamoxiclav","amoxicillin clavulanic acid"],
  sulfamethoxazole:["co trimoxazole","trimethoprim"], cotrimoxazole:["co trimoxazole","trimethoprim"],
  "folinic acid":["calcium folinate","leucovorin"], "calcium folinate":["folinic acid","leucovorin"],
  "methylprednisolone sodium succinate":["methylprednisolone"], "morphine sulfate":["morphine sulphate"], "morphine sulphate":["morphine sulfate"]
};
function drugAliasScore(item, query) {
  const matches = drugAliasEntries(query);
  if (!matches.length) return 0;
  const itemName = norm([item.name,item.nameAr,item.genericName,item.scientificName,...(Array.isArray(item.aliases)?item.aliases:[])].filter(Boolean).join(" "));
  let best = 0;
  for (const match of matches) for (const genericRaw of match.generics || []) {
    const generic = norm(genericRaw); if (!generic || generic.length < 4) continue;
    const terms = [generic,...(DRUG_GENERIC_EQUIVALENTS[generic]||[])].map(norm);
    if (terms.some(term => term && (itemName === term || itemName.startsWith(term+" ") || itemName.includes(" "+term+" ") || itemName.includes(term)))) best = Math.max(best, match.exact ? 1180 : 930);
  }
  return best;
}
function scoreItem(item, query) {
  const name = norm([item.name, item.nameAr, ...(Array.isArray(item.aliases) ? item.aliases : [])].filter(Boolean).join(" ")), code = norm(item.code), q = norm(query);
  const brandScore = drugAliasScore(item, query);
  if (!q) return 0;
  if (brandScore) return brandScore;
  const itemNameForSynonyms = norm([item.name,item.nameAr,item.genericName,item.scientificName].filter(Boolean).join(" "));
  const genericQuery = q.replace(/\b(?:hydrochloride|hydrobromide|sulfate|sulphate|sodium|potassium|tablet|capsule|oral)\b/g, " ").trim();
  const equivalents = DRUG_GENERIC_EQUIVALENTS[genericQuery] || [];
  if (equivalents.some(term => itemNameForSynonyms.includes(norm(term)))) return 1120;
  if (code && code === q) return 1200;
  if (name === q) return 1150;
  if (code && code.startsWith(q)) return 1000;
  if (name.startsWith(q)) return 950;
  if (name.includes(q)) return 850;
  if (code && code.includes(q)) return 800;
  const words = q.split(" ").filter(Boolean);
  const hits = words.filter(w => name.includes(w) || code.includes(w)).length;
  if (hits === words.length) return 700 + hits;
  if (hits) return 300 + hits * 10;
  const candidateWords = name.split(" ").filter(w => w.length >= Math.max(3, q.length - 2));
  const qPhonetic = latinPhoneticKey(query);
  if (qPhonetic.length >= 3 && candidateWords.some(w => latinPhoneticKey(w) === qPhonetic)) return 260;
  const distances = candidateWords.map(w => editDistance(w, q));
  const distance = distances.length ? Math.min(...distances) : 99;
  return distance <= 1 ? 250 : distance <= 2 ? 150 : 0;
}
function editDistance(a,b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let previous = Array.from({ length: b.length + 1 }, (_,i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(current[j-1] + 1, previous[j] + 1, previous[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
const AR_MEDICAL_TERMS = {
  "باراسيتامول":"paracetamol acetaminophen", "بنادول":"paracetamol acetaminophen", "اسيتامينوفين":"acetaminophen paracetamol", "زيلودا":"xeloda capecitabine", "كسيلودا":"xeloda capecitabine", "كابسيتابين":"capecitabine", "كابيسيتابين":"capecitabine", "باراسيتامول":"paracetamol acetaminophen", "اوجمنتين":"augmentin amoxicillin clavulanic acid", "اموكسكلاف":"amoxicillin clavulanic acid coamoxiclav", "فلاجيل":"flagyl metronidazole", "فنتولين":"ventolin salbutamol", "نيكسيوم":"nexium esomeprazole", "كونكور":"concor bisoprolol", "ليبيتور":"lipitor atorvastatin", "كريستور":"crestor rosuvastatin",
  "ايبوبروفين":"ibuprofen", "ديكلوفيناك":"diclofenac", "اموكسيسيلين":"amoxicillin", "ازيثرومايسين":"azithromycin",
  "سيفترياكسون":"ceftriaxone", "ميترونيدازول":"metronidazole", "اوميبرازول":"omeprazole", "بانتوبرازول":"pantoprazole",
  "ميتفورمين":"metformin", "انسولين":"insulin", "اسبرين":"aspirin", "اتورفاستاتين":"atorvastatin",
  "املوديبين":"amlodipine", "لوسارتان":"losartan", "كابتوبريل":"captopril", "سالبيوتامول":"salbutamol albuterol",
  "فوروسيميد":"furosemide", "سيتريزين":"cetirizine", "لوراتادين":"loratadine", "ديكساميثازون":"dexamethasone",
  "محلول":"solution", "حقن":"injection injectable", "امبول":"ampoule", "امبولات":"ampoule", "قنينة":"vial bottle",
  "شراب":"syrup", "اقراص":"tablet tablets", "حبوب":"tablet tablets", "كبسول":"capsule capsules", "كبسولات":"capsule capsules",
  "مرهم":"ointment", "كريم":"cream", "قطرة":"drops", "قطرات":"drops", "معلق":"suspension", "بودرة":"powder",
  "مضاد":"antibiotic", "حيوي":"antibiotic", "مسكن":"analgesic painkiller", "مخدر":"anesthetic anaesthetic",
  "مضاد حيوي":"antibiotic", "ضغط":"blood pressure antihypertensive", "سكري":"diabetes diabetic", "سكر":"glucose sugar",
  "قثطار":"catheter", "قسطرة":"catheter", "كانيولا":"cannula", "كانيولا وريدية":"iv cannula", "سرنجة":"syringe",
  "محقنة":"syringe", "ابر":"needle needles", "ابرة":"needle", "شاش":"gauze", "ضماد":"dressing", "ضمادات":"dressings",
  "قفازات":"gloves", "كفوف":"gloves", "كمامة":"mask", "كمامات":"masks", "خيوط جراحية":"surgical suture sutures",
  "خيط جراحي":"surgical suture", "شريط":"tape strip", "لاصق":"adhesive tape", "مطهر":"disinfectant antiseptic",
  "معقم":"sterilizer disinfectant", "تعقيم":"sterilization", "جهاز":"device machine", "عدة":"set kit",
  "طقم":"set kit", "انبوب":"tube", "انابيب":"tubes", "قناع":"mask", "فلتر":"filter", "مرشح":"filter",
  "كيس":"bag", "اكياس":"bags", "صمام":"valve", "مشرط":"scalpel", "شفرة":"blade", "ملقط":"forceps",
  "مقص":"scissors", "حامل":"holder stand", "ميزان":"scale", "ضمادة":"dressing", "مصل":"serum",
  "دم":"blood", "بول":"urine", "مختبر":"laboratory lab", "فحص":"test assay", "اختبار":"test",
  "حمل":"pregnancy", "سكر الدم":"blood glucose", "اوكسجين":"oxygen", "أوكسجين":"oxygen",
  "طبي":"medical", "طبية":"medical", "طبيات":"medical supplies", "مستلزمات":"supplies", "دواء":"drug medicine",
  "ادوية":"medicines drugs", "مادة":"material item", "مواد":"materials items", "جراحي":"surgical",
  "جراحية":"surgical", "معقمات":"disinfectants", "وريدي":"intravenous iv", "وريدية":"intravenous iv",
  "فموي":"oral", "فموية":"oral", "اطفال":"pediatric paediatric", "بالغين":"adult", "عقم":"sterile",
  "معقم":"sterile disinfectant",
  "سرنجة":"syringe", "سرنج":"syringe", "سرنجات":"syringes", "شريجة":"syringe", "شرايج":"syringes",
  "كانولا":"cannula", "كانيوله":"cannula", "كانيولات":"cannulas", "فراشة":"scalp vein set butterfly needle",
  "مايكرو درب":"microdrip iv set", "مايكروست":"microdrip infusion set", "مايكرو سيت":"microdrip infusion set",
  "ماكرو درب":"macrodrip infusion set", "ماكروست":"macrodrip infusion set", "درب":"iv drip infusion set",
  "دربه":"iv drip infusion set", "دربات":"iv infusion sets", "جهاز اعطاء سوائل":"iv infusion set",
  "سيت مغذي":"iv infusion set", "كيس ادرار":"urine drainage bag", "كيس ادرار كبار":"adult urine bag",
  "كيس ادرار اطفال":"pediatric urine bag", "ادرار":"urine urinary", "صونة ادرار":"urine drainage bag",
  "فولي كاتتر":"foley catheter", "فولي":"foley catheter", "كاتتر":"catheter", "كاتيتر":"catheter",
  "قثطرة":"catheter", "قثاطر":"catheters", "قسطرة بولية":"urinary catheter", "كوندوم ادرار":"urinary condom catheter",
  "ردي فاك":"redi-vac drain", "رديڤاك":"redi-vac drain", "لاب سبونج":"lap sponge", "سبونج":"sponge",
  "فوط بطن":"abdominal swab lap sponge", "شاش كوز":"gauze swabs", "شاش كوز مقطع":"cut gauze swabs",
  "شاش رول":"gauze roll", "رولة شاش":"gauze roll", "رول شاش":"gauze roll", "لفاف مطاط":"elastic bandage",
  "بانادج":"bandage", "باندج":"bandage", "بلاستر":"adhesive plaster", "تيب":"medical tape",
  "قطن":"cotton wool", "قطن طبي":"medical cotton", "قطن كرات":"cotton balls", "كف نيتريل":"nitrile gloves",
  "كف نتيرال":"nitrile gloves", "كف جراحي":"surgical gloves", "كف فحص":"examination gloves",
  "كفوف فحص":"examination gloves", "كفوف جراحية":"surgical gloves", "ماسك":"face mask",
  "مريول":"medical gown", "مريول عمليات":"surgical gown", "قناني":"bottles vials", "فايل":"vial",
  "فايلات":"vials", "نرمل سلاين":"normal saline", "نورمل سلاين":"normal saline", "ديكستروز":"dextrose",
  "بوفيدون":"povidone iodine", "سبيرتو":"medical alcohol", "جفنة":"kidney dish", "جفنة كلوية":"kidney dish",
  "شريطة سكر":"glucose test strip", "ستربات السكر":"glucose test strips", "سترب السكر":"glucose test strip",
  "لانست":"lancet", "جهاز سكر":"glucometer", "جهاز قياس السكر":"glucometer", "جهاز ضغط":"blood pressure monitor",
  "اوكسيميتر":"pulse oximeter", "نظارة اوكسجين":"nasal oxygen cannula", "بخاخ ربو":"asthma inhaler",
  "نيبولايزر":"nebulizer", "نبولايزر":"nebulizer", "ترمومتر":"thermometer", "ثرمومتر":"thermometer",
  "سماعة طبيب":"stethoscope", "حامل ابر":"needle holder", "طقم غيار":"dressing set",
  "طقم خياطة":"suturing set", "طقم ولادة":"delivery set", "طقم قثطرة":"catheterization set",
  "حاوية ابر":"sharps container", "سيفتي بوكس":"safety box sharps container", "كيس نفايات طبية":"medical waste bag",
  "تيوب سحب دم":"blood collection tube", "تيوب بنفسجي":"purple top edta blood collection tube",
  "تيوب احمر":"red top blood collection tube", "تيوب ازرق":"blue top blood collection tube",
  "تيوب اصفر":"yellow top blood collection tube", "تيوب اخضر":"green top blood collection tube",
  "سلايد":"microscope slide", "كفر سليب":"cover slip", "بيبت":"pipette", "ماصة":"pipette",
  "وجع راس":"headache", "راس يوجع":"headache", "حرارة":"fever", "خافض حرارة":"antipyretic",
  "زكام":"common cold", "رشح":"runny nose cold", "كحة":"cough", "بلغم":"sputum",
  "مغص":"colic abdominal pain", "ترجيع":"vomiting", "استفراغ":"vomiting", "حموضة":"heartburn acidity",
  "حكة":"itching pruritus", "دوا":"medicine drug", "علاج":"medicine treatment", "علاجات":"medicines",
  "دهان":"ointment cream", "قطرة عين":"eye drops", "قطرة اذن":"ear drops", "قطرة انف":"nasal drops",
  "تحميلة":"suppository", "تحاميل":"suppositories", "لبوس":"suppository", "املاح":"electrolytes salts",
  "محلول املاح":"oral rehydration salts", "اكياس املاح":"oral rehydration salts sachets", "بنج":"anesthetic",
  "بنج موضعي":"local anesthetic", "ابر تخدير":"anesthetic needles",
  "مرة":"single use", "استعمال واحد":"single use disposable",
  "شلفة":"surgical blade scalpel blade", "شلفه":"surgical blade scalpel blade", "شلفات":"surgical blades",
  "براسيتول":"paracetamol acetaminophen", "باراسيتول":"paracetamol acetaminophen",
  "باندج":"bandage", "ملحف طفل":"baby sheet infant sheet", "ملحف":"bed sheet bedsheet",
  "جرجف":"bed sheet bedsheet medical bed cover", "جرجف سدية":"bed sheet fitted sheet",
  "شرشف سرير":"bed sheet bedsheet", "شرشف":"bed sheet", "شرشف طبي":"medical bed sheet",
  "سوار طفل":"infant identification wristband baby id band", "سوار المولود":"newborn identification wristband",
  "سوار مولود":"newborn identification wristband", "سوار ام":"mother identification wristband maternity id band",
  "سوار الام":"mother identification wristband maternity id band", "اسورة طفل":"infant identification wristband",
  "اسوارة طفل":"infant identification wristband", "اسورة ام":"mother identification wristband",
  "اسوارة ام":"mother identification wristband", "سوار هوية طفل":"infant identification wristband",
  "كاون":"surgical gown medical gown", "كاون طبي":"medical gown surgical gown", "كاون عمليات":"surgical gown",
  "كاون معقم":"sterile surgical gown", "كاون دسبوزبل":"disposable gown", "جاون":"gown",
  "جاون عمليات":"surgical gown", "هيد كب":"head cover surgical cap", "هيد كاب":"head cover surgical cap",
  "كاب راس":"head cover surgical cap", "كب راس":"head cover surgical cap", "غطاء راس":"head cover",
  "غطاء رأس":"head cover", "قبعة عمليات":"surgical cap", "كاب عمليات":"surgical cap",
  "كفر شوز":"shoe cover shoes cover", "شوز كفر":"shoe cover shoes cover", "غطاء حذاء":"shoe cover",
  "غطاء احذية":"shoe covers", "كفر احذية":"shoe covers", "كفر شوز نايلون":"plastic shoe covers",
  "كفر شوز قماش":"cloth shoe covers", "كفر شوز بلاستيك":"plastic shoe covers",
  "كفر شوز دسبوزبل":"disposable shoe covers", "غطاء قدم":"shoe cover foot cover",
  "وجه مخدة":"pillow case pillow cover", "كيس مخدة":"pillow case", "مفرش سرير":"bed sheet bed cover",
  "غطاء سرير":"bed cover bed sheet", "ملحف مستشفى":"hospital bed sheet", "شرشف لاستيك":"fitted bed sheet",
  "شرشف مطاط":"fitted bed sheet", "غطاء مرتبة":"mattress cover", "ملاءة سرير":"bed sheet"
};
function translateArabicQuery(query) {
  const normalized = norm(query);
  if (!/[\u0600-\u06ff]/.test(normalized)) return normalized;
  const tokens = normalized.split(" ").filter(Boolean);
  const translated = [];
  for (let i = 0; i < tokens.length; i++) {
    const triple = i + 2 < tokens.length ? tokens.slice(i, i + 3).join(" ") : "";
    const pair = i + 1 < tokens.length ? tokens[i] + " " + tokens[i + 1] : "";
    if (triple && AR_MEDICAL_TERMS[triple]) { translated.push(AR_MEDICAL_TERMS[triple]); i += 2; continue; }
    if (pair && AR_MEDICAL_TERMS[pair]) { translated.push(AR_MEDICAL_TERMS[pair]); i++; continue; }
    translated.push(AR_MEDICAL_TERMS[tokens[i]] || tokens[i]);
  }
  return translated.join(" ");
}

function search() {
  const query = $("#searchInput").value;
  const translatedQuery = translateArabicQuery(query);
  const box = $("#results");
  if (!query.trim()) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">⌕</div><strong>' +
      (state.items.length ? "اكتب اسم المادة للبحث" : "قاعدة البيانات تحتاج إلى استيراد") +
      '</strong><p>' + (state.items.length ? "تظهر النتائج المطابقة والمشابهة أثناء الكتابة." : "استورد ملازم Excel لعام 2026 من تبويب قاعدة البيانات للبدء.") +
      '</p>' + (state.items.length ? "" : '<button class="secondary" id="emptyImport">استيراد ملفات Excel</button>') + '</div>';
    const btn = $("#emptyImport"); if (btn) btn.onclick = () => navigate("database");
    return;
  }
  const translatedTerms = (translatedQuery !== norm(query) ? translatedQuery.split(" ").filter(Boolean) : []).concat(state.aiTerms);
  const hits = state.items.map(item => ({ item, score: Math.max(scoreItem(item, query), scoreItem({...item,name:item.permanentName||item.name}, query), ...translatedTerms.map(term => Math.max(scoreItem(item, term), scoreItem({...item,name:item.permanentName||item.name}, term)))) }))
    .filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0,35);
  if (!hits.length) {
    box.innerHTML = '<div class="empty-state"><strong>ما لقينا تطابقاً واضحاً</strong><p>جرّب الاسم بالإنجليزية أو جزءاً من الاسم أو الرمز الوطني.</p></div>';
    return;
  }
  box.innerHTML = hits.map(({item}) =>
    '<article class="result-row"><div><div class="result-name">' + esc(item.permanentName || item.name) + '</div>' + (item.permanentName && item.permanentName !== item.name ? '<div class="result-meta"><span>الاسم الأصلي: ' + esc(item.name) + '</span></div>' : '') + (item.nameAr ? '<div class="result-meta"><span>الاسم العربي: ' + esc(item.nameAr) + '</span></div>' : '') + '<div class="result-meta">' +
    '<span class="code">' + esc(item.code || "بدون رمز مسجل") + '</span><span>' + esc(item.unit || "الوحدة غير محددة") +
    '</span><span>' + esc(item.source || "") + '</span><span>ورقة: ' + esc(item.sheet || "") +
    '</span>' + (item.review ? '<span class="warning-tag">تحتاج مراجعة</span>' : '') +
    '</div></div><div class="result-actions"><span class="qty-chip">سنوي: ' + (item.annual === null ? "غير محدد" : fmt(item.annual)) +
    '</span><button class="secondary mini-btn" data-item="' + item.id + '">تفاصيل المادة</button><button class="secondary mini-btn" data-edit-permanent="' + item.id + '">تعديل الاسم</button><button class="mini-btn direct-add-btn" data-add-direct="' + item.id + '">إضافة مباشرة للطباعة</button></div></article>'
  ).join("");
  $$("[data-item]").forEach(button => button.onclick = () => selectItem(Number(button.dataset.item)));
  $$("[data-add-direct]").forEach(button => button.onclick = () => addSearchResultDirect(Number(button.dataset.addDirect)));
  $$("[data-edit-permanent]").forEach(button => button.onclick = () => openNameEditor({kind:"catalog", id:Number(button.dataset.editPermanent)}));
}
function addSearchResultDirect(id) {
  const item=state.items.find(x=>Number(x.id)===Number(id));if(!item)return;
  const divisor=item.kind==='drug'?4:2,period=item.kind==='drug'?3:6;
  const expected=item.annual==null?null:Number(item.annual)/divisor;
  const qty=expected;
  const over=qty!==null&&expected!==null&&qty>expected;
  const needsReview=!!item.review||!item.code||expected===null;
  if(qty===null||!Number.isFinite(qty)||qty<0){toast('تعذر تحديد كمية آمنة تلقائياً. افتح تفاصيل المادة وأدخل العدد يدوياً.');selectItem(id);return;}
  const add=force=>{
    if(needsReview&&!force&&!confirm('المادة تحتاج مراجعة الرمز الوطني أو الاحتياج. إضافة كمسودة غير معتمدة إلى الطباعة؟'))return;
    const existing=state.documentItems.find(x=>x.code&&norm(x.code)===norm(item.code));
    const entry={...item,formName:item.permanentName||item.name,requested:qty,specification:item.dose||'',expected,period,aboveOfficialNeed:over,reviewAcknowledged:!!force};
    if(existing)Object.assign(existing,entry);else state.documentItems.push(entry);
    renderDocItems();toast(needsReview?'أضيفت المادة إلى قائمة الطباعة كمسودة مع تنبيه المراجعة. يمكنك إضافة مواد أخرى ثم الانتقال للطباعة يدوياً.':'أضيفت المادة إلى قائمة الطباعة. يمكنك إضافة مواد أخرى ثم الانتقال للطباعة يدوياً.');
  };
  if(over){if(!confirm('الكمية المحسوبة تتجاوز الاحتياج؟ راجع لجنة الصيدلة والعلاج. هل تريد المتابعة على أي حال؟')){selectItem(id);return;}add(true);return;}
  add(false);
}
function selectItem(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;
  state.selected = item;
  $("#results").classList.add("hidden");
  const period = item.kind === "drug" ? 3 : 6;
  const divisor = item.kind === "drug" ? 4 : 2;
  const special = false;
  const calculated = item.annual === null ? null : item.annual / divisor;
  const zeroNeed = item.annual === 0;
  $("#selectedPanel").classList.remove("hidden");
  $("#selectedPanel").innerHTML =
    '<div class="selected-head"><div><p class="eyebrow">تفاصيل المادة</p><h2>' + esc(item.permanentName || item.name) +
    '</h2></div><button class="clear-btn" id="closeSelected">إغلاق ×</button></div>' +
    '<div class="selected-grid">' +
    field("الرمز الوطني", item.code || "غير مسجل", true) + field("التصنيف", item.kind === "drug" ? "دواء" : "مستلزم / مادة") +
    field("وحدة القياس", item.unit || "غير محددة") + field("الاحتياج السنوي حسب الملزمة", item.annual === null ? "غير واضح" : fmt(item.annual)) +
    field("مصدر البيانات", (item.source || "") + " · " + (item.sheet || "") + " · صف " + item.row) +
    field("الأولوية", item.priority || "غير محددة") + field("الملاحظات الأصلية", item.note || "لا توجد") +
    '</div><div class="quantity-area">' +
    '<label>الكمية المطلوبة<input id="requestedQty" type="number" min="0" step="any" value="" data-calculated="' + (calculated === null ? "" : calculated) +
    '" placeholder="فارغ = احتياج ' + period + ' أشهر حسب الملزمة"></label><label>المواصفة / الجرعة<input id="specification" value="' + esc(item.dose || "") +
    '" placeholder="اختياري"></label></div><div class="quantity-area"><label>اسم المادة في الاستمارة (يمكن اختصاره)<input id="formItemName" maxlength="180" value="' + esc(item.formName || item.permanentName || item.name) +
    '" placeholder="اكتب الاسم المختصر الذي يظهر بالطباعة"></label></div><div id="qtyWarning">' +
    (item.review ? '<div class="warning">تحتاج هذه المادة إلى مراجعة: ' + (!item.code ? "الرمز الوطني غير متوفر. " : "") +
      (item.annual === null ? "الاحتياج السنوي غير واضح أو غير موجود في الورقة المختارة. " : "") + "تحقق من المصدر قبل الاعتماد.</div>" : "") +
    (zeroNeed ? '<div class="warning">الاحتياج المسجل في الملزمة يساوي صفر؛ لا يعني ذلك تلقائياً عدم الحاجة. راجع المصدر قبل تجهيز مستند رسمي.</div>' : "") +
    '</div><div class="button-row"><button class="primary" id="addToDoc">＋ إضافة للمستند</button>' +
    '<button class="secondary" id="resetQty">استخدام الاحتياج التلقائي</button></div>';
  $("#closeSelected").onclick = () => { $("#selectedPanel").classList.add("hidden"); $("#results").classList.remove("hidden"); };
  const addSelectedItem = (qty, force = false) => {
    if (qty === null || qty < 0) { toast(special ? "أدخل العدد حسب بيانات المرضى" : "تعذر حساب الكمية؛ أدخل العدد يدوياً"); return; }
    if (calculated !== null && qty > calculated && !force) {
      const warning = $("#qtyWarning");
      warning.innerHTML = '<div class="warning over-need-warning"><strong>الاحتياج فوق الرسمي ويحتاج إلى لجنة صيدلة وعلاج.</strong><p>الكمية المدخلة: ' + esc(fmt(qty)) + ' — احتياج ' + period + ' أشهر حسب الملزمة: ' + esc(fmt(calculated)) + '.</p><button type="button" class="primary" id="continueOverNeed">متابعة على أي حال</button> <button type="button" class="secondary" id="editOverNeed">تعديل الكمية</button></div>';
      $("#continueOverNeed").onclick = () => addSelectedItem(qty, true);
      $("#editOverNeed").onclick = () => $("#requestedQty").focus();
      return;
    }
    if (item.review && !force && !confirm("هذه المادة تحتاج مراجعة المصدر. هل تريد إضافتها كمسودة غير معتمدة؟")) return;
    const existing = state.documentItems.find(x => x.code && norm(x.code) === norm(item.code));
    if (existing) {
      if (!force && !confirm("المادة أو الرمز موجود بالفعل في المستند. تريد تحديث الكمية إلى " + fmt(qty) + "؟")) return;
      existing.requested = qty; existing.specification = $("#specification").value;
      existing.formName = clean($("#formItemName").value) || item.permanentName || item.name;
    } else {
      state.documentItems.push({ ...item, formName: clean($("#formItemName").value) || item.permanentName || item.name, requested: qty, specification: $("#specification").value, expected: calculated, period, special, aboveOfficialNeed: calculated !== null && qty > calculated });
    }
    renderDocItems(); toast(calculated !== null && qty > calculated ? "أضيفت مع تنبيه: تحتاج موافقة لجنة الصيدلة والعلاج" : "تمت إضافة المادة للمستند");
    $("#searchInput").value = ""; search(); $("#results").classList.remove("hidden");
    $("#selectedPanel").classList.add("hidden"); $("#searchInput").focus();
  };
  $("#addToDoc").onclick = () => {
    const entered = $("#requestedQty").value.trim();
    const qty = entered === "" ? calculated : number(entered);
    addSelectedItem(qty);
  };
  $("#resetQty").onclick = () => {
    $("#requestedQty").value = "";
    checkQty(item, calculated, special);
  };
  $("#requestedQty").oninput = () => checkQty(item, calculated, special);
  checkQty(item, calculated, special);
}
function field(label, value, code) {
  return '<div class="field-box"><span>' + esc(label) + '</span><strong' + (code ? ' class="code"' : '') + '>' + esc(value) + '</strong></div>';
}
function checkQty(item, calculated, special) {
  const quantity = number($("#requestedQty").value);
  const box = $("#qtyWarning");
  if (!box) return;
  const messages = [];
  if (item.review) messages.push("تحقق من الرمز الوطني والاحتياج قبل الاعتماد.");
  if (item.annual === 0) messages.push("الاحتياج السنوي مسجل بصفر؛ يلزم تأكيده من الملزمة.");
  if (quantity !== null && calculated !== null && quantity > calculated)
    messages.push("الكمية أعلى من الحساب الأولي بمقدار " + fmt(quantity - calculated) + ". راجع الضوابط ووحدة التعبئة.");
  else if (quantity !== null && calculated !== null && quantity <= calculated && !item.review && item.annual !== 0)
    messages.push("الكمية لا تتجاوز الحساب الأولي؛ راجع وحدة التعبئة قبل الاعتماد.");
  box.innerHTML = messages.filter(m => !m.includes("الحساب اليدوي مطلوب") && !m.includes("بيانات المرضى/الأوزان")).map(m => '<div class="warning">' + esc(m) + '</div>').join("");
}
function renderDocItems() {
  const box = $("#documentItems");
  if (!state.documentItems.length) {
    box.innerHTML = '<p class="muted">لم تتم إضافة مواد بعد. ابحث عن مادة ثم اضغط «إضافة للمستند».</p>';
    return;
  }
  box.innerHTML = '<div class="table-wrap"><table class="doc-table"><thead><tr><th>اسم المادة للطباعة</th><th>الرمز الوطني</th><th>الكمية</th><th>الوحدة</th><th>إجراء</th></tr></thead><tbody>' +
    state.documentItems.map((x,i) => '<tr><td class="doc-name-cell"><span class="doc-name-text">' + esc(x.formName || x.name) + '</span><button type="button" class="secondary doc-edit-btn" data-edit-name="' + i + '">تعديل الاسم</button></td><td class="code">' + esc(x.code || "غير مسجل") +
      '</td><td class="quantity-edit-cell"><div class="quantity-value">' + fmt(x.requested) + '</div><button type="button" class="secondary doc-qty-edit-btn" data-edit-qty="' + i + '">تعديل العدد</button></td><td>' + esc(x.unit || "—") + '</td><td class="doc-actions"><button type="button" class="clear-btn doc-delete-btn" data-remove="' + i + '">حذف</button></td></tr>').join("") +
    '</tbody></table></div>';
  $$("[data-edit-name]").forEach(button => button.onclick = () => {
    const index = Number(button.dataset.editName), item = state.documentItems[index];
    if (!item) return;
    openNameEditor({kind:"document", index});
  });
  $$("[data-edit-qty]").forEach(button => button.onclick = () => {
    const index=Number(button.dataset.editQty), item=state.documentItems[index]; if(!item)return;
    const cell=button.closest('td');
    const expected=item.expected!=null?Number(item.expected):null;
    cell.innerHTML='<label class="inline-qty-label">العدد<input type="number" min="0" step="any" value="'+esc(item.requested)+'" data-qty-value></label><div class="inline-qty-warning" aria-live="polite"></div><div class="inline-qty-actions"><button type="button" class="secondary" data-qty-restore '+(expected===null||!Number.isFinite(expected)||expected<0?'disabled':'')+'>إرجاع العدد حسب الاحتياج ('+(expected===null?'غير محدد':esc(fmt(expected)))+')</button><button type="button" class="primary" data-qty-save>حفظ العدد</button><button type="button" class="secondary" data-qty-continue>متابعة على أي حال</button><button type="button" class="secondary" data-qty-cancel>إلغاء</button></div>';
    const input=cell.querySelector('[data-qty-value]'), warning=cell.querySelector('.inline-qty-warning'), cont=cell.querySelector('[data-qty-continue]');
    const assess=()=>{const q=number(input.value);const over=q!==null&&expected!==null&&q>expected;const unknown=expected===null||item.review||!item.code;warning.innerHTML=(over?'<div class="warning"><strong>الكمية أعلى من الاحتياج المحسوب.</strong><p>تحتاج مراجعة وموافقة لجنة الصيدلة والعلاج والمتابعة.</p></div>':'')+(unknown?'<div class="warning">تحقق من الرمز الوطني والاحتياج مع الصيدلة والعلاج قبل الاعتماد.</div>':'');cont.hidden=!(over||unknown);};
    assess();input.addEventListener('input',assess);
    const save=(force)=>{const q=number(input.value);if(q===null||q<0){toast('أدخل عدداً صحيحاً قبل الحفظ');input.focus();return;}const over=expected!==null&&q>expected;const unknown=expected===null||item.review||!item.code;if((over||unknown)&&!force){assess();toast(over?'الكمية تتجاوز الاحتياج؛ راجع لجنة الصيدلة والعلاج أو اختر متابعة على أي حال.':'المادة تحتاج مراجعة؛ تحقق من بيانات الصيدلة والعلاج أو اختر متابعة على أي حال.');return;}item.requested=q;item.aboveOfficialNeed=over;item.reviewAcknowledged=!!force;renderDocItems();toast(over||unknown?'تم تحديث العدد مع إبقاء تنبيه المراجعة.':'تم تحديث العدد.');};
    cell.querySelector('[data-qty-restore]').onclick=()=>{if(expected===null||!Number.isFinite(expected)||expected<0){toast('الاحتياج غير محدد لهذه المادة؛ راجع قاعدة البيانات.');return;}if(expected===0&&!confirm('الاحتياج المحسوب لهذه المادة صفر حسب قاعدة البيانات. هل تريد إرجاع العدد إلى صفر فعلاً؟'))return;item.requested=expected;item.aboveOfficialNeed=false;item.reviewAcknowledged=false;renderDocItems();toast('تم إرجاع العدد إلى الاحتياج المحسوب: '+fmt(expected));};cell.querySelector('[data-qty-save]').onclick=()=>save(false);cont.onclick=()=>{if(confirm('تأكيد المتابعة على أي حال رغم تنبيه الاحتياج ومراجعة لجنة الصيدلة والعلاج والمتابعة؟'))save(true);};cell.querySelector('[data-qty-cancel]').onclick=()=>renderDocItems();input.focus();
  });
  $$("[data-remove]").forEach(button => button.onclick = () => {
    state.documentItems.splice(Number(button.dataset.remove),1); renderDocItems();
  });
}
window.haboubiLoadHistoryForEdit = row => {
  const items=Array.isArray(row?.items)?row.items:[];if(!items.length){toast('لا توجد مواد في هذه العملية');return;}
  state.documentItems=items.map(saved=>{const catalog=state.items.find(x=>String(x.code||'').trim().toLowerCase()===String(saved.code||'').trim().toLowerCase());const item=catalog?{...catalog}:{};const expected=item.annual==null?null:Number(item.annual)/(item.kind==='drug'?4:2);return {...item,id:item.id||0,name:saved.name||item.name||'',formName:saved.name||item.permanentName||item.name||'',code:saved.code||item.code||'',requested:Number(saved.qty??saved.requested??0)||0,unit:item.unit||'',specification:saved.spec||item.dose||'',note:saved.note||item.note||'',expected,period:item.kind==='drug'?3:6,review:!!item.review||!saved.code||!catalog,aboveOfficialNeed:expected!==null&&Number(saved.qty)>expected,historyEditId:row.id};});
  const y=$('#letterYear'),a=$('#authorizedName'),sk=$('#storekeeperName');if(y)y.value=row.year||'2026';if(a)a.value='';if(sk)sk.value=row.storekeeperName||'';
  const nav=$('[data-view="documents"]');if(nav)nav.click();renderDocItems();toast('تم تحميل المواد والكميات المحفوظة إلى صفحة الطباعة.');
};
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}"); } catch { return {}; }
}
function printDocument(type) {
  if (!state.documentItems.length) { toast("أضف مادة واحدة على الأقل أولاً"); return; }
  const settings = loadSettings();
  const isAuth = type === "authorization";
  const title = isAuth ? "تخويل" : "م / اعتذار";
  const recipient = isAuth ? ($("#authRecipient").value || settings.authRecipient) : ($("#apologyRecipient").value || settings.apologyRecipient);
  const name = $("#authorizedName").value.trim();
  const store = $("#storekeeperName").value.trim();
  const date = ($( "#letterYear" )?.value || "2026") + " /　　/　　";
  const rows = state.documentItems.map((item,i) =>
    '<tr><td>' + (i+1) + '</td><td>' + esc(item.name) + '</td><td class="code">' + esc(item.code || "غير مسجل") +
    '</td><td>' + fmt(item.requested) + '</td>' + (isAuth ? '<td>يُستكمل من الجهة المختصة</td>' : '') + '</tr>'
  ).join("");
  const bodyText = isAuth
    ? '<p class="document-body">نرسل إليكم مخوّلنا ( <strong>' + esc(name || "................................") +
      '</strong> ) لاستلام حصتنا من الأدوية والمستلزمات الطبية.</p><p class="document-body">هذا ولكم الأمر مع التقدير.</p>'
    : '<p class="document-body">نعتذر عن تجهيز الأدوية والمستلزمات الطبية المدرجة أدناه لعدم توفرها في مخازن قسم الصيدلة وحسب الطلب.</p>';
  const declaration = isAuth ? "" :
    '<div class="declaration">أني الموقع أدناه ( <strong>' + esc($("#apologyDeclarant").value.trim() || "................................") +
    '</strong> ) أتعهد بعدم وجود المادة ضمن المناقلات ولا يوجد في التعميم الصادر من قسم الصيدلة بوجود المادة ضمن تقدير الاحتياج وبصحة الرمز الوطني والمعلومات المقدمة بالاعتذار.</div>' +
    '<div class="signature pharmacist">الصيدلاني<br><strong>' + esc($("#pharmacistName").value || settings.pharmacistName || "علي شكري العبادي") + '</strong></div>';
  const view = $("#view-documents");
  view.classList.add("printing");
  const old = $("#printArea"); if (old) old.remove();
  const div = document.createElement("div"); div.id = "printArea"; div.className = "print-sheet";
  div.innerHTML = '<div class="official-header">' +
    '<div class="ministry"><strong>' + (isAuth ? "وزارة الصحة" : "محافظة ذي قار") + '</strong><span>دائرة صحة محافظة ذي قار</span>' + (isAuth ? '<span>' + esc($("#hospitalName").value || settings.hospitalName || "مستشفى الحبوبي التعليمي") + '</span>' : '<span>قسم الصيدلة</span>') + '</div>' +
    '<div class="letter-meta"><span>العدد: ................</span><span>التاريخ: ' + esc(date) + '</span></div></div>' +
    '<div class="recipient">إلى / ' + esc(recipient) + '</div><h2 class="print-title">' + title + '</h2>' + bodyText +
    '<table><thead><tr><th>ت</th><th>اسم المادة</th><th>الرمز الوطني</th><th>العدد</th>' + (isAuth ? '<th>بيان توفر المادة</th>' : '') +
    '</tr></thead><tbody>' + rows + '</tbody></table>' + declaration +
    (isAuth ? '<div class="signature-row"><div>اسم المخوّل<br><strong>' + esc(name || "................................") +
      '</strong><br>التوقيع: ................</div><div>أمين المخزن<br><strong>' + esc(store || "................................") +
      '</strong><br>التوقيع: ................</div></div>' : '') +
    (isAuth ? '<div class="director-signature"><strong>' + esc($("#directorName").value.trim() || settings.directorName || "الدكتور احمد صبحي خضير") + '</strong><span>مدير مستشفى الحبوبي التعليمي</span></div>' : '<div class="director-signature"><strong>' + esc($("#pharmacyHeadName").value.trim() || settings.pharmacyHeadName || $("#directorName").value.trim() || settings.directorName || "الدكتور احمد صبحي خضير") + '</strong><span>مدير قسم الصيدلة</span></div>') +
    '<p class="draft-note">مسودة مولدة آلياً للمراجعة — يلزم التحقق من صحة البيانات ومطابقة النموذج قبل التوقيع والاعتماد.</p>';
  view.appendChild(div); window.print();
  setTimeout(() => { div.remove(); view.classList.remove("printing"); if (isAuth) $("#authorizedName").value = ""; }, 600);
}
function saveSettings() {
  const existingSettings = loadSettings();
  const settings = {
    ...existingSettings,
    hospitalName: $("#hospitalName").value, authRecipient: $("#authRecipient").value,
    apologyRecipient: $("#apologyRecipient").value, directorName: $("#directorName").value,
    pharmacistName: $("#pharmacistName").value, pharmacyHeadName: $("#pharmacyHeadName").value.trim() || "علي شكري العبادي",
    letterYear: $("#letterYear")?.value || String(new Date().getFullYear()), letterYearManual: existingSettings.letterYearManual === true
  };
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); state.settings = settings;
  if (window.haboubiAuth && window.haboubiAuth.user) window.haboubiAuth.scheduleDataSave({ items: state.items, files: state.files, settings });
  toast("تم حفظ الإعدادات على هذا الجهاز والموقع");
}
async function sha256(file) {
  if (typeof crypto === "undefined" || !crypto.subtle) return file.name + "|" + file.size + "|" + file.lastModified;
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,"0")).join("");
}
async function importFiles(files) {
  if (!window.XLSX) { toast("تعذر تحميل مكتبة Excel؛ تحقق من الاتصال"); return; }
  const logs = [];
  for (const file of files) {
    try {
      const hash = await sha256(file);
      if (state.files.some(existing => existing.hash === hash)) {
        logs.push("↷ تم تجاوز الملف المكرر: " + file.name);
        continue;
      }
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const result = parseWorkbook(file, workbook);
      if (!result.items.length) {
        logs.push("! " + file.name + ": لم تُكتشف أعمدة الرمز الوطني واسم المادة؛ لم تتم إضافة صفوف.");
        continue;
      }
      let added = 0;
      for (const item of result.items) {
        const key = sameItemKey(item);
        const index = state.items.findIndex(existing => sameItemKey(existing) === key);
        if (index >= 0) state.items[index] = mergeItem(state.items[index], item);
        else { state.items.push(item); added++; }
      }
      state.files.push({ name: file.name, size: file.size, hash, sheetsRead: result.sheetsRead });
      logs.push("✓ " + file.name + ": أُضيف " + added + " سجل جديد، ودُمجت " + (result.items.length - added) +
        " سجلات متطابقة، وتم تجاوز " + result.skipped + " صف عنوان/فارغ.");
    } catch (error) {
      logs.push("✕ " + file.name + ": تعذّر الاستيراد (" + error.message + ")");
    }
  }
  state.items.forEach((item,index) => { item.id = index + 1; });
  persistData(); refreshStats(); $("#importLog").textContent = logs.join("\n") || "لم يتم استيراد ملفات.";
  search(); toast("اكتمل الاستيراد الأولي. راجع تقرير التكرارات والمواد الناقصة.");
  $("#fileInput").value = "";
}
function exportJSON() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items: state.items, files: state.files }, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, "haboubi-procurement-backup.json");
}
async function restoreJSON(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.files))
      throw new Error("صيغة النسخة غير صحيحة؛ يلزم ملف نسخة احتياطية صادر من النظام.");
    const validItems = data.items.filter(x => x && typeof x.name === "string" && x.name.trim());
    if (!validItems.length && data.items.length) throw new Error("لم يتم العثور على سجلات مواد صالحة.");
    if (!confirm("سيتم استبدال قاعدة البيانات الحالية بـ" + validItems.length + " مادة من النسخة الاحتياطية. صدّر نسخة من البيانات الحالية أولاً إذا تحتاجها. متابعة؟")) return;
    state.items = validItems.map((item,index) => ({
      ...item,
      code: clean(item.code), name: clean(item.name),
      annual: item.annual == null || item.annual === "" ? null : number(item.annual),
      id: index + 1,
      review: !clean(item.code) || (item.annual == null || item.annual === "" || number(item.annual) === null),
      sources: Array.isArray(item.sources) ? item.sources : [{ source:item.source || "نسخة JSON", sheet:item.sheet || "", row:item.row || "" }]
    }));
    state.files = data.files.filter(x => x && typeof x.name === "string");
    state.documentItems = []; state.selected = null;
    $("#selectedPanel").classList.add("hidden");
    if (!persistData()) throw new Error("تعذر حفظ النسخة المستعادة في مساحة التخزين المحلية؛ تحقق من سعة المتصفح.");
    refreshStats(); renderDocItems(); search();
    $("#importLog").textContent = "تمت استعادة " + state.items.length + " مادة و" + state.files.length + " ملف من: " + file.name;
    toast("تمت استعادة النسخة الاحتياطية بنجاح");
  } catch (error) {
    toast("فشلت استعادة النسخة: " + error.message);
    $("#importLog").textContent = "خطأ استعادة JSON: " + error.message;
  } finally {
    $("#restoreDataInput").value = "";
  }
}
function exportCSV() {
  const headers = ["اسم المادة بالإنكليزي","اسم المادة بالعربي","الرمز الوطني","التصنيف","وحدة القياس","الاحتياج السنوي","الأولوية","الملاحظات","نوع المادة","الملف المصدر","الورقة","رقم الصف","يحتاج مراجعة"];
  const rows = state.items.map(x => [x.name,x.nameAr || "",x.code,x.category,x.unit,x.annual,x.priority,x.note,x.kind === "drug" ? "دواء" : "مستلزم",x.source,x.sheet,x.row,x.review ? "نعم" : "لا"]);
  const csv = "\uFEFF" + [headers,...rows].map(row => row.map(v => '"' + String(v ?? "").replace(/"/g,'""') + '"').join(",")).join("\r\n");
  downloadBlob(new Blob([csv], { type:"text/csv;charset=utf-8" }), "haboubi-procurement-materials.csv");
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function navigate(view) {
  $$(".nav").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach(section => section.classList.toggle("active", section.id === "view-" + view));
  $("#pageTitle").textContent = pages[view][0]; $("#pageDesc").textContent = pages[view][1];
  if (view === "documents") renderDocItems();
  if (view === "database") refreshStats();
}
$$(".nav").forEach(button => button.onclick = () => navigate(button.dataset.view));
$("#addMaterialForm").addEventListener("submit", event => {
  event.preventDefault();
  const nameAr = clean($("#newMaterialNameAr").value);
  const name = clean($("#newMaterialName").value);
  const code = clean($("#newMaterialCode").value);
  const annual = number($("#newMaterialAnnual").value);
  const kind = $("#newMaterialKind").value === "drug" ? "drug" : "supply";
  const unit = clean($("#newMaterialUnit").value);
  if (!nameAr || !name || !code || annual === null || annual < 0) {
    toast("أدخل الاسم العربي والإنكليزي والرمز الوطني والاحتياج السنوي الصحيح."); return;
  }
  const duplicate = state.items.find(item => norm(item.code) === norm(code) || (norm(item.name) === norm(name) && norm(item.nameAr) === norm(nameAr)));
  if (duplicate) {
    toast("المادة أو الرمز موجود مسبقاً: " + duplicate.name + " — " + duplicate.code);
    return;
  }
  const item = {
    id: Math.max(0, ...state.items.map(x => Number(x.id) || 0)) + 1,
    name, nameAr, code, annual, needRaw: String(annual), unit, kind,
    category: kind === "drug" ? "أدوية" : "مستلزمات طبية",
    priority: "", note: "مضافة يدوياً — يلزم التحقق من المصدر الرسمي", dose: "",
    source: "إضافة يدوية", sheet: "قاعدة البيانات", row: "",
    review: true, sources: [{ source: "إضافة يدوية", sheet: "قاعدة البيانات", row: "" }]
  };
  state.items.push(item);
  if (!persistData()) { state.items.pop(); return; }
  refreshStats(); renderDocItems(); search();
  $("#addMaterialForm").reset();
  toast("تمت إضافة المادة وحفظها. تظهر الآن عند البحث بالاسم العربي أو الإنكليزي.");
  $("#searchInput").value = nameAr;
  navigate("search"); search();
});
$("#searchInput").addEventListener("input", () => { state.aiTerms = []; search(); });
$("#clearSearch").onclick = () => { $("#searchInput").value = ""; state.aiTerms = []; search(); };
const emptyImportButton = $("#emptyImport"); if (emptyImportButton) emptyImportButton.onclick = () => navigate("database");
$("#fileInput").onchange = event => importFiles([...event.target.files]);
$("#exportData").onclick = exportJSON;
$("#restoreDataBtn").onclick = () => $("#restoreDataInput").click();
$("#restoreDataInput").onchange = event => restoreJSON(event.target.files[0]);
$("#exportCsv").onclick = exportCSV;
$("#clearData").onclick = () => {
  if (confirm("مسح كل البيانات المستوردة من هذا المتصفح؟ لا يمكن التراجع. صدّر نسخة احتياطية قبل المسح.")) {
    state.items = []; state.files = []; state.documentItems = [];
    localStorage.removeItem(STORAGE_DATA); localStorage.removeItem("haboubiData");
    persistData(); refreshStats(); renderDocItems(); $("#importLog").textContent = "تم مسح البيانات."; search();
  }
};
$("#saveSettings").onclick = saveSettings;
const namePickerDialog = $("#namePickerDialog");
let activeNamePicker = "authorized";
const namePickerConfig = {
  authorized: { input: "#authorizedName", list: "authorizedNames", title: "اختيار المخوّل", button: "اختيار مخوّل" },
  storekeeper: { input: "#storekeeperName", list: "storekeeperNames", title: "اختيار أمين المخزن", button: "اختيار أمين مخزن" }
};
const closeNamePicker = () => { namePickerDialog?.classList.add("hidden"); $("#newSavedName").value = ""; };
function persistNameLists(settings) {
  try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); } catch (error) { toast("تعذر حفظ الأسماء على هذا الجهاز"); return false; }
  state.settings = settings;
  if (window.haboubiAuth?.user) window.haboubiAuth.scheduleDataSave({ items: state.items, files: state.files, settings });
  return true;
}
function renderSavedNameList() {
  const config = namePickerConfig[activeNamePicker], list = $("#savedNameList");
  if (!config || !list) return;
  const settings = loadSettings(), names = Array.isArray(settings[config.list]) ? settings[config.list] : [];
  list.replaceChildren();
  if (!names.length) { const empty = document.createElement("div"); empty.className = "saved-name-empty"; empty.textContent = "لا توجد أسماء محفوظة لهذا المستخدم بعد."; list.append(empty); return; }
  names.forEach(name => {
    const button = document.createElement("button"); button.type = "button"; button.className = "saved-name-option"; button.textContent = name;
    button.addEventListener("click", () => {
      const input = $(config.input); if (input) { input.value = name; input.dispatchEvent(new Event("change", { bubbles: true })); }
      closeNamePicker();
    });
    list.append(button);
  });
}
document.querySelectorAll("[data-name-picker]").forEach(button => button.addEventListener("click", () => {
  activeNamePicker = button.dataset.namePicker === "storekeeper" ? "storekeeper" : "authorized";
  const config = namePickerConfig[activeNamePicker];
  $("#namePickerTitle").textContent = config.title;
  $("#namePickerDescription").textContent = "اختر اسماً محفوظاً لهذا المستخدم أو أضف اسماً جديداً.";
  renderSavedNameList(); namePickerDialog.classList.remove("hidden"); $("#newSavedName").focus();
}));
$("#namePickerForm")?.addEventListener("submit", event => {
  event.preventDefault();
  const config = namePickerConfig[activeNamePicker], input = $("#newSavedName"), name = input.value.trim();
  if (!name) { input.focus(); return; }
  const settings = loadSettings(), names = Array.isArray(settings[config.list]) ? settings[config.list].slice() : [];
  const existing = names.find(value => value.localeCompare(name, "ar", { sensitivity: "base" }) === 0);
  if (!existing) names.push(name);
  settings[config.list] = names;
  if (!persistNameLists(settings)) return;
  const field = $(config.input); if (field) { field.value = existing || name; field.dispatchEvent(new Event("change", { bubbles: true })); }
  input.value = ""; renderSavedNameList(); toast(existing ? "الاسم محفوظ مسبقاً" : "تمت إضافة الاسم لهذا المستخدم فقط");
});
$("#closeNamePicker")?.addEventListener("click", closeNamePicker);
$("#cancelNamePicker")?.addEventListener("click", closeNamePicker);
namePickerDialog?.addEventListener("click", event => { if (event.target === namePickerDialog) closeNamePicker(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeNamePicker(); });
$("#authorizedName")?.addEventListener("change", () => { const settings = loadSettings(); if (Object.prototype.hasOwnProperty.call(settings, "authorizedName")) { delete settings.authorizedName; persistNameLists(settings); } });
$("#storekeeperName")?.addEventListener("change", () => { const name = $("#storekeeperName").value.trim(); if (name) { const settings = loadSettings(); settings.storekeeperName = name; persistNameLists(settings); } });
$("#letterYear")?.addEventListener("change", () => {
  const settings = loadSettings(); settings.letterYear = $("#letterYear").value; settings.letterYearManual = true;
  try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); } catch (_) {}
  state.settings = settings;
  if (window.haboubiAuth?.user) window.haboubiAuth.scheduleDataSave({ items: state.items, files: state.files, settings });
});
const editNameDialog = $("#editNameDialog");
const closeEditNameDialog = () => editNameDialog?.classList.add("hidden");
function openNameEditor(context) {
  const dialog=$("#editNameDialog"), input=$("#editMaterialName"); if(!dialog||!input)return;
  const item=context.kind==="document"?state.documentItems[context.index]:state.items.find(x=>Number(x.id)===Number(context.id));
  if(!item)return;
  $("#editNameIndex").value=context.kind==="document"?"doc:"+context.index:"item:"+item.id;
  const normalSave=$("#editNameForm button[type=submit]");if(normalSave)normalSave.textContent=context.kind==="document"?"حفظ لهذه الاستمارة":"حفظ الاسم دائماً";
  input.value=context.kind==="document"?(item.formName||item.permanentName||item.name||""):(item.permanentName||item.name||"");
  dialog.classList.remove("hidden");input.focus();input.setSelectionRange?.(0,input.value.length);
}
function savePermanentMaterialName(name, context) {
  const docItem=context.kind==="document"?state.documentItems[context.index]:null;
  const source=state.items.find(x=>Number(x.id)===Number(docItem?docItem.id:context.id));
  if(!source){toast("تعذر العثور على المادة الأصلية لحفظ الاسم.");return false;}
  source.permanentName=name;
  if(docItem)docItem.permanentName=name;
  if(!persistData()){delete source.permanentName;return false;}
  if(docItem)docItem.formName=name;
  renderDocItems();search();toast("تم حفظ الاسم الدائم لهذا المستخدم فقط.");return true;
}
$("#editNameForm")?.addEventListener("submit", event => {
  event.preventDefault();
  const raw=$("#editNameIndex")?.value||"", name=$("#editMaterialName")?.value.trim();
  if(!name){$("#editMaterialName")?.focus();return;}
  const [kind,key]=raw.split(":");
  if(kind==="doc") {const item=state.documentItems[Number(key)];if(!item)return;item.formName=name;renderDocItems();toast("تم تحديث الاسم في هذه الاستمارة فقط.");}
  else if(kind==="item") {if(!savePermanentMaterialName(name,{kind:"catalog",id:Number(key)}))return;}
  closeEditNameDialog();
});
$("#savePermanentName")?.addEventListener("click",()=>{
  const raw=$("#editNameIndex")?.value||"",name=$("#editMaterialName")?.value.trim();if(!name){$("#editMaterialName")?.focus();return;}
  const [kind,key]=raw.split(":");const context=kind==="doc"?{kind:"document",index:Number(key)}:{kind:"catalog",id:Number(key)};
  if(savePermanentMaterialName(name,context))closeEditNameDialog();
});
$("#restoreOriginalName")?.addEventListener("click",()=>{
  const raw=$("#editNameIndex")?.value||"",[kind,key]=raw.split(":");
  const docItem=kind==="doc"?state.documentItems[Number(key)]:null;
  const source=state.items.find(x=>Number(x.id)===Number(docItem?docItem.id:key));
  if(!source){toast("تعذر العثور على المادة الأصلية.");return;}
  delete source.permanentName;
  if(docItem){docItem.permanentName=undefined;docItem.formName=source.name;}
  if(!persistData())return;
  if(docItem)renderDocItems();search();$("#editMaterialName").value=source.name||"";toast("تم إرجاع الاسم الأصلي وحذف التعديل الدائم لهذا المستخدم.");closeEditNameDialog();
});
$("#closeEditName")?.addEventListener("click", closeEditNameDialog);
$("#cancelEditName")?.addEventListener("click", closeEditNameDialog);
editNameDialog?.addEventListener("click", event => { if (event.target === editNameDialog) closeEditNameDialog(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeEditNameDialog(); });
const aboutDialog = $("#aboutDialog");
const closeAbout = () => aboutDialog?.classList.add("hidden");
$("#settingsBtn").onclick = () => aboutDialog?.classList.remove("hidden");
$("#closeAbout")?.addEventListener("click", closeAbout);
$("#aboutOk")?.addEventListener("click", closeAbout);
aboutDialog?.addEventListener("click", event => { if (event.target === aboutDialog) closeAbout(); });
const printAuthorizationButton = $("#printAuthorization"); if (printAuthorizationButton) printAuthorizationButton.onclick = () => printDocument("authorization");
const printApologyButton = $("#printApology"); if (printApologyButton) printApologyButton.onclick = () => printDocument("apology");
if ($("#letterYear") && !$("#letterYear").value) populateYearSelect($("#letterYear"), new Date().getFullYear());
window.haboubiAppReady = restoreData().then(() => search()).catch(error => { console.error('Database initialization failed:', error); const status = $('#dbStatus'); if (status) status.textContent = 'تعذر تحميل قاعدة البيانات'; const results = $('#results'); if (results) results.innerHTML = '<div class="empty-state"><strong>تعذر تحميل قاعدة البيانات</strong><p>' + esc(error && error.message || 'خطأ غير معروف') + '</p><button class="secondary" onclick="location.reload()">إعادة المحاولة</button></div>'; });
