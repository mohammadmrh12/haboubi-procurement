#!/usr/bin/env node
// Rebuild the bundled catalogue from original 2026 Excel workbooks while preserving every source need row.
// Usage: node scripts/rebuild-catalog-from-workbooks.js /path/to/Downloads
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const XLSX = require('../vendor/xlsx.full.min.js');
const root = path.resolve(process.argv[2] || path.join(process.env.HOME || '', 'Downloads'));
const project = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(project, 'app.js'), 'utf8');
const cut = source.indexOf('\n$$(".nav").forEach(button => button.onclick');
if (cut < 0) throw new Error('Could not isolate the workbook parser from app.js');
const context = { console, XLSX, document: { querySelector: () => ({}) }, setTimeout, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.createContext(context);
vm.runInContext(source.slice(0, cut) + '\nglobalThis.__catalogTools = { parseWorkbook, mergeItem, reviewNameBase, norm };', context);
const tools = context.__catalogTools;
const old = JSON.parse(fs.readFileSync(path.join(project, 'catalog-seed.json'), 'utf8'));
const items = [];
const positions = new Map();
const keyOf = item => {
  const code = tools.norm(item.code).replace(/\s/g, '');
  const name = tools.reviewNameBase(item) || tools.norm(item.name);
  return code ? code + '|' + name : 'no-code|' + name + '|' + tools.norm(item.source);
};
function add(item) {
  const key = keyOf(item);
  if (positions.has(key)) {
    const index = positions.get(key);
    items[index] = tools.mergeItem(items[index], item);
  } else {
    positions.set(key, items.length);
    items.push({ ...item });
  }
}
for (const item of old.items || []) add(item);
const workbookFiles = fs.readdirSync(root).filter(name => name.toLowerCase().endsWith('.xlsx')).sort((a,b) => a.localeCompare(b, 'en'));
if (!workbookFiles.length) throw new Error('No .xlsx source workbooks found in ' + root);
const files = [];
let parsedRows = 0, skippedRows = 0, sheetsRead = 0;
for (const name of workbookFiles) {
  const fullPath = path.join(root, name);
  const bytes = fs.readFileSync(fullPath);
  const workbook = XLSX.read(bytes, { type: 'buffer', cellText: true, cellDates: false });
  const parsed = tools.parseWorkbook({ name }, workbook);
  parsedRows += parsed.items.length;
  skippedRows += parsed.skipped;
  sheetsRead += parsed.sheetsRead;
  for (const item of parsed.items) add(item);
  files.push({ name, size: bytes.length, hash: crypto.createHash('sha256').update(bytes).digest('hex'), sheetsRead: parsed.sheetsRead });
}
const finalItems = items.map((item, index) => ({
  ...item,
  id: index + 1,
  category: item.kind === 'drug' ? 'أدوية' : 'مستلزمات طبية',
  sources: item.sources || [{ source: item.source, sheet: item.sheet, row: item.row }],
  needRecords: item.needRecords || [{ annual: item.annual, needRaw: item.needRaw || '', source: item.source, sheet: item.sheet, row: item.row, note: item.note || '', priority: item.priority || '' }]
}));
const output = { items: finalItems, files };
const json = JSON.stringify(output);
fs.writeFileSync(path.join(project, 'catalog-seed.json'), JSON.stringify(output, null, 2) + '\n');
fs.writeFileSync(path.join(project, 'catalog-seed.js'), 'window.HABOUBI_DEFAULT_CATALOG=' + json + ';\n');
const terms = /adrenaline|epinephrine|ceftriaxone|ceftrixone/i;
console.log(JSON.stringify({ sourceFolder: root, workbooks: files.length, sheetsRead, parsedRows, skippedRows, finalCatalogItems: finalItems.length, positiveNeedItems: finalItems.filter(item => Number(item.annual) > 0).length, itemsWithMultipleDistinctNeeds: finalItems.filter(item => new Set((item.needRecords || []).filter(record => record.annual != null && record.annual !== '').map(record => String(Number(record.annual)))).size > 1).length, targetItems: finalItems.filter(item => terms.test(item.name + ' ' + (item.sourceNameRaw || ''))).map(item => ({ name: item.name, code: item.code, annual: item.annual, needs: item.needRecords, source: item.source, row: item.row })), outputBytes: Buffer.byteLength(json) }, null, 2));
