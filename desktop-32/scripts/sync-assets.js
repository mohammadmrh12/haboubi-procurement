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
// Route Windows desktop printing through Electron's main-process native print dialog.
const desktopForms = path.join(dest, 'forms-addon.js');
let formsSource = fs.readFileSync(desktopForms, 'utf8');
const androidPrintBlock = ` if(window.AndroidApp&&typeof window.AndroidApp.printHtml==='function'){
  window.AndroidApp.printHtml(html,'file:///android_asset/www/styles.css');
  return;
 }`;
const desktopPrintBlock = androidPrintBlock + `
 if(window.haboubiDesktop?.isDesktop){const view=$('#'+viewId);if(!view)return;view.classList.add('printing');const old=$('#'+areaId);if(old)old.remove();const area=document.createElement('div');area.id=areaId;area.innerHTML=html.replaceAll('src=\"iraqi-ministry-health-logo.svg\"','src=\"'+new URL('iraqi-ministry-health-logo.svg',location.href).href+'\"');view.appendChild(area);window.haboubiDesktop.printCurrent().then(result=>{if(!result?.success&&result?.reason)alert('تعذرت طباعة المستند: '+result.reason)}).catch(err=>alert('تعذرت طباعة المستند: '+err.message)).finally(()=>{area.remove();view.classList.remove('printing')});return;}`;
if (!formsSource.includes('if(window.haboubiDesktop?.isDesktop){const view=')) {
  if (!formsSource.includes(androidPrintBlock)) throw new Error('Could not find canonical print block');
  formsSource = formsSource.replace(androidPrintBlock, desktopPrintBlock);
  formsSource = formsSource.replace('requestAnimationFrame(()=>{window.print();setTimeout(cleanup,3000)});', 'requestAnimationFrame(()=>{if(window.haboubiDesktop?.isDesktop)window.haboubiDesktop.printCurrent();else window.print();setTimeout(cleanup,3000)});');
  formsSource = formsSource.replace("window.addEventListener('afterprint',cleanup,{once:true});window.print();setTimeout(cleanup,60000);", "window.addEventListener('afterprint',cleanup,{once:true});if(window.haboubiDesktop?.isDesktop)window.haboubiDesktop.printCurrent();else window.print();setTimeout(cleanup,60000);");
  fs.writeFileSync(desktopForms, formsSource);
}
const desktopApp = path.join(dest, 'app.js');
fs.writeFileSync(desktopApp, fs.readFileSync(desktopApp, 'utf8').replace('view.appendChild(div); window.print();', 'view.appendChild(div); if(window.haboubiDesktop?.isDesktop)window.haboubiDesktop.printCurrent();else window.print();'));

// Ensure desktop app assets use the same entrypoint scripts and print stylesheet as the web app.
console.log(`Prepared ${files.length + 1} shared assets from ${root}`);
