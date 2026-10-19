const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ROOT = path.resolve(process.env.HABOUBI_APP_ROOT || __dirname);
const PRIVATE = path.resolve(process.env.HABOUBI_DATA_DIR || path.join(ROOT, 'data', 'private'));
const DESKTOP_MODE = process.env.HABOUBI_DESKTOP === '1';
const CLOUD_URL = String(process.env.HABOUBI_CLOUD_URL || 'https://medstock.cinematicplus.online').replace(/\/$/, '');
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
const aiRequests = new Map();
const AI_REQUEST_LIMIT = 12;
const AI_WINDOW_MS = 60 * 1000;
function setSecurityHeaders(res, req) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https://generativelanguage.googleapis.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}
function sameOriginMutation(req) {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return true;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // Native Android bridge does not necessarily send browser Origin.
  try { return new URL(origin).host === String(req.headers.host || ''); } catch { return false; }
}
function allowAiRequest(userId) {
  const now = Date.now();
  for (const [key, times] of aiRequests) { const fresh = times.filter(t => now - t < AI_WINDOW_MS); if (fresh.length) aiRequests.set(key, fresh); else aiRequests.delete(key); }
  const key = String(userId), recent = aiRequests.get(key) || [];
  if (recent.length >= AI_REQUEST_LIMIT) return false;
  recent.push(now); aiRequests.set(key, recent); return true;
}
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
  const raw = Buffer.from(JSON.stringify(value));
  const acceptsGzip = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(String(res.req?.headers?.['accept-encoding'] || ''));
  const compressed = acceptsGzip && raw.length >= 1024;
  const body = compressed ? zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_SPEED }) : raw;
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':String(body.length),...extra};
  if (compressed) { headers['Content-Encoding']='gzip'; headers['Vary']='Accept-Encoding'; }
  res.writeHead(status, headers);
  res.end(body);
}
function readBody(req, limit=12*1024*1024) {
  return new Promise((resolve,reject) => {
    const chunks=[]; let total=0, tooLarge=false, settled=false;
    req.on('data', chunk => {
      if (tooLarge) return;
      total += chunk.length;
      if (total > limit) { tooLarge=true; settled=true; reject(new Error('حجم الطلب كبير')); return; }
      chunks.push(chunk);
    });
    req.on('end',()=>{ if (tooLarge) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('صيغة البيانات غير صحيحة')); } });
    req.on('error',err=>{ if (!settled) reject(err); });
  });
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
function readDesktopSyncState() {
  const file=path.join(PRIVATE,'sync-state.json');
  try { const value=JSON.parse(fs.readFileSync(file,'utf8')); return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }
  catch(e) { if(e.code==='ENOENT')return {}; throw e; }
}
function writeDesktopSyncState(state) { const file=path.join(PRIVATE,'sync-state.json'),temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(state),{mode:0o600});fs.renameSync(temp,file); }
function emptyUserData(data) { return !data || !(data.items||[]).length && !(data.files||[]).length && !Object.keys(data.settings||{}).length; }
function mergeDesktopData(local,remote) {
  const signature=item=>{const key=[String(item.code||'').trim().toLowerCase(),String(item.name||'').trim().toLowerCase()].join('|');return key==='|'?JSON.stringify(item):key;};
  const items=new Map((Array.isArray(remote?.items)?remote.items:[]).map(item=>[signature(item),item]));
  for(const item of (Array.isArray(local?.items)?local.items:[])){const key=signature(item);items.set(key,items.has(key)?{...items.get(key),...item}:item);}
  const files=new Map();for(const file of [...(remote?.files||[]),...(local?.files||[])]){const key=String(file.name||file.source||JSON.stringify(file));if(!files.has(key))files.set(key,file);}
  const rs=remote?.settings&&typeof remote.settings==='object'?remote.settings:{};const ls=local?.settings&&typeof local.settings==='object'?local.settings:{};
  return {items:[...items.values()],files:[...files.values()],settings:{...rs,...ls,minutesPreferences:{...(rs.minutesPreferences||{}),...(ls.minutesPreferences||{})}}};
}
async function cloudRequest(route, cookieValue='', options={}) {
  const response=await fetch(CLOUD_URL+route,{...options,headers:{...(options.headers||{}),...(cookieValue?{Cookie:cookieValue}:{}),'Accept':'application/json'},signal:AbortSignal.timeout(15000)});
  const raw=await response.text();let data;try{data=JSON.parse(raw||'{}')}catch{throw new Error('الخادم السحابي أعاد استجابة غير صالحة ('+response.status+')');}
  if(!response.ok){if(response.status===401)desktopCloudSessions.clear();const error=new Error(data.error||('فشل الاتصال بالخادم السحابي ('+response.status+')'));error.status=response.status;throw error;}
  return {data,response};
}
const desktopCloudSessions = new Map();
async function performDesktopSync(user, code) {
  const numeric=Number(code), expectedUser=Number.isInteger(numeric)&&numeric>=0?CODES.indexOf(String(code)): -1;
  if(expectedUser<0||expectedUser+1!==user.id)throw new Error('كود المستخدم المحلي غير مطابق');
  let cloudCookie=desktopCloudSessions.get(user.id)?.code===String(code)?desktopCloudSessions.get(user.id).cookie:'';
  if(!cloudCookie){
    const login=await fetch(CLOUD_URL+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({code:String(code),remember:true}),signal:AbortSignal.timeout(12000)});
    const loginBody=await login.json().catch(()=>({}));
    if(!login.ok)throw new Error(loginBody.error||'تعذر تسجيل الدخول إلى خدمة المزامنة');
    const setCookies=typeof login.headers.getSetCookie==='function'?login.headers.getSetCookie():[login.headers.get('set-cookie')||''];
    cloudCookie=(setCookies.map(v=>String(v).split(';')[0]).find(v=>v.startsWith('haboubi_session='))||'');
    if(!cloudCookie)throw new Error('لم يصدر الخادم السحابي جلسة مزامنة');
    desktopCloudSessions.set(user.id,{code:String(code),cookie:cloudCookie});
  }

  const userKey=String(user.id), localUsers=readUserData(), local=localUsers[userKey]||null;
  const remoteResult=await cloudRequest('/api/data',cloudCookie), remote=remoteResult.data.data||null;
  const states=readDesktopSyncState(), state=states[userKey]||{};
  let dataAction='unchanged', latestLocal=local, latestRemote=remote;
  if(remote&&!local){latestLocal={...remote,updatedAt:Date.now()};localUsers[userKey]=latestLocal;writeUserData(localUsers);dataAction='downloaded';}
  else if(local&&!remote){const put=await cloudRequest('/api/data',cloudCookie,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{items:local.items||[],files:local.files||[],settings:local.settings||{}},baseUpdatedAt:0})});latestRemote={...local,updatedAt:Number(put.data.updatedAt)||Date.now()};dataAction='uploaded';}
  else if(local&&remote){
    const localChanged=state.lastLocalUpdatedAt!=null&&Number(local.updatedAt)>Number(state.lastLocalUpdatedAt);
    const cloudChanged=state.lastCloudUpdatedAt!=null&&Number(remote.updatedAt)>Number(state.lastCloudUpdatedAt);
    const same=JSON.stringify({items:local.items||[],files:local.files||[],settings:local.settings||{}})===JSON.stringify({items:remote.items||[],files:remote.files||[],settings:remote.settings||{}});
    if(!state.initialized&&!same){
      const merged=mergeDesktopData(local,remote);
      const put=await cloudRequest('/api/data',cloudCookie,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:merged,baseUpdatedAt:Number(remote.updatedAt)||0})});
      latestRemote={...merged,updatedAt:Number(put.data.updatedAt)||Date.now()};latestLocal=latestRemote;localUsers[userKey]=latestLocal;writeUserData(localUsers);dataAction='merged';
    } else if(localChanged&&cloudChanged){
      const merged=mergeDesktopData(local,remote);
      const put=await cloudRequest('/api/data',cloudCookie,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:merged,baseUpdatedAt:Number(remote.updatedAt)||0})});
      latestRemote={...merged,updatedAt:Number(put.data.updatedAt)||Date.now()};latestLocal=latestRemote;localUsers[userKey]=latestLocal;writeUserData(localUsers);dataAction='merged';
    } else if(localChanged){
      const put=await cloudRequest('/api/data',cloudCookie,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{items:local.items||[],files:local.files||[],settings:local.settings||{}},baseUpdatedAt:Number(remote.updatedAt)||0})});
      latestRemote={...local,updatedAt:Number(put.data.updatedAt)||Date.now()};dataAction='uploaded';
    } else if(cloudChanged||!same){latestLocal={...remote,updatedAt:Date.now()};localUsers[userKey]=latestLocal;writeUserData(localUsers);dataAction='downloaded';}
  }

  // Sync the user's operation history without exposing or combining other users' records.
  let localRows=readHistory(), remoteHistoryResult=await cloudRequest('/api/history',cloudCookie);
  let remoteRows=Array.isArray(remoteHistoryResult.data.items)?remoteHistoryResult.data.items:[];
  const mappings=state.historyMap&&typeof state.historyMap==='object'?state.historyMap:{};
  const historyRevisions=state.historyRevisions&&typeof state.historyRevisions==='object'?state.historyRevisions:{};
  const cloudToLocal=new Map(Object.entries(mappings).map(([localId,cloudId])=>[String(cloudId),String(localId)]));
  const pendingDeletes=Array.isArray(state.deletedHistoryIds)?state.deletedHistoryIds:[], stillDeleted=[];
  for(const localId of pendingDeletes){const cloudId=String(mappings[localId]||localId);try{await cloudRequest('/api/history?id='+encodeURIComponent(cloudId),cloudCookie,{method:'DELETE'});delete mappings[localId];delete historyRevisions[localId];}catch(err){if(!String(err.message||'').includes('غير موجودة'))stillDeleted.push(localId);else{delete mappings[localId];delete historyRevisions[localId];}}}
  if(pendingDeletes.length)remoteRows=remoteRows.filter(row=>!pendingDeletes.includes(cloudToLocal.get(String(row.id))||String(row.id)));
  let historyDownloaded=0,historyUploaded=0,historyUpdated=0;
  for(const row of remoteRows){
    const localId=cloudToLocal.get(String(row.id))||String(row.id);
    const index=localRows.findIndex(x=>x.id===localId&&x.userId===user.id);
    if(index<0){localRows.push({...row,id:localId,userId:user.id});mappings[localId]=String(row.id);cloudToLocal.set(String(row.id),localId);historyDownloaded++;historyRevisions[localId]={lastLocalUpdatedAt:Number(row.updatedAt||row.createdAt)||0,lastCloudUpdatedAt:Number(row.updatedAt||row.createdAt)||0};continue;}
    mappings[localId]=String(row.id);cloudToLocal.set(String(row.id),localId);
    const localRow=localRows[index], rev=historyRevisions[localId]||{};
    const localRev=Number(localRow.updatedAt||localRow.createdAt)||0, cloudRev=Number(row.updatedAt||row.createdAt)||0;
    const localChanged=rev.lastLocalUpdatedAt!=null&&localRev>Number(rev.lastLocalUpdatedAt);
    const cloudChanged=rev.lastCloudUpdatedAt!=null&&cloudRev>Number(rev.lastCloudUpdatedAt);
    if(cloudChanged&&!localChanged){localRows[index]={...row,id:localId,userId:user.id};historyRevisions[localId]={lastLocalUpdatedAt:cloudRev,lastCloudUpdatedAt:cloudRev};}
    else if(localChanged){
      let items=localRow.items||[];
      if(cloudChanged){const mergedItems=new Map((row.items||[]).map(item=>[[String(item.code||'').trim().toLowerCase(),String(item.name||'').trim().toLowerCase()].join('|'),item]));for(const item of items)mergedItems.set([String(item.code||'').trim().toLowerCase(),String(item.name||'').trim().toLowerCase()].join('|'),item);items=[...mergedItems.values()];}
      const put=await cloudRequest('/api/history?id='+encodeURIComponent(row.id),cloudCookie,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:localRow.year,authorizedName:localRow.authorizedName,storekeeperName:localRow.storekeeperName,items})});
      const saved=put.data.item||row;localRows[index]={...localRow,items,updatedAt:Number(saved.updatedAt||saved.createdAt)||Date.now()};const newLocalRev=Number(localRows[index].updatedAt)||localRev;historyRevisions[localId]={lastLocalUpdatedAt:newLocalRev,lastCloudUpdatedAt:Number(saved.updatedAt||saved.createdAt)||Date.now()};historyUpdated++;
    } else historyRevisions[localId]={lastLocalUpdatedAt:localRev,lastCloudUpdatedAt:cloudRev};
  }
  const remoteIds=new Set(remoteRows.map(row=>String(row.id)));
  for(const row of localRows.filter(x=>x.userId===user.id)){
    if(mappings[row.id]||remoteIds.has(String(row.id)))continue;
    const result=await cloudRequest('/api/history',cloudCookie,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:row.kind,year:row.year,authorizedName:row.authorizedName,storekeeperName:row.storekeeperName,items:row.items})});
    const cloudId=String(result.data.item?.id||'');if(cloudId){mappings[row.id]=cloudId;cloudToLocal.set(cloudId,row.id);const stamp=Number(row.updatedAt||row.createdAt)||Date.now();historyRevisions[row.id]={lastLocalUpdatedAt:stamp,lastCloudUpdatedAt:Number(result.data.item.updatedAt||result.data.item.createdAt)||stamp};historyUploaded++;}
  }
  writeHistory(localRows);

  const savedLocal=readUserData()[userKey]||null, savedRemote=latestRemote||remote||null;
  states[userKey]={initialized:true,lastLocalUpdatedAt:Number(savedLocal?.updatedAt)||0,lastCloudUpdatedAt:Number(savedRemote?.updatedAt)||0,historyMap:mappings,historyRevisions,deletedHistoryIds:stillDeleted,lastSyncAt:Date.now()};writeDesktopSyncState(states);
  return {ok:true,dataAction,historyDownloaded,historyUploaded,historyUpdated,catalogueUpdated:false,syncedAt:Date.now()};
}

function safeStatic(urlPath) {
  let decoded; try { decoded=decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (DESKTOP_MODE && ['/catalog-seed.js','/drug-aliases.js'].includes(decoded)) {
    const override=path.join(PRIVATE,'catalog-overrides',decoded.slice(1));
    if (fs.existsSync(override)) return override;
  }
  if (decoded === '/') decoded='/index.html';
  if (decoded.split('/').some(part => part.startsWith('.') && part.length > 1)) return null;
  const file=path.resolve(ROOT,'.'+decoded);
  if (!file.startsWith(ROOT+path.sep) || file.startsWith(PRIVATE+path.sep) || file === PRIVATE) return null;
  return file;
}
const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,'http://localhost');
  setSecurityHeaders(res, req);
  if (url.pathname.startsWith('/api/')) {
    if (!sameOriginMutation(req)) { json(res, 403, {error:'تم رفض الطلب لأنه ليس من نفس الموقع'}); return; }
    if (req.method==='POST' && url.pathname==='/api/login') {
      const ip=req.socket.remoteAddress||'unknown'; const now=Date.now();
      for (const [key,times] of attempts) { const fresh=times.filter(t=>now-t<10*60*1000); if (fresh.length) attempts.set(key,fresh); else attempts.delete(key); }
      if (attempts.size > 1000) attempts.delete(attempts.keys().next().value);
      const recent=(attempts.get(ip)||[]).filter(t=>now-t<10*60*1000);
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
    if(req.method==='POST' && url.pathname==='/api/desktop-sync'){
      if(!DESKTOP_MODE){json(res,404,{error:'المسار غير موجود'});return;}
      let body;try{body=await readBody(req,4096);}catch(e){json(res,400,{error:e.message});return;}
      try{const result=await performDesktopSync(user,String(body.code||''));json(res,200,result);}catch(e){json(res,503,{error:'تعذر المزامنة الآن: '+String(e.message||'خطأ اتصال').slice(0,220)});}return;
    }
    if(req.method==='POST' && url.pathname==='/api/ai-search'){
      if (!allowAiRequest(user.id)) { json(res,429,{error:'وصلت إلى الحد المؤقت لطلبات البحث الذكي؛ انتظر دقيقة ثم أعد المحاولة'}); return; }
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
      if (!allowAiRequest(user.id)) { json(res,429,{error:'وصلت إلى الحد المؤقت لطلبات المراجعة الذكية؛ انتظر دقيقة ثم أعد المحاولة'}); return; }
      let body; try{body=await readBody(req,20000);}catch(e){json(res,400,{error:e.message});return;}
      const items=Array.isArray(body.items)?body.items.slice(0,10).map(x=>({name:String(x.name||'').slice(0,200),code:String(x.code||'').slice(0,100),qty:String(x.qty??x.requested??'').slice(0,80),spec:String(x.spec||'').slice(0,160)})):[];
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
        const users=readUserData(), key=String(user.id), existing=users[key]||null;
        if(body.baseUpdatedAt!==undefined&&Number(body.baseUpdatedAt)!==Number(existing?.updatedAt||0)){json(res,409,{error:'توجد تعديلات أحدث من جهاز آخر؛ ستتم مزامنتها ودمجها قبل الحفظ',data:existing});return;}
        users[key]={updatedAt:Math.max(Date.now(),Number(existing?.updatedAt||0)+1),items:body.data.items,files:body.data.files,settings:body.data.settings};
        writeUserData(users);
        json(res,200,{ok:true,updatedAt:users[key].updatedAt});
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
    if(req.method==='PUT' && url.pathname==='/api/history'){
      const id=String(url.searchParams.get('id')||'').slice(0,100);
      if(!id){json(res,400,{error:'معرّف العملية مطلوب'});return;}
      let body;try{body=await readBody(req);}catch(e){json(res,400,{error:e.message});return;}
      if(!Array.isArray(body.items)||!body.items.length||body.items.length>10){json(res,400,{error:'قائمة المواد غير صالحة'});return;}
      const items=body.items.map(x=>({name:String(x.name||'').trim().slice(0,400),code:String(x.code||'').slice(0,100),qty:String(x.qty??x.requested??'').slice(0,80),spec:String(x.spec||'').slice(0,300),note:String(x.note||'').slice(0,300)}));
      if(items.some(x=>!x.name)){json(res,400,{error:'اسم المادة مطلوب لكل صف'});return;}
      try{const rows=readHistory();const row=rows.find(x=>x.id===id&&x.userId===user.id);if(!row){json(res,404,{error:'العملية غير موجودة في سجل هذا المستخدم'});return;}row.items=items;row.year=String(body.year||row.year||new Date().getFullYear()).slice(0,4);row.authorizedName=String(body.authorizedName||'').slice(0,200);row.storekeeperName=String(body.storekeeperName||'').slice(0,200);row.updatedAt=Date.now();writeHistory(rows);json(res,200,{ok:true,item:row});}
      catch{json(res,500,{error:'تعذر حفظ التعديلات؛ سجل العمليات الحالي محفوظ ولم يتم استبداله'});}
      return;
    }
    if(req.method==='DELETE' && url.pathname==='/api/history'){
      const id=String(url.searchParams.get('id')||'').slice(0,100);
      if(!id){json(res,400,{error:'معرّف العملية مطلوب'});return;}
      try {
        const rows=readHistory();
        const index=rows.findIndex(row=>row.id===id && row.userId===user.id);
        if(index<0){json(res,404,{error:'العملية غير موجودة في سجل هذا المستخدم'});return;}
        rows.splice(index,1);writeHistory(rows);
        if(DESKTOP_MODE){const all=readDesktopSyncState(),entry=all[String(user.id)]||{};entry.deletedHistoryIds=[...new Set([...(entry.deletedHistoryIds||[]),id])];all[String(user.id)]=entry;writeDesktopSyncState(all);}
        json(res,200,{ok:true});
      } catch { json(res,500,{error:'تعذر حذف العملية؛ سجل العمليات الحالي محفوظ ولم يتم استبداله'}); }
      return;
    }
    if(req.method==='POST' && url.pathname==='/api/history'){
      let body; try{body=await readBody(req);}catch(e){json(res,400,{error:e.message});return;}
      const kind=['اعتذار','تخويل','اعتذار وتخويل','حزمة مستندات'].includes(body.kind)?body.kind:'اعتذار وتخويل';
      const items=Array.isArray(body.items)?body.items.slice(0,10).map(x=>({name:String(x.name||'').slice(0,400),code:String(x.code||'').slice(0,100),qty:String(x.qty??x.requested??'').slice(0,80),spec:String(x.spec||'').slice(0,300),note:String(x.note||'').slice(0,300)})).filter(x=>x.name):[];
      if(!items.length){json(res,400,{error:'لا توجد مواد لحفظها'});return;}
      const row={id:crypto.randomUUID(),userId:user.id,kind,createdAt:Date.now(),updatedAt:Date.now(),year:String(body.year||new Date().getFullYear()).slice(0,4),authorizedName:String(body.authorizedName||'').slice(0,200),storekeeperName:String(body.storekeeperName||'').slice(0,200),items};
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
    const changingAsset=DESKTOP_MODE&&['catalog-seed.js','drug-aliases.js'].includes(path.basename(file));
    res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':ext==='.html'||changingAsset?'no-cache':'public, max-age=300'});
    if(req.method==='HEAD'){res.end();return;} fs.createReadStream(file).pipe(res);
  });
});
server.listen(PORT,'127.0.0.1',()=>console.log('Haboubi server listening on 127.0.0.1:'+PORT));
