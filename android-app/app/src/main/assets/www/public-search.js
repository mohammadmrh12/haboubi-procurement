(() => {
  const input=document.getElementById('searchInput'), clear=document.getElementById('clearSearch'), results=document.getElementById('results'), status=document.getElementById('status');
  const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=value=>{if(value===null||value===''||!Number.isFinite(Number(value)))return 'غير محدد في الملزمة';return new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(Number(value));};
  let items=[];
  function render(){
    const q=normalize(input.value);results.innerHTML='';
    if(!q){status.textContent=`قاعدة البحث جاهزة · ${items.length.toLocaleString('en-US')} مادة`;return;}
    const hits=items.map((item,index)=>{const name=normalize(item.name);let score=0;if(name===q)score=1000;else if(name.startsWith(q))score=800;else if(name.split(' ').some(word=>word.startsWith(q)))score=600;else if(name.includes(q))score=400;return {item,index,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,30);
    status.textContent=hits.length?`عدد النتائج: ${hits.length}${hits.length===30?' (أول 30 نتيجة)':''}`:'لا توجد نتيجة مطابقة للاسم العلمي. جرّب كتابة جزء آخر من الاسم.';
    if(!hits.length){results.innerHTML='<div class="empty">لم يتم العثور على مادة بهذا الاسم.</div>';return;}
    results.innerHTML=hits.map(({item})=>{const isDrug=item.kind==='drug';const period=isDrug?3:6;const need=item.annual===null||item.annual===''||!Number.isFinite(Number(item.annual))?null:Number(item.annual)/(isDrug?4:2);return `<article class="result"><div class="result-name">${escapeHtml(item.permanentName||item.name||'اسم غير متوفر')}</div><div class="fields"><div class="field code-field"><span>الرمز الوطني</span><strong>${escapeHtml(item.code||'غير مسجل')}</strong></div><div class="field"><span>النوع</span><strong>${isDrug?'دواء':'مستلزم طبي'}</strong></div><div class="field"><span>الشكل الدوائي / وحدة المادة</span><strong>${escapeHtml(item.dose||item.unit||'غير محدد')}</strong></div><div class="field annual-field"><span>الاحتياج السنوي</span><strong>${fmt(item.annual)}${item.annual!==null&&item.annual!==''?' '+escapeHtml(item.unit||''):''}</strong></div><div class="field period-field" style="grid-column:1/-1"><span>احتياج ${period} أشهر (${isDrug?'دواء':'مستلزم طبي'})</span><strong>${need===null?'غير قابل للحساب — الاحتياج السنوي غير محدد':fmt(need)+' '+escapeHtml(item.unit||'')}</strong></div></div></article>`;}).join('');
  }
  input.addEventListener('input',render);clear.addEventListener('click',()=>{input.value='';render();input.focus();});
  if(window.HABOUBI_DEFAULT_CATALOG&&Array.isArray(window.HABOUBI_DEFAULT_CATALOG.items)){items=window.HABOUBI_DEFAULT_CATALOG.items.filter(x=>x&&typeof x.name==='string'&&x.name.trim());status.textContent='قاعدة البحث جاهزة';render();}
  else {status.textContent='تعذر تحميل قاعدة البيانات. حدّث الصفحة أو أعد المحاولة.';}
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
