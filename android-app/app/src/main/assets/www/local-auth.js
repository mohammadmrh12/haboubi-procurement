(() => {
  const $ = s => document.querySelector(s);
  const KEY = 'haboubiLocalHistoryV1';
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  function renderHistory() {
    const list = $('#historyList'); if (!list) return;
    const rows = read(); list.replaceChildren();
    if (!rows.length) { const p=document.createElement('p'); p.className='muted'; p.textContent='لا توجد عمليات محفوظة على هذا الجهاز حتى الآن.'; list.append(p); return; }
    rows.sort((a,b)=>b.createdAt-a.createdAt).forEach(row=>{
      const card=document.createElement('article'); card.className='history-item';
      const heading=document.createElement('div'); heading.className='history-heading';
      const title=document.createElement('strong'); title.textContent=row.kind+' · '+new Date(row.createdAt).toLocaleString('ar-IQ');
      const count=document.createElement('span'); count.textContent=(row.items||[]).length+' مواد'; heading.append(title,count);
      const detail=document.createElement('p'); detail.textContent=(row.items||[]).slice(0,3).map(x=>x.name).join('، ')+((row.items||[]).length>3?'…':'');
      const actions=document.createElement('div'); actions.className='history-actions';
      const view=document.createElement('button'); view.type='button'; view.className='secondary'; view.textContent='عرض التفاصيل';
      view.onclick=()=>alert(row.kind+'\n'+new Date(row.createdAt).toLocaleString('ar-IQ')+'\n\n'+(row.items||[]).map((x,i)=>(i+1)+'. '+x.name+' | الرمز: '+x.code+' | العدد: '+x.qty).join('\n'));
      const reprint=document.createElement('button'); reprint.type='button'; reprint.className='primary'; reprint.textContent='إعادة طباعة';
      reprint.onclick=()=>{ if($('#letterYear'))$('#letterYear').value=row.year||'2026'; if($('#authorizedName'))$('#authorizedName').value=row.authorizedName||''; if($('#storekeeperName'))$('#storekeeperName').value=row.storekeeperName||''; if(window.haboubiPrintSaved)window.haboubiPrintSaved(row.items); };
      actions.append(view,reprint); card.append(heading,detail,actions); list.append(card);
    });
  }
  const gate=$('#authGate'), form=$('#loginForm'), codeInput=$('#loginCode'), error=$('#loginError'), submit=$('#loginSubmit'), rememberInput=$('#rememberDevice');
  let authenticated=false, currentUser=null;
  function lockScreen(){authenticated=false;currentUser=null;if(gate)gate.classList.remove('auth-hidden');document.body.classList.add('auth-locked');}
  function unlockScreen(user){authenticated=true;currentUser=user||{id:'local-device',name:'هذا الجهاز'};if(gate)gate.classList.add('auth-hidden');document.body.classList.remove('auth-locked');}
  window.haboubiNativeLoginResult=(ok,message,user)=>{if(submit){submit.disabled=false;submit.textContent='دخول';}if(ok){if(error)error.textContent='';unlockScreen(user);}else if(error){error.textContent=message||'تعذر التحقق من كود الدخول';}};
  if(form)form.addEventListener('submit',event=>{event.preventDefault();if(error)error.textContent='';const entered=String(codeInput?.value||'').trim();if(!/^\d{4}$/.test(entered)){if(error)error.textContent='أدخل كود الدخول المكوّن من 4 أرقام';return;}if(!window.AndroidApp||typeof window.AndroidApp.authenticate!=='function'){if(error)error.textContent='تعذر الاتصال بخدمة التحقق';return;}if(submit){submit.disabled=true;submit.textContent='جارٍ التحقق…';}window.AndroidApp.authenticate(entered,!!rememberInput?.checked);});
  lockScreen();
  if(window.AndroidApp&&typeof window.AndroidApp.restoreSession==='function')window.AndroidApp.restoreSession();
  window.haboubiAuth={
    get user(){return authenticated?currentUser:null;},
    scheduleDataSave(){},
    async saveOperation(items){
      if(!authenticated)throw new Error('يلزم تسجيل الدخول');
      const row={id:'local-'+Date.now(),kind:'اعتذار وتخويل',createdAt:Date.now(),year:$('#letterYear')?.value||'2026',authorizedName:$('#authorizedName')?.value||'',storekeeperName:$('#storekeeperName')?.value||'',items:items.map(x=>({...x}))};
      const rows=read(); rows.push(row); localStorage.setItem(KEY,JSON.stringify(rows)); renderHistory(); return row;
    }
  };
  $('#refreshHistory')?.addEventListener('click',renderHistory);
  renderHistory();
})();
