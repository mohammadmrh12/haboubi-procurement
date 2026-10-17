const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");
const marker = '\n$$(\".nav\").forEach(button => button.onclick';
const cut = source.indexOf(marker);
assert.notEqual(cut, -1, "parser test marker must exist in app.js");
const testSource = source.slice(0, cut) + "\nglobalThis.__test = { parseWorkbook, cleanImportedMaterialName, mergeItem };";
const context = {
  console,
  XLSX: { utils: { sheet_to_json: sheet => sheet.rows } },
  document: { querySelector: () => ({}) },
  setTimeout,
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {}
};
vm.createContext(context);
vm.runInContext(testSource, context);
const { parseWorkbook, cleanImportedMaterialName, mergeItem } = context.__test;
function run(name, rows, sheetName = "Sheet1") {
  return parseWorkbook({ name }, { SheetNames: [sheetName], Sheets: { [sheetName]: { rows } } });
}
const dental = run("dental supplies 2026.xlsx", [
  ["120","DENTAL SUPPLIES","وحدة القياس","الاولوية الاستيرادية","احتياج 2026","مصروف 2023"],
  ["NEW CODE","DENTAL SUPPLIES","","","",""],
  ["","operative","","","",""],
  ["DNS-DE00-001","Amalgum cap Box of 50","Box","A","500",""]
]);
assert.equal(dental.items.length, 1);
assert.equal(dental.items[0].code, "DNS-DE00-001");
assert.equal(dental.items[0].unit, "Box");
assert.equal(dental.items[0].annual, 500);

const cardiac = run("cardiac.xlsx", [
  ["","الرقم الرمزي","اسم المادة","وحدة القياس"],
  ["CRD-RE00-001","M15-Alc-002","Electrode disc for ECG metalic","pcs"],
  ["CRD-RE00-002","M15-Alc-003","Weight and length measurment","pcs"]
]);
assert.equal(cardiac.items.length, 2);
assert.equal(cardiac.items[0].code, "CRD-RE00-001");

const drugs = run("قائمة الادوية الاساسية 2026.xlsx", [
  ["احتياج عام 2026","","","","","الاستطباب","احتياج 2026","مصروف 2023"],
  ["NATIONAL CODE","ITEMS","UNIT DOSE","NOTE","A1+A2","","",""],
  ["1A","DIURETICS","","","0","","",""],
  ["01-AA0-004","Digoxin 250 mcg tablet","Tablet","","A1","","0",""],
  ["01-B00-005","Furosemide 20mg Ampoule","Ampoule","","A1","","600",""]
]);
assert.equal(drugs.items.length, 2);
assert.equal(drugs.items[0].kind, "drug");
assert.equal(drugs.items[0].annual, 0);
assert.equal(drugs.items[1].annual, 600);

const oncology = run("السرطانية 2026.xlsx", [
  ["NATIONAL CODE","ITEMS","UNIT","NOTE","المستوى","الاستطباب","احتياج 2024","الاستطباب","طريقة الاحتساب","احتياج عام 2026"],
  ["04-F00-025","Aprepitant 125 mg","pocket","note","A1","","","","","8500"]
], "احتياج 2026");
assert.equal(oncology.items[0].annual, 8500);
assert.equal(oncology.items[0].kind, "drug");

const needContinuation = run("قائمة الادوية الاساسية 2026.xlsx", [
  ["NATIONAL CODE", "ITEMS", "UNIT DOSE", "NOTE", "PRIORITY", "الاستطباب", "احتياج 2026"],
  ["14-DB0-004", "Adrenaline 1mg/ml (1ml ampoule) s.c,i.m أن مادة الـ Adrenaline for I.V use after dilution ".padEnd(430, "x"), "amp", "", "A1", "طوارئ", "100"],
  ["", "", "", "", "", "تخدير", "700"],
  ["05-AB0-031", "Ceftriaxone 1g I.V. Injection + solvent water for injection ملاحظات وتحذيرات رسمية ".padEnd(700, "x"), "vial", "", "A1", "", "25000"]
]);
const adrenaline = needContinuation.items.find(item => item.code === "14-DB0-004");
assert.ok(adrenaline, "adrenaline must not be skipped because official committee notes make the source cell long");
assert.equal(adrenaline.annual, 700, "default need should be a positive value rather than the earlier zero/smaller row");
assert.deepEqual(Array.from(adrenaline.needRecords, record => Number(record.annual)), [100, 700], "merged/continuation need rows must both be preserved without summing");
const ceftriaxone = needContinuation.items.find(item => item.code === "05-AB0-031");
assert.ok(ceftriaxone, "ceftriaxone must remain searchable when committee notes are embedded in its name cell");
assert.equal(ceftriaxone.annual, 25000);
assert.ok(ceftriaxone.name.startsWith("Ceftriaxone 1g I.V. Injection"), "committee notes should not pollute the material name");
const mergedNeed = mergeItem({name:"Test drug",code:"TEST-1",annual:0,source:"old.xlsx",sheet:"Sheet1",row:2}, {name:"Test drug",code:"TEST-1",annual:250,needRaw:"250",source:"new.xlsx",sheet:"Sheet1",row:8});
assert.equal(mergedNeed.annual, 250, "a later positive source need must replace a duplicate zero as the default value");
assert.deepEqual(Array.from(mergedNeed.needRecords, record => Number(record.annual)), [0, 250], "all source need values must remain available for audit");
console.log("PASS: Excel layouts, long annotated names, continuation needs, and positive-need preservation.");
