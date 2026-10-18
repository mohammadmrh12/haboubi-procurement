(() => {
  const $ = s => document.querySelector(s);
  let currentUser = null;
  const gate = $('#authGate'), form = $('#loginForm'), code = $('#loginCode'), error = $('#loginError');
  const nativeRequests = new Map();
  let nativeRequestId = 0;
  window.haboubiNativeApiResult = (id, status, raw) => {
    const pending = nativeRequests.get(String(id));
    if (!pending) return;
    nativeRequests.delete(String(id));
    let data; try { data = JSON.parse(raw || '{}'); } catch { data = {error:'استجابة غير مفهومة من الخادم'}; }
    if (status >= 200 && status < 300) pending.resolve(data);
    else { const err=new Error(data.error || 'تعذر إكمال الطلب (' + status + ')');err.status=status;err.data=data;pending.reject(err); }
  };
  async function api(url, options={}) {
    const method = String(options.method || 'GET').toUpperCase();
    const body = typeof options.body === 'string' ? options.body : (options.body == null ? '' : JSON.stringify(options.body));
    if (window.AndroidApp && typeof window.AndroidApp.apiRequest === 'function') {
      const id = String(++nativeRequestId);
      return new Promise((resolve, reject) => {
        nativeRequests.set(id, {resolve, reject});
        try { window.AndroidApp.apiRequest(String(url), method, body, id); }
        catch (err) { nativeRequests.delete(id); reject(new Error('تعذر بدء الاتصال بالخادم من تطبيق أندرويد')); }
      });
    }
    const response = await fetch(url, { credentials:'same-origin', cache:'no-store', ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})} });
    const data = await response.json().catch(()=>({error:'استجابة غير مفهومة من الخادم'}));
    if (!response.ok) {const err=new Error(data.error || 'تعذر إكمال الطلب');err.status=response.status;err.data=data;throw err;}
    return data;
  }
  async function unlock(user) {
    currentUser = user;
    gate.classList.add('auth-hidden');
    document.body.classList.remove('auth-locked');
    const title = document.querySelector('.top-actions');
    if (title && !$('#userSession')) {
      const label = document.createElement('span'); label.id='userSession'; label.className='user-session';
      label.textContent=user.name;
      const logout=document.createElement('button'); logout.type='button'; logout.id='logoutBtn'; logout.className='secondary logout-btn'; logout.textContent='تسجيل الخروج';
      title.prepend(logout,label);
      logout.addEventListener('click', async()=>{try{await api('/api/logout',{method:'POST',body:'{}'});}catch{}for(let i=1;i<=10;i++)sessionStorage.removeItem('haboubi-sync-user-'+i);location.reload();});
    }
    await syncUserData(user);
    loadHistory();
  }
  form.addEventListener('submit', async e => {
    e.preventDefault(); error.textContent=''; const button=$('#loginSubmit'); button.disabled=true; button.textContent='جارٍ التحقق…';
    try { const result=await api('/api/login',{method:'POST',body:JSON.stringify({code:code.value,remember:$('#rememberDevice').checked})}); unlock(result.user); }
    catch(err){error.textContent=err.message;code.select();}
    finally{button.disabled=false;button.textContent='دخول';}
  });
  let dataSaveTimer=null, latestData=null, lastServerUpdatedAt=0, syncTimer=null, syncBusy=false, localDirty=false;
  const CLOUD_REVISION_KEY='haboubiCloudUpdatedAt';
  function setSyncStatus(message, ok=false){const status=$('#dbStatus');if(status){status.textContent=message;status.dataset.sync=ok?'ok':'error';}}
  function readLocalMinutePreferences(){const prefs={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key||!key.startsWith('haboubiMinutes:'))continue;const rawKey=key.slice('haboubiMinutes:'.length);try{prefs[rawKey.startsWith('selected:')?rawKey:'custom:'+rawKey]=rawKey.startsWith('selected:')?localStorage.getItem(key):JSON.parse(localStorage.getItem(key)||'[]');}catch{}}return prefs;}
  function applyRemoteData(data,userId){
    for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key&&key.startsWith('haboubiMinutes:'))localStorage.removeItem(key);}
    localStorage.setItem('haboubiDataV2',JSON.stringify({items:Array.isArray(data.items)?data.items:[],files:Array.isArray(data.files)?data.files:[]}));
    const settings=data.settings&&typeof data.settings==='object'?data.settings:{};
    localStorage.setItem('haboubiSettings',JSON.stringify(settings));
    localStorage.setItem('haboubiLocalUserId',String(userId));
    localStorage.setItem(CLOUD_REVISION_KEY,String(Number(data.updatedAt)||0));
    const prefs=settings.minutesPreferences&&typeof settings.minutesPreferences==='object'?settings.minutesPreferences:{};
    Object.entries(prefs).forEach(([key,value])=>{if(key.startsWith('custom:'))localStorage.setItem('haboubiMinutes:'+key.slice(7),JSON.stringify(Array.isArray(value)?value:[]));else if(key.startsWith('selected:')){const prefKey=key.slice(9);if(value===null||value==='')localStorage.removeItem('haboubiMinutes:selected:'+prefKey);else localStorage.setItem('haboubiMinutes:selected:'+prefKey,String(value));}});
  }
  function mergeSyncData(local,remote){
    const signature=item=>{const key=[String(item.code||'').trim().toLowerCase(),String(item.name||'').trim().toLowerCase()].join('|');return key==='|'?JSON.stringify(item):key;};
    const items=new Map((Array.isArray(remote.items)?remote.items:[]).map(item=>[signature(item),item]));
    for(const item of (Array.isArray(local.items)?local.items:[])){const key=signature(item);items.set(key,items.has(key)?{...items.get(key),...item}:item);}
    const files=new Map();for(const file of [...(remote.files||[]),...(local.files||[])]){const key=String(file.name||file.source||JSON.stringify(file));if(!files.has(key))files.set(key,file);}
    const remoteSettings=remote.settings&&typeof remote.settings==='object'?remote.settings:{};const localSettings=local.settings&&typeof local.settings==='object'?local.settings:{};
    const settings={...remoteSettings,...localSettings,minutesPreferences:{...(remoteSettings.minutesPreferences||{}),...(localSettings.minutesPreferences||{})}};
    return {items:[...items.values()],files:[...files.values()],settings};
  }
  function hasActiveEdits(){return !!document.querySelector('.edit-name-dialog:not(.hidden), #minutesDialog, #historyEditDialog:not(.hidden), #editNameDialog:not(.hidden)') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'');}
  function startContinuousSync(){if(syncTimer)clearInterval(syncTimer);syncTimer=setInterval(()=>{if(document.visibilityState==='visible')pollRemoteData();},12000);window.addEventListener('online',pollRemoteData);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pollRemoteData();});}
  async function pollRemoteData(){if(!currentUser||syncBusy||dataSaveTimer)return;syncBusy=true;try{await loadHistory(true);const result=await api('/api/data');const remote=result.data;if(!remote)return;const revision=Number(remote.updatedAt)||0;if(revision<=lastServerUpdatedAt)return;if(localDirty||hasActiveEdits()){setSyncStatus('توجد تعديلات بانتظار المزامنة',false);return;}applyRemoteData(remote,currentUser.id);lastServerUpdatedAt=revision;sessionStorage.setItem('haboubi-sync-user-'+currentUser.id,'1');setSyncStatus('تمت مزامنة آخر التعديلات',true);location.reload();}catch(err){console.error('Continuous cloud sync failed',err);setSyncStatus('بانتظار الاتصال لمزامنة التعديلات',false);}finally{syncBusy=false;}}
  async function syncUserData(user){
    try{
      await (window.haboubiAppReady||Promise.resolve());
      const result=await api('/api/data');
      const remote=result.data;
      const marker='haboubi-sync-user-'+user.id;
      const localOwner=localStorage.getItem('haboubiLocalUserId');
      if(remote){
        const revision=Number(remote.updatedAt)||0;
        const knownRevision=Number(localStorage.getItem(CLOUD_REVISION_KEY)||0);
        if(!sessionStorage.getItem(marker)||localOwner!==String(user.id)||revision>knownRevision){
          const settings=remote.settings&&typeof remote.settings==='object'?{...remote.settings}:{};
          const remotePrefs=settings.minutesPreferences&&typeof settings.minutesPreferences==='object'?{...settings.minutesPreferences}:{};
          const legacyPrefs=localOwner===String(user.id)?readLocalMinutePreferences():{};
          const migratedKeys=[];for(const [key,value] of Object.entries(legacyPrefs)){if(!Object.prototype.hasOwnProperty.call(remotePrefs,key)){remotePrefs[key]=value;migratedKeys.push(key);}}
          settings.minutesPreferences=remotePrefs;
          applyRemoteData({...remote,settings},user.id);sessionStorage.setItem(marker,'1');lastServerUpdatedAt=revision;localDirty=false;
          if(migratedKeys.length){try{const saved=await api('/api/data',{method:'PUT',body:JSON.stringify({data:{items:remote.items||[],files:remote.files||[],settings}})});lastServerUpdatedAt=Number(saved.updatedAt)||Date.now();localStorage.setItem(CLOUD_REVISION_KEY,String(lastServerUpdatedAt));}catch(err){console.error('Legacy preferences migration failed',err);}}
          location.reload();return;
        }
        lastServerUpdatedAt=Math.max(revision,knownRevision);
      }else{
        if(localOwner&&localOwner!==String(user.id)){
          const embedded=window.HABOUBI_DEFAULT_CATALOG||{items:[],files:[]};
          applyRemoteData({items:embedded.items||[],files:embedded.files||[],settings:{},updatedAt:0},user.id);
          sessionStorage.setItem(marker,'1');location.reload();return;
        }
        localStorage.setItem('haboubiLocalUserId',String(user.id));
        let local={items:[],files:[]},settings={};
        try{local=JSON.parse(localStorage.getItem('haboubiDataV2')||'{"items":[],"files":[]}');}catch{}
        try{settings=JSON.parse(localStorage.getItem('haboubiSettings')||'{}');}catch{}
        const saved=await api('/api/data',{method:'PUT',body:JSON.stringify({data:{items:Array.isArray(local.items)?local.items:[],files:Array.isArray(local.files)?local.files:[],settings},baseUpdatedAt:0})});lastServerUpdatedAt=Number(saved.updatedAt)||Date.now();localStorage.setItem(CLOUD_REVISION_KEY,String(lastServerUpdatedAt));sessionStorage.setItem(marker,'1');
      }
      setSyncStatus('المزامنة التلقائية مفعّلة',true);startContinuousSync();
    }catch(err){console.error('Cloud data sync failed',err);setSyncStatus('تعذر الاتصال بالمزامنة؛ ستتم إعادة المحاولة تلقائياً',false);startContinuousSync();}
  }
  function scheduleDataSave(data){
    latestData=data;localDirty=true;try{localStorage.setItem('haboubiLocalDirty','1');}catch{}clearTimeout(dataSaveTimer);
    setSyncStatus('جارٍ حفظ التعديلات ومزامنتها…',true);
    dataSaveTimer=setTimeout(async()=>{
      dataSaveTimer=null;
      if(!currentUser||!latestData)return;
      try{const result=await api('/api/data',{method:'PUT',body:JSON.stringify({data:latestData,baseUpdatedAt:lastServerUpdatedAt})});lastServerUpdatedAt=Number(result.updatedAt)||Date.now();localStorage.setItem(CLOUD_REVISION_KEY,String(lastServerUpdatedAt));localDirty=false;try{localStorage.removeItem('haboubiLocalDirty');}catch{}setSyncStatus('تم حفظ التعديلات ومزامنتها',true);}
      catch(err){if(err.status===409&&err.data?.data){latestData=mergeSyncData(latestData,err.data.data);lastServerUpdatedAt=Number(err.data.data.updatedAt)||0;try{localStorage.setItem('haboubiDataV2',JSON.stringify({items:latestData.items,files:latestData.files}));localStorage.setItem('haboubiSettings',JSON.stringify(latestData.settings));}catch{}scheduleDataSave(latestData);return;}console.error('Cloud data save failed',err);setSyncStatus('تعذر مزامنة البيانات؛ ستتم إعادة المحاولة تلقائياً',false);setTimeout(()=>{if(currentUser&&latestData)scheduleDataSave(latestData);},5000);}
    },650);
  }
  function saveMinutePreference(key,value){
    try{const settings=JSON.parse(localStorage.getItem('haboubiSettings')||'{}');settings.minutesPreferences=settings.minutesPreferences||{};settings.minutesPreferences[key]=value;localStorage.setItem('haboubiSettings',JSON.stringify(settings));const raw=JSON.parse(localStorage.getItem('haboubiDataV2')||'{"items":[],"files":[]}');scheduleDataSave({items:Array.isArray(raw.items)?raw.items:[],files:Array.isArray(raw.files)?raw.files:[],settings});return true;}catch(err){console.error('Minute preference sync failed',err);return false;}
  }
  async function loadHistory(quiet=false){
    const list=$('#historyList'); if(!list)return; if(!quiet)list.innerHTML='<p class="muted">جارٍ تحميل السجل…</p>';
    try{
      const result=await api('/api/history'); const rows=result.items||[];
      if(!rows.length){list.innerHTML='<p class="muted">لا توجد عمليات محفوظة لهذا المستخدم حتى الآن.</p>';return;}
      list.replaceChildren();
      rows.forEach(row=>{
        const card=document.createElement('article');card.className='history-item';
        const heading=document.createElement('div');heading.className='history-heading';
        const title=document.createElement('strong');title.textContent=row.kind+' · '+new Date(row.createdAt).toLocaleString('ar-IQ');
        const count=document.createElement('span');count.textContent=(row.items||[]).length+' مواد';
        heading.append(title,count);
        const detail=document.createElement('div');detail.className='history-material-list';(row.items||[]).forEach((item,index)=>{const line=document.createElement('div');line.className='history-material-line';const name=document.createElement('span');name.className='history-material-name';name.textContent=(index+1)+'- '+(item.name||'مادة بدون اسم');const qty=document.createElement('span');qty.className='history-material-qty';const rawQty=item.qty??item.requested;qty.textContent='العدد: '+(rawQty===undefined||rawQty===null||String(rawQty).trim()===''?'—':String(rawQty));line.append(name,qty);detail.append(line);});
        const actions=document.createElement('div');actions.className='history-actions';
        const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='تعديل';edit.addEventListener('click',()=>{if(window.haboubiLoadHistoryForEdit){window.haboubiLoadHistoryForEdit(row);}});
        const reprint=document.createElement('button');reprint.type='button';reprint.className='primary';reprint.textContent='طباعة';reprint.addEventListener('click',()=>{const y=$('#letterYear'),a=$('#authorizedName'),s=$('#storekeeperName');if(y)y.value=row.year||'2026';if(a)a.value=row.authorizedName||'';if(s)s.value=row.storekeeperName||'';if(window.haboubiPrintSaved)window.haboubiPrintSaved(row.items);});const remove=document.createElement('button');remove.type='button';remove.className='history-delete-btn';remove.textContent='حذف';remove.addEventListener('click',async()=>{if(!confirm('حذف هذه العملية من السجل السابق؟ لا يمكن التراجع عن الحذف.'))return;remove.disabled=true;try{await api('/api/history?id='+encodeURIComponent(row.id),{method:'DELETE'});await loadHistory();}catch(err){alert('تعذر حذف العملية: '+err.message);remove.disabled=false;}});const receipt=document.createElement('button');receipt.type='button';receipt.className='secondary';receipt.textContent='محضر الاستلام';receipt.addEventListener('click',()=>window.haboubiPrintMinutes?.('receipt',row));const evalBtn=document.createElement('button');evalBtn.type='button';evalBtn.className='secondary';evalBtn.textContent='محضر التقييم';const hasSupplies=(row.items||[]).some(item=>{const catalog=window.haboubiCatalogItems?.find?.(x=>String(x.code||'').trim()===String(item.code||'').trim());return catalog&&catalog.kind!=='drug'});evalBtn.hidden=!hasSupplies;evalBtn.addEventListener('click',()=>window.haboubiPrintMinutes?.('evaluation',row));const referral=document.createElement('button');referral.type='button';referral.className='secondary';referral.textContent='قرار الإحالة';referral.addEventListener('click',()=>window.haboubiPrintMinutes?.('referral',row));actions.append(edit,reprint,receipt,evalBtn,referral,remove);card.append(heading,detail,actions);list.append(card);
      });
    }catch(err){list.innerHTML='';const p=document.createElement('p');p.className='login-error';p.textContent=err.message;list.append(p);}
  }
  function openHistoryEditor(row){
    let modal=document.querySelector('#historyEditDialog');
    if(!modal){modal=document.createElement('div');modal.id='historyEditDialog';modal.className='edit-name-dialog';modal.innerHTML='<form class="edit-name-card history-edit-card"><button type="button" class="edit-name-close" data-close-history aria-label="إغلاق">×</button><h2>تعديل العملية المحفوظة</h2><p class="muted">التعديلات تُحفظ في سجل هذا المستخدم فقط.</p><label>السنة</label><select name="year" aria-label="سنة العملية"></select><label>اسم المخوّل</label><input name="authorizedName" maxlength="200"><label>اسم أمين المخزن</label><input name="storekeeperName" maxlength="200"><div class="history-edit-items"></div><div class="button-row"><button type="submit" class="primary">حفظ التعديلات</button><button type="button" class="secondary" data-close-history>إلغاء</button></div></form>';document.body.append(modal);
      modal.querySelectorAll('[data-close-history]').forEach(b=>b.addEventListener('click',()=>modal.classList.add('hidden')));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
      modal.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const save=form.querySelector('button[type=submit]');const items=[...form.querySelectorAll('.history-edit-row')].map(r=>({name:r.querySelector('[name=name]').value.trim(),code:r.querySelector('[name=code]').value.trim(),qty:r.querySelector('[name=qty]').value.trim(),spec:r.querySelector('[name=spec]').value.trim(),note:r.querySelector('[name=note]').value.trim()}));if(items.some(x=>!x.name)){alert('اسم المادة مطلوب لكل صف.');return;}const zeroItems=items.filter(x=>x.qty!==''&&Number(x.qty)===0);if(zeroItems.length&&!confirm('تنبيه: توجد مادة أو أكثر كميتها صفر. هل تريد حفظ الصفر فعلاً؟ إذا كان العدد ناتجاً عن تعديل سابق بالخطأ، اختر إلغاء وصحح الكمية قبل الحفظ.'))return;save.disabled=true;try{await api('/api/history?id='+encodeURIComponent(form.dataset.id),{method:'PUT',body:JSON.stringify({year:form.elements.year.value,authorizedName:form.elements.authorizedName.value,storekeeperName:form.elements.storekeeperName.value,items})});modal.classList.add('hidden');await loadHistory();}catch(err){alert('تعذر حفظ التعديلات: '+err.message);}finally{save.disabled=false;}});
    }
    const form=modal.querySelector('form');form.dataset.id=row.id;const yearSelect=form.elements.year;yearSelect.replaceChildren();for(let year=2000;year<=2100;year++){const option=document.createElement('option');option.value=String(year);option.textContent=String(year);yearSelect.append(option);}yearSelect.value=String(Math.min(2100,Math.max(2000,Number(row.year)||2026)));yearSelect.addEventListener('change',()=>{try{const settings=JSON.parse(localStorage.getItem('haboubiSettings')||'{}');settings.letterYear=yearSelect.value;settings.letterYearManual=true;localStorage.setItem('haboubiSettings',JSON.stringify(settings));if(currentUser)scheduleDataSave({items:JSON.parse(localStorage.getItem('haboubiDataV2')||'{"items":[],"files":[]}').items||[],files:JSON.parse(localStorage.getItem('haboubiDataV2')||'{"items":[],"files":[]}').files||[],settings});}catch(err){console.error('Unable to save selected year',err);}});form.elements.authorizedName.value=row.authorizedName||'';form.elements.storekeeperName.value=row.storekeeperName||'';const container=form.querySelector('.history-edit-items');container.replaceChildren();
    const zeroCount=(row.items||[]).filter(item=>item.qty!==''&&Number(item.qty)===0).length;
    if(zeroCount){const warning=document.createElement('p');warning.className='warning';warning.textContent='تنبيه: هذه العملية تحتوي '+zeroCount+' مادة محفوظة بكمية صفر. راجع الكمية قبل الحفظ؛ لن تُستعاد الكمية القديمة تلقائياً إذا كانت قد حُفظت صفراً سابقاً.';container.append(warning);}
    (row.items||[]).forEach((item,i)=>{const section=document.createElement('fieldset');section.className='history-edit-row';const legend=document.createElement('legend');legend.textContent='المادة '+(i+1);section.append(legend);for(const [key,label,value] of [['name','اسم المادة',item.name],['code','الرمز الوطني',item.code],['qty','الكمية',item.qty],['spec','المواصفة / الجرعة',item.spec],['note','ملاحظات',item.note]]){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.name=key;input.value=value||'';input.maxLength=key==='name'?400:300;l.append(input);section.append(l);}container.append(section);});modal.classList.remove('hidden');
  }
  $('#refreshHistory')?.addEventListener('click',loadHistory);
  $('#refreshAppData')?.addEventListener('click', async () => {
    const button=$('#refreshAppData'); button.disabled=true; const old=button.textContent; button.textContent='جارٍ تحديث البيانات…';
    try {
      if(!currentUser) throw new Error('سجّل الدخول أولاً');
      const result=await api('/api/data');
      if(!result.data) throw new Error('لا توجد نسخة بيانات محفوظة لهذا المستخدم على الموقع');
      localStorage.setItem('haboubiDataV2',JSON.stringify({items:result.data.items||[],files:result.data.files||[]}));
      localStorage.setItem('haboubiSettings',JSON.stringify(result.data.settings||{}));
      localStorage.setItem('haboubiLocalUserId',String(currentUser.id));
      sessionStorage.setItem('haboubi-sync-user-'+currentUser.id,'1');
      location.reload();
    } catch(err) { alert('تعذر تحديث البيانات: '+err.message); button.disabled=false; button.textContent=old; }
  });
  window.haboubiAuth = {
    get user(){return currentUser;},
    api,
    scheduleDataSave,
    saveMinutePreference,
    async saveOperation(items){
      const normalizedItems=(Array.isArray(items)?items:[]).map(item=>({
        name:item.formName||item.name||'',
        code:item.code||'',
        qty:item.requested??item.qty??'',
        spec:item.specification||item.spec||item.dose||'',
        note:item.note||''
      }));
      const payload={kind:'اعتذار وتخويل',items:normalizedItems,year:$('#letterYear')?.value||'2026',authorizedName:$('#authorizedName')?.value||'',storekeeperName:$('#storekeeperName')?.value||''};
      const result=await api('/api/history',{method:'POST',body:JSON.stringify(payload)});await loadHistory();return result.item;
    },
    async restoreSession(){
      try{const result=await api('/api/session');unlock(result.user);}
      catch{document.body.classList.add('auth-locked');gate.classList.remove('auth-hidden');setTimeout(()=>code.focus(),100);}
    }
  };
  document.body.classList.add('auth-locked');
  window.haboubiAuth.restoreSession();
})();