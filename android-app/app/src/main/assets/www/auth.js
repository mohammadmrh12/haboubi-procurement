(() => {
  const $ = s => document.querySelector(s);
  let currentUser = null;
  const gate = $('#authGate'), form = $('#loginForm'), code = $('#loginCode'), error = $('#loginError');
  async function api(url, options={}) {
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
        if(!sessionStorage.getItem(marker)){
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
        const view=document.createElement('button');view.type='button';view.className='secondary';view.textContent='عرض التفاصيل';
        view.addEventListener('click',()=>{const text=(row.items||[]).map((x,i)=>(i+1)+'. '+x.name+' | الرمز: '+x.code+' | العدد: '+x.qty).join('\n');alert(row.kind+'\n'+new Date(row.createdAt).toLocaleString('ar-IQ')+'\n\n'+text);});
        const reprint=document.createElement('button');reprint.type='button';reprint.className='primary';reprint.textContent='إعادة طباعة';reprint.addEventListener('click',()=>{const y=$('#letterYear'),a=$('#authorizedName'),s=$('#storekeeperName');if(y)y.value=row.year||'2026';if(a)a.value=row.authorizedName||'';if(s)s.value=row.storekeeperName||'';if(window.haboubiPrintSaved)window.haboubiPrintSaved(row.items);});const remove=document.createElement('button');remove.type='button';remove.className='history-delete-btn';remove.textContent='حذف';remove.addEventListener('click',async()=>{if(!confirm('حذف هذه العملية من السجل السابق؟ لا يمكن التراجع عن الحذف.'))return;remove.disabled=true;try{await api('/api/history?id='+encodeURIComponent(row.id),{method:'DELETE'});await loadHistory();}catch(err){alert('تعذر حذف العملية: '+err.message);remove.disabled=false;}});actions.append(view,reprint,remove);card.append(heading,detail,actions);list.append(card);
      });
    }catch(err){list.innerHTML='';const p=document.createElement('p');p.className='login-error';p.textContent=err.message;list.append(p);}
  }
  $('#refreshHistory')?.addEventListener('click',loadHistory);
  window.haboubiAuth = {
    get user(){return currentUser;},
    api,
    scheduleDataSave,
    async saveOperation(items){
      const payload={kind:'اعتذار وتخويل',items,year:$('#letterYear')?.value||'2026',authorizedName:$('#authorizedName')?.value||'',storekeeperName:$('#storekeeperName')?.value||''};
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