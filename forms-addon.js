(() => {
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=id=>$('#'+id)?.value||'';
const items=()=>[...$('#documentItems').querySelectorAll('tbody tr')].map((tr,i)=>{const c=tr.querySelectorAll('td');return {n:i+1,name:(c[0]?.innerText||'').trim(),code:(c[1]?.innerText||'').trim(),qty:(c[2]?.innerText||'').trim(),unit:(c[3]?.innerText||'').trim()}}).filter(x=>x.name);
const table=(heads,rows)=>'<table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
const sheet=(title,body)=>'<section class="print-sheet"><header class="official-header"><div class="ministry"><strong>وزارة الصحة</strong><span>دائرة صحة ذي قار</span><span>مستشفى الحبوبي التعليمي</span></div><div class="letter-meta"><span>التاريخ: '+esc(val('letterDate')||new Date().toISOString().slice(0,10))+'</span></div></header>'+body+'<p class="draft-note">مسودة للمراجعة والتدقيق قبل التوقيع والاعتماد الرسمي.</p></section>';
const startPrint=(viewId,areaId,html)=>{const view=$('#'+viewId);view.classList.add('printing');let area=$('#'+areaId);if(area)area.remove();area=document.createElement('div');area.id=areaId;area.innerHTML=html;view.appendChild(area);window.print();setTimeout(()=>{area.remove();view.classList.remove('printing')},1200)};
const head=t=>'<h2 class="print-title">'+t+'</h2>';
const itemRows=data=>data.map(x=>[x.n,x.name,x.qty]);
const procurementPacket=data=>{
 const basic=table(['ت','اسم المادة','العدد'],itemRows(data));
 const pages=[];
 pages.push(sheet('استمارة طلب شراء مواد',head('استمارة طلب شراء مواد')+'<p>يرجى اتخاذ اللازم بشأن المواد المدرجة أدناه.</p>'+basic+'<p>مقدم الطلب: ........................　التوقيع: ........................</p>'));
 pages.push(sheet('تأييد المخزن',head('تأييد المخزن')+'<p>يرجى تأييد موقف توفر المواد المدرجة أدناه في المخزن.</p>'+basic+'<p>أمين المخزن: ........................　التوقيع: ........................</p>'));
 pages.push(sheet('الكلف التخمينية والمواصفات',head('استمارة الكلف التخمينية والمواصفات')+basic+'<p>تُستكمل الكلف والمواصفات من اللجنة المختصة خارج النظام.</p><p>أعضاء اللجنة والتواقيع: ................................................</p>'));
 pages.push(sheet('التخصيص المالي وموافقة الصرف',head('تأييد التخصيص المالي وموافقة الصرف')+basic+'<p>تأييد التخصيص المالي: ................................................................</p><p>اسم وتوقيع المحاسب: ........................</p><p>الأمر بالصرف / صاحب الصلاحية: ........................</p>'));
 pages.push(sheet('إلى المورد',head('إلى / المورد — قائمة طلب الشراء')+'<p>يرجى بيان إمكانية تجهيز المواد المدرجة أدناه.</p>'+basic+'<p>توقيع لجنة المشتريات: ........................</p>'));
 pages.push(sheet('تأييد قسم العقود',head('تأييد قسم العقود')+basic+'<p>ملاحظات قسم العقود: ................................................................</p><p>التوقيع: ........................</p>'));
 return pages.join('');
};
$('#printBoth').textContent='معاينة وطباعة التخويل والاعتذار واستمارات المشتريات';
$('#printBoth').onclick=()=>{
 const data=items(); if(!data.length){alert('أضف مادة واحدة على الأقل من البحث أولاً');return}
 const r=data.map(x=>[x.n,x.name,x.code,x.qty]);
 const common='<p>العدد: '+esc(val('letterNo')||'........')+'　التاريخ: '+esc(val('letterDate')||new Date().toISOString().slice(0,10))+'</p>';
 const a=sheet('التخويل','<p>إلى / '+esc(val('authRecipient')||'دائرة صحة ذي قار / قسم الصيدلة')+'</p>'+head('تخويل')+'<p class="document-body">نرسل إليكم مخوّلنا ( <strong>'+esc(val('authorizedName')||'................')+'</strong> ) لاستلام حصتنا من الأدوية والمستلزمات الطبية.</p>'+common+table(['ت','اسم المادة','الرمز الوطني','العدد','بيان توفر المادة'],data.map(x=>[x.n,x.name,x.code,x.qty,'يستكمل من الجهة المختصة']))+'<div class="signature-row"><div>اسم المخوّل<br>'+esc(val('authorizedName')||'.................')+'<br>التوقيع: ........</div><div>أمين المخزن<br>'+esc(val('storekeeperName')||'.................')+'<br>التوقيع: ........</div></div><div class="director-signature"><strong>'+esc(val('directorName')||'الدكتور احمد صبحي خضير')+'</strong><span>مدير مستشفى الحبوبي التعليمي</span></div>');
 const b=sheet('الاعتذار','<p>إلى / '+esc(val('apologyRecipient')||'مستشفى الحبوبي التعليمي')+'</p>'+head('م / اعتذار')+'<p class="document-body">نعتذر عن تجهيز الأدوية والمستلزمات الطبية المدرجة أدناه لعدم توفرها في مخازن قسم الصيدلة وحسب الطلب.</p>'+common+table(['ت','اسم المادة','الرمز الوطني','العدد'],r)+'<div class="declaration">أني الموقع أدناه ( <strong>'+esc(val('apologyDeclarant')||'................')+'</strong> ) أتعهد بصحة المعلومات والرمز الوطني الواردة في الاعتذار.</div>');
 startPrint('view-documents','printArea',a+b+procurementPacket(data));
};
})();
