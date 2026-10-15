const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PRIVATE = path.join(ROOT, 'data', 'private');
const HISTORY_FILE = path.join(PRIVATE, 'history.json');
const USER_DATA_FILE = path.join(PRIVATE, 'user-data.json');
const SECRET_FILE = path.join(PRIVATE, 'session.key');
const PORT = Number(process.env.PORT || 8101);
// Load local secrets without a dependency; .env is ignored by Git and never served.
try {
  const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const name of ['GEMINI_API_KEY', 'GEMINI_MODEL']) {
    const match = envText.match(new RegExp('^' + name + '=(.*)$', 'm'));
    if (match && !Object.prototype.hasOwnProperty.call(process.env, name)) process.env[name] = match[1].trim();
  }
} catch {}
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
async function geminiText(prompt, maxOutputTokens=700) {
  if (!GEMINI_API_KEY) throw new Error('مفتاح Gemini غير مضبوط على الخادم');
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(GEMINI_MODEL) + ':generateContent', {
    method: 'POST', headers: {'Content-Type':'application/json','x-goog-api-key':GEMINI_API_KEY},
    body: JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.1,maxOutputTokens,responseMimeType:'application/json'}}),
    signal: AbortSignal.timeout(18000)
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    const status = response.status;
    const message = status === 400 || status === 403 ? 'رفض Gemini المفتاح أو إعدادات المشروع؛ تحقق من صلاحية المفتاح وواجهة Gemini API' : status === 429 ? 'تجاوزت حصة Gemini المتاحة حالياً' : status === 503 ? 'خدمة Gemini مشغولة مؤقتاً (503)' : 'تعذر الاتصال بخدمة Gemini (' + status + ')';
    const err = new Error(message); err.status = status; throw err;
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map(p=>p.text||'').join('');
  if (!text) throw new Error('لم يرجع Gemini نتيجة قابلة للاستخدام');
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()); } catch { throw new Error('تعذر قراءة استجابة Gemini'); }
}
fs.mkdirSync(PRIVATE, { recursive: true, mode: 0o700 });
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48), { mode: 0o600 });
const SECRET = fs.readFileSync(SECRET_FILE);
const CODES = ['1111','2222','3333','4444','5555','6666','7777','8888','9999','0000'];
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.apk':'application/vnd.android.package-archive'};
const attempts = new Map();
function sign(value) { return crypto.createHmac('sha256', SECRET).update(value).digest('base64url'); }
function cookie(req, name) {
  const all = (req.headers.cookie || '').split(';');
  for (const part of all) { const i = part.indexOf('='); if (i > 0 && part.slice(0,i).trim() === name) return decodeURIComponent(part.slice(i+1).trim()); }
  return '';
}
function getUser(req) {
  const token = cookie(req, 'haboubi_session');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[0] + '.' + parts[1];
  const expected = sign(payload);
  const a = Buffer.from(parts[2]); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  let data; try { data = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch { return null; }
  if (!data || !Number.isInteger(data.u) || data.u < 1 || data.u > 10 || !Number.isFinite(data.e) || data.e < Date.now()) return null;
  return { id: data.u, name: 'المستخدم ' + data.u };
}
function issueSession(userId, remember) {
  const expires = Date.now() + (remember ? 365 : 1) * 24 * 60 * 60 * 1000;
  const encoded = Buffer.from(JSON.stringify({u:userId,e:expires})).toString('base64url');
  const payload = encoded + '.' + expires;
  const token = payload + '.' + sign(payload);
  return 'haboubi_session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Strict' + (remember ? '; Max-Age=31536000' : '');
}
function json(res, status, value, extra={}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
  res.end(JSON.stringify(value));
}
function readBody(req, limit=12*1024*1024) {
  return new Promise((resolve,reject) => { let raw=''; req.on('data', chunk => { raw += chunk; if (Buffer.byteLength(raw)>limit) { reject(new Error('حجم الطلب كبير')); req.destroy(); } }); req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'));}catch{reject(new Error('صيغة البيانات غير صحيحة'));}}); req.on('error',reject); });
}
function readHistory() {
  let raw;
  try { raw=fs.readFileSync(HISTORY_FILE,'utf8'); }
  catch (e) { if (e.code==='ENOENT') return []; throw e; }
  const data=JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('سجل العمليات ليس مصفوفة JSON');
  return data;
}
function writeHistory(rows) { const temp=HISTORY_FILE+'.tmp'; fs.writeFileSync(temp,JSON.stringify(rows),{mode:0o600}); fs.renameSync(temp,HISTORY_FILE); }
function readUserData() {
  let raw;
  try { raw=fs.readFileSync(USER_DATA_FILE,'utf8'); }
  catch (e) { if (e.code==='ENOENT') return {}; throw e; }
  const data=JSON.parse(raw);
  if (!data || typeof data!=='object' || Array.isArray(data)) throw new Error('بيانات المستخدمين ليست كائن JSON');
  return data;
}
function writeUserData(data) { const temp=USER_DATA_FILE+'.tmp'; fs.writeFileSync(temp,JSON.stringify(data),{mode:0o600}); fs.renameSync(temp,USER_DATA_FILE); }
function safeStatic(urlPath) {
  let decoded; try { decoded=decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (decoded === '/') decoded='/index.html';
  if (decoded.split('/').some(part => part.startsWith('.') && part.length > 1)) return null;
  const file=path.resolve(ROOT,'.'+decoded);
  if (!file.startsWith(ROOT+path.sep) || file.startsWith(PRIVATE+path.sep) || file === PRIVATE) return null;
  return file;
}
const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (url.pathname.startsWith('/api/')) {
    if (req.method==='POST' && url.pathname==='/api/login') {
      const ip=req.socket.remoteAddress||'unknown'; const now=Date.now(); const recent=(attempts.get(ip)||[]).filter(t=>now-t<10*60*1000);
      if(recent.length>=30){json(res,429,{error:'محاولات كثيرة. انتظر عشر دقائق.'});return;}
      let body; try{body=await readBody(req,4096);}catch(e){json(res,400,{error:e.message});return;}
      const code=String(body.code||''); let userId=0;
      for(let i=0;i<CODES.length;i++){const a=Buffer.from(code.padEnd(4,'\0').slice(0,4));const b=Buffer.from(CODES[i]);if(a.length===b.length&&crypto.timingSafeEqual(a,b)&&code.length===4)userId=i+1;}
      if(!userId){recent.push(now);attempts.set(ip,recent);json(res,401,{error:'الكود غير صحيح'});return;}
      attempts.delete(ip);
      json(res,200,{ok:true,user:{id:userId,name:'المستخدم '+userId}},{'Set-Cookie':issueSession(userId,!!body.remember)});return;
    }
    if(req.method==='POST' && url.pathname==='/api/logout'){json(res,200,{ok:true},{'Set-Cookie':'haboubi_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});return;}
    const user=getUser(req);
    if(!user){json(res,401,{error:'يلزم تسجيل الدخول'});return;}
    if(req.method==='GET' && url.pathname==='/api/session'){json(res,200,{ok:true,user});return;}
    if(req.method==='POST' && url.pathname==='/api/ai-search'){
      let body; try{body=await readBody(req,8192);}catch(e){json(res,400,{error:e.message});return;}
      const query=String(body.query||'').trim().slice(0,250);
      if(query.length<2){json(res,400,{error:'اكتب اسم المادة أو جزءاً منه'});return;}
      try {
        const result=await geminiText('أنت مساعد بحث دوائي ومستلزمات طبية عراقي. لا تخترع رموزاً وطنية أو احتياجات. حلل عبارة البحث فقط وأرجع JSON بالشكل {"queries":["..."]}. أعطِ حتى 8 صيغ بحث مرادفة تشمل تهجئات عربية/إنجليزية وأسماء علمية أو تجارية محتملة فقط إذا كانت معروفة بثقة. العبارة الأصلية أولاً. لا تضف شرحاً. البحث: '+JSON.stringify(query),500);
        const queries=Array.isArray(result.queries)?result.queries.map(x=>String(x).trim().slice(0,120)).filter(Boolean).slice(0,8):[];
        json(res,200,{ok:true,queries:[query,...queries].filter((v,i,a)=>a.indexOf(v)===i).slice(0,8)});
      } catch(e){
        const detail = e && e.cause && e.cause.code ? e.cause.code : '';
        const message = e && e.name === 'TimeoutError' ? 'انتهت مهلة الاتصال بـGemini؛ جرّب مرة أخرى' : (e && e.status ? e.message : 'تعذر الاتصال بـGemini من الخادم' + (detail ? ' ('+detail+')' : ''));
        if (e && e.status === 503) { json(res,200,{ok:true,queries:[query],degraded:true,message:'Gemini مشغول مؤقتاً؛ تم تنفيذ البحث المحلي بالعبارة الأصلية'}); return; }
        json(res,e.status===429?429:502,{error:message});
      } return;
    }
    if(req.method==='POST' && url.pathname==='/api/ai-review-print'){
      let body; try{body=await readBody(req,20000);}catch(e){json(res,400,{error:e.message});return;}
      const items=Array.isArray(body.items)?body.items.slice(0,10).map(x=>({name:String(x.name||'').slice(0,200),code:String(x.code||'').slice(0,100),qty:String(x.qty||'').slice(0,80),spec:String(x.spec||'').slice(0,160)})):[];
      if(!items.length){json(res,400,{error:'لا توجد مواد للمراجعة'});return;}
      try {
        const result=await geminiText('راجع مسودة كتاب إداري طبي قبل الطباعة. لا تغيّر ولا تستنتج الرمز الوطني أو الكمية أو الاسم الرسمي. اكتشف فقط النواقص والتعارضات الظاهرة من المدخلات، ولا تتحقق من صحة الرمز من دون مصدر. أرجع JSON {"warnings":["..."]} بالعربية، وبحد أقصى 6 تحذيرات قصيرة. بيانات الرأس: '+JSON.stringify({kind:String(body.kind||'').slice(0,60),year:String(body.year||'').slice(0,4),authorizedName:String(body.authorizedName||'').slice(0,150),storekeeperName:String(body.storekeeperName||'').slice(0,150),recipient:String(body.recipient||'').slice(0,150)})+' المواد: '+JSON.stringify(items),700);
        json(res,200,{ok:true,warnings:Array.isArray(result.warnings)?result.warnings.map(x=>String(x).slice(0,300)).slice(0,6):[]});
      } catch(e){json(res,e.status===429?429:502,{error:e.message});} return;
    }
    if(req.method==='GET' && url.pathname==='/api/data'){
      try { const data=readUserData()[String(user.id)]||null; json(res,200,{data}); }
      catch { json(res,500,{error:'تعذرت قراءة بيانات المستخدمين؛ لم يتم استبدال البيانات'}); }
      return;
    }
    if(req.method==='PUT' && url.pathname==='/api/data'){
      let body; try{body=await readBody(req);}catch(e){json(res,400,{error:e.message});return;}
      if(!body.data || !Array.isArray(body.data.items) || !Array.isArray(body.data.files) || typeof body.data.settings!=='object' || body.data.settings===null || Array.isArray(body.data.settings)) {json(res,400,{error:'بيانات الحفظ غير مكتملة'});return;}
      try {
        const users=readUserData(); users[String(user.id)]={updatedAt:Date.now(),items:body.data.items,files:body.data.files,settings:body.data.settings};
        writeUserData(users);
        json(res,200,{ok:true,updatedAt:users[String(user.id)].updatedAt});
      } catch { json(res,500,{error:'تعذر حفظ قاعدة بيانات المستخدمين؛ البيانات الحالية محفوظة ولم يتم استبدالها'}); }
      return;
    }
    if(req.method==='GET' && url.pathname==='/api/history'){
      try {
        const rows=readHistory().filter(row=>row.userId===user.id).sort((a,b)=>b.createdAt-a.createdAt);
        json(res,200,{items:rows});
      } catch { json(res,500,{error:'تعذر قراءة سجل العمليات؛ لم يتم استبدال السجل'}); }
      return;
    }
    if(req.method==='POST' && url.pathname==='/api/history'){
      let body; try{body=await readBody(req);}catch(e){json(res,400,{error:e.message});return;}
      const kind=['اعتذار','تخويل','اعتذار وتخويل','حزمة مستندات'].includes(body.kind)?body.kind:'اعتذار وتخويل';
      const items=Array.isArray(body.items)?body.items.slice(0,10).map(x=>({name:String(x.name||'').slice(0,400),code:String(x.code||'').slice(0,100),qty:String(x.qty||'').slice(0,80),spec:String(x.spec||'').slice(0,300),note:String(x.note||'').slice(0,300)})).filter(x=>x.name):[];
      if(!items.length){json(res,400,{error:'لا توجد مواد لحفظها'});return;}
      const row={id:crypto.randomUUID(),userId:user.id,kind,createdAt:Date.now(),year:String(body.year||new Date().getFullYear()).slice(0,4),authorizedName:String(body.authorizedName||'').slice(0,200),storekeeperName:String(body.storekeeperName||'').slice(0,200),items};
      try { const rows=readHistory(); rows.push(row); writeHistory(rows); }
      catch { json(res,500,{error:'تعذر حفظ العملية؛ سجل العمليات الحالي محفوظ ولم يتم استبداله'}); return; }
      json(res,201,{ok:true,item:row});return;
    }
    json(res,404,{error:'المسار غير موجود'});return;
  }
  if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const file=safeStatic(url.pathname);
  if(!file){res.writeHead(404);res.end('Not found');return;}
  fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);res.end('Not found');return;}
    const ext=path.extname(file).toLowerCase();
    res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=300','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'});
    if(req.method==='HEAD'){res.end();return;} fs.createReadStream(file).pipe(res);
  });
});
server.listen(PORT,'127.0.0.1',()=>console.log('Haboubi server listening on 127.0.0.1:'+PORT));
