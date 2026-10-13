const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");
const marker = '\n$$(\".nav\").forEach(button => button.onclick';
const cut = source.indexOf(marker);
assert.notEqual(cut, -1, "parser test marker must exist in app.js");
const testSource = source.slice(0, cut) + "\nglobalThis.__test = { parseWorkbook };";
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
const parseWorkbook = context.__test.parseWorkbook;
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
console.log("PASS: 4 Excel-layout parser fixtures.");
