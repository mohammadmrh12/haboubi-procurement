(() => {
  const MANIFEST_URL='https://medstock.cinematicplus.online/android-update.json';
  const APP_VERSION='1.5.2';
  const CATALOG_KEY='haboubiCatalogVersionV1';
  const $=s=>document.querySelector(s);

  const say=message=>{const el=$('#updateStatus');if(el)el.textContent=message;};
  async function checkUpdates(manual=false){
    const button=$('#checkUpdatesBtn'); if(button)button.disabled=true;
    say('جارٍ التحقق من التحديثات…');
    try{
      const response=await fetch(MANIFEST_URL+'?t='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('تعذر الوصول إلى خادم التحديث');
      const manifest=await response.json();
      if(manifest.appVersionName && compare(manifest.appVersionName,APP_VERSION)>0){
        const apk=new URL(manifest.apkUrl,MANIFEST_URL).href;
        if(confirm('تتوفر نسخة أحدث من التطبيق ('+manifest.appVersionName+'). افتح رابط تنزيل APK؟')){
          if(window.AndroidApp&&window.AndroidApp.openUrl)window.AndroidApp.openUrl(apk);else window.open(apk,'_blank');
        }
      }
      const current=localStorage.getItem(CATALOG_KEY)||'';
      if(manifest.catalogVersion && manifest.catalogUrl && manifest.catalogVersion!==current){
        say('يتوفر تحديث لقاعدة المواد؛ جارٍ تنزيله…');
        const catalogUrl=new URL(manifest.catalogUrl,MANIFEST_URL).href;
        const catalogResponse=await fetch(catalogUrl+'?v='+encodeURIComponent(manifest.catalogVersion),{cache:'no-store'});
        if(!catalogResponse.ok)throw new Error('تعذر تنزيل قاعدة المواد');
        const catalog=await catalogResponse.json();
        if(!catalog||!Array.isArray(catalog.items)||!catalog.items.length)throw new Error('ملف قاعدة المواد غير صالح');
        // Replace stale bundled records while preserving records added by the user.
        try {
          const oldCatalog=window.HABOUBI_DEFAULT_CATALOG||{items:[],files:[]};
          const saved=JSON.parse(localStorage.getItem('haboubiDataV2')||'{"items":[],"files":[]}');
          const signature=item=>[String(item.code||'').trim().toLowerCase(),String(item.name||'').trim().toLowerCase()].join('|');
          const oldSignatures=new Set((oldCatalog.items||[]).map(signature));
          const savedItems=saved.items||[];
          const extras=savedItems.filter(item=>!oldSignatures.has(signature(item)));
          const updatedItems=[...catalog.items]; const known=new Set(updatedItems.map(signature));
          const bySignature=new Map(updatedItems.map(item=>[signature(item),item]));
          for(const item of savedItems){
            const bundled=bySignature.get(signature(item));if(!bundled)continue;
            const sn=item.annual==null||item.annual===''?null:Number(item.annual);const bn=bundled.annual==null||bundled.annual===''?null:Number(bundled.annual);
            if(Number.isFinite(sn)&&sn>0&&(!Number.isFinite(bn)||bn<=0)){bundled.annual=sn;bundled.needRaw=item.needRaw||String(sn);bundled.review=false;bundled.needSource=item.source||item.needSource||'سجل محفوظ للمستخدم';}
            if(Array.isArray(item.needRecords)){
              const records=new Map((bundled.needRecords||[]).map(record=>[[record.source,record.sheet,record.row].join('|'),record]));
              for(const record of item.needRecords){const key=[record.source,record.sheet,record.row].join('|');if(!records.has(key))records.set(key,record);else records.set(key,{...records.get(key),...record,needOnly:!!(records.get(key).needOnly||record.needOnly)});}
              bundled.needRecords=[...records.values()];
              const positive=bundled.needRecords.filter(record=>record.annual!=null&&record.annual!==''&&Number.isFinite(Number(record.annual))&&Number(record.annual)>0);
              if(positive.length&&!(Number(bundled.annual)>0)){bundled.annual=Math.max(...positive.map(record=>Number(record.annual)));bundled.needRaw=String(bundled.annual);bundled.review=false;}
            }
          }
          for(const item of extras){const key=signature(item);if(!known.has(key)){updatedItems.push(item);known.add(key);}}
          const updatedFiles=[...(catalog.files||[])]; const fileNames=new Set(updatedFiles.map(f=>String(f.name||f.source||'')));
          for(const file of (saved.files||[])){const key=String(file.name||file.source||'');if(key&&!fileNames.has(key)){updatedFiles.push(file);fileNames.add(key);}}
          localStorage.setItem('haboubiDataV2',JSON.stringify({items:updatedItems,files:updatedFiles}));
        } catch (mergeError) { console.error('Local catalog merge failed',mergeError); }
        localStorage.setItem('haboubiRemoteCatalogV1',JSON.stringify(catalog));
        localStorage.setItem(CATALOG_KEY,manifest.catalogVersion);
        say('تم تحديث قاعدة المواد إلى '+manifest.catalogVersion+'؛ جارٍ إعادة تحميل التطبيق…');
        location.reload();return;
      }
      say('التطبيق وقاعدة المواد محدّثان. آخر فحص: '+new Date().toLocaleString('ar-IQ'));
      if(manual)alert('ماكو تحديثات جديدة حالياً.');
    }catch(error){
      say('غير متصل بخادم التحديث. التطبيق وقاعدة البيانات المحلية ما زالا يعملان.');
      if(manual)alert('ما قدرنا نتحقق من التحديثات. تأكد من اتصال الإنترنت وحاول مرة ثانية.');
    }finally{if(button)button.disabled=false;}
  }
  function compare(a,b){const x=String(a).split(/[.+-]/).slice(0,3).map(v=>parseInt(v,10)||0),y=String(b).split(/[.+-]/).slice(0,3).map(v=>parseInt(v,10)||0);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)?1:-1;}return 0;}
  $('#checkUpdatesBtn')?.addEventListener('click',()=>checkUpdates(true));
  window.haboubiLocalUpdates={check:()=>checkUpdates(true)};
  checkUpdates(false);
})();
