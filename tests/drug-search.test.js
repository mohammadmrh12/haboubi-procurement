const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = require('node:path').join(__dirname, '..');
const app = fs.readFileSync(root + '/app.js', 'utf8');
const start = app.indexOf('function latinPhoneticKey(value)');
const end = app.indexOf('function editDistance(a,b)', start);
assert.ok(start >= 0 && end > start, 'drug search functions should exist');
const searchFunctions = app.slice(start, end);
const helpers = `
function clean(value){return value==null?'':String(value).replace(/\\s+/g,' ').trim()}
function norm(value){return clean(value).toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[^\\p{L}\\p{N}]+/gu,' ').trim()}
function editDistance(a,b){if(Math.abs(a.length-b.length)>3)return 99;let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(c[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[b.length]}
`;
const context = { window: {}, Map, Math, Array, String };
vm.createContext(context);
vm.runInContext(fs.readFileSync(root + '/drug-aliases.js', 'utf8'), context);
vm.runInContext(helpers + searchFunctions + `this.score=(item,q)=>scoreItem(item,q); this.phonetic=latinPhoneticKey;`, context);
const capecitabine = { name: 'Capecitabine 500mg tablet', code: '15-AB0-099' };
assert.ok(context.score(capecitabine, 'xeloda') >= 1100, 'Xeloda should return capecitabine first');
assert.ok(context.score(capecitabine, 'زيلودا') >= 1100, 'Arabic spelling of Xeloda should return capecitabine');
assert.equal(context.phonetic('Xeloda'), context.phonetic('زيلودا'), 'Arabic and English brand transliterations should normalize together');
assert.ok(context.score({ name: 'Paracetamol 500mg Tablet' }, 'acetaminophen') >= 1100, 'generic synonyms should cross-match');
const aliases = JSON.parse(fs.readFileSync(root + '/drug-aliases.json', 'utf8')).aliases;
assert.ok(Object.keys(aliases).length >= 1000, 'researched brand crosswalk should contain broad brand coverage');
console.log(`PASS: brand/generic search, Arabic transliteration, synonyms, and ${Object.keys(aliases).length} trade-name aliases.`);
