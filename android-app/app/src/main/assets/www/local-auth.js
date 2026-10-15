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
  const gate=$('#authGate'); if(gate)gate.classList.add('auth-hidden');
  document.body.classList.remove('auth-locked');
  window.haboubiAuth={
    get user(){return {id:'local-device',name:'هذا الجهاز'};},
    scheduleDataSave(){},
    async saveOperation(items){
      const row={id:'local-'+Date.now(),kind:'اعتذار وتخويل',createdAt:Date.now(),year:$('#letterYear')?.value||'2026',authorizedName:$('#authorizedName')?.value||'',storekeeperName:$('#storekeeperName')?.value||'',items:items.map(x=>({...x}))};
      const rows=read(); rows.push(row); localStorage.setItem(KEY,JSON.stringify(rows)); renderHistory(); return row;
    }
  };
  $('#refreshHistory')?.addEventListener('click',renderHistory);
  renderHistory();
})();
