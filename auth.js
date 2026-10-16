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
    else pending.reject(new Error(data.error || 'تعذر إكمال الطلب (' + status + ')'));
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
    if (!response.ok) throw new Error(data.error || 'تعذر إكمال الطلب');
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
  let dataSaveTimer=null, latestData=null;
  async function syncUserData(user){
    try{
      await (window.haboubiAppReady||Promise.resolve());
      const result=await api('/api/data');
      if(result.data){
        const marker='haboubi-sync-user-'+user.id;
        const localOwner=localStorage.getItem('haboubiLocalUserId');
        // A per-tab marker is not enough: a different user may have logged in in this tab.
        // Always replace local account data when its owner differs from the authenticated user.
        if(!sessionStorage.getItem(marker) || localOwner!==String(user.id)){
          localStorage.setItem('haboubiDataV2',JSON.stringify({items:result.data.items||[],files:result.data.files||[]}));
          localStorage.setItem('haboubiSettings',JSON.stringify(result.data.settings||{}));
          localStorage.setItem('haboubiLocalUserId',String(user.id));
          sessionStorage.setItem(marker,'1');location.reload();return;
        }
      }else{
        const localOwner=localStorage.getItem('haboubiLocalUserId');
        if(localOwner && localOwner!==String(user.id)){
          const embedded=window.HABOUBI_DEFAULT_CATALOG||{items:[],files:[]};
          localStorage.setItem('haboubiDataV2',JSON.stringify({items:embedded.items||[],files:embedded.files||[]}));
          localStorage.setItem('haboubiSettings','{}');localStorage.setItem('haboubiLocalUserId',String(user.id));
          sessionStorage.setItem('haboubi-sync-user-'+user.id,'1');location.reload();return;
        }
        localStorage.setItem('haboubiLocalUserId',String(user.id));
        let local={items:[],files:[]},settings={};
        try{local=JSON.parse(localStorage.getItem('haboubiDataV2')||'{"items":[],"files":[]}');}catch{}
        try{settings=JSON.parse(localStorage.getItem('haboubiSettings')||'{}');}catch{}
        await api('/api/data',{method:'PUT',body:JSON.stringify({data:{items:Array.isArray(local.items)?local.items:[],files:Array.isArray(local.files)?local.files:[],settings}})});
      }
    }catch(err){console.error('Cloud data sync failed',err);}
  }
  function scheduleDataSave(data){
    latestData=data;clearTimeout(dataSaveTimer);
    dataSaveTimer=setTimeout(async()=>{
      if(!currentUser||!latestData)return;
      try{await api('/api/data',{method:'PUT',body:JSON.stringify({data:latestData})});}
      catch(err){console.error('Cloud data save failed',err);const status=$('#dbStatus');if(status)status.textContent='تعذر مزامنة البيانات مع الموقع';}
    },650);
  }
  async function loadHistory(){
    const list=$('#historyList'); if(!list)return; list.innerHTML='<p class="muted">جارٍ تحميل السجل…</p>';
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
        const detail=document.createElement('p');detail.textContent=(row.items||[]).slice(0,3).map(x=>x.name).join('، ')+((row.items||[]).length>3?'…':'');
        const actions=document.createElement('div');actions.className='history-actions';
        const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='تعديل';edit.addEventListener('click',()=>{if(window.haboubiLoadHistoryForEdit){window.haboubiLoadHistoryForEdit(row);}});
        const reprint=document.createElement('button');reprint.type='button';reprint.className='primary';reprint.textContent='طباعة';reprint.addEventListener('click',()=>{const y=$('#letterYear'),a=$('#authorizedName'),s=$('#storekeeperName');if(y)y.value=row.year||'2026';if(a)a.value=row.authorizedName||'';if(s)s.value=row.storekeeperName||'';if(window.haboubiPrintSaved)window.haboubiPrintSaved(row.items);});const remove=document.createElement('button');remove.type='button';remove.className='history-delete-btn';remove.textContent='حذف';remove.addEventListener('click',async()=>{if(!confirm('حذف هذه العملية من السجل السابق؟ لا يمكن التراجع عن الحذف.'))return;remove.disabled=true;try{await api('/api/history?id='+encodeURIComponent(row.id),{method:'DELETE'});await loadHistory();}catch(err){alert('تعذر حذف العملية: '+err.message);remove.disabled=false;}});actions.append(edit,reprint,remove);card.append(heading,detail,actions);list.append(card);
      });
    }catch(err){list.innerHTML='';const p=document.createElement('p');p.className='login-error';p.textContent=err.message;list.append(p);}
  }
  function openHistoryEditor(row){
    let modal=document.querySelector('#historyEditDialog');
    if(!modal){modal=document.createElement('div');modal.id='historyEditDialog';modal.className='edit-name-dialog';modal.innerHTML='<form class="edit-name-card history-edit-card"><button type="button" class="edit-name-close" data-close-history aria-label="إغلاق">×</button><h2>تعديل العملية المحفوظة</h2><p class="muted">التعديلات تُحفظ في سجل هذا المستخدم فقط.</p><label>السنة</label><select name="year" aria-label="سنة العملية"></select><label>اسم المخوّل</label><input name="authorizedName" maxlength="200"><label>اسم أمين المخزن</label><input name="storekeeperName" maxlength="200"><div class="history-edit-items"></div><div class="button-row"><button type="submit" class="primary">حفظ التعديلات</button><button type="button" class="secondary" data-close-history>إلغاء</button></div></form>';document.body.append(modal);
      modal.querySelectorAll('[data-close-history]').forEach(b=>b.addEventListener('click',()=>modal.classList.add('hidden')));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
      modal.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const save=form.querySelector('button[type=submit]');const items=[...form.querySelectorAll('.history-edit-row')].map(r=>({name:r.querySelector('[name=name]').value.trim(),code:r.querySelector('[name=code]').value.trim(),qty:r.querySelector('[name=qty]').value.trim(),spec:r.querySelector('[name=spec]').value.trim(),note:r.querySelector('[name=note]').value.trim()}));if(items.some(x=>!x.name)){alert('اسم المادة مطلوب لكل صف.');return;}const zeroItems=items.filter(x=>x.qty!==''&&Number(x.qty)===0);if(zeroItems.length&&!confirm('تنبيه: توجد مادة أو أكثر كميتها صفر. هل تريد حفظ الصفر فعلاً؟ إذا كان العدد ناتجاً عن تعديل سابق بالخطأ، اختر إلغاء وصحح الكمية قبل الحفظ.'))return;save.disabled=true;try{await api('/api/history?id='+encodeURIComponent(form.dataset.id),{method:'PUT',body:JSON.stringify({year:form.elements.year.value,authorizedName:form.elements.authorizedName.value,storekeeperName:form.elements.storekeeperName.value,items})});modal.classList.add('hidden');await loadHistory();}catch(err){alert('تعذر حفظ التعديلات: '+err.message);}finally{save.disabled=false;}});
    }
    const form=modal.querySelector('form');form.dataset.id=row.id;const yearSelect=form.elements.year;yearSelect.replaceChildren();for(let year=2000;year<=2100;year++){const option=document.createElement('option');option.value=String(year);option.textContent=String(year);yearSelect.append(option);}yearSelect.value=String(Math.min(2100,Math.max(2000,Number(row.year)||2026)));yearSelect.addEventListener('change',()=>{try{const settings=JSON.parse(localStorage.getItem('haboubiSettings')||'{}');settings.letterYear=yearSelect.value;localStorage.setItem('haboubiSettings',JSON.stringify(settings));if(currentUser)scheduleDataSave({items:JSON.parse(localStorage.getItem('haboubiDataV2')||'{"items":[],"files":[]}').items||[],files:JSON.parse(localStorage.getItem('haboubiDataV2')||'{"items":[],"files":[]}').files||[],settings});}catch(err){console.error('Unable to save selected year',err);}});form.elements.authorizedName.value=row.authorizedName||'';form.elements.storekeeperName.value=row.storekeeperName||'';const container=form.querySelector('.history-edit-items');container.replaceChildren();
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