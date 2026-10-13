/* Haboubi procurement prototype — Arabic RTL */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { items: [], files: [], selected: null, documentItems: [], settings: {} };
const pages = {
  search: ["البحث عن مادة", "ابحث بالاسم العلمي أو الوصف أو الرمز الوطني، ثم راجع الاحتياج قبل إنشاء المستند."],
  documents: ["التخويل والاعتذار", ""],
  procurement: ["استمارات المشتريات", "نماذج مراحل الشراء الحكومية من طلب الشراء إلى المورد وقسم العقود."],
  database: ["قاعدة البيانات", "استيراد ملازم 2026 ومراجعة سلامة البيانات ومصادرها."],
  settings: ["الإعدادات", "تخصيص معلومات الجهة والمستندات."]
};
const STORAGE_DATA = "haboubiDataV2";
const STORAGE_SETTINGS = "haboubiSettings";
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
  let embedded = window.HABOUBI_DEFAULT_CATALOG;
  if (!embedded || !Array.isArray(embedded.items) || !embedded.items.length) {
    try { const response = await fetch('./catalog-seed.json?v=20', { cache: 'no-store' }); if (response.ok) embedded = await response.json(); } catch (_) {}
  }
  const savedItems = data && Array.isArray(data.items) ? data.items : [];
  if (embedded && Array.isArray(embedded.items) && embedded.items.length) {
    // Always include every bundled default item, even when this browser already
    // has an older/partial local database. Keep additional user-imported records.
    const merged = [...embedded.items];
    const signature = item => [String(item.code || '').trim().toLowerCase(), String(item.name || '').trim().toLowerCase()].join('|');
    const seen = new Set(merged.map(signature));
    for (const item of savedItems) {
      const key = signature(item);
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
  Object.entries(settings).forEach(([key,value]) => { const el = $("#" + key); if (el) el.value = value; });
  const pharmacyHeadInput = $("#pharmacyHeadName");
  if (pharmacyHeadInput && (!pharmacyHeadInput.value.trim() || pharmacyHeadInput.value.trim() === "الدكتور احمد صبحي خضير")) {
    pharmacyHeadInput.value = "علي شكري العبادي";
    state.settings.pharmacyHeadName = "علي شكري العبادي";
    try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(state.settings)); } catch (_) {}
  }
  state.items = state.items.map((item,index) => ({ ...item, id: index + 1, sources: item.sources || [{ source:item.source, sheet:item.sheet, row:item.row }] }));
  renderDocItems(); refreshStats();
  if (state.items.length) { const results = $('#results'); if (results && !$('#searchInput').value.trim()) results.innerHTML = '<div class="empty-state"><div class="empty-icon">⌕</div><strong>قاعدة البيانات جاهزة</strong><p>تم تحميل ' + fmt(state.items.length) + ' مادة. اكتب اسم المادة أو الرمز الوطني للبحث.</p></div>'; }
}

function scoreItem(item, query) {
  const name = norm([item.name, item.nameAr, ...(Array.isArray(item.aliases) ? item.aliases : [])].filter(Boolean).join(" ")), code = norm(item.code), q = norm(query);
  if (!q) return 0;
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
  "باراسيتامول":"paracetamol acetaminophen", "بنادول":"paracetamol acetaminophen", "اسيتامينوفين":"acetaminophen paracetamol",
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
  "معقم":"sterile disinfectant", "مرة":"single use", "استعمال واحد":"single use disposable"
};
function translateArabicQuery(query) {
  const normalized = norm(query);
  if (!/[\u0600-\u06ff]/.test(normalized)) return normalized;
  const tokens = normalized.split(" ").filter(Boolean);
  const translated = [];
  for (let i = 0; i < tokens.length; i++) {
    const pair = i + 1 < tokens.length ? tokens[i] + " " + tokens[i + 1] : "";
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
  const translatedTerms = translatedQuery !== norm(query) ? translatedQuery.split(" ").filter(Boolean) : [];
  const hits = state.items.map(item => ({ item, score: Math.max(scoreItem(item, query), ...translatedTerms.map(term => scoreItem(item, term))) }))
    .filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0,35);
  if (!hits.length) {
    box.innerHTML = '<div class="empty-state"><strong>ما لقينا تطابقاً واضحاً</strong><p>جرّب الاسم بالإنجليزية أو جزءاً من الاسم أو الرمز الوطني.</p></div>';
    return;
  }
  box.innerHTML = hits.map(({item}) =>
    '<article class="result-row"><div><div class="result-name">' + esc(item.name) + '</div>' + (item.nameAr ? '<div class="result-meta"><span>الاسم العربي: ' + esc(item.nameAr) + '</span></div>' : '') + '<div class="result-meta">' +
    '<span class="code">' + esc(item.code || "بدون رمز مسجل") + '</span><span>' + esc(item.unit || "الوحدة غير محددة") +
    '</span><span>' + esc(item.source || "") + '</span><span>ورقة: ' + esc(item.sheet || "") +
    '</span>' + (item.review ? '<span class="warning-tag">تحتاج مراجعة</span>' : '') +
    '</div></div><div class="result-actions"><span class="qty-chip">سنوي: ' + (item.annual === null ? "غير محدد" : fmt(item.annual)) +
    '</span><button class="mini-btn" data-item="' + item.id + '">إضافة المادة</button></div></article>'
  ).join("");
  $$("[data-item]").forEach(button => button.onclick = () => selectItem(Number(button.dataset.item)));
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
    '<div class="selected-head"><div><p class="eyebrow">تفاصيل المادة</p><h2>' + esc(item.name) +
    '</h2></div><button class="clear-btn" id="closeSelected">إغلاق ×</button></div>' +
    '<div class="selected-grid">' +
    field("الرمز الوطني", item.code || "غير مسجل", true) + field("التصنيف", item.kind === "drug" ? "دواء" : "مستلزم / مادة") +
    field("وحدة القياس", item.unit || "غير محددة") + field("الاحتياج السنوي حسب الملزمة", item.annual === null ? "غير واضح" : fmt(item.annual)) +
    field("مصدر البيانات", (item.source || "") + " · " + (item.sheet || "") + " · صف " + item.row) +
    field("الأولوية", item.priority || "غير محددة") + field("الملاحظات الأصلية", item.note || "لا توجد") +
    '</div><div class="quantity-area">' +
    '<label>الكمية المطلوبة<input id="requestedQty" type="number" min="0" step="any" value="" data-calculated="' + (calculated === null ? "" : calculated) +
    '" placeholder="فارغ = احتياج ' + period + ' أشهر حسب الملزمة"></label><label>المواصفة / الجرعة<input id="specification" value="' + esc(item.dose || "") +
    '" placeholder="اختياري"></label></div><div id="qtyWarning">' +
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
    } else {
      state.documentItems.push({ ...item, requested: qty, specification: $("#specification").value, expected: calculated, period, special, aboveOfficialNeed: calculated !== null && qty > calculated });
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
  box.innerHTML = '<div class="table-wrap"><table class="doc-table"><thead><tr><th>المادة</th><th>الرمز الوطني</th><th>الكمية</th><th>الوحدة</th><th></th></tr></thead><tbody>' +
    state.documentItems.map((x,i) => '<tr><td>' + esc(x.name) + '</td><td class="code">' + esc(x.code || "غير مسجل") +
      '</td><td>' + fmt(x.requested) + '</td><td>' + esc(x.unit || "—") + '</td><td><button class="clear-btn" data-remove="' + i + '">حذف</button></td></tr>').join("") +
    '</tbody></table></div>';
  $$("[data-remove]").forEach(button => button.onclick = () => {
    state.documentItems.splice(Number(button.dataset.remove),1); renderDocItems();
  });
}
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
  setTimeout(() => { div.remove(); view.classList.remove("printing"); }, 600);
}
function saveSettings() {
  const settings = {
    hospitalName: $("#hospitalName").value, authRecipient: $("#authRecipient").value,
    apologyRecipient: $("#apologyRecipient").value, directorName: $("#directorName").value,
    pharmacistName: $("#pharmacistName").value, pharmacyHeadName: $("#pharmacyHeadName").value.trim() || "علي شكري العبادي"
  };
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); state.settings = settings;
  toast("تم حفظ الإعدادات على هذا الجهاز");
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
$("#searchInput").addEventListener("input", search);
$("#clearSearch").onclick = () => { $("#searchInput").value = ""; search(); };
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
$("#settingsBtn").onclick = () => navigate("settings");
const printAuthorizationButton = $("#printAuthorization"); if (printAuthorizationButton) printAuthorizationButton.onclick = () => printDocument("authorization");
const printApologyButton = $("#printApology"); if (printApologyButton) printApologyButton.onclick = () => printDocument("apology");
if ($("#letterYear") && !$("#letterYear").value) $("#letterYear").value = "2026";
restoreData().then(() => search()).catch(error => { console.error('Database initialization failed:', error); const status = $('#dbStatus'); if (status) status.textContent = 'تعذر تحميل قاعدة البيانات'; const results = $('#results'); if (results) results.innerHTML = '<div class="empty-state"><strong>تعذر تحميل قاعدة البيانات</strong><p>' + esc(error && error.message || 'خطأ غير معروف') + '</p><button class="secondary" onclick="location.reload()">إعادة المحاولة</button></div>'; });
