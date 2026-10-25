/* TradeGlass | Arabic trading journal | MIT-style personal-use source */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const pad = x => String(x).padStart(2,'0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const todayKey = dateKey(new Date());
  const parseDate = k => { const [y,m,d] = String(k).split('-').map(Number); return new Date(y,m-1,d); };
  const shortDate = k => { const d=parseDate(k);return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`; };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (v, signed = true) => `${signed && Number(v)>0?'+':Number(v)<0?'-':''}$${Math.abs(Number(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const dayMoney = n => { const a=Math.abs(n);return `${n>0?'+':n<0?'-':''}$${a>=10000?(a/1000).toFixed(a%1000===0?0:1)+'k':a>=1000?(a/1000).toFixed(1)+'k':a.toLocaleString('en-US',{maximumFractionDigits:a<100?2:0})}`; };
  const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parseDate(d).getTime()) && dateKey(parseDate(d))===d;
  const cleanEntry = e => ({id:String(e.id),user_id:e.user_id||null,trade_date:String(e.trade_date),symbol:String(e.symbol||'XAUUSD'),side:e.side==='sell'?'sell':'buy',pnl:Number(e.pnl),notes:String(e.notes||''),created_at:String(e.created_at||new Date().toISOString())});
  const config = window.TRADEGLASS_CONFIG || {};
  const isConfigured = /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co\/?$/.test((config.supabaseUrl||'').trim()) && Boolean((config.supabasePublishableKey||'').trim());
  let client=null;
  let session=null;
  let cloudReady=false;
  let cloudFailed=false;
  let entries=readGuest();
  let viewYear=new Date().getFullYear();
  let viewMonth=new Date().getMonth();
  let modalName=null;
  let formOutcome='win';
  let busy=false;
  let toastTimer;

  function readGuest(){ try { const d=JSON.parse(localStorage.getItem('tradeglass_guest_entries')||'[]');return Array.isArray(d)?d.filter(e=>e && validDate(e.trade_date) && Number.isFinite(Number(e.pnl))).map(cleanEntry):[]; }catch(_){return [];} }
  function saveGuest(){try{localStorage.setItem('tradeglass_guest_entries',JSON.stringify(entries));return true;}catch(_){notify('تعذر حفظ البيانات محليًا: تحقق من مساحة المتصفح.',true);return false;}}
  function notify(message,error=false){const t=$('toast');t.textContent=message;t.className=`toast visible${error?' error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.classList.remove('visible');},4000);}
  function aggregate(){
    const monthly=entries.filter(e=>{const d=e.trade_date;return d.slice(0,7)===`${viewYear}-${pad(viewMonth+1)}`});
    const perDay=new Map();for(const e of monthly){const d=e.trade_date;const p=perDay.get(d)||{sum:0,count:0};p.sum+=e.pnl;p.count++;perDay.set(d,p);}
    return {monthly,perDay,net:monthly.reduce((s,e)=>s+e.pnl,0),winDays:[...perDay.values()].filter(p=>p.sum>.004).length,lossDays:[...perDay.values()].filter(p=>p.sum<-.004).length,wins:monthly.filter(e=>e.pnl>0).length,grossWins:monthly.filter(e=>e.pnl>0).reduce((s,e)=>s+e.pnl,0),grossLosses:monthly.filter(e=>e.pnl<0).reduce((s,e)=>s+e.pnl,0)};
  }
  function render(){
    const a=aggregate();const totalDays=a.perDay.size;
    $('month-title').textContent=`${months[viewMonth]} ${viewYear}`;
    $('stat-net').textContent=money(a.net);$('stat-net').className=`stat-value numeric ${a.net>0?'text-win':a.net<0?'text-loss':''}`;
    $('stat-net-caption').textContent=`${a.monthly.length} صفقة في ${months[viewMonth]}`;
    $('stat-win-days').innerHTML=`${a.winDays} <small>يوم</small>`;
    $('stat-win-caption').textContent=`من أصل ${totalDays} يوم تداول`;
    $('stat-winrate').innerHTML=`${a.monthly.length?Math.round(a.wins/a.monthly.length*100):0}<small>%</small>`;
    $('stat-winrate-caption').textContent=`${a.wins} رابحة من ${a.monthly.length} صفقة`;
    $('gross-wins').textContent=money(a.grossWins);
    $('gross-losses').textContent=money(a.grossLosses);
    const best=[...a.perDay].filter(([,v])=>v.sum>0).sort((x,y)=>y[1].sum-x[1].sum)[0];
    $('best-day').textContent=best?`${money(best[1].sum)} · ${parseDate(best[0]).getDate()}`:'—';
    renderCalendar(a);renderChart(a);renderRecent();renderAccount();
  }
  function renderCalendar(a){
    const first=new Date(viewYear,viewMonth,1);const offset=first.getDay();
    const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
    // A stable 5- or 6-week layout, always showing surrounding month days.
    const cells=Math.ceil((offset+daysInMonth)/7)*7;
    let html='';
    for(let i=0;i<cells;i++){
      const d=new Date(viewYear,viewMonth,i-offset+1);const key=dateKey(d);const own=d.getMonth()===viewMonth;const item=own?a.perDay.get(key):null;
      const c=item?(item.sum>.004?'won':item.sum<-.004?'lost':'flat'):'empty';
      const amount=item?`<span class="day-money">${esc(dayMoney(item.sum))}</span>`:'<span class="day-money">—</span>';
      const counts=item?`${item.count} ${item.count===1?'صفقة':'صفقات'}`:'&nbsp;';
      const desc=`${shortDate(key)}${item?'، '+money(item.sum)+'، '+item.count+' صفقات':''}`;
      html+=`<button class="day-cell ${c} ${own?'':'outside'} ${key===todayKey?'current':''}" data-day="${key}" role="gridcell" aria-label="${esc(desc)}"><span class="day-number">${d.getDate()}</span>${amount}<span class="day-count">${counts}</span></button>`;
    }
    $('calendar').innerHTML=html;
  }
  function renderChart(a){
    const count=new Date(viewYear,viewMonth+1,0).getDate();const sums=[];for(let d=1;d<=count;d++)sums.push(a.perDay.get(`${viewYear}-${pad(viewMonth+1)}-${pad(d)}`)?.sum||0);
    const max=Math.max(1,...sums.map(Math.abs));const html=sums.map((v,i)=>`<div class="chart-bar ${v<0?'negative':v===0?'zero':''}" style="height:${v===0?3:Math.max(7,Math.abs(v)/max*100)}%" title="${i+1} ${months[viewMonth]}: ${money(v)}"></div>`).join('');
    $('chart').innerHTML=html;
    // The chart shows absolute daily magnitudes, color indicates sign.
    if(!$('chart-note')){$('chart').insertAdjacentHTML('afterend','<div class="chart-note" id="chart-note"><span>01</span><span id="chart-mid"></span><span id="chart-last"></span></div>');}
    $('chart-mid').textContent=pad(Math.round(count/2));$('chart-last').textContent=pad(count);
  }
  function renderRecent(){
    const sorted=[...entries].sort((a,b)=>b.trade_date.localeCompare(a.trade_date)||b.created_at.localeCompare(a.created_at)).slice(0,5);
    $('activity-count').textContent=String(entries.length);
    $('activity-list').innerHTML=sorted.length?sorted.map(e=>`<div class="activity-entry"><span class="asset-logo">${esc(e.symbol.substring(0,2).toUpperCase())}</span><div class="activity-info"><b>${esc(e.symbol.toUpperCase())}</b><small>${esc(shortDate(e.trade_date))} · ${e.side==='buy'?'شراء':'بيع'}</small></div><strong class="activity-value ${e.pnl>0?'text-win':e.pnl<0?'text-loss':''}">${money(e.pnl)}</strong></div>`).join(''):'<div class="muted-empty"><span class="empty-icon">✧</span><span>لا توجد صفقات حتى الآن</span><span style="font-size:10px;color:#a4a4a7">أضف أول صفقة وابدأ رحلتك.</span></div>';
  }
  function renderAccount(){
    $('sync-badge').classList.toggle('online',Boolean(session && cloudReady));
    $('sync-label').textContent=session?(cloudFailed?'خطأ في المزامنة':cloudReady?'متصل بالسحابة':'جارٍ المزامنة'):isConfigured?'غير مسجل':'محلي فقط';
    $('account-label').textContent=session?session.user.email?.split('@')[0]||'حسابي':'حسابي';
  }
  function setMonth(delta){const d=new Date(viewYear,viewMonth+delta,1);viewYear=d.getFullYear();viewMonth=d.getMonth();render();}
  function openModal(name,html){modalName=name;$('modal-content').innerHTML=html;$('modal-layer').classList.remove('hidden');$('modal-layer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';setTimeout(()=>$('modal-card').querySelector('input:not([type="hidden"]),.x-close')?.focus(),30);}
  function closeModal(){modalName=null;$('modal-layer').classList.add('hidden');$('modal-layer').setAttribute('aria-hidden','true');document.body.style.overflow='';$('modal-content').innerHTML='';}
  function modalHeader(title,subtitle=''){return `<header class="modal-head"><div><span class="section-kicker">TRADEGLASS</span><h2 id="modal-heading">${esc(title)}</h2>${subtitle?`<div class="modal-subtitle">${esc(subtitle)}</div>`:''}</div><button class="x-close" data-close="1" aria-label="إغلاق">×</button></header>`;}
  function openDay(key){
    if(!validDate(key))return;
    const filtered=entries.filter(e=>e.trade_date===key).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const sum=filtered.reduce((s,e)=>s+e.pnl,0);
    const list=filtered.length?filtered.map(e=>`<div class="day-trade"><span class="asset-logo">${esc(e.symbol.slice(0,2).toUpperCase())}</span><div class="day-trade-main"><b>${esc(e.symbol.toUpperCase())}</b><small>${e.side==='buy'?'شراء':'بيع'}${e.notes?' · '+esc(e.notes):''}</small></div><strong dir="ltr" class="day-trade-amount ${e.pnl>0?'text-win':e.pnl<0?'text-loss':''}">${money(e.pnl)}</strong><button class="small-action" data-edit="${esc(e.id)}" aria-label="تعديل الصفقة" title="تعديل">✎</button><button class="small-action" data-delete="${esc(e.id)}" aria-label="حذف الصفقة" title="حذف">×</button></div>`).join(''):'<div class="muted-empty"><span class="empty-icon">◇</span>لا توجد صفقات في هذا اليوم.</div>';
    openModal('day',`${modalHeader(shortDate(key),'تفاصيل يوم التداول')}<div class="day-summary"><div><small>صافي نتيجة اليوم</small><strong dir="ltr" class="numeric ${sum>0?'text-win':sum<0?'text-loss':''}">${money(sum)}</strong></div><div style="text-align:left"><small>عدد الصفقات</small><strong class="numeric">${filtered.length}</strong></div></div><div>${list}</div><div class="modal-actions"><button class="primary-btn" data-new-date="${key}">＋ إضافة صفقة لهذا اليوم</button><button class="secondary-btn" data-close="1">إغلاق</button></div>`);
  }
  function openTrade(key=todayKey,id=null){
    const e=id?entries.find(x=>x.id===id):null;
    if(id&&!e)return notify('الصفقة غير موجودة',true);
    const date=e?.trade_date||key;
    formOutcome=e?.pnl<0?'loss':'win';
    openModal('trade',`${modalHeader(e?'تعديل صفقة':'إضافة صفقة جديدة','سجّل النتيجة يدويًا، وسيتم تحديث التقويم تلقائيًا.')}
    <form id="trade-form" data-id="${esc(e?.id||'')}">
      <div class="two-fields"><div class="field"><label for="f-date">تاريخ الصفقة</label><input required id="f-date" type="date" value="${esc(date)}" /></div><div class="field"><label for="f-symbol">الأصل المتداول</label><input required maxlength="24" id="f-symbol" placeholder="XAUUSD" value="${esc(e?.symbol||'XAUUSD')}" /></div></div>
      <div class="field"><label for="f-side">نوع الصفقة</label><select id="f-side"><option value="buy" ${e?.side==='sell'?'':'selected'}>شراء (Buy)</option><option value="sell" ${e?.side==='sell'?'selected':''}>بيع (Sell)</option></select></div>
      <div class="field"><label>نتيجة الصفقة</label><div class="outcome-group"><button type="button" class="outcome-button win ${formOutcome==='win'?'active':''}" data-outcome="win">↗ ربح</button><button type="button" class="outcome-button loss ${formOutcome==='loss'?'active':''}" data-outcome="loss">↘ خسارة</button></div></div>
      <div class="field"><label for="f-amount">المبلغ بالدولار (USD)</label><input id="f-amount" type="number" min="0" max="999999999999.99" step="0.01" inputmode="decimal" required placeholder="0.00" value="${e?Math.abs(e.pnl):''}" /></div>
      <div class="field"><label for="f-notes">ملاحظات (اختياري)</label><textarea id="f-notes" maxlength="2000" placeholder="سبب الدخول، الاستراتيجية، الدروس المستفادة...">${esc(e?.notes||'')}</textarea></div>
      <div class="modal-actions"><button class="primary-btn" type="submit" id="save-trade-btn">${e?'حفظ التعديلات':'حفظ الصفقة'}</button><button class="secondary-btn" data-close="1" type="button">إلغاء</button></div></form>`);
  }
  function openAuth(tab='login'){
    if(!isConfigured || !client)return openSettings();
    openModal('auth',`${modalHeader('حسابك السحابي','سجل بنفس البريد على جميع أجهزتك لمشاهدة صفقاتك.')}
      <div class="auth-tabs"><button class="${tab==='login'?'active':''}" data-auth-tab="login">تسجيل الدخول</button><button class="${tab==='signup'?'active':''}" data-auth-tab="signup">إنشاء حساب</button></div>
      <form id="auth-form" data-tab="${tab}"><div class="field"><label for="auth-email">البريد الإلكتروني</label><input id="auth-email" type="email" autocomplete="email" required placeholder="name@example.com" dir="ltr" /></div>
      <div class="field"><label for="auth-password">كلمة المرور</label><input id="auth-password" type="password" autocomplete="${tab==='signup'?'new-password':'current-password'}" minlength="6" required placeholder="6 حروف على الأقل" dir="ltr" /></div>
      <div class="modal-actions"><button class="primary-btn" id="submit-auth" type="submit">${tab==='signup'?'إنشاء الحساب':'تسجيل الدخول'}</button><button class="secondary-btn" data-close="1" type="button">إلغاء</button></div>
      ${tab==='login'?'<button type="button" id="forgot-password" style="border:0;background:none;color:#e2e2e3;margin-top:15px;font-size:11px">نسيت كلمة المرور؟</button>':''}</form>`);
  }
  function openRecovery(){
    openModal('recovery',`${modalHeader('تعيين كلمة مرور جديدة','أدخل كلمة مرور جديدة لحسابك.')}
      <form id="recovery-form"><div class="field"><label for="new-password">كلمة المرور الجديدة</label><input id="new-password" type="password" minlength="6" autocomplete="new-password" required placeholder="6 حروف على الأقل" dir="ltr" /></div>
      <div class="modal-actions"><button class="primary-btn" type="submit" id="recovery-save">تحديث كلمة المرور</button></div></form>`);
  }
  async function submitRecovery(){
    const password=$('new-password').value;
    if(!client || password.length<6)return;
    try{const {error}=await client.auth.updateUser({password});if(error)throw error;closeModal();notify('تم تحديث كلمة المرور بنجاح ✓');}
    catch(e){notify('تعذر تغيير كلمة المرور: '+friendlyError(e),true);}
  }
  function openSettings(){
    const guestCount=readGuest().length;
    let body='';
    if(session){body=`<div class="account-status"><span class="user-avatar">TG</span><div><strong>${esc(session.user.email||'حساب متصل')}</strong><small>حسابك مرتبط بالمزامنة السحابية</small></div></div><div class="setting-row"><span>حالة المزامنة<small>بياناتك محفوظة داخل حسابك في Supabase</small></span><strong class="connected-state">متصل ✓</strong></div>${guestCount?`<div class="setting-row"><span>صفقات الوضع المحلي<small>${guestCount} صفقة مخزنة على هذا الجهاز</small></span><button class="secondary-btn" id="import-guest">نقل للسحابة</button></div>`:''}<div class="setting-row"><span>تحديث البيانات</span><button class="secondary-btn" id="manual-refresh">مزامنة الآن</button></div><div class="setting-row"><span>تنزيل سجل الصفقات<small>ملف CSV يحتوي جميع صفقات الحساب</small></span><button class="secondary-btn" id="export-csv">تصدير CSV</button></div><div class="modal-actions"><button class="danger-btn" id="signout-btn">تسجيل الخروج</button><button class="secondary-btn" data-close="1">إغلاق</button></div>`;}
    else if(isConfigured){body=`<div class="notice">المزامنة السحابية مفعّلة في التطبيق، لكنك غير مسجل الدخول. الصفقات التي تضيفها الآن تحفظ على هذا الجهاز فقط.</div><div class="setting-row"><span>صفقات الجهاز<small>${entries.length} صفقة محلية</small></span><button class="secondary-btn" id="export-csv">تصدير CSV</button></div><div class="modal-actions"><button class="primary-btn" id="open-login">تسجيل الدخول / إنشاء حساب</button></div>`;}
    else {body=`<div class="notice warn">أنت في <b>الوضع المحلي</b>: تحفظ الصفقات على هذا المتصفح فقط، ولن تظهر على هاتف آخر قبل تفعيل الحساب السحابي.</div><p class="help-text">لتفعيل الحفظ بين الأجهزة: أنشئ مشروعًا في Supabase، شغّل ملف <b dir="ltr">schema.sql</b>، ثم ضع رابط المشروع والمفتاح العام في <b dir="ltr">config.js</b> وانشر الموقع على HTTPS.</p><div class="setting-row"><span>صفقات الجهاز<small>${entries.length} صفقة محلية</small></span><button class="secondary-btn" id="export-csv">تصدير CSV</button></div>`;}
    openModal('settings',modalHeader('إعدادات TradeGlass','إدارة حسابك وبيانات التداول.')+body);
  }
  async function onSubmitTrade(form){
    if(busy)return;
    const id=form.dataset.id;
    const date=$('f-date').value,symbol=$('f-symbol').value.trim().toUpperCase(),side=$('f-side').value,amount=Number($('f-amount').value),notes=$('f-notes').value.trim();
    if(!validDate(date)||!symbol||symbol.length>24||!['buy','sell'].includes(side)||!Number.isFinite(amount)||amount<0||amount>999999999999.99||notes.length>2000){notify('تحقق من جميع تفاصيل الصفقة.',true);return;}
    const payload={trade_date:date,symbol,side,pnl:Number((amount*(formOutcome==='loss'?-1:1)).toFixed(2)),notes};
    busy=true;$('save-trade-btn').disabled=true;$('save-trade-btn').innerHTML='<span class="loading-spinner"></span> جارٍ الحفظ';
    try{
      if(session){const q=id?client.from('trade_entries').update(payload).eq('id',id).eq('user_id',session.user.id):client.from('trade_entries').insert({...payload,user_id:session.user.id});const {data,error}=await q.select('*').single();if(error)throw error;const item=cleanEntry(data);if(id)entries=entries.map(e=>e.id===id?item:e);else entries.push(item);}
      else{if(id){entries=entries.map(e=>e.id===id?{...e,...payload}:e);}else entries.push(cleanEntry({...payload,id:window.crypto?.randomUUID?.()||`guest-${Date.now()}-${Math.random().toString(36).slice(2)}`,created_at:new Date().toISOString()}));saveGuest();}
      closeModal();viewYear=Number(date.slice(0,4));viewMonth=Number(date.slice(5,7))-1;render();notify(id?'تم تحديث الصفقة بنجاح':'تم حفظ الصفقة بنجاح ✓');
    }catch(error){notify('تعذر حفظ الصفقة: '+friendlyError(error),true);}finally{busy=false;if($('save-trade-btn')){$('save-trade-btn').disabled=false;}}
  }
  async function deleteTrade(id){
    const entry=entries.find(e=>e.id===id);if(!entry)return;
    if(!window.confirm(`هل تريد حذف صفقة ${entry.symbol} بقيمة ${money(entry.pnl)}؟`))return;
    try{
      if(session){const {error}=await client.from('trade_entries').delete().eq('id',id).eq('user_id',session.user.id);if(error)throw error;}
      entries=entries.filter(e=>e.id!==id);if(!session)saveGuest();render();openDay(entry.trade_date);notify('تم حذف الصفقة.');
    }catch(error){notify('تعذر الحذف: '+friendlyError(error),true);}
  }
  function friendlyError(e){const s=String(e?.message||'خطأ غير معروف');if(/Invalid login credentials/i.test(s))return 'البريد أو كلمة المرور غير صحيحة';if(/Email not confirmed/i.test(s))return 'أكد بريدك الإلكتروني أولًا';if(/fetch|network|failed to fetch/i.test(s))return 'تحقق من الاتصال بالإنترنت';if(/relation|schema cache|table/i.test(s))return 'تحقق من تشغيل ملف schema.sql';return s.length>120?s.slice(0,117)+'...':s;}
  async function submitAuth(form){
    if(!client||busy)return;
    const email=$('auth-email').value.trim(),password=$('auth-password').value;
    const signup=form.dataset.tab==='signup';busy=true;$('submit-auth').disabled=true;$('submit-auth').textContent='جارٍ التحقق...';
    try{
      if(signup){const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(data.session){closeModal();notify('تم إنشاء الحساب وتسجيل الدخول ✓');}else{notify('تم إرسال رسالة لتأكيد بريدك. افتح بريدك ثم سجّل الدخول.');openAuth('login');}}
      else {const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;closeModal();notify('تم تسجيل الدخول، جارٍ تحميل صفقاتك...');}
    }catch(e){notify(friendlyError(e),true);}finally{busy=false;if($('submit-auth')){$('submit-auth').disabled=false;$('submit-auth').textContent=signup?'إنشاء الحساب':'تسجيل الدخول';}}
  }
  async function resetPassword(){const email=$('auth-email')?.value.trim();if(!email){notify('أدخل بريدك الإلكتروني أولًا.',true);return;}try{const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;notify('تم إرسال رابط استعادة كلمة المرور إلى بريدك.');}catch(e){notify(friendlyError(e),true);}}
  async function cloudRefresh(silent=false){
    if(!session||!client){if(!silent)notify('البيانات المحلية محدثة.');render();return;}
    const userId=session.user.id;
    try{
      const received=[];const pageSize=500;
      for(let start=0;;start+=pageSize){
        const {data,error}=await client.from('trade_entries').select('id,user_id,trade_date,symbol,side,pnl,notes,created_at').eq('user_id',userId).order('trade_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+pageSize-1);
        if(error)throw error;
        if(session?.user.id!==userId)return;
        received.push(...(data||[]));
        if(!data || data.length<pageSize)break;
      }
      entries=received.map(cleanEntry);cloudReady=true;cloudFailed=false;render();if(!silent)notify('تم تحديث بياناتك من السحابة ✓');
    }
    catch(e){cloudReady=false;cloudFailed=true;render();notify('تعذرت المزامنة: '+friendlyError(e),true);}
  }
  async function sessionChanged(next){const oldId=session?.user.id;const newId=next?.user.id;session=next;if(oldId!==newId){cloudReady=false;cloudFailed=false;entries=next?[]:readGuest();render();if(next)await cloudRefresh(true);}else render();}
  async function importGuest(){
    const guest=readGuest();if(!guest.length)return notify('لا توجد صفقات محلية لنقلها.');
    if(!session)return;
    if(!confirm(`سيتم نسخ ${guest.length} صفقة محلية إلى حسابك السحابي، ثم حذف النسخة المحلية بعد التأكد. متابعة؟`))return;
    const userId=session.user.id;
    try{
      // Keep guest IDs out of the cloud; database assigns fresh UUIDs.
      const payload=guest.map(({trade_date,symbol,side,pnl,notes})=>({trade_date,symbol,side,pnl,notes,user_id:userId}));
      for(let i=0;i<payload.length;i+=100){const {error}=await client.from('trade_entries').insert(payload.slice(i,i+100));if(error)throw error;}
      localStorage.removeItem('tradeglass_guest_entries');await cloudRefresh(true);openSettings();notify('تم نقل الصفقات المحلية إلى السحابة ✓');
    }catch(e){notify('لم يكتمل النقل؛ احتفظنا بالبيانات المحلية. راجع حسابك قبل المحاولة مجددًا.',true);}
  }
  function csvCell(x){let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function exportCSV(){
    const header=['Date','Symbol','Side','PnL_USD','Notes'];
    const rows=[header,...entries.map(e=>[e.trade_date,e.symbol,e.side,e.pnl.toFixed(2),e.notes])];
    const csv='\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`TradeGlass-${todayKey}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);notify('تم تجهيز ملف CSV.');
  }
  function bindEvents(){
    $('prev-month').addEventListener('click',()=>setMonth(-1));$('next-month').addEventListener('click',()=>setMonth(1));
    $('today-btn').addEventListener('click',()=>{const d=new Date();viewYear=d.getFullYear();viewMonth=d.getMonth();render();});
    $('add-trade-btn').addEventListener('click',()=>openTrade());
    $('settings-btn').addEventListener('click',openSettings);$('account-btn').addEventListener('click',()=>session?openSettings():isConfigured?openAuth():openSettings());
    $('sync-now-btn').addEventListener('click',()=>cloudRefresh(false));
    $('calendar').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(!b)return;const d=b.dataset.day;if(d.slice(0,7)!==`${viewYear}-${pad(viewMonth+1)}`){viewYear=Number(d.slice(0,4));viewMonth=Number(d.slice(5,7))-1;render();}openDay(d);});
    $('modal-layer').addEventListener('click',async e=>{
      const node=e.target.closest('button,[data-close]');if(!node)return;
      if(node.dataset.close){closeModal();return;}
      if(node.dataset.newDate){openTrade(node.dataset.newDate);return;}
      if(node.dataset.edit){const en=entries.find(x=>x.id===node.dataset.edit);if(en)openTrade(en.trade_date,en.id);return;}
      if(node.dataset.delete){await deleteTrade(node.dataset.delete);return;}
      if(node.dataset.outcome){formOutcome=node.dataset.outcome;document.querySelectorAll('.outcome-button').forEach(b=>b.classList.toggle('active',b.dataset.outcome===formOutcome));return;}
      if(node.dataset.authTab){openAuth(node.dataset.authTab);return;}
      if(node.id==='open-login'){openAuth();return;}
      if(node.id==='signout-btn'){if(client){const {error}=await client.auth.signOut();if(error)notify(friendlyError(error),true);else{closeModal();notify('تم تسجيل الخروج.');}}return;}
      if(node.id==='manual-refresh'){await cloudRefresh(false);closeModal();return;}
      if(node.id==='import-guest'){await importGuest();return;}
      if(node.id==='export-csv'){exportCSV();return;}
      if(node.id==='forgot-password'){await resetPassword();return;}
    });
    $('modal-layer').addEventListener('submit',e=>{if(e.target.id==='trade-form'){e.preventDefault();onSubmitTrade(e.target);}if(e.target.id==='auth-form'){e.preventDefault();submitAuth(e.target);}if(e.target.id==='recovery-form'){e.preventDefault();submitRecovery();}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalName)closeModal();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)cloudRefresh(true);});
    window.addEventListener('online',()=>{if(session)cloudRefresh(true);});
  }
  async function init(){
    bindEvents();render();
    if(isConfigured){
      if(!window.supabase?.createClient){notify('تعذر تحميل مكتبة المزامنة؛ تحقق من اتصال الإنترنت.',true);return;}
      try{
        client=window.supabase.createClient(config.supabaseUrl.trim(),config.supabasePublishableKey.trim(),{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
        client.auth.onAuthStateChange((event,s)=>{setTimeout(()=>{sessionChanged(s);if(event==='PASSWORD_RECOVERY')openRecovery();},0);});
        const {data,error}=await client.auth.getSession();if(error)throw error;
        await sessionChanged(data.session);
      }catch(e){notify('فشل إعداد المزامنة: '+friendlyError(e),true);}
    }
    if('serviceWorker' in navigator && location.protocol==='https:'){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
  }
  init();
})();
