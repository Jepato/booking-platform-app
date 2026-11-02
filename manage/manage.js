/* manage.js — the business's own app: owner, manager and staff. One code for every business; what each person
   sees follows their role, and the database (RLS) enforces the same rules, so hiding a button is never the protection.
   Routes: #/login · #/join/<code> · #/reset · #/ diary · #/new · #/customers · #/more · #/services · #/hours · #/team
           #/look · #/business · #/share */
(() => {
  'use strict';
  const P = window.PLATFORM;
  const { $, $$, esc, icon, toast, sheet, closeSheet, busy, ymd, hm, dayLong, addDays, wd, at, hhmm, money } = UI;
  const S = { access: null, tid: null, setup: null, day: null, week: null, agenda: [], showCancelled: false };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
               set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
  const role = () => S.setup && S.setup.role, canManage = () => ['owner', 'manager'].includes(role()), isOwner = () => role() === 'owner';
  const T = () => S.setup.tenant;
  const ini = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(w => [...w][0] || '').join('');   // "יעל לוי" → "יל"
  const rpc = API.rpc;
  const bookingLink = slug => P.businessUrl(slug);
  const STATUS = { confirmed: ['', ''], completed: ['הגיע/ה', 'ok'], no_show: ['לא הגיע/ה', 'bad'], cancelled: ['בוטל', ''] };

  // ---------------------------------------------------------------- boot / session
  async function boot() {
    await API.auth.load();
    const code = ls.get('manage.invite');
    if (code) { try { await rpc('accept_invite', { p_code: code }); toast('הצטרפת לעסק'); } catch (e) { toast(API.say(e)); } ls.set('manage.invite', null); }
    S.access = await rpc('my_access');
    const list = S.access.businesses;
    if (!list.length) return false;
    const saved = ls.get('manage.tid');
    S.tid = list.some(b => b.id === saved) ? saved : list[0].id;
    await loadSetup();
    return true;
  }
  async function loadSetup() {
    S.setup = await rpc('owner_setup', { p_tenant: S.tid });
    UI.tz(T().timezone);
    const c = T().config || {}, root = document.documentElement, skin = Themes.list[Themes.skinOf(c)];
    const a = Themes.okAccent(c.accent) ? c.accent : skin.accent;
    root.style.setProperty('--brand', a); root.style.setProperty('--on-brand', Themes.onAccent(a));
    root.style.setProperty('--brand-text-l', Themes.textStep(a, '#fbf7f5', false)); root.style.setProperty('--brand-text-d', Themes.textStep(a, '#1a1514', true));
    document.title = `${T().name} · ניהול`;
  }
  const signedIn = () => !!API.auth.session;
  // wrap a screen: signed in and set up first
  const screen = (view, opts = {}) => async p => {
    if (!signedIn()) { Router.go('/login'); return ''; }
    if (!S.setup) {
      let ok;
      try { ok = await boot(); } catch (e) { if (e.code === 'signed_out') { Router.go('/login'); return ''; } return errorView(e); }
      if (!ok) return noBusiness();
    }
    if (opts.manage && !canManage()) { Router.go('/'); return ''; }
    tabs(!opts.noTabs);
    return view(p);
  };
  const errorView = e => `<div class="empty"><h1>לא הצלחנו לטעון</h1><p>${esc(API.say(e))}</p><button class="btn btn-primary" data-reload>לנסות שוב</button></div>`;
  function noBusiness() {
    tabs(false);
    if (S.access && S.access.is_admin) { location.href = P.url('admin/'); return ''; }
    return `<div class="auth"><div class="card"><h1>אין עדיין עסק בחשבון הזה</h1>
      <p class="muted">כדי להיכנס לעסק צריך קישור הזמנה מבעל/ת העסק או מאיתנו.</p>
      <a class="btn btn-primary" href="${Biz.wa(P.supportPhone, 'שלום, נרשמתי למערכת ואין לי עדיין עסק בחשבון')}" target="_blank" rel="noopener">${icon('b-whatsapp')}לדבר איתנו</a>
      <button class="btn btn-quiet" type="button" data-signout>יציאה</button></div></div>`;
  }
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-signout]')) { await API.auth.signOut(); S.setup = null; S.access = null; ls.set('manage.tid', null); Router.go('/login'); }
  });

  function tabs(show) {
    const nav = $('#tabs'); document.body.classList.toggle('no-tabs', !show); nav.hidden = !show; if (!show) return;
    const items = canManage()
      ? [['/', 'i-calendar', 'יומן'], ['/new', 'i-plus', 'תור חדש'], ['/customers', 'i-users', 'לקוחות'], ['/more', 'i-menu', 'עוד']]
      : [['/', 'i-calendar', 'יומן'], ['/more', 'i-menu', 'עוד']];
    nav.style.setProperty('--n', items.length);
    const cur = Router.path, top = ['/services', '/hours', '/team', '/look', '/business', '/share'].includes(cur) ? '/more' : cur;
    nav.innerHTML = items.map(([h, i, l]) => `<a href="#${h}" ${top === h ? 'aria-current="page"' : ''}>${icon(i)}<span class="${top === h ? '' : 'vh'}">${l}</span></a>`).join('');
  }
  const header = (title, back) => `<header class="top"><div class="wrap">${back ? `<a class="icon-btn" href="#${back}" aria-label="חזרה">${icon('i-arrow-right')}</a>` : ''}<h1>${esc(title)}</h1></div></header>`;

  // ---------------------------------------------------------------- sign in / join / reset
  function authCard(inner) { tabs(false); return `<div class="auth"><div class="card">${inner}</div></div>`; }
  function loginView() {
    if (signedIn()) { Router.go('/'); return ''; }
    const joining = !!ls.get('manage.invite');
    return authCard(`<h1>כניסה</h1>
      <p class="muted">${joining ? 'התחברו כדי להצטרף לעסק.' : 'ניהול התורים של העסק שלך.'}</p>
      <form id="login" class="stack" novalidate>
        <div class="field"><label for="l-email">אימייל</label><input id="l-email" name="email" type="email" autocomplete="username" dir="ltr" required></div>
        <div class="field"><label for="l-pw">סיסמה</label><input id="l-pw" name="pw" type="password" autocomplete="current-password" dir="ltr" required></div>
        <p class="error" id="l-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-wide" type="submit">כניסה</button>
        <button class="btn btn-quiet" type="button" id="forgot">שכחתי סיסמה</button>
      </form>`);
  }
  function wireLogin(app) {
    const f = $('#login', app); if (!f) return;
    f.onsubmit = async e => { e.preventDefault();
      await busy(f.querySelector('[type=submit]'), async () => { await API.auth.signIn(f.email.value, f.pw.value); S.setup = null; Router.go('/'); }, $('#l-err')).catch(() => {}); };
    $('#forgot', app).onclick = () => sheet(`<h2 class="sheet-title" id="sheet-t">איפוס סיסמה</h2><p class="muted">נשלח קישור לאימייל.</p>
      <form id="rec" class="stack"><div class="field"><label for="r-email">אימייל</label><input id="r-email" type="email" dir="ltr" autofocus value="${esc(f.email.value)}"></div>
      <p class="error" id="r-err" hidden></p><button class="btn btn-primary btn-wide">שליחת קישור</button></form>`, b => {
        $('#rec', b).onsubmit = async e => { e.preventDefault();
          await busy(e.target.querySelector('button'), () => API.auth.recover($('#r-email', b).value, P.url('manage/')), $('#r-err', b)).catch(() => {});
          if ($('#r-err', b).hidden) { closeSheet(); toast('אם האימייל רשום, נשלח אליו קישור'); } };
      });
  }
  function joinView(code) {
    ls.set('manage.invite', code);
    if (signedIn()) { S.setup = null; Router.go('/'); return ''; }
    return authCard(`<h1>הצטרפות</h1>
      <p class="muted">קיבלת הזמנה לנהל עסק ב${esc(P.name)}. פותחים חשבון עם אימייל וסיסמה.</p>
      <form id="join" class="stack" novalidate>
        <div class="field"><label for="j-email">אימייל</label><input id="j-email" name="email" type="email" autocomplete="username" dir="ltr" required></div>
        <div class="field"><label for="j-pw">סיסמה (לפחות 8 תווים)</label><input id="j-pw" name="pw" type="password" autocomplete="new-password" dir="ltr" minlength="8" required></div>
        <p class="error" id="j-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-wide" type="submit">פתיחת חשבון</button>
        <a class="btn btn-quiet" href="#/login">כבר יש לי חשבון</a>
      </form>`);
  }
  function wireJoin(app) {
    const f = $('#join', app); if (!f) return;
    f.onsubmit = async e => { e.preventDefault();
      if (f.pw.value.length < 8) { $('#j-err').textContent = 'הסיסמה צריכה לפחות 8 תווים.'; $('#j-err').hidden = false; return; }
      await busy(f.querySelector('[type=submit]'), async () => {
        const r = await API.auth.signUp(f.email.value, f.pw.value);
        if (r.needsConfirm) { app.innerHTML = authCard(`<h1>בדקו את האימייל</h1><p>שלחנו קישור אישור ל-<bdi dir="ltr">${esc(f.email.value)}</bdi>. אחרי האישור נכנסים כאן, וההזמנה תופעל.</p><a class="btn btn-primary" href="#/login">לכניסה</a>`); return; }
        S.setup = null; Router.go('/');
      }, $('#j-err')).catch(() => {}); };
  }
  function resetView() {
    return authCard(`<h1>סיסמה חדשה</h1><form id="reset" class="stack" novalidate>
      <div class="field"><label for="n-pw">סיסמה חדשה (לפחות 8 תווים)</label><input id="n-pw" type="password" autocomplete="new-password" dir="ltr" minlength="8" required autofocus></div>
      <p class="error" id="n-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`);
  }
  function wireReset(app) {
    const f = $('#reset', app); if (!f) return;
    f.onsubmit = async e => { e.preventDefault();
      await busy(f.querySelector('button'), async () => { await API.auth.setPassword($('#n-pw').value); toast('הסיסמה עודכנה'); Router.go('/'); }, $('#n-err')).catch(() => {}); };
  }

  // ---------------------------------------------------------------- diary
  async function loadWeek(force) {
    const start = addDays(S.day, -wd(S.day));
    if (force || S.week !== start) { S.agenda = await rpc('owner_agenda', { p_tenant: S.tid, p_from: start, p_days: 7 }); S.week = start; }
  }
  async function diary() {
    S.day = S.day || ymd(new Date());
    await loadWeek();
    const today = ymd(new Date()), start = S.week, multi = S.setup.staff.filter(s => s.active).length > 1;
    const dayOf = b => ymd(new Date(b.starts_at));
    const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
    const list = S.agenda.filter(b => dayOf(b) === S.day);
    const live = list.filter(b => b.status !== 'cancelled'), off = list.filter(b => b.status === 'cancelled');
    const mine = role() === 'staff';
    const row = b => { const [label, cls] = STATUS[b.status]; const s = new Date(b.starts_at), e = new Date(b.ends_at);
      return `<button class="item ${b.status === 'cancelled' ? 'is-off' : ''}" type="button" data-b="${b.id}">
        <span class="t">${hm(s)}<small>${hm(e)}</small></span>
        <span class="main"><strong>${esc(b.customer_name)}</strong><span>${esc(b.service)}${multi && !mine ? ' · ' + esc(b.staff) : ''}</span></span>
        <span>${label ? `<span class="chip ${cls}">${label}</span>` : b.source === 'online' && Date.now() - new Date(b.created_at) < 864e5 ? '<span class="newdot" title="חדש"></span><span class="vh">חדש</span>' : ''}</span>
      </button>`; };
    const me = S.setup.staff.find(x => x.id === S.setup.my_staff_id), firstName = me ? me.name.split(' ')[0] : '';
    const nowD = new Date(), upcoming = S.agenda.filter(b => b.status === 'confirmed' && new Date(b.ends_at) > nowD).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const next = upcoming.find(b => !mine || b.staff_id === S.setup.my_staff_id);
    const nextLine = next ? `התור הבא: ${whenWord(new Date(next.starts_at))} ב-${hm(new Date(next.starts_at))}` : 'אין תורים קרובים השבוע';
    return `<div class="wrap">
        <header class="hello">
          <span class="now"><i></i><bdi dir="ltr">${hm(nowD)}</bdi> · ${esc(T().name)}</span>
          <div class="hello-row"><h1>${esc(Biz.greet())}${firstName ? `, ${esc(firstName)}` : ''}</h1><span class="avatar" aria-hidden="true">${esc([...(firstName || T().name)][0])}</span></div>
          <p>${esc(nextLine)}</p>
        </header>
        ${heroCard(live)}
        <section class="section" aria-label="בחירת יום">
          <div class="daynav">
            <button class="icon-btn" type="button" data-week="-7" aria-label="שבוע קודם">${icon('i-chevron-right')}</button>
            <span class="label">${esc(dayLong(at(S.day, 720)))}</span>
            <button class="icon-btn" type="button" data-week="7" aria-label="שבוע הבא">${icon('i-chevron-left')}</button>
          </div>
          <div class="week">${days.map(d => { const n = S.agenda.filter(b => dayOf(b) === d && b.status !== 'cancelled').length;
            return `<button class="wd ${d === today ? 'today' : ''}" type="button" data-day="${d}" aria-pressed="${d === S.day}" aria-label="${Biz.DAY_HE[wd(d)]} ${+d.slice(8)}.${+d.slice(5, 7)}, ${n} תורים">
              <span class="small">${Biz.DAY_LETTER[wd(d)]}</span><b>${+d.slice(8)}</b><i>${n ? n : ''}</i></button>`; }).join('')}</div>
          ${S.day !== today ? `<button class="btn btn-quiet btn-sm" type="button" data-day="${today}">חזרה להיום</button>` : ''}
        </section>
        <section class="section" aria-labelledby="h-day">
          <div class="row"><h2 id="h-day" class="grow">${live.length ? `${live.length} תורים` : 'אין תורים'}</h2>
            ${S.day === today || S.day === addDays(today, 1) ? `<button class="btn btn-ghost btn-sm" type="button" id="remind">${icon('i-bell')}תזכורות למחר</button>` : ''}</div>
          ${live.length ? `<div class="list">${live.map(row).join('')}</div>`
            : `<div class="empty card">אין תורים ביום הזה.${canManage() ? `<a class="btn btn-primary" href="#/new">${icon('i-plus')}תור חדש</a>` : ''}</div>`}
          ${off.length ? `<button class="btn btn-quiet btn-sm" type="button" id="toggle-off">${S.showCancelled ? 'להסתיר' : 'להציג'} ${off.length} מבוטלים</button>
            ${S.showCancelled ? `<div class="list">${off.map(row).join('')}</div>` : ''}` : ''}
        </section>
        ${canManage() ? '<section class="section" id="stats"></section>' : ''}
      </div>`;
  }
  // the one black card: the chosen day at a glance (first/next booking, bookings per hour, count, booked value, how full)
  function heroCard(live) {
    const today = ymd(new Date()), isToday = S.day === today, nowD = new Date();
    const conf = live.filter(b => b.status !== 'cancelled');
    const focus = (isToday ? conf.find(b => new Date(b.ends_at) > nowD) : conf[0]) || null;
    const hours = S.setup.hours.filter(h => !h.staff_id && h.weekday === wd(S.day));
    const open = hours.reduce((m, h) => m + (h.closes_min - h.opens_min), 0) * Math.max(1, S.setup.staff.filter(x => x.active).length);
    const booked = conf.reduce((m, b) => m + (new Date(b.ends_at) - new Date(b.starts_at)) / 60000, 0);
    const from = hours.length ? Math.floor(Math.min(...hours.map(h => h.opens_min)) / 60) : 8, to = hours.length ? Math.ceil(Math.max(...hours.map(h => h.closes_min)) / 60) : 20;
    const per = Array.from({ length: Math.max(1, to - from) }, (_, k) => conf.filter(b => { const m = new Date(b.starts_at); return +hm(m).slice(0, 2) === from + k; }).length);
    const max = Math.max(1, ...per), nowH = +hm(nowD).slice(0, 2);
    const value = conf.reduce((m, b) => m + (b.price_agorot || 0), 0);
    return `<section class="hero" aria-label="סיכום היום">
      <span class="lbl">${focus ? (isToday ? 'התור הבא' : 'התור הראשון') + ' · ' + esc(dayLong(at(S.day, 720))) : esc(dayLong(at(S.day, 720)))}</span>
      <div class="hero-main">
        <span class="hero-time"><bdi dir="ltr">${focus ? hm(new Date(focus.starts_at)) : '—'}</bdi></span>
        ${focus ? `<span class="hero-who"><span><strong>${esc(focus.customer_name)}</strong><span>${esc(focus.service)}</span></span><span class="avatar" aria-hidden="true">${esc(ini(focus.customer_name))}</span></span>` : `<span class="hero-who"><span>${conf.length ? '' : 'יום פנוי'}</span></span>`}
      </div>
      <div><div class="bars" aria-hidden="true">${per.map((n, k) => `<i class="${isToday && from + k === nowH ? 'now' : ''}" style="height:${Math.round((n / max) * 100)}%"></i>`).join('')}</div>
        <div class="bars-x" aria-hidden="true"><span>${from}</span><span>${Math.round((from + to) / 2)}</span><span>${to}</span></div></div>
      <div class="hero-stats">
        <div><span>תורים</span><b>${conf.length}</b></div>
        <div><span>לפי המחירון</span><b>${money(value) || '₪0'}</b></div>
        <div><span>תפוסה</span><b>${open ? Math.min(100, Math.round(100 * booked / open)) + '%' : '–'}</b></div>
      </div></section>`;
  }
  function wireDiary(app) {
    $$('[data-day]', app).forEach(b => b.onclick = () => { S.day = b.dataset.day; Router.refresh(); });
    $$('[data-week]', app).forEach(b => b.onclick = () => { S.day = addDays(S.day, +b.dataset.week); Router.refresh(); });
    $$('[data-b]', app).forEach(b => b.onclick = () => bookingSheet(S.agenda.find(x => x.id === b.dataset.b)));
    const t = $('#toggle-off', app); if (t) t.onclick = () => { S.showCancelled = !S.showCancelled; Router.refresh(); };
    const r = $('#remind', app); if (r) r.onclick = reminders;
    const st = $('#stats', app);
    if (st) rpc('owner_stats', { p_tenant: S.tid }).then(s => { st.innerHTML = `<h2>סיכום</h2><div class="kpis">
      <div class="kpi"><b>${s.next_7_days}</b><span>תורים ב-7 הימים הקרובים</span></div>
      <div class="kpi"><b>${s.last_30_days}</b><span>תורים ב-30 הימים האחרונים</span></div>
      <div class="kpi"><b>${s.online_share_30 == null ? '–' : s.online_share_30 + '%'}</b><span>נקבעו אונליין (30 יום)</span></div>
      <div class="kpi"><b>${s.no_shows_30}</b><span>לא הגיעו (30 יום)</span></div></div>
      <p class="hint">${money(s.booked_value_30) || '₪0'} בתורים שנקבעו ב-30 הימים האחרונים, לפי המחירון. זה לא סכום ששולם: התשלום נעשה בעסק.</p>`; }).catch(() => {});
  }
  const refreshDiary = async () => { S.week = null; await Router.refresh(); };

  // WhatsApp texts (the owner presses send in WhatsApp; nothing is sent automatically)
  const custLink = b => `${bookingLink(T().slug)}#/t/${b.token}`;
  const whenWord = d => { const k = ymd(d), t = ymd(new Date()); return k === t ? 'היום' : k === addDays(t, 1) ? 'מחר' : dayLong(d); };
  const remindText = b => `היי ${b.customer_name}, תזכורת לתור שלך ב${T().name} ${whenWord(new Date(b.starts_at))} ב-${hm(new Date(b.starts_at))} (${b.service}). לפרטים או לביטול: ${custLink(b)}`;

  function bookingSheet(b) {
    const s = new Date(b.starts_at), e = new Date(b.ends_at), [label, cls] = STATUS[b.status], ph = Biz.phone(b.phone);
    sheet(`<div class="sheet-who"><span class="avatar round" aria-hidden="true">${esc(ini(b.customer_name))}</span>
        <div><h2 class="sheet-title" id="sheet-t">${esc(b.customer_name)}</h2>${label ? `<span class="chip ${cls}">${label}</span>` : b.source === 'online' ? '<span class="chip acc">נקבע אונליין</span>' : ''}</div></div>
      <dl class="facts">
        <dt>מתי</dt><dd>${esc(dayLong(s))} · <bdi dir="ltr">${hm(s)}–${hm(e)}</bdi></dd>
        <dt>שירות</dt><dd>${esc(b.service)}${b.price_agorot != null ? ' · ' + money(b.price_agorot) : ''}</dd>
        <dt>אצל</dt><dd>${esc(b.staff)}</dd>
        ${b.phone ? `<dt>טלפון</dt><dd><bdi dir="ltr">${esc(ph.ok ? ph.local : b.phone)}</bdi></dd>` : ''}
        ${b.customer_note ? `<dt>הערה</dt><dd>${esc(b.customer_note)}</dd>` : ''}
        <dt>נקבע</dt><dd>${b.source === 'online' ? 'אונליין' : 'ידנית'}${b.cancelled_by ? ` · בוטל ע״י ${b.cancelled_by === 'customer' ? 'הלקוח/ה' : 'העסק'}` : ''}</dd>
      </dl>
      ${ph.ok ? `<div class="grid2">
        ${ph.mobile ? `<a class="btn btn-ghost" href="${Biz.wa(b.phone, b.status === 'confirmed' ? remindText(b) : `היי ${b.customer_name}, `)}" target="_blank" rel="noopener">${icon('b-whatsapp')}וואטסאפ</a>` : ''}
        <a class="btn btn-ghost" href="${Biz.tel(b.phone)}">${icon('i-phone')}חיוג</a></div>` : ''}
      <div class="stack" style="margin-top:12px">
        ${b.status === 'confirmed' ? `<div class="grid2"><button class="btn btn-brand" type="button" data-st="completed">${icon('i-check')}הגיע/ה</button>
          <button class="btn btn-ghost" type="button" data-st="no_show">לא הגיע/ה</button></div>` : ''}
        ${canManage() && b.status === 'confirmed' ? `<div class="grid2"><button class="btn btn-soft" type="button" id="b-move">${icon('i-calendar')}שינוי מועד</button>
          <button class="btn btn-primary" type="button" id="b-cancel">ביטול התור</button></div>` : ''}
        ${canManage() && b.status !== 'confirmed' ? `<button class="btn btn-ghost" type="button" data-st="confirmed">להחזיר לתור פעיל</button>` : ''}
      </div>
      ${canManage() ? `<div class="field" style="margin-top:14px"><label for="b-note">הערה פנימית (רק לצוות)</label><textarea id="b-note" maxlength="500">${esc(b.internal_note || '')}</textarea>
        <button class="btn btn-ghost btn-sm" type="button" id="b-note-save">שמירת הערה</button></div>` : ''}
      <p class="error" id="b-err" hidden></p>`, body => {
      $$('[data-st]', body).forEach(btn => btn.onclick = () => busy(btn, async () => {
        await rpc('owner_set_status', { p_booking: b.id, p_status: btn.dataset.st }); closeSheet(); toast('עודכן'); await refreshDiary();
      }, $('#b-err', body)).catch(() => {}));
      const ns = $('#b-note-save', body);
      if (ns) ns.onclick = () => busy(ns, async () => { await rpc('owner_set_status', { p_booking: b.id, p_status: b.status, p_note: $('#b-note', body).value }); toast('נשמר'); S.week = null; }, $('#b-err', body)).catch(() => {});
      const c = $('#b-cancel', body); if (c) c.onclick = () => cancelSheet(b);
      const m = $('#b-move', body); if (m) m.onclick = () => moveSheet(b);
    });
  }
  function cancelSheet(b) {
    const s = new Date(b.starts_at), ph = Biz.phone(b.phone);
    const text = `היי ${b.customer_name}, לצערנו צריך לבטל את התור שלך ב${T().name} ${whenWord(s)} ב-${hm(s)}. אפשר לקבוע תור חדש כאן: ${bookingLink(T().slug)}`;
    sheet(`<h2 class="sheet-title" id="sheet-t">לבטל את התור?</h2>
      <p class="muted">${esc(b.customer_name)} · ${esc(dayLong(s))} · ${hm(s)}</p>
      ${ph.ok && ph.mobile ? `<p class="hint" style="margin-top:8px">כדאי להודיע ללקוח/ה. הכפתור פותח וואטסאפ עם הודעה מוכנה.</p>
        <a class="btn btn-ghost btn-wide" style="margin-top:8px" href="${Biz.wa(b.phone, text)}" target="_blank" rel="noopener">${icon('b-whatsapp')}הודעה על הביטול</a>` : ''}
      <p class="error" id="c-err" hidden></p>
      <div class="stack" style="margin-top:12px"><button class="btn btn-danger btn-wide" type="button" id="c-yes">ביטול התור</button>
      <button class="btn btn-quiet btn-wide" type="button" data-close>חזרה</button></div>`, body => {
      $('#c-yes', body).onclick = e => busy(e.currentTarget, async () => { await rpc('owner_set_status', { p_booking: b.id, p_status: 'cancelled' }); closeSheet(); toast('התור בוטל'); await refreshDiary(); }, $('#c-err', body)).catch(() => {});
    });
  }
  function moveSheet(b) {
    const s = new Date(b.starts_at), active = S.setup.staff.filter(x => x.active);
    sheet(`<h2 class="sheet-title" id="sheet-t">הזזת תור</h2><p class="muted">${esc(b.customer_name)} · ${esc(b.service)}</p>
      <form id="mv" class="stack" style="margin-top:12px">
        <div class="grid2"><div class="field"><label for="mv-d">יום</label><input id="mv-d" type="date" value="${ymd(s)}" required></div>
        <div class="field"><label for="mv-t">שעה</label><input id="mv-t" type="time" step="300" value="${hm(s)}" required></div></div>
        ${active.length > 1 ? `<div class="field"><label for="mv-s">אצל</label><select id="mv-s">${active.map(x => `<option value="${x.id}" ${x.id === b.staff_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
        <div id="mv-free" class="row"></div>
        <p class="error" id="mv-err" hidden></p>
        <button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      const f = $('#mv', body), staffSel = $('#mv-s', body);
      const free = async () => { const el = $('#mv-free', body); el.innerHTML = '<span class="hint">שעות פנויות…</span>';
        try { const xs = await rpc('public_slots', { p_tenant: S.tid, p_service: b.service_id, p_from: $('#mv-d', body).value, p_days: 1, p_staff: staffSel ? staffSel.value : b.staff_id });
          el.innerHTML = xs.length ? xs.slice(0, 12).map(x => `<button class="btn btn-ghost btn-sm" type="button" data-t="${hm(new Date(x.starts_at))}">${hm(new Date(x.starts_at))}</button>`).join('') : '<span class="hint">אין שעות פנויות אונליין ביום הזה (אפשר לבחור שעה ידנית)</span>';
          $$('[data-t]', el).forEach(x => x.onclick = () => { $('#mv-t', body).value = x.dataset.t; }); } catch { el.innerHTML = ''; } };
      $('#mv-d', body).onchange = free; if (staffSel) staffSel.onchange = free; free();
      f.onsubmit = e => { e.preventDefault(); const [h, m] = $('#mv-t', body).value.split(':').map(Number);
        busy(f.querySelector('.btn-primary'), async () => {
          await rpc('owner_move_booking', { p_booking: b.id, p_starts_at: at($('#mv-d', body).value, h * 60 + m).toISOString(), p_staff: staffSel ? staffSel.value : null });
          closeSheet(); toast('התור הוזז'); S.day = $('#mv-d', body).value; await refreshDiary();
        }, $('#mv-err', body)).catch(() => {}); };
    });
  }
  async function reminders() {
    const tomorrow = addDays(ymd(new Date()), 1);
    let list = S.agenda.filter(b => ymd(new Date(b.starts_at)) === tomorrow);
    if (addDays(S.week, 7) <= tomorrow) list = await rpc('owner_agenda', { p_tenant: S.tid, p_from: tomorrow, p_days: 1 });
    list = list.filter(b => b.status === 'confirmed' && Biz.phone(b.phone).mobile);
    const sent = id => ls.get('rem.' + id);
    sheet(`<h2 class="sheet-title" id="sheet-t">תזכורות למחר</h2>
      <p class="hint">כל כפתור פותח וואטסאפ עם תזכורת מוכנה ללקוח/ה, כולל קישור לביטול. לוחצים "שליחה" בוואטסאפ.</p>
      ${list.length ? `<div class="list" style="margin-top:12px">${list.map(b => `<div class="item plain"><span class="main"><strong>${hm(new Date(b.starts_at))} · ${esc(b.customer_name)}</strong><span>${esc(b.service)}</span></span>
        <a class="btn ${sent(b.id) ? 'btn-ghost' : 'btn-primary'} btn-sm" data-rem="${b.id}" href="${Biz.wa(b.phone, remindText(b))}" target="_blank" rel="noopener">${sent(b.id) ? icon('i-check') + 'נשלח' : icon('b-whatsapp') + 'שליחה'}</a></div>`).join('')}</div>`
        : '<div class="empty">אין מחר תורים עם מספר נייד.</div>'}`, body => {
      $$('[data-rem]', body).forEach(a => a.addEventListener('click', () => { ls.set('rem.' + a.dataset.rem, '1'); setTimeout(() => { a.className = 'btn btn-ghost btn-sm'; a.innerHTML = icon('i-check') + 'נשלח'; }, 300); }));
    });
  }

  // ---------------------------------------------------------------- new booking (phone / walk-in)
  function newView() {
    const svc = S.setup.services.filter(s => s.active), staff = S.setup.staff.filter(s => s.active);
    if (!svc.length) return `${header('תור חדש')}<div class="wrap"><div class="empty card">קודם מוסיפים שירות. <a class="btn btn-primary" href="#/services">לשירותים</a></div></div>`;
    return `${header('תור חדש')}<div class="wrap"><form id="nb" class="stack section" novalidate>
      <div class="field"><label for="nb-s">שירות</label><select id="nb-s">${svc.map(s => `<option value="${s.id}">${esc(s.name)} · ${Biz.dur(s.duration_min)}</option>`).join('')}</select></div>
      ${staff.length > 1 ? `<div class="field"><label for="nb-st">אצל</label><select id="nb-st"></select></div>` : ''}
      <div class="field"><label for="nb-d">יום</label><input id="nb-d" type="date" value="${S.day || ymd(new Date())}" required></div>
      <div class="field"><span class="label">שעה פנויה</span><div id="nb-free" class="row"></div>
        <label class="hint" for="nb-t">או שעה אחרת (גם מחוץ לשעות האונליין):</label><input id="nb-t" class="input" type="time" step="300"></div>
      <div class="field"><label for="nb-ph">טלפון</label><input id="nb-ph" type="tel" inputmode="tel" dir="ltr" autocomplete="off" required placeholder="050-000-0000"></div>
      <div id="nb-sug" class="row"></div>
      <div class="field"><label for="nb-n">שם</label><input id="nb-n" autocomplete="off" required maxlength="60"></div>
      <div class="field"><label for="nb-note">הערה פנימית</label><input id="nb-note" maxlength="500"></div>
      <p class="error" id="nb-err" role="alert" hidden></p>
      <button class="btn btn-primary btn-wide" type="submit">קביעת התור</button></form></div>`;
  }
  function wireNew(app) {
    const f = $('#nb', app); if (!f) return;
    const sSel = $('#nb-s', f), stSel = $('#nb-st', f), staff = S.setup.staff.filter(s => s.active);
    let chosen = null;
    const eligible = sid => staff.filter(st => !st.service_ids.length || st.service_ids.includes(sid) || !staff.some(x => x.service_ids.includes(sid)));
    const fillStaff = () => { if (!stSel) return; const cur = stSel.value; stSel.innerHTML = eligible(sSel.value).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
      if ([...stSel.options].some(o => o.value === cur)) stSel.value = cur; };
    const staffId = () => stSel ? stSel.value : staff[0].id;
    const free = async () => { const el = $('#nb-free', f); chosen = null; el.innerHTML = '<span class="hint">טוען…</span>';
      try { const xs = await rpc('public_slots', { p_tenant: S.tid, p_service: sSel.value, p_from: $('#nb-d', f).value, p_days: 1, p_staff: staffId() });
        el.innerHTML = xs.length ? xs.map(x => `<button class="btn btn-ghost btn-sm" type="button" aria-pressed="false" data-at="${x.starts_at}">${hm(new Date(x.starts_at))}</button>`).join('') : '<span class="hint">אין שעות פנויות אונליין ביום הזה</span>';
        $$('[data-at]', el).forEach(b => b.onclick = () => { $$('[data-at]', el).forEach(x => { x.setAttribute('aria-pressed', x === b); x.className = 'btn btn-sm ' + (x === b ? 'btn-primary' : 'btn-ghost'); }); chosen = b.dataset.at; $('#nb-t', f).value = ''; });
      } catch (e) { el.innerHTML = `<span class="error">${esc(API.say(e))}</span>`; } };
    sSel.onchange = () => { fillStaff(); free(); }; if (stSel) stSel.onchange = free; $('#nb-d', f).onchange = free;
    $('#nb-t', f).oninput = () => { chosen = null; $$('[data-at]', f).forEach(x => { x.className = 'btn btn-ghost btn-sm'; x.setAttribute('aria-pressed', 'false'); }); };
    fillStaff(); free();
    // existing customers: type part of a name or phone
    let tmr; const sug = $('#nb-sug', f);
    const look = q => { clearTimeout(tmr); if (q.trim().length < 2) { sug.innerHTML = ''; return; }
      tmr = setTimeout(async () => { try { const cs = await rpc('owner_customers', { p_tenant: S.tid, p_q: q.trim() });
        sug.innerHTML = cs.slice(0, 4).map(c => `<button class="btn btn-ghost btn-sm" type="button" data-c='${esc(JSON.stringify({ n: c.name, p: c.phone }))}'>${esc(c.name)} · <bdi dir="ltr">${esc(Biz.phone(c.phone).local || c.phone)}</bdi></button>`).join('');
        $$('[data-c]', sug).forEach(b => b.onclick = () => { const c = JSON.parse(b.dataset.c); $('#nb-ph', f).value = Biz.phone(c.p).local || c.p; $('#nb-n', f).value = c.n; sug.innerHTML = ''; });
      } catch {} }, 250); };
    $('#nb-ph', f).oninput = e => look(e.target.value); $('#nb-n', f).oninput = e => look(e.target.value);
    f.onsubmit = e => { e.preventDefault(); const err = $('#nb-err', f);
      const t = $('#nb-t', f).value, ph = Biz.phone($('#nb-ph', f).value), name = $('#nb-n', f).value.trim();
      let starts = chosen; if (!starts && t) { const [h, m] = t.split(':').map(Number); starts = at($('#nb-d', f).value, h * 60 + m).toISOString(); }
      const miss = !starts ? 'בחרו שעה.' : !ph.ok ? 'מספר טלפון לא תקין.' : !name ? 'צריך שם.' : '';
      if (miss) { err.textContent = miss; err.hidden = false; return; }
      busy(f.querySelector('[type=submit]'), async () => {
        await rpc('owner_book', { p_tenant: S.tid, p_service: sSel.value, p_staff: staffId(), p_starts_at: starts, p_name: name, p_phone: ph.digits, p_note: $('#nb-note', f).value || null });
        toast('התור נקבע'); S.day = ymd(new Date(starts)); S.week = null; Router.go('/');
      }, err).catch(() => {}); };
  }

  // ---------------------------------------------------------------- customers
  function customersView() {
    return `${header('לקוחות')}<div class="wrap"><section class="section">
      <div class="field"><label for="cq" class="vh">חיפוש</label><input id="cq" class="input" type="search" placeholder="חיפוש לפי שם או טלפון" autocomplete="off"></div>
      <div id="clist" class="list"><div class="empty">טוען…</div></div></section></div>`;
  }
  function wireCustomers(app) {
    const q = $('#cq', app), el = $('#clist', app); let tmr, data = [];
    const load = async () => { try { data = await rpc('owner_customers', { p_tenant: S.tid, p_q: q.value.trim() || null });
      el.innerHTML = data.length ? data.map((c, i) => `<button class="item plain" type="button" data-i="${i}"><span class="main"><strong>${esc(c.name)}</strong>
        <span><bdi dir="ltr">${esc(Biz.phone(c.phone).local || c.phone)}</bdi> · ${c.visits} ביקורים${c.no_shows ? ` · ${c.no_shows} לא הגיעו` : ''}</span></span>
        <span class="small muted">${c.last_at ? esc(UI.dayLong(new Date(c.last_at))) : ''}</span></button>`).join('')
        : `<div class="empty">${q.value ? 'לא נמצא.' : 'עוד אין לקוחות. הם מופיעים כאן אחרי התור הראשון.'}</div>`;
      $$('[data-i]', el).forEach(b => b.onclick = () => customerSheet(data[+b.dataset.i]));
    } catch (e) { el.innerHTML = `<div class="empty error">${esc(API.say(e))}</div>`; } };
    q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(load, 250); }; load();
  }
  function customerSheet(c) {
    const ph = Biz.phone(c.phone);
    sheet(`<h2 class="sheet-title" id="sheet-t">${esc(c.name)}</h2>
      <dl class="facts"><dt>טלפון</dt><dd><bdi dir="ltr">${esc(ph.local || c.phone)}</bdi></dd><dt>ביקורים</dt><dd>${c.visits}</dd>
        <dt>לא הגיעו</dt><dd>${c.no_shows}</dd>${c.last_at ? `<dt>אחרון</dt><dd>${esc(dayLong(new Date(c.last_at)))}</dd>` : ''}</dl>
      <div class="grid2">${ph.mobile ? `<a class="btn btn-ghost" href="${Biz.wa(c.phone, `היי ${c.name}, `)}" target="_blank" rel="noopener">${icon('b-whatsapp')}וואטסאפ</a>` : ''}
        <a class="btn btn-ghost" href="${Biz.tel(c.phone)}">${icon('i-phone')}חיוג</a></div>
      <div class="field" style="margin-top:14px"><label for="c-notes">הערות (רק לעסק)</label><textarea id="c-notes" maxlength="1000" placeholder="למשל: רגישה לאצטון, אוהבת גוונים בהירים">${esc(c.notes || '')}</textarea></div>
      <p class="error" id="cn-err" hidden></p><button class="btn btn-primary btn-wide" type="button" id="c-save">שמירה</button>
      <button class="btn btn-quiet btn-wide" type="button" id="c-del" style="margin-top:8px">מחיקת הלקוח/ה וכל הפרטים</button>
      <div id="c-del-confirm" hidden class="stack" style="margin-top:8px"><p class="hint">יימחקו השם, הטלפון, ההערות וכל התורים של ${esc(c.name)} (גם עתידיים). אי אפשר לשחזר. משתמשים בזה כשלקוח/ה מבקש/ת למחוק את הפרטים שלו/ה.</p>
        <button class="btn btn-danger btn-wide" type="button" id="c-del-yes">כן, למחוק לצמיתות</button></div>`, body => {
      $('#c-del', body).onclick = () => { $('#c-del-confirm', body).hidden = false; $('#c-del', body).hidden = true; $('#c-del-yes', body).focus(); };
      $('#c-del-yes', body).onclick = e => busy(e.currentTarget, async () => {
        const r = await rpc('owner_delete_customer', { p_customer: c.id }); closeSheet(); S.week = null;
        toast(r.bookings_deleted ? `נמחק/ה, עם ${r.bookings_deleted} תורים` : 'נמחק/ה'); Router.refresh();
      }, $('#cn-err', body)).catch(() => {});
      $('#c-save', body).onclick = e => busy(e.currentTarget, async () => { await rpc('owner_save_customer_note', { p_customer: c.id, p_notes: $('#c-notes', body).value }); c.notes = $('#c-notes', body).value; closeSheet(); toast('נשמר'); }, $('#cn-err', body)).catch(() => {});
    });
  }

  // ---------------------------------------------------------------- more
  function moreView() {
    const many = S.access.businesses.length > 1;
    const link = (h, i, l) => `<a href="#${h}">${icon(i)}<span>${l}</span>${icon('i-chevron-left', 'go dir')}</a>`;
    return `${header('עוד')}<div class="wrap">
      <section class="section"><div class="menu">
        ${canManage() ? link('/services', 'i-shopping-bag', 'שירותים ומחירים') + link('/hours', 'i-clock', 'שעות, חופשות וסגירות') + link('/team', 'i-users', 'צוות')
          + link('/look', 'i-image', 'מראה ותמונות') + link('/business', 'i-store', 'פרטי העסק וכללי הזמנה') : ''}
        ${link('/share', 'i-qr-code', 'הקישור לקביעת תור')}
        <a href="${bookingLink(T().slug)}" target="_blank" rel="noopener">${icon('i-globe')}<span>לראות את העמוד כמו לקוח/ה</span></a>
      </div></section>
      ${many ? `<section class="section"><h2>החלפת עסק</h2><div class="menu">${S.access.businesses.map(b => `<button type="button" data-tid="${b.id}">${icon('i-store')}<span>${esc(b.name)}</span>${b.id === S.tid ? `<span class="chip acc go">עכשיו</span>` : ''}</button>`).join('')}</div></section>` : ''}
      <section class="section"><div class="menu">
        ${S.access.is_admin ? `<a href="${P.url('admin/')}">${icon('i-accessibility')}<span>ניהול המערכת (אדמין)</span></a>` : ''}
        <a href="${Biz.wa(P.supportPhone, `שלום, צריך עזרה עם ${T().name}`)}" target="_blank" rel="noopener">${icon('b-whatsapp')}<span>עזרה בוואטסאפ</span></a>
        <button type="button" data-signout>${icon('i-arrow-left', 'dir')}<span>יציאה</span></button>
      </div>
      <p class="hint">${esc(API.auth.user() && API.auth.user().email || '')} · ${role() === 'owner' ? 'בעלים' : role() === 'manager' ? 'מנהל/ת' : 'צוות'}</p></section></div>`;
  }
  function wireMore(app) {
    $$('[data-tid]', app).forEach(b => b.onclick = async () => { S.tid = b.dataset.tid; ls.set('manage.tid', S.tid); S.week = null; S.day = null; await loadSetup(); Router.go('/'); });
  }

  // ---------------------------------------------------------------- services
  function servicesView() {
    const list = S.setup.services;
    return `${header('שירותים ומחירים', '/more')}<div class="wrap"><section class="section">
      ${list.length ? `<div class="list">${list.map(s => `<button class="item plain ${s.active ? '' : 'is-off'}" type="button" data-s="${s.id}">
        <span class="main"><strong>${esc(s.name)}</strong><span>${Biz.dur(s.duration_min)}${s.buffer_min ? ` + ${s.buffer_min} דק׳ הפסקה` : ''}${s.active ? '' : ' · מוסתר'}</span></span>
        <span class="num">${s.price_agorot == null ? '<span class="muted small">בלי מחיר</span>' : (s.price_from ? 'מ-' : '') + money(s.price_agorot)}</span></button>`).join('')}</div>`
        : '<div class="empty card">עוד אין שירותים.</div>'}
      <button class="btn btn-primary" type="button" id="s-add">${icon('i-plus')}שירות חדש</button></section></div>`;
  }
  function wireServices(app) {
    $$('[data-s]', app).forEach(b => b.onclick = () => serviceSheet(S.setup.services.find(s => s.id === b.dataset.s)));
    $('#s-add', app).onclick = () => serviceSheet({ name: '', duration_min: 30, buffer_min: 0, price_agorot: null, price_from: false, active: true });
  }
  function serviceSheet(s) {
    const durs = [10, 15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240, 300];
    if (!durs.includes(s.duration_min)) durs.push(s.duration_min), durs.sort((a, b) => a - b);
    sheet(`<h2 class="sheet-title" id="sheet-t">${s.id ? 'עריכת שירות' : 'שירות חדש'}</h2>
      <form id="sv" class="stack" novalidate>
        <div class="field"><label for="sv-n">שם</label><input id="sv-n" required maxlength="80" value="${esc(s.name)}" autofocus></div>
        <div class="field"><label for="sv-d">תיאור קצר <span class="hint">(לא חובה)</span></label><input id="sv-d" maxlength="400" value="${esc(s.description || '')}"></div>
        <div class="grid2"><div class="field"><label for="sv-du">משך</label><select id="sv-du">${durs.map(d => `<option value="${d}" ${d === s.duration_min ? 'selected' : ''}>${Biz.dur(d)}</option>`).join('')}</select></div>
          <div class="field"><label for="sv-b">הפסקה אחרי</label><select id="sv-b">${[0, 5, 10, 15, 20, 30, 45, 60].map(d => `<option value="${d}" ${d === s.buffer_min ? 'selected' : ''}>${d ? d + ' דק׳' : 'בלי'}</option>`).join('')}</select></div></div>
        <div class="grid2"><div class="field"><label for="sv-p">מחיר ₪ <span class="hint">(ריק = בלי)</span></label><input id="sv-p" type="number" inputmode="decimal" min="0" step="1" dir="ltr" value="${s.price_agorot == null ? '' : s.price_agorot / 100}"></div>
          <label class="check" style="align-self:end"><input type="checkbox" id="sv-f" ${s.price_from ? 'checked' : ''}>"החל מ-"</label></div>
        <label class="check"><input type="checkbox" id="sv-a" ${s.active ? 'checked' : ''}>מופיע בקביעת תור אונליין</label>
        <p class="error" id="sv-err" hidden></p>
        <button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      const f = $('#sv', body);
      f.onsubmit = e => { e.preventDefault(); const err = $('#sv-err', body), name = $('#sv-n', body).value.trim(), p = $('#sv-p', body).value;
        if (!name) { err.textContent = 'צריך שם לשירות.'; err.hidden = false; return; }
        busy(f.querySelector('.btn-primary'), async () => {
          await rpc('owner_save_service', { p_tenant: S.tid, p: { id: s.id || null, name, description: $('#sv-d', body).value.trim(), duration_min: +$('#sv-du', body).value,
            buffer_min: +$('#sv-b', body).value, price_agorot: p === '' ? null : Math.round(+p * 100), price_from: $('#sv-f', body).checked, active: $('#sv-a', body).checked } });
          await loadSetup(); closeSheet(); toast('נשמר'); Router.refresh();
        }, err).catch(() => {}); };
    });
  }

  // ---------------------------------------------------------------- hours, closures
  let hoursFor = '';   // '' = the business, else a staff id
  function hoursView() {
    const staff = S.setup.staff.filter(s => s.active);
    const rows = S.setup.hours.filter(h => (h.staff_id || '') === hoursFor);
    const usesBiz = hoursFor && !rows.length;
    const byDay = d => rows.filter(h => h.weekday === d).sort((a, b) => a.opens_min - b.opens_min);
    const opts = sel => Array.from({ length: 97 }, (_, i) => i * 15).filter(m => m <= 1440).map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${hhmm(m === 1440 ? 1440 : m).replace('24:00', '24:00')}</option>`).join('');
    const off = S.setup.time_off.filter(o => new Date(o.ends_at) > Date.now());
    const who = id => id ? (S.setup.staff.find(s => s.id === id) || {}).name || '' : 'כל העסק';
    return `${header('שעות וחופשות', '/more')}<div class="wrap">
      <section class="section"><h2>שעות קבועות</h2>
        ${staff.length > 1 ? `<div class="field"><label for="h-who">של מי</label><select id="h-who"><option value="">העסק (ברירת מחדל לכולם)</option>${staff.map(s => `<option value="${s.id}" ${s.id === hoursFor ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
        ${hoursFor ? `<label class="check"><input type="checkbox" id="h-biz" ${usesBiz ? 'checked' : ''}>עובד/ת לפי שעות העסק</label>` : ''}
        <form id="hours" class="card" ${usesBiz ? 'hidden' : ''}>${[0, 1, 2, 3, 4, 5, 6].map(d => { const rs = byDay(d);
          return `<div class="day-row" data-wd="${d}"><label class="check"><input type="checkbox" data-open ${rs.length ? 'checked' : ''}>${Biz.DAY_HE[d]}</label>
            <div class="ranges">${(rs.length ? rs : [{ opens_min: 540, closes_min: 1140 }]).map(r => `<div class="range" ${rs.length ? '' : 'hidden'}>
              <select aria-label="פתיחה" data-a>${opts(r.opens_min)}</select><span>עד</span><select aria-label="סגירה" data-b>${opts(r.closes_min)}</select>
              <button class="icon-btn" type="button" data-rm aria-label="הסרת טווח">${icon('i-x')}</button></div>`).join('')}</div>
            <button class="btn btn-quiet btn-sm" type="button" data-addr ${rs.length ? '' : 'hidden'}>${icon('i-plus')}הפסקה / טווח נוסף</button></div>`; }).join('')}
          <p class="error" id="h-err" hidden></p>
          <button class="btn btn-primary btn-wide" type="submit">שמירת שעות</button></form></section>
      <section class="section"><h2>חופשות וסגירות</h2>
        ${off.length ? `<div class="list">${off.map(o => `<div class="item plain"><span class="main"><strong>${esc(dayLong(new Date(o.starts_at)))}${ymd(new Date(o.starts_at)) !== ymd(new Date(new Date(o.ends_at) - 1)) ? ' – ' + esc(dayLong(new Date(new Date(o.ends_at) - 1))) : ` · <bdi dir="ltr">${hm(new Date(o.starts_at))}–${hm(new Date(o.ends_at))}</bdi>`}</strong>
          <span>${esc(who(o.staff_id))}${o.reason ? ' · ' + esc(o.reason) : ''}</span></span><button class="icon-btn" type="button" data-off="${o.id}" aria-label="מחיקה">${icon('i-trash-2')}</button></div>`).join('')}</div>`
          : '<p class="muted">אין סגירות קרובות.</p>'}
        <button class="btn btn-ghost" type="button" id="off-add">${icon('i-plus')}סגירה / חופשה</button>
        <p class="hint">חגים לא נכנסים לבד. מוסיפים אותם כאן מראש, והשעות האלה לא יוצעו ללקוחות.</p></section></div>`;
  }
  function wireHours(app) {
    const who = $('#h-who', app); if (who) who.onchange = () => { hoursFor = who.value; Router.refresh(); };
    const biz = $('#h-biz', app); if (biz) biz.onchange = async () => {
      if (biz.checked) { await busy(null, () => rpc('owner_set_hours', { p_tenant: S.tid, p_hours: [], p_staff: hoursFor })).catch(() => {}); await loadSetup(); toast('לפי שעות העסק'); Router.refresh(); }
      else $('#hours', app).hidden = false; };
    const f = $('#hours', app);
    $$('.day-row', f).forEach(row => {
      const sync = () => { const on = $('[data-open]', row).checked; $$('.range', row).forEach(r => r.hidden = !on); $('[data-addr]', row).hidden = !on; };
      $('[data-open]', row).onchange = sync;
      $('[data-addr]', row).onclick = () => { const r = $('.range', row).cloneNode(true); r.hidden = false; $('[data-a]', r).value = '960'; $('[data-b]', r).value = '1200'; $('.ranges', row).appendChild(r); wireRm(r, row); };
      $$('.range', row).forEach(r => wireRm(r, row));
    });
    function wireRm(r, row) { $('[data-rm]', r).onclick = () => { if ($$('.range', row).length > 1) r.remove(); else { $('[data-open]', row).checked = false; $('[data-open]', row).onchange(); } }; }
    f.onsubmit = e => { e.preventDefault();
      const hours = $$('.day-row', f).flatMap(row => $('[data-open]', row).checked ? $$('.range', row).map(r => ({ weekday: +row.dataset.wd, opens_min: +$('[data-a]', r).value, closes_min: +$('[data-b]', r).value })) : []);
      busy(f.querySelector('[type=submit]'), async () => { await rpc('owner_set_hours', { p_tenant: S.tid, p_hours: hours, p_staff: hoursFor || null }); await loadSetup(); toast('השעות נשמרו'); }, $('#h-err', f)).catch(() => {}); };
    $$('[data-off]', app).forEach(b => b.onclick = () => busy(b, async () => { await rpc('owner_remove_time_off', { p_id: b.dataset.off }); await loadSetup(); toast('נמחק'); Router.refresh(); }).catch(() => {}));
    $('#off-add', app).onclick = offSheet;
  }
  function offSheet() {
    const staff = S.setup.staff.filter(s => s.active), today = ymd(new Date());
    sheet(`<h2 class="sheet-title" id="sheet-t">סגירה / חופשה</h2><form id="of" class="stack" novalidate>
      ${staff.length > 1 ? `<div class="field"><label for="of-w">מי</label><select id="of-w"><option value="">כל העסק</option>${staff.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>` : ''}
      <div class="grid2"><div class="field"><label for="of-a">מיום</label><input id="of-a" type="date" value="${today}" min="${today}"></div>
        <div class="field"><label for="of-b">עד יום (כולל)</label><input id="of-b" type="date" value="${today}" min="${today}"></div></div>
      <label class="check"><input type="checkbox" id="of-all" checked>ימים שלמים</label>
      <div class="grid2" id="of-times" hidden><div class="field"><label for="of-t1">משעה</label><input id="of-t1" type="time" value="12:00" step="900"></div>
        <div class="field"><label for="of-t2">עד שעה</label><input id="of-t2" type="time" value="16:00" step="900"></div></div>
      <div class="field"><label for="of-r">סיבה (רק לך)</label><input id="of-r" maxlength="120" placeholder="למשל: ראש השנה"></div>
      <p class="error" id="of-err" hidden></p><button class="btn btn-primary btn-wide">הוספה</button></form>`, body => {
      const all = $('#of-all', body); all.onchange = () => { $('#of-times', body).hidden = all.checked; };
      $('#of-a', body).onchange = e => { if ($('#of-b', body).value < e.target.value) $('#of-b', body).value = e.target.value; };
      $('#of', body).onsubmit = e => { e.preventDefault(); const a = $('#of-a', body).value, b = $('#of-b', body).value;
        const mins = v => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
        const s = all.checked ? at(a, 0) : at(a, mins($('#of-t1', body).value)), en = all.checked ? at(addDays(b, 1), 0) : at(b, mins($('#of-t2', body).value));
        if (!(en > s)) { $('#of-err', body).textContent = 'הסיום צריך להיות אחרי ההתחלה.'; $('#of-err', body).hidden = false; return; }
        busy(e.target.querySelector('button'), async () => {
          const r = await rpc('owner_add_time_off', { p_tenant: S.tid, p_starts_at: s.toISOString(), p_ends_at: en.toISOString(), p_staff: ($('#of-w', body) || {}).value || null, p_reason: $('#of-r', body).value });
          await loadSetup(); closeSheet(); Router.refresh();
          toast(r.affected ? `נוסף. שימו לב: ${r.affected} תורים קיימים בזמן הזה. כדאי לעדכן אותם ביומן` : 'נוסף');
        }, $('#of-err', body)).catch(() => {}); };
    });
  }

  // ---------------------------------------------------------------- team
  function teamView() {
    const members = S.setup.members || [], staff = S.setup.staff;
    const roleHe = r => ({ owner: 'בעלים', manager: 'מנהל/ת', staff: 'צוות' }[r]);
    return `${header('צוות', '/more')}<div class="wrap">
      <section class="section"><h2>אנשי צוות ביומן</h2><p class="hint">כל מי שמקבל/ת לקוחות. לכל אחד/ת שירותים ושעות משלו/ה.</p>
        <div class="list">${staff.map(s => `<button class="item plain ${s.active ? '' : 'is-off'}" type="button" data-st="${s.id}"><span class="main"><strong>${esc(s.name)}</strong>
          <span>${s.service_ids.length ? s.service_ids.map(id => esc((S.setup.services.find(x => x.id === id) || {}).name || '')).join(', ') : 'כל השירותים'}${s.active ? '' : ' · לא פעיל/ה'}</span></span>${icon('i-chevron-left', 'dir')}</button>`).join('')}</div>
        <button class="btn btn-ghost" type="button" id="st-add">${icon('i-plus')}איש/אשת צוות</button></section>
      ${isOwner() ? `<section class="section"><h2>מי נכנס/ת לאפליקציה</h2>
        <div class="list">${members.map(m => `<div class="item plain"><span class="main"><strong><bdi dir="ltr">${esc(m.email || '')}</bdi></strong>
          <span>${roleHe(m.role)}${m.staff_id ? ' · ' + esc((staff.find(s => s.id === m.staff_id) || {}).name || '') : ''}</span></span>
          ${m.user_id !== (API.auth.user() || {}).id ? `<button class="icon-btn" type="button" data-rm="${m.user_id}" aria-label="הסרה">${icon('i-trash-2')}</button>` : '<span class="chip">את/ה</span>'}</div>`).join('')}</div>
        <button class="btn btn-primary" type="button" id="invite">${icon('i-link')}הזמנת איש/אשת צוות</button>
        <p class="hint"><b>צוות</b> רואה רק את התורים שלו/ה ומסמן/ת הגעה. <b>מנהל/ת</b> מנהל/ת הכל חוץ מצוות וחיוב.</p></section>` : ''}</div>`;
  }
  function wireTeam(app) {
    $$('[data-st]', app).forEach(b => b.onclick = () => staffSheet(S.setup.staff.find(s => s.id === b.dataset.st)));
    $('#st-add', app).onclick = () => staffSheet({ name: '', active: true, service_ids: [] });
    $$('[data-rm]', app).forEach(b => b.onclick = () => busy(b, async () => { await rpc('owner_remove_member', { p_tenant: S.tid, p_user: b.dataset.rm }); await loadSetup(); toast('הוסר/ה'); Router.refresh(); }).catch(() => {}));
    const inv = $('#invite', app); if (inv) inv.onclick = inviteSheet;
  }
  function staffSheet(s) {
    sheet(`<h2 class="sheet-title" id="sheet-t">${s.id ? esc(s.name) : 'איש/אשת צוות'}</h2><form id="sf" class="stack" novalidate>
      <div class="field"><label for="sf-n">שם (כמו שהלקוחות רואים)</label><input id="sf-n" maxlength="60" value="${esc(s.name)}" required autofocus></div>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label">שירותים <span class="hint">(בלי סימון = כולם)</span></legend>
        ${S.setup.services.filter(x => x.active).map(x => `<label class="check"><input type="checkbox" value="${x.id}" ${s.service_ids.includes(x.id) ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}</fieldset>
      <label class="check"><input type="checkbox" id="sf-a" ${s.active ? 'checked' : ''}>פעיל/ה ביומן</label>
      <p class="error" id="sf-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      $('#sf', body).onsubmit = e => { e.preventDefault(); const name = $('#sf-n', body).value.trim();
        if (!name) { $('#sf-err', body).textContent = 'צריך שם.'; $('#sf-err', body).hidden = false; return; }
        busy(e.target.querySelector('.btn-primary'), async () => {
          await rpc('owner_save_staff', { p_tenant: S.tid, p: { id: s.id || null, name, active: $('#sf-a', body).checked, service_ids: $$('fieldset input:checked', body).map(i => i.value) } });
          await loadSetup(); closeSheet(); toast('נשמר'); Router.refresh();
        }, $('#sf-err', body)).catch(() => {}); };
    });
  }
  function inviteSheet() {
    const staff = S.setup.staff.filter(s => s.active);
    sheet(`<h2 class="sheet-title" id="sheet-t">הזמנה לאפליקציה</h2><form id="iv" class="stack">
      <div class="field"><label for="iv-r">תפקיד</label><select id="iv-r"><option value="staff">צוות: רואה את התורים שלו/ה</option><option value="manager">מנהל/ת: מנהל/ת את העסק</option></select></div>
      <div class="field"><label for="iv-s">מי ביומן</label><select id="iv-s"><option value="">(לא מקבל/ת לקוחות)</option>${staff.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <p class="error" id="iv-err" hidden></p><button class="btn btn-primary btn-wide">יצירת קישור</button></form><div id="iv-out"></div>`, body => {
      $('#iv', body).onsubmit = e => { e.preventDefault();
        busy(e.target.querySelector('button'), async () => {
          const r = await rpc('owner_invite', { p_tenant: S.tid, p_role: $('#iv-r', body).value, p_staff: $('#iv-s', body).value || null });
          const url = P.url(`manage/#/join/${r.code}`);
          $('#iv-out', body).innerHTML = `<div class="stack" style="margin-top:14px"><p class="hint">הקישור טוב לשימוש אחד, ל-14 יום.</p>
            <div class="linkbox"><input class="input" readonly value="${esc(url)}" aria-label="קישור הזמנה" dir="ltr"><button class="btn btn-ghost" type="button" id="iv-copy">${icon('i-copy')}</button></div>
            <a class="btn btn-ghost btn-wide" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`הזמנה לנהל איתי את התורים של ${T().name}: ${url}`)}">${icon('b-whatsapp')}שליחה בוואטסאפ</a></div>`;
          $('#iv-copy', body).onclick = () => copy(url);
        }, $('#iv-err', body)).catch(() => {}); };
    });
  }
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast('הועתק'); } catch { toast('לא הצלחנו להעתיק. אפשר לסמן ולהעתיק ידנית'); } }

  // ---------------------------------------------------------------- look and photos
  function lookView() {
    const c = { photos: {}, ...(T().config || {}) }; c.photos = { gallery: [], ...c.photos };
    const accents = ['#b4705e', '#e0606e', '#c2410c', '#a65463', '#8f7bb8', '#2f5d8a', '#1f6f6a', '#5d7a3a', '#c9a227', '#2a2a2a'];
    const slot = (k, label, tip) => `<div class="slot"><div class="ph">${c.photos[k] ? `<img src="${esc(c.photos[k])}" alt="">` : icon('i-image')}</div>
      <div class="stack"><strong>${label}</strong><span class="hint">${tip}</span><div class="row">
        <label class="btn btn-ghost btn-sm file-btn">${icon('i-camera')}${c.photos[k] ? 'החלפה' : 'העלאה'}<input type="file" accept="image/*" data-up="${k}"></label>
        ${c.photos[k] ? `<button class="btn btn-quiet btn-sm" type="button" data-del="${k}">הסרה</button>` : ''}</div></div></div>`;
    return `${header('מראה ותמונות', '/more')}<div class="wrap">
      <section class="section"><h2>סגנון</h2><div class="themes" role="group" aria-label="סגנון">
        ${Object.entries(Themes.list).map(([k, t]) => { const a = c.accent || t.accent, bg = k === 'color' ? a : t.dark ? '#1c1716' : '#fbf6f4', fg = k === 'color' ? Themes.onAccent(a) : t.dark ? '#f3eeeb' : '#1b1412';
          return `<button class="theme" type="button" data-theme="${k}" aria-pressed="${Themes.skinOf(c) === k}" style="background:${bg};color:${fg};border-radius:${k === 'color' ? 22 : k === 'ink' ? 4 : 12}px">
          <span class="aa" style="font-family:'${t.display}',serif">${esc([...T().name][0])}א</span><span class="sw"><i style="background:${a}"></i><i style="background:${k === 'ink' ? '#120d0c' : fg}"></i></span><span class="small" style="font-weight:800">${t.label}</span></button>`; }).join('')}</div></section>
      <section class="section"><h2>הצבע של העסק</h2><div class="swatches" role="group" aria-label="צבע">
        ${accents.map(a => `<button class="swatch" type="button" data-acc="${a}" style="background:${a}" aria-label="${a}" aria-pressed="${c.accent === a}"></button>`).join('')}
        <label class="swatch" style="display:grid;place-items:center;background:var(--soft)" title="צבע אחר">${icon('i-plus')}<input type="color" id="acc-any" value="${esc(c.accent || '#8a4b3c')}" class="vh" aria-label="צבע אחר"></label></div>
        <p class="hint" id="acc-warn" hidden></p></section>
      <section class="section"><h2>תמונות</h2><p class="hint">תמונות אמיתיות מהעסק עובדות הכי טוב: המקום, העבודות, את/ה. התמונה מוקטנת לפני ההעלאה, ופרטי מיקום נמחקים ממנה.</p>
        ${slot('cover', 'תמונה ראשית', 'רוחבית, בהירה, בלי טקסט עליה')}
        ${slot('logo', 'לוגו', 'ריבועי. אם אין, מופיעה האות הראשונה של השם')}
        <div class="stack"><strong>גלריה (${c.photos.gallery.length}/9)</strong><span class="hint">מופיעה בעמוד מ-3 תמונות ומעלה</span>
          <div class="photos">${c.photos.gallery.map((u, i) => `<div class="ph"><img src="${esc(u)}" alt=""><button class="x" type="button" data-gdel="${i}" aria-label="הסרה">${icon('i-x')}</button></div>`).join('')}
          ${c.photos.gallery.length < 9 ? `<label class="ph file-btn" style="cursor:pointer">${icon('i-plus')}<span class="vh">הוספת תמונות</span><input type="file" accept="image/*" multiple data-up="gallery"></label>` : ''}</div></div>
        <p class="hint" id="up-status" role="status"></p></section>
      <section class="section"><h2>מילים</h2><form id="words" class="stack">
        <div class="field"><label for="w-tag">משפט אחד שמתאר את העסק</label><input id="w-tag" maxlength="90" value="${esc(c.tagline || '')}" placeholder="למשל: ציפורניים נקיות שמחזיקות שלושה שבועות"></div>
        <div class="field"><label for="w-about">קצת עלינו</label><textarea id="w-about" maxlength="600">${esc(c.about || '')}</textarea></div>
        <div class="field"><label for="w-aud">פנייה ללקוחות</label><select id="w-aud"><option value="n" ${c.audience === 'n' || !c.audience ? 'selected' : ''}>לכולם (בחירת שירות)</option><option value="f" ${c.audience === 'f' ? 'selected' : ''}>לנשים (בחרי טיפול)</option><option value="m" ${c.audience === 'm' ? 'selected' : ''}>לגברים (בחר שירות)</option></select></div>
        <div class="field"><label for="w-ig">אינסטגרם <span class="hint">(שם המשתמש)</span></label><input id="w-ig" dir="ltr" maxlength="40" value="${esc(c.instagram || '')}" placeholder="studio.name"></div>
        <p class="error" id="w-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>
        <a class="btn btn-ghost" href="${bookingLink(T().slug)}" target="_blank" rel="noopener">${icon('i-globe')}לראות את העמוד</a></section></div>`;
  }
  async function saveConfig(patch) {
    const config = { ...(T().config || {}), ...patch };
    await rpc('owner_save_profile', { p_tenant: S.tid, p: { config } });
    await loadSetup();
  }
  function wireLook(app) {
    const c = () => ({ photos: {}, ...(T().config || {}) });
    $$('[data-theme]', app).forEach(b => b.onclick = () => busy(b, async () => { await saveConfig({ theme: b.dataset.theme }); toast('הסגנון עודכן'); Router.refresh(); }).catch(() => {}));
    const setAcc = a => {
      if (!Themes.okAccent(a)) return;
      busy(null, async () => { await saveConfig({ accent: a }); toast('הצבע עודכן'); Router.refresh(); }).catch(() => {}); };
    $$('[data-acc]', app).forEach(b => b.onclick = () => setAcc(b.dataset.acc));
    $('#acc-any', app).onchange = e => setAcc(e.target.value);
    const status = $('#up-status', app);
    $$('[data-up]', app).forEach(inp => inp.onchange = async () => {
      const k = inp.dataset.up, files = [...inp.files].slice(0, 9); if (!files.length) return;
      status.textContent = `מעלה ${files.length > 1 ? files.length + ' תמונות' : 'תמונה'}…`;
      try {
        const urls = []; for (const f of files) urls.push(await API.upload(S.tid, f, k, k === 'logo' ? 512 : 1600));
        const photos = { gallery: [], ...c().photos };
        if (k === 'gallery') photos.gallery = [...(photos.gallery || []), ...urls].slice(0, 9); else photos[k] = urls[0];
        await saveConfig({ photos }); toast('התמונה נשמרה'); Router.refresh();
      } catch (e) { status.textContent = API.say(e); }
    });
    $$('[data-del]', app).forEach(b => b.onclick = () => busy(b, async () => { const photos = { ...c().photos }; delete photos[b.dataset.del]; await saveConfig({ photos }); Router.refresh(); }).catch(() => {}));
    $$('[data-gdel]', app).forEach(b => b.onclick = () => busy(b, async () => { const photos = { ...c().photos }; photos.gallery = (photos.gallery || []).filter((_, i) => i !== +b.dataset.gdel); await saveConfig({ photos }); Router.refresh(); }).catch(() => {}));
    $('#words', app).onsubmit = e => { e.preventDefault();
      busy(e.target.querySelector('button'), async () => { await saveConfig({ tagline: $('#w-tag', app).value.trim(), about: $('#w-about', app).value.trim(), audience: $('#w-aud', app).value, instagram: $('#w-ig', app).value.trim().replace(/^@/, '') }); toast('נשמר'); }, $('#w-err', app)).catch(() => {}); };
  }

  // ---------------------------------------------------------------- business details and booking rules
  function businessView() {
    const t = T(), sel = (id, cur, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${+v === +cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `${header('פרטי העסק וכללים', '/more')}<div class="wrap"><form id="bz" class="stack section" novalidate>
      <h2>פרטים</h2>
      <div class="field"><label for="bz-n">שם העסק</label><input id="bz-n" maxlength="80" value="${esc(t.name)}" required></div>
      <div class="field"><label for="bz-p">טלפון / וואטסאפ של העסק</label><input id="bz-p" type="tel" inputmode="tel" dir="ltr" value="${esc(t.phone ? Biz.phone(t.phone).local : '')}"></div>
      <div class="field"><label for="bz-a">כתובת</label><input id="bz-a" maxlength="200" value="${esc(t.address || '')}" placeholder="רחוב ומספר, עיר"></div>
      <h2 style="margin-top:12px">כללי הזמנה אונליין</h2>
      <div class="field"><label for="bz-mn">כמה זמן מראש לפחות</label>${sel('bz-mn', t.min_notice_min, [[0, 'אפשר גם לעוד רגע'], [30, 'חצי שעה'], [60, 'שעה'], [120, 'שעתיים'], [180, '3 שעות'], [720, '12 שעות'], [1440, 'יום'], [2880, 'יומיים']])}</div>
      <div class="field"><label for="bz-mx">עד כמה רחוק קדימה</label>${sel('bz-mx', t.max_days_ahead, [[7, 'שבוע'], [14, 'שבועיים'], [30, 'חודש'], [60, 'חודשיים'], [90, '3 חודשים']])}</div>
      <div class="field"><label for="bz-st">שעות מוצעות כל</label>${sel('bz-st', t.slot_step_min, [[10, '10 דקות'], [15, 'רבע שעה'], [20, '20 דקות'], [30, 'חצי שעה'], [60, 'שעה']])}</div>
      <div class="field"><label for="bz-c">ביטול דרך הקישור עד</label>${sel('bz-c', t.cancel_until_min, [[0, 'עד תחילת התור'], [60, 'שעה לפני'], [120, 'שעתיים לפני'], [180, '3 שעות לפני'], [360, '6 שעות לפני'], [720, '12 שעות לפני'], [1440, 'יום לפני'], [2880, 'יומיים לפני']])}</div>
      <div class="field"><label for="bz-o">כמה תורים פתוחים למספר טלפון אחד</label>${sel('bz-o', t.max_open_per_phone, [[1, '1'], [2, '2'], [3, '3'], [5, '5'], [10, '10']])}</div>
      <label class="check"><input type="checkbox" id="bz-cs" ${t.choose_staff ? 'checked' : ''}>לקוחות בוחרים אצל מי</label>
      <h2 style="margin-top:12px">תזכורות</h2>
      <label class="check"><input type="checkbox" id="bz-rem" ${t.reminders_enabled ? 'checked' : ''}>תזכורת אוטומטית בוואטסאפ לפני כל תור</label>
      <div class="field"><label for="bz-rh">כמה זמן לפני</label>${sel('bz-rh', t.reminder_hours || 24, [[2, 'שעתיים'], [3, '3 שעות'], [12, '12 שעות'], [24, 'יום'], [48, 'יומיים']])}</div>
      <p class="hint">ההודעה יוצאת מהמספר העסקי של ${esc(P.name)}, עם קישור לביטול. בלי זה, כפתור "תזכורות למחר" ביומן פותח וואטסאפ עם הודעה מוכנה.</p>
      <p class="error" id="bz-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button>
      <p class="hint">הכתובת של העמוד (<bdi dir="ltr">${esc(t.slug)}</bdi>) ודומיין משלך: דרכנו, בוואטסאפ.</p></form></div>`;
  }
  function wireBusiness(app) {
    $('#bz', app).onsubmit = e => { e.preventDefault(); const v = id => $('#' + id, app).value, ph = v('bz-p').trim();
      if (ph && !Biz.phone(ph).ok) { $('#bz-err', app).textContent = 'מספר הטלפון לא תקין.'; $('#bz-err', app).hidden = false; return; }
      busy(e.target.querySelector('.btn-primary'), async () => {
        await rpc('owner_save_profile', { p_tenant: S.tid, p: { name: v('bz-n').trim(), phone: ph, address: v('bz-a'), min_notice_min: +v('bz-mn'), max_days_ahead: +v('bz-mx'),
          slot_step_min: +v('bz-st'), cancel_until_min: +v('bz-c'), max_open_per_phone: +v('bz-o'), choose_staff: $('#bz-cs', app).checked, reminders_enabled: $('#bz-rem', app).checked, reminder_hours: +v('bz-rh') } });
        await loadSetup(); toast('נשמר');
      }, $('#bz-err', app)).catch(() => {}); };
  }

  // ---------------------------------------------------------------- share
  function shareView() {
    const url = bookingLink(T().slug);
    return `${header('הקישור לקביעת תור', '/more')}<div class="wrap"><section class="section">
      <div class="linkbox"><input class="input" id="sh-url" readonly dir="ltr" value="${esc(url)}" aria-label="הקישור"><button class="btn btn-primary" type="button" id="sh-copy">${icon('i-copy')}העתקה</button></div>
      <a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`לקביעת תור ב${T().name}: ${url}`)}">${icon('b-whatsapp')}שיתוף בוואטסאפ</a>
      <div class="qr" aria-label="קוד QR לעמוד">${Biz.qr(url, { size: 220, dark: '#111' })}</div>
      <p class="hint" style="text-align:center">צילום מסך של הקוד: לשלט בעסק, לכרטיס ביקור, לחלון.</p>
      <h2>איפה לשים את הקישור</h2>
      <ul class="stack" style="padding-inline-start:20px;margin:0">
        <li>בביו של האינסטגרם ובכפתור "הזמנת תור".</li>
        <li>בפרופיל העסק בגוגל מפות, בשדה "קישור להזמנות".</li>
        <li>בהודעת הפתיחה של וואטסאפ עסקי.</li>
        <li>בסטטוס, פעם בשבוע: "נשארו שעות פנויות השבוע".</li></ul></section></div>`;
  }
  function wireShare(app) { $('#sh-copy', app).onclick = () => copy($('#sh-url', app).value); }

  // ---------------------------------------------------------------- routes
  const recovery = API.auth.takeFromUrl();
  Router.route('/login', loginView, { title: 'כניסה', after: wireLogin })
    .route('/reset', resetView, { title: 'סיסמה חדשה', after: wireReset })
    .route('/', screen(diary), { title: 'יומן', after: wireDiary })
    .route('/new', screen(newView, { manage: true }), { title: 'תור חדש', after: wireNew })
    .route('/customers', screen(customersView, { manage: true }), { title: 'לקוחות', after: wireCustomers })
    .route('/more', screen(moreView), { title: 'עוד', after: wireMore })
    .route('/services', screen(servicesView, { manage: true }), { title: 'שירותים', after: wireServices })
    .route('/hours', screen(hoursView, { manage: true }), { title: 'שעות', after: wireHours })
    .route('/team', screen(teamView, { manage: true }), { title: 'צוות', after: wireTeam })
    .route('/look', screen(lookView, { manage: true }), { title: 'מראה', after: wireLook })
    .route('/business', screen(businessView, { manage: true }), { title: 'פרטי העסק', after: wireBusiness })
    .route('/share', screen(shareView), { title: 'קישור', after: wireShare })
    .route('*', p => p.startsWith('/join/') ? joinView(p.slice(6)) : (Router.go('/'), ''), { title: 'הצטרפות', after: wireJoin });
  if (recovery === 'recovery') location.hash = '#/reset';
  Router.start({ app: '#app', title: t => `${t} · ${S.setup ? T().name : P.name}` });
})();
