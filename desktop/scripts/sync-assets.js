const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const dest = path.resolve(__dirname, '../assets');
const files = [
  'index.html','styles.css','app.js','auth.js','forms-addon.js',
  'catalog-seed.js','drug-aliases.js','catalog-seed.json','drug-aliases.json',
  'manifest.json','logo.svg','iraqi-ministry-health-logo.svg','sw.js',
  'public-search.html','public-search.css','public-search.js','public-search-manifest.json',
  'apple-touch-icon.png','apple-touch-icon-v3.png','vendor/xlsx.full.min.js'
];
fs.rmSync(dest, {recursive:true, force:true});
fs.mkdirSync(dest, {recursive:true});
for (const rel of files) {
  const from = path.join(root, rel);
  if (!fs.existsSync(from)) throw new Error(`Required app asset is missing: ${rel}`);
  const to = path.join(dest, rel);
  fs.mkdirSync(path.dirname(to), {recursive:true});
  fs.copyFileSync(from, to);
}
fs.copyFileSync(path.join(root, 'server.js'), path.join(dest, 'server.js'));
// Keep the settings-page APK link useful in Windows without bundling an Android installer in the desktop package.
const desktopIndex = path.join(dest, 'index.html');
fs.writeFileSync(desktopIndex, fs.readFileSync(desktopIndex, 'utf8').replace('href="haboubi-procurement-android-latest.apk?build=1.5.7-offline-sync"', 'href="https://medstock.cinematicplus.online/haboubi-procurement-android-latest.apk?build=1.5.7-offline-sync"'));
// Ensure desktop app assets use the same entrypoint scripts and print stylesheet as the web app.
console.log(`Prepared ${files.length + 1} shared assets from ${root}`);
