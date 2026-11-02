/* admin.js — the platform part of your panel: every business on the platform, its status and its billing (#/platform).
   office.js (loaded after) owns the routes and the rest of the back office.
   Only a platform admin gets data here (the database checks it; this screen only shows what it is given). */
(() => {
  'use strict';
  const P = window.PLATFORM;
  const { $, $$, esc, icon, toast, sheet, closeSheet, busy, money } = UI;
  const S = { data: null, filter: 'all', q: '' };
  const STATUS = { trial: ['ניסיון', 'warn'], active: ['פעיל', 'ok'], past_due: ['באיחור', 'bad'], suspended: ['מושהה', 'bad'], cancelled: ['בוטל', ''] };
  const pageUrl = slug => P.businessUrl(slug);
  const inviteUrl = code => P.url(`manage/#/join/${code}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const dateHe = d => d ? new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }).format(new Date(d + (d.length === 10 ? 'T12:00:00' : ''))) : '–';
  const shekels = v => Math.round(+String(v).replace(/[^\d.]/g, '') * 100) || 0;

  // ---------------------------------------------------------------- sign in
  function loginView() {
    return `<div class="auth"><div class="card"><h1>ניהול ${esc(P.name)}</h1>
      <form id="login" class="stack" novalidate>
        <div class="field"><label for="l-email">אימייל</label><input id="l-email" name="email" type="email" autocomplete="username" dir="ltr" required></div>
        <div class="field"><label for="l-pw">סיסמה</label><input id="l-pw" name="pw" type="password" autocomplete="current-password" dir="ltr" required></div>
        <p class="error" id="l-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-wide">כניסה</button>
        <a class="btn btn-quiet" href="${P.url('manage/#/signup')}">אין לי חשבון: פתיחת חשבון</a></form></div></div>`;
  }
  function wireLogin(app) {
    const f = $('#login', app); if (!f) return;
    f.onsubmit = e => { e.preventDefault();
      busy(f.querySelector('button'), async () => { await API.auth.signIn(f.email.value, f.pw.value); Router.go('/'); }, $('#l-err')).catch(() => {}); };
  }

  // ---------------------------------------------------------------- overview
  async function load() { S.data = await API.rpc('admin_overview'); }
  async function home() {
    if (!API.auth.session) { Router.go('/login'); return ''; }
    try { await load(); }
    catch (e) {
      if (e.code === 'forbidden') return `<div class="auth"><div class="card"><h1>אין הרשאת מנהל</h1><p class="muted">החשבון הזה לא מנהל את המערכת.</p>
        <a class="btn btn-ghost" href="${P.url('manage/')}">לאפליקציית העסק</a><button class="btn btn-quiet" type="button" data-signout>יציאה</button></div></div>`;
      if (e.code === 'signed_out') { Router.go('/login'); return ''; }
      return `<div class="empty"><p>${esc(API.say(e))}</p><button class="btn btn-primary" data-reload>לנסות שוב</button></div>`;
    }
    const k = S.data.kpi;
    return `<header class="top"><div class="wrap"><a class="icon-btn" href="#/more" aria-label="חזרה">${icon('i-arrow-right')}</a><h1>עסקים בפלטפורמה</h1>
        <button class="btn btn-primary btn-sm" type="button" id="new">${icon('i-plus')}עסק חדש</button></div></header>
      <div class="wrap">
        <section class="section" aria-label="מספרים">
          <div class="kpis">
            <div class="kpi"><b>${money(k.mrr_agorot) || '₪0'}</b><span>הכנסה חודשית קבועה (פעילים + באיחור)</span></div>
            <div class="kpi"><b>${money(k.received_this_month_agorot) || '₪0'}</b><span>התקבל החודש</span></div>
            <div class="kpi"><b>${k.active}</b><span>עסקים פעילים</span></div>
            <div class="kpi"><b>${k.trial}</b><span>בניסיון</span></div>
            <div class="kpi"><b class="${k.due_now ? 'due' : ''}">${k.due_now}</b><span>לגבייה עכשיו</span></div>
            <div class="kpi"><b class="${k.past_due ? 'due' : ''}">${k.past_due}</b><span>באיחור</span></div>
          </div>
        </section>
        <section class="section" aria-labelledby="h-biz">
          <div class="row"><h2 id="h-biz" class="grow">עסקים (${k.businesses})</h2></div>
          <div class="field"><label for="q" class="vh">חיפוש</label><input id="q" class="input" type="search" placeholder="חיפוש לפי שם, כתובת או טלפון" value="${esc(S.q)}" autocomplete="off"></div>
          <div class="filters" role="group" aria-label="סינון">${[['all', 'הכל'], ['active', 'פעילים'], ['trial', 'ניסיון'], ['due', 'לגבייה'], ['past_due', 'באיחור'], ['suspended', 'מושהים']]
            .map(([v, l]) => `<button class="btn btn-ghost btn-sm" type="button" data-f="${v}" aria-pressed="${S.filter === v}">${l}</button>`).join('')}</div>
          <div class="list" id="list"></div>
        </section>
      </div>`;
  }
  function renderList() {
    const el = $('#list'); if (!el) return;
    const q = S.q.trim().toLowerCase();
    const xs = S.data.businesses.filter(b => {
      const due = b.subscription && b.subscription.next_charge_on && b.subscription.next_charge_on <= today() && ['active', 'past_due'].includes(b.status);
      const okF = S.filter === 'all' || (S.filter === 'due' ? due : b.status === S.filter);
      return okF && (!q || [b.name, b.slug, b.phone || ''].some(x => x.toLowerCase().includes(q)));
    });
    el.innerHTML = xs.length ? xs.map(b => { const [l, c] = STATUS[b.status], sb = b.subscription || {};
      const due = sb.next_charge_on && sb.next_charge_on <= today() && ['active', 'past_due'].includes(b.status);
      return `<button class="item plain" type="button" data-id="${b.id}"><span class="main"><strong>${esc(b.name)}</strong>
        <span><bdi dir="ltr">${esc(b.slug)}</bdi> · ${money(sb.monthly_agorot) || '₪0'}/חודש · ${b.bookings_30} תורים ב-30 יום${!b.owners ? ' · <b>בעלים עוד לא נכנס/ה</b>' : ''}</span>
        <span class="line ${due ? 'due' : ''}">חיוב הבא: ${dateHe(sb.next_charge_on)}</span></span>
        <span class="chip ${c}">${l}</span></button>`; }).join('')
      : '<div class="empty card">אין עסקים כאן.</div>';
    $$('[data-id]', el).forEach(b => b.onclick = () => bizSheet(S.data.businesses.find(x => x.id === b.dataset.id)));
  }
  function wireHome(app) {
    if (!S.data) return;
    renderList();
    $('#q', app).oninput = e => { S.q = e.target.value; renderList(); };
    $$('[data-f]', app).forEach(b => b.onclick = () => { S.filter = b.dataset.f; $$('[data-f]', app).forEach(x => x.setAttribute('aria-pressed', x === b)); renderList(); });
    $('#new', app).onclick = newSheet;
  }
  const reload = async () => { await load(); Router.refresh(); };

  // ---------------------------------------------------------------- new business
  function newSheet() {
    sheet(`<h2 class="sheet-title" id="sheet-t">עסק חדש</h2>
      <form id="nf" class="stack" novalidate>
        <div class="field"><label for="n-name">שם העסק</label><input id="n-name" required maxlength="80" autofocus></div>
        <div class="field"><label for="n-slug">כתובת (באנגלית)</label><input id="n-slug" dir="ltr" required maxlength="40" placeholder="noa-nails" pattern="[a-z0-9-]+">
          <span class="hint" id="n-slug-hint" dir="ltr"></span></div>
        <div class="field"><label for="n-phone">טלפון של בעל/ת העסק</label><input id="n-phone" type="tel" inputmode="tel" dir="ltr" placeholder="050-000-0000"></div>
        <div class="grid2"><div class="field"><label for="n-setup">הקמה ₪</label><input id="n-setup" type="number" inputmode="numeric" min="0" dir="ltr" value="990"></div>
          <div class="field"><label for="n-month">חודשי ₪</label><input id="n-month" type="number" inputmode="numeric" min="0" dir="ltr" value="200"></div></div>
        <div class="grid2"><label class="check"><input type="checkbox" id="n-launch" checked>מחיר השקה</label>
          <div class="field"><label for="n-commit">התחייבות</label><select id="n-commit"><option value="12">12 חודשים</option><option value="0">בלי</option><option value="6">6 חודשים</option><option value="24">24 חודשים</option></select></div></div>
        <div class="field"><label for="n-status">מצב</label><select id="n-status"><option value="trial">ניסיון (עוד לא שילם/ה)</option><option value="active">פעיל</option></select></div>
        <div class="field"><label for="n-notes">הערות</label><input id="n-notes" maxlength="300" placeholder="למשל: הגיע/ה דרך המפיצה"></div>
        <p class="error" id="n-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-wide">יצירה</button></form>`, body => {
      const slug = $('#n-slug', body), hint = $('#n-slug-hint', body);
      slug.oninput = () => { slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); hint.textContent = slug.value ? pageUrl(slug.value) : ''; };
      $('#nf', body).onsubmit = e => { e.preventDefault(); const err = $('#n-err', body);
        const name = $('#n-name', body).value.trim(), s = slug.value.replace(/^-+|-+$/g, ''), ph = $('#n-phone', body).value.trim();
        const miss = name.length < 2 ? 'צריך שם לעסק.' : !/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]?$/.test(s) ? API.say({ code: 'slug_invalid' }) : ph && !Biz.phone(ph).ok ? 'מספר הטלפון לא תקין.' : '';
        if (miss) { err.textContent = miss; err.hidden = false; return; }
        busy(e.target.querySelector('.btn-primary'), async () => {
          const r = await API.rpc('admin_create_business', { p: { name, slug: s, phone: ph ? Biz.phone(ph).digits : null, status: $('#n-status', body).value,
            setup_agorot: shekels($('#n-setup', body).value), monthly_agorot: shekels($('#n-month', body).value), launch_price: $('#n-launch', body).checked,
            commitment_months: +$('#n-commit', body).value, notes: $('#n-notes', body).value.trim() } });
          await load(); Router.refresh();
          inviteResult(name, ph, r.invite_code, 'העסק נוצר');
        }, err).catch(() => {}); };
    });
  }
  function inviteResult(name, phone, code, title) {
    const url = inviteUrl(code), text = `שלום! זה הקישור לפתוח את מערכת התורים של ${name}: ${url}\nנכנסים, פותחים חשבון עם אימייל וסיסמה, ומשם מגדירים שירותים, שעות ותמונות.`;
    sheet(`<h2 class="sheet-title" id="sheet-t">${esc(title)}</h2>
      <p class="muted">שלחו לבעל/ת העסק את קישור ההזמנה. הוא טוב לשימוש אחד, ל-30 יום.</p>
      <div class="stack" style="margin-top:12px">
        <div class="linkbox"><input class="input" readonly dir="ltr" value="${esc(url)}" aria-label="קישור הזמנה"><button class="btn btn-ghost" type="button" id="cp">${icon('i-copy')}</button></div>
        ${phone && Biz.phone(phone).mobile ? `<a class="btn btn-primary btn-wide" href="${Biz.wa(phone, text)}" target="_blank" rel="noopener">${icon('b-whatsapp')}שליחה בוואטסאפ</a>`
          : `<a class="btn btn-primary btn-wide" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${icon('b-whatsapp')}שליחה בוואטסאפ</a>`}
        <button class="btn btn-quiet btn-wide" type="button" data-close>סגירה</button></div>`, body => {
      $('#cp', body).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('הועתק'); } catch { toast('אפשר לסמן ולהעתיק ידנית'); } };
    });
  }

  // ---------------------------------------------------------------- one business
  function bizSheet(b) {
    const sb = b.subscription || {}, [l, c] = STATUS[b.status], lp = b.last_payment;
    sheet(`<h2 class="sheet-title" id="sheet-t">${esc(b.name)}</h2><span class="chip ${c}">${l}</span>
      <dl class="facts">
        <dt>עמוד</dt><dd><a href="${pageUrl(b.slug)}" target="_blank" rel="noopener" dir="ltr">${esc(b.custom_domain || pageUrl(b.slug).replace(/^https?:\/\//, ''))}</a></dd>
        ${b.phone ? `<dt>טלפון</dt><dd><bdi dir="ltr">${esc(Biz.phone(b.phone).local || b.phone)}</bdi></dd>` : ''}
        <dt>מחיר</dt><dd>הקמה ${money(sb.setup_agorot) || '₪0'}${sb.launch_price ? ' (השקה)' : ''} · ${money(sb.monthly_agorot) || '₪0'} לחודש</dd>
        <dt>חיוב הבא</dt><dd>${dateHe(sb.next_charge_on)}</dd>
        ${sb.commitment_until ? `<dt>התחייבות עד</dt><dd>${dateHe(sb.commitment_until)}</dd>` : ''}
        <dt>שולם עד היום</dt><dd>${money(b.paid_total_agorot) || '₪0'}${lp ? ` · אחרון ${money(lp.amount_agorot)} ב-${dateHe(lp.paid_on)}` : ''}</dd>
        <dt>תורים</dt><dd>${b.bookings_30} ב-30 הימים האחרונים</dd>
        <dt>נוצר</dt><dd>${dateHe(b.created_at.slice(0, 10))}</dd>
        ${sb.notes ? `<dt>הערות</dt><dd>${esc(sb.notes)}</dd>` : ''}
      </dl>
      ${!b.owners ? `<p class="hint"><b>בעל/ת העסק עוד לא נכנס/ה.</b> ${b.open_invite ? 'יש קישור הזמנה פתוח.' : ''}</p>` : ''}
      <div class="stack">
        <button class="btn btn-primary" type="button" id="pay">${icon('i-plus')}רישום תשלום</button>
        <div class="grid2">
          ${b.phone && Biz.phone(b.phone).mobile ? `<a class="btn btn-ghost" href="${Biz.wa(b.phone, `שלום, `)}" target="_blank" rel="noopener">${icon('b-whatsapp')}וואטסאפ</a>` : ''}
          <button class="btn btn-ghost" type="button" id="inv">${icon('i-link')}${b.open_invite ? 'קישור הזמנה' : 'הזמנה חדשה'}</button>
        </div>
        <button class="btn btn-ghost" type="button" id="edit">${icon('i-store')}מצב, מחיר ודומיין</button>
        <button class="btn btn-quiet" type="button" id="log">שינויים אחרונים</button>
        <div id="log-out"></div>
      </div>`, body => {
      $('#pay', body).onclick = () => paySheet(b);
      $('#edit', body).onclick = () => editSheet(b);
      $('#inv', body).onclick = () => busy($('#inv', body), async () => {
        const code = b.open_invite || (await API.rpc('admin_new_owner_invite', { p_tenant: b.id })).code;
        inviteResult(b.name, b.phone, code, 'קישור הזמנה לבעלים'); load();
      }).catch(() => {});
      $('#log', body).onclick = () => busy($('#log', body), async () => {
        const xs = await API.rpc('admin_audit', { p_tenant: b.id, p_limit: 20 });
        const what = a => ({ bookings: 'תור', services: 'שירות', staff: 'צוות', working_hours: 'שעות', time_off: 'סגירה', tenants: 'פרטי עסק', subscriptions: 'מנוי', payments: 'תשלום' }[a.entity] || a.entity);
        const act = a => ({ insert: 'נוסף', update: 'עודכן', delete: 'נמחק' }[a.action]);
        $('#log-out', body).innerHTML = xs.length ? `<ul class="stack small" style="padding-inline-start:18px;margin:0">${xs.map(a => `<li>${new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(a.at))} · ${what(a)} ${act(a)}${a.changes && a.changes.status ? ` (${esc(a.changes.status)})` : ''}</li>`).join('')}</ul>` : '<p class="hint">אין שינויים.</p>';
      }).catch(() => {});
    });
  }
  function paySheet(b) {
    const sb = b.subscription || {};
    sheet(`<h2 class="sheet-title" id="sheet-t">תשלום · ${esc(b.name)}</h2><form id="pf" class="stack" novalidate>
      <div class="grid2"><div class="field"><label for="p-amt">סכום ₪</label><input id="p-amt" type="number" inputmode="decimal" min="1" dir="ltr" value="${(sb.monthly_agorot || 0) / 100 || ''}" required autofocus></div>
        <div class="field"><label for="p-kind">על מה</label><select id="p-kind"><option value="monthly">חודשי</option><option value="setup">הקמה</option><option value="addon">תוספת</option><option value="other">אחר</option></select></div></div>
      <div class="grid2"><div class="field"><label for="p-m">איך</label><select id="p-m"><option value="bit">ביט</option><option value="paybox">פייבוקס</option><option value="transfer">העברה</option><option value="card">אשראי</option><option value="cash">מזומן</option><option value="other">אחר</option></select></div>
        <div class="field"><label for="p-d">תאריך</label><input id="p-d" type="date" value="${today()}"></div></div>
      <div class="field"><label for="p-ref">מספר קבלה / חשבונית</label><input id="p-ref" dir="ltr" maxlength="80"></div>
      <p class="hint">תשלום חודשי מזיז את תאריך החיוב הבא בחודש, ומחזיר עסק "באיחור" לפעיל.</p>
      <p class="error" id="p-err" hidden></p><button class="btn btn-primary btn-wide">רישום</button></form>`, body => {
      $('#p-kind', body).onchange = e => { if (e.target.value === 'setup') $('#p-amt', body).value = (sb.setup_agorot || 0) / 100 || ''; };
      $('#pf', body).onsubmit = e => { e.preventDefault(); const amt = shekels($('#p-amt', body).value);
        if (amt <= 0) { $('#p-err', body).textContent = 'צריך סכום.'; $('#p-err', body).hidden = false; return; }
        busy(e.target.querySelector('button'), async () => {
          await API.rpc('admin_record_payment', { p_tenant: b.id, p: { amount_agorot: amt, kind: $('#p-kind', body).value, method: $('#p-m', body).value, paid_on: $('#p-d', body).value, reference: $('#p-ref', body).value.trim() } });
          closeSheet(); toast('התשלום נרשם'); await reload();
        }, $('#p-err', body)).catch(() => {}); };
    });
  }
  function editSheet(b) {
    const sb = b.subscription || {};
    sheet(`<h2 class="sheet-title" id="sheet-t">${esc(b.name)}</h2><form id="ef" class="stack" novalidate>
      <div class="field"><label for="e-st">מצב</label><select id="e-st">${Object.entries(STATUS).map(([v, [l]]) => `<option value="${v}" ${v === b.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="hint">מושהה / בוטל: עמוד קביעת התורים יורד מהאוויר. הנתונים נשמרים.</span></div>
      <div class="grid2"><div class="field"><label for="e-m">חודשי ₪</label><input id="e-m" type="number" min="0" dir="ltr" value="${(sb.monthly_agorot || 0) / 100}"></div>
        <div class="field"><label for="e-next">חיוב הבא</label><input id="e-next" type="date" value="${sb.next_charge_on || ''}"></div></div>
      <div class="field"><label for="e-cu">התחייבות עד</label><input id="e-cu" type="date" value="${sb.commitment_until || ''}"></div>
      <div class="field"><label for="e-dom">דומיין משלו <span class="hint">(לא חובה)</span></label><input id="e-dom" dir="ltr" placeholder="www.example.co.il" value="${esc(b.custom_domain || '')}">
        <span class="hint">אחרי השמירה מחברים את הדומיין ב-Cloudflare (מדריך: README → דומיין של לקוח).</span></div>
      <div class="field"><label for="e-notes">הערות</label><input id="e-notes" maxlength="1000" value="${esc(sb.notes || '')}"></div>
      <p class="error" id="e-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      $('#ef', body).onsubmit = e => { e.preventDefault();
        busy(e.target.querySelector('button'), async () => {
          await API.rpc('admin_update_business', { p_tenant: b.id, p: { status: $('#e-st', body).value, custom_domain: $('#e-dom', body).value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''),
            subscription: { monthly_agorot: shekels($('#e-m', body).value), next_charge_on: $('#e-next', body).value || null, commitment_until: $('#e-cu', body).value || null, notes: $('#e-notes', body).value } } });
          closeSheet(); toast('נשמר'); await reload();
        }, $('#e-err', body)).catch(() => {}); };
    });
  }

  document.addEventListener('click', async e => { if (e.target.closest('[data-signout]')) { await API.auth.signOut(); S.data = null; Router.go('/login'); } });
  window.Platform = { home, wireHome, loginView, wireLogin, businesses: async () => { await load(); return S.data.businesses; } };
})();
