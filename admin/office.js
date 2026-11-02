/* office.js — your back office: overview, leads from the referrer, clients and projects, money (income, expenses,
   commissions), the price list and quotes that go out on WhatsApp. Owns the panel's routes (admin.js adds #/platform).
   Routes: #/ overview · #/leads · #/clients · #/client/<id> · #/money · #/more · #/platform · #/catalog · #/referrers */
(() => {
  'use strict';
  const P = window.PLATFORM;
  const { $, $$, esc, icon, toast, sheet, closeSheet, busy } = UI;
  const rpc = API.rpc;
  const S = { leadFilter: 'open', leadQ: '', clientQ: '', month: null, catalog: null, referrers: null };
  const nis = ag => Biz.money((ag || 0) / 100);
  const shekels = v => Math.round(+String(v ?? '').replace(/[^\d.]/g, '') * 100) || 0;
  const today = () => new Date().toISOString().slice(0, 10);
  const dateHe = d => d ? new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' }).format(new Date(String(d).slice(0, 10) + 'T12:00:00')) : '';
  const ini = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(w => [...w][0] || '').join('');
  const LEAD = { new: ['חדש', 'acc'], contacted: ['דיברנו', 'warn'], quote_sent: ['נשלחה הצעה', 'warn'], won: ['נסגר', 'ok'], lost: ['לא רלוונטי', ''] };
  const PROJ = { agreed: ['סוכם', 'warn'], building: ['בבנייה', 'acc'], live: ['באוויר', 'ok'], paused: ['מושהה', 'bad'], ended: ['הסתיים', ''] };
  const SOURCE = { referrer: 'מפיצה', self: 'אני', friend: 'חבר/ה', social: 'רשתות', other: 'אחר' };
  const CAT = { servers: 'שרתים', domains: 'דומיינים', tools: 'כלים', ads: 'פרסום', commission: 'עמלות', other: 'אחר' };
  const METHOD = { bit: 'ביט', paybox: 'פייבוקס', transfer: 'העברה', card: 'אשראי', cash: 'מזומן', other: 'אחר' };
  const opts = (map, cur) => Object.entries(map).map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${Array.isArray(l) ? l[0] : l}</option>`).join('');
  const chip = (map, k) => { const [l, c] = map[k] || [k, '']; return `<span class="chip ${c}">${l}</span>`; };
  const waBtn = (phone, text, label = 'וואטסאפ') => phone && Biz.phone(phone).mobile ? `<a class="btn btn-ghost btn-sm" href="${Biz.wa(phone, text)}" target="_blank" rel="noopener">${icon('b-whatsapp')}${label}</a>` : '';
  const catalog = async () => S.catalog || (S.catalog = await rpc('bo_catalog_list'));
  const referrers = async (force) => (!force && S.referrers) || (S.referrers = await rpc('bo_referrers_list'));

  // ---------------------------------------------------------------- frame
  function tabs(show = true) {
    const nav = $('#tabs'); document.body.classList.toggle('no-tabs', !show); nav.hidden = !show; if (!show) return;
    const cur = Router.path.startsWith('/client') ? '/clients' : ['/platform', '/catalog', '/referrers'].includes(Router.path) ? '/more' : Router.path;
    nav.innerHTML = [['/', 'i-store', 'סקירה'], ['/leads', 'i-bell', 'לידים'], ['/clients', 'i-users', 'לקוחות'], ['/money', 'i-shopping-bag', 'כסף'], ['/more', 'i-menu', 'עוד']]
      .map(([h, i, l]) => `<a href="#${h}" ${cur === h ? 'aria-current="page"' : ''}>${icon(i)}<span class="${cur === h ? '' : 'vh'}">${l}</span></a>`).join('');
  }
  const header = (title, back, extra = '') => `<header class="top"><div class="wrap">${back ? `<a class="icon-btn" href="#${back}" aria-label="חזרה">${icon('i-arrow-right')}</a>` : ''}<h1>${esc(title)}</h1>${extra}</div></header>`;
  // every screen: signed in as the admin, or the sign-in / "not an admin" screen
  const screen = (view, opts = {}) => async p => {
    if (!API.auth.session) { Router.go('/login'); return ''; }
    tabs(!opts.noTabs);
    try { return await view(p); }
    catch (e) {
      if (e.code === 'signed_out') { Router.go('/login'); return ''; }
      if (e.code === 'forbidden') { tabs(false); return `<div class="auth"><div class="card"><h1>אין הרשאת מנהל</h1><p class="muted">החשבון הזה לא מנהל את המערכת.</p>
        <a class="btn btn-ghost" href="${P.url('manage/')}">לאפליקציית העסק</a><button class="btn btn-quiet" type="button" data-signout>יציאה</button></div></div>`; }
      return `<div class="empty"><p>${esc(API.say(e))}</p><button class="btn btn-primary" data-reload>לנסות שוב</button></div>`;
    }
  };

  // ---------------------------------------------------------------- overview
  async function overview() {
    const o = await rpc('bo_overview');
    const profit = o.income_month - o.expenses_month, pipe = o.pipeline || {}, max = Math.max(1, ...o.months.flatMap(m => [m.income, m.expenses]));
    const monthName = m => new Intl.DateTimeFormat('he-IL', { month: 'short' }).format(new Date(m + '-15'));
    return `<div class="wrap">
      <header class="hello"><span class="now"><i></i>${esc(P.name)} · המשרד שלך</span>
        <div class="hello-row"><h1>${esc(Biz.greet())}</h1><span class="avatar" aria-hidden="true">${esc([...P.name][0])}</span></div>
        <p>${o.follow_up.length ? `${o.follow_up.length} לידים מחכים לך היום` : 'אין לידים שמחכים היום'}</p></header>
      <section class="hero" aria-label="הכסף">
        <span class="lbl">הכנסה חודשית קבועה</span>
        <div class="hero-main"><span class="hero-time"><bdi dir="ltr">${nis(o.mrr)}</bdi></span>
          <span class="hero-who"><span><strong>${o.clients}</strong><span>לקוחות</span></span></span></div>
        <div><div class="bars" aria-hidden="true">${o.months.map(m => `<i style="height:${Math.round(m.income / max * 100)}%"></i><i class="now" style="height:${Math.round(m.expenses / max * 100)}%;opacity:.55"></i>`).join('')}</div>
          <div class="bars-x" aria-hidden="true">${o.months.map(m => `<span>${monthName(m.month)}</span>`).join('')}</div></div>
        <div class="hero-stats">
          <div><span>נכנס החודש</span><b>${nis(o.income_month)}</b></div>
          <div><span>יצא החודש</span><b>${nis(o.expenses_month)}</b></div>
          <div><span>רווח החודש</span><b>${nis(profit)}</b></div>
        </div></section>
      <section class="section"><div class="tiles">
        <a class="tile brand" href="#/leads" style="text-decoration:none"><span>לידים פתוחים</span><b>${(pipe.new || 0) + (pipe.contacted || 0) + (pipe.quote_sent || 0)}</b></a>
        <a class="tile" href="#/money" style="text-decoration:none;color:inherit"><span>עמלה לתשלום</span><b>${nis(o.commission_owed)}</b></a>
        <div class="tile"><span>פרויקטים בבנייה</span><b>${((o.projects || {}).agreed || 0) + ((o.projects || {}).building || 0)}</b></div>
        <div class="tile"><span>הכנסות השנה</span><b>${nis(o.income_year)}</b></div>
      </div></section>
      <section class="section" aria-labelledby="h-fu"><h2 id="h-fu">לטפל היום</h2>
        ${o.follow_up.length ? `<div class="list">${o.follow_up.map(l => `<button class="item with-av" type="button" data-lead='${esc(JSON.stringify(l))}'>
          <span class="avatar round" aria-hidden="true">${esc(ini(l.name))}</span>
          <span class="main"><strong>${esc(l.business || l.name)}</strong><span>${esc(l.next_step || l.wants || l.trade || 'ליד חדש')}</span></span><span></span>
          ${chip(LEAD, l.status)}</button>`).join('')}</div>` : '<div class="empty card">הכל מטופל.</div>'}
        <p class="hint">${o.monthly_costs ? `עלויות קבועות בחודש: ${nis(o.monthly_costs)}. ` : ''}"הכנסה חודשית קבועה" = סכום החודשי של כל הפרויקטים באוויר.</p>
      </section></div>`;
  }
  function wireOverview(app) { $$('[data-lead]', app).forEach(b => b.onclick = () => leadSheet(JSON.parse(b.dataset.lead))); }

  // ---------------------------------------------------------------- leads
  async function leads() {
    const status = S.leadFilter === 'open' ? null : S.leadFilter === 'all' ? null : S.leadFilter;
    let xs = await rpc('bo_leads_list', { p_status: status, p_q: S.leadQ || null });
    if (S.leadFilter === 'open') xs = xs.filter(l => ['new', 'contacted', 'quote_sent'].includes(l.status));
    return `${header('לידים', null, `<button class="btn btn-primary btn-sm" type="button" id="lead-new">${icon('i-plus')}ליד</button>`)}
      <div class="wrap"><section class="section">
        <div class="field"><label for="lq" class="vh">חיפוש</label><input id="lq" class="input" type="search" placeholder="שם, עסק או טלפון" value="${esc(S.leadQ)}" autocomplete="off"></div>
        <div class="filters row" role="group" aria-label="סינון">${[['open', 'פתוחים'], ['new', 'חדשים'], ['contacted', 'דיברנו'], ['quote_sent', 'נשלחה הצעה'], ['won', 'נסגרו'], ['lost', 'לא רלוונטי'], ['all', 'הכל']]
          .map(([v, l]) => `<button class="btn btn-ghost btn-sm" type="button" data-f="${v}" aria-pressed="${S.leadFilter === v}">${l}</button>`).join('')}</div>
        ${xs.length ? `<div class="list">${xs.map(l => `<button class="item with-av" type="button" data-lead='${esc(JSON.stringify(l))}'>
          <span class="avatar round" aria-hidden="true">${esc(ini(l.name))}</span>
          <span class="main"><strong>${esc(l.business || l.name)}</strong><span>${esc([l.business ? l.name : '', l.trade, l.referrer ? 'דרך ' + l.referrer : SOURCE[l.source]].filter(Boolean).join(' · '))}</span>
            ${l.next_step_at ? `<span class="line ${l.next_step_at <= today() ? 'due' : ''}">${esc(l.next_step || 'לחזור')} · ${dateHe(l.next_step_at)}</span>` : ''}</span><span></span>
          ${chip(LEAD, l.status)}</button>`).join('')}</div>` : `<div class="empty card">אין לידים כאן.${S.leadFilter === 'open' ? ' כשהמפיצה מביאה מישהו, מוסיפים אותו ב"ליד".' : ''}</div>`}
      </section></div>`;
  }
  function wireLeads(app) {
    let t; $('#lq', app).oninput = e => { clearTimeout(t); t = setTimeout(() => { S.leadQ = e.target.value; Router.refresh(); }, 350); };
    $$('[data-f]', app).forEach(b => b.onclick = () => { S.leadFilter = b.dataset.f; Router.refresh(); });
    $$('[data-lead]', app).forEach(b => b.onclick = () => leadSheet(JSON.parse(b.dataset.lead)));
    $('#lead-new', app).onclick = () => leadForm({});
  }
  async function leadForm(l) {
    const refs = (await referrers()).filter(r => r.active || r.id === l.referrer_id);
    sheet(`<h2 class="sheet-title" id="sheet-t">${l.id ? 'עריכת ליד' : 'ליד חדש'}</h2><form id="lf" class="stack" novalidate>
      <div class="grid2"><div class="field"><label for="lf-n">שם</label><input id="lf-n" value="${esc(l.name || '')}" maxlength="80" required autofocus></div>
        <div class="field"><label for="lf-b">שם העסק</label><input id="lf-b" value="${esc(l.business || '')}" maxlength="80"></div></div>
      <div class="grid2"><div class="field"><label for="lf-p">טלפון</label><input id="lf-p" type="tel" inputmode="tel" dir="ltr" value="${esc(l.phone ? Biz.phone(l.phone).local : '')}"></div>
        <div class="field"><label for="lf-t">תחום</label><input id="lf-t" value="${esc(l.trade || '')}" maxlength="60" placeholder="ציפורניים, מספרה…"></div></div>
      <div class="field"><label for="lf-w">מה הוא/היא צריכים</label><textarea id="lf-w" maxlength="500">${esc(l.wants || '')}</textarea></div>
      <div class="grid2"><div class="field"><label for="lf-s">מקור</label><select id="lf-s">${opts(SOURCE, l.source || (refs.length ? 'referrer' : 'self'))}</select></div>
        <div class="field"><label for="lf-r">מפיצה</label><select id="lf-r"><option value="">—</option>${refs.map(r => `<option value="${r.id}" ${r.id === (l.referrer_id || (refs.length === 1 && !l.id ? refs[0].id : '')) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div></div>
      <div class="grid2"><div class="field"><label for="lf-ns">הצעד הבא</label><input id="lf-ns" value="${esc(l.next_step || '')}" maxlength="200" placeholder="להתקשר, לשלוח דוגמה…"></div>
        <div class="field"><label for="lf-nd">מתי</label><input id="lf-nd" type="date" value="${esc(l.next_step_at || today())}"></div></div>
      <div class="field"><label for="lf-no">הערות</label><textarea id="lf-no">${esc(l.notes || '')}</textarea></div>
      <p class="error" id="lf-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      $('#lf', body).onsubmit = e => { e.preventDefault(); const v = id => $('#' + id, body).value.trim();
        if (!v('lf-n')) { $('#lf-err', body).textContent = 'צריך שם.'; $('#lf-err', body).hidden = false; return; }
        busy(e.target.querySelector('.btn-primary'), async () => {
          const saved = await rpc('bo_save_lead', { p: { id: l.id || null, name: v('lf-n'), business: v('lf-b'), phone: v('lf-p'), trade: v('lf-t'), wants: v('lf-w'),
            source: v('lf-s'), referrer_id: v('lf-r'), next_step: v('lf-ns'), next_step_at: v('lf-nd'), notes: v('lf-no') } });
          closeSheet(); toast('נשמר'); S.referrers = null; Router.refresh(); if (!l.id) setTimeout(() => leadSheet(saved), 350);
        }, $('#lf-err', body)).catch(() => {}); };
    });
  }
  async function leadSheet(l) {
    const quotes = await rpc('bo_quotes_for', { p_lead: l.id });
    const open = ['new', 'contacted', 'quote_sent'].includes(l.status);
    sheet(`<div class="sheet-who"><span class="avatar round" aria-hidden="true">${esc(ini(l.name))}</span>
        <div><h2 class="sheet-title" id="sheet-t">${esc(l.business || l.name)}</h2>${chip(LEAD, l.status)}</div></div>
      <dl class="facts">
        ${l.business ? `<dt>איש קשר</dt><dd>${esc(l.name)}</dd>` : ''}
        ${l.phone ? `<dt>טלפון</dt><dd><bdi dir="ltr">${esc(Biz.phone(l.phone).local)}</bdi></dd>` : ''}
        ${l.trade ? `<dt>תחום</dt><dd>${esc(l.trade)}</dd>` : ''}
        <dt>מקור</dt><dd>${esc(l.referrer ? 'דרך ' + l.referrer : SOURCE[l.source])}</dd>
        ${l.wants ? `<dt>צריך</dt><dd>${esc(l.wants)}</dd>` : ''}
        ${l.next_step_at ? `<dt>הצעד הבא</dt><dd>${esc(l.next_step || 'לחזור')} · ${dateHe(l.next_step_at)}</dd>` : ''}
        ${l.notes ? `<dt>הערות</dt><dd>${esc(l.notes)}</dd>` : ''}
        ${quotes.length ? `<dt>הצעות</dt><dd>${quotes.map(q => `${dateHe(q.created_at)}: ${nis(q.setup_total)} + ${nis(q.monthly_total)} לחודש`).join('<br>')}</dd>` : ''}
      </dl>
      <div class="grid2">${waBtn(l.phone, `היי ${l.name}, `)}${l.phone ? `<a class="btn btn-ghost btn-sm" href="${Biz.tel(l.phone)}">${icon('i-phone')}חיוג</a>` : ''}</div>
      ${open ? `<div class="stack" style="margin-top:12px">
        <button class="btn btn-brand" type="button" id="l-quote">${icon('i-copy')}הצעת מחיר</button>
        <div class="grid2"><button class="btn btn-soft" type="button" data-st="contacted">דיברנו</button><button class="btn btn-ghost" type="button" id="l-edit">עריכה</button></div>
        <button class="btn btn-primary" type="button" id="l-win">${icon('i-check')}נסגר! להפוך ללקוח</button>
        <button class="btn btn-quiet" type="button" data-st="lost">לא רלוונטי</button></div>`
      : `<div class="stack" style="margin-top:12px"><button class="btn btn-ghost" type="button" id="l-edit">עריכה</button>
          ${l.status === 'lost' ? `<button class="btn btn-soft" type="button" data-st="new">להחזיר לפתוחים</button>` : ''}
          <button class="btn btn-quiet" type="button" id="l-del">מחיקת הליד</button></div>`}
      <p class="error" id="l-err" hidden></p>`, body => {
      $$('[data-st]', body).forEach(b => b.onclick = () => busy(b, async () => { await rpc('bo_save_lead', { p: { id: l.id, status: b.dataset.st } }); closeSheet(); toast('עודכן'); Router.refresh(); }, $('#l-err', body)).catch(() => {}));
      $('#l-edit', body).onclick = () => leadForm(l);
      const q = $('#l-quote', body); if (q) q.onclick = () => quoteSheet({ lead: l });
      const w = $('#l-win', body); if (w) w.onclick = () => winSheet(l, quotes);
      const d = $('#l-del', body); if (d) d.onclick = () => busy(d, async () => { await rpc('bo_delete_lead', { p_id: l.id }); closeSheet(); toast('נמחק'); Router.refresh(); }).catch(() => {});
    });
  }
  function winSheet(l, quotes) {
    sheet(`<h2 class="sheet-title" id="sheet-t">נסגר עם ${esc(l.business || l.name)} 🎉</h2>
      <p class="muted">${quotes.length ? 'מאיזו הצעה לפתוח את הפרויקטים?' : 'אין הצעת מחיר שמורה. אפשר לפתוח לקוח ולהוסיף פרויקט ידנית.'}</p>
      <div class="stack" style="margin-top:12px">${quotes.map(q => `<button class="btn btn-ghost" type="button" data-q="${q.id}" style="justify-content:space-between">
        <span>${esc(q.items.map(i => i.name).join(' + '))}</span><span class="num">${nis(q.setup_total)}</span></button>`).join('')}
        <button class="btn ${quotes.length ? 'btn-quiet' : 'btn-primary'}" type="button" data-q="">לקוח בלי הצעה</button></div><p class="error" id="w-err" hidden></p>`, body => {
      $$('[data-q]', body).forEach(b => b.onclick = () => busy(b, async () => {
        const r = await rpc('bo_win_lead', { p_lead: l.id, p_quote: b.dataset.q || null }); closeSheet(); toast('לקוח חדש!'); location.hash = '#/client/' + r.client_id;
      }, $('#w-err', body)).catch(() => {}));
    });
  }

  // ---------------------------------------------------------------- quotes
  function quoteText(who, q) {
    const name = (who.name || '').split(' ')[0], biz = who.business || '';
    const lines = q.items.map(i => i.kind === 'service'
      ? `• *${i.name}*: הקמה ${q.launch_price && i.setup < i.setup_regular ? `~${Biz.money(i.setup_regular / 100)}~ *${Biz.money(i.setup / 100)}* (מחיר השקה)` : Biz.money(i.setup / 100)}${i.monthly ? ` · חודשי ${Biz.money(i.monthly / 100)}` : ''}${i.description ? `\n  ${i.description}` : ''}`
      : `• ${i.name}: ${Biz.money(i.setup / 100)}`);
    const commit = Math.max(0, ...q.items.map(i => i.commitment || 0));
    return `היי ${name} 👋\nהצעת מחיר${biz ? ` ל${biz}` : ''}:\n\n${lines.join('\n')}\n\n*סה״כ הקמה: ${Biz.money(q.setup_total / 100)}*${q.monthly_total ? `\n*חודשי: ${Biz.money(q.monthly_total / 100)}* (אחסון, דומיין, גיבויים, עדכונים קטנים ותמיכה)` : ''}` +
      `${commit ? `\nהתחייבות: ${commit} חודשים.` : ''}\nתשלום: 50% מקדמה ו-50% בעלייה לאוויר.\nההצעה בתוקף עד ${dateHe(q.valid_until)}.`;
  }
  async function quoteSheet({ lead, client }) {
    const cat = (await catalog()).filter(c => c.active), who = lead || client;
    const pick = new Set();
    const render = launch => {
      const items = cat.filter(c => pick.has(c.key));
      const setup = items.reduce((m, c) => m + (launch && c.setup_launch != null ? c.setup_launch : c.setup_regular), 0), monthly = items.reduce((m, c) => m + c.monthly, 0);
      $('#q-total').innerHTML = items.length ? `הקמה <b class="num">${nis(setup)}</b> · חודשי <b class="num">${nis(monthly)}</b>` : 'בחרו שירותים';
    };
    sheet(`<h2 class="sheet-title" id="sheet-t">הצעת מחיר</h2><p class="muted">${esc(who.business || who.name)}</p>
      <form id="qf" class="stack" style="margin-top:10px">
        ${['service', 'addon'].map(k => `<fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label">${k === 'service' ? 'שירותים' : 'תוספות'}</legend>
          ${cat.filter(c => c.kind === k).map(c => `<label class="check" style="justify-content:space-between"><span style="display:flex;gap:10px;align-items:center"><input type="checkbox" value="${c.key}">${esc(c.name)}</span>
            <span class="small muted num">${c.setup_launch != null ? `<s>${nis(c.setup_regular)}</s> ${nis(c.setup_launch)}` : nis(c.setup_regular)}${c.monthly ? ` + ${nis(c.monthly)}` : ''}</span></label>`).join('')}</fieldset>`).join('')}
        <label class="check"><input type="checkbox" id="q-launch" checked>מחיר השקה</label>
        <div class="field"><label for="q-valid">בתוקף עד</label><input id="q-valid" type="date" value="${new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)}"></div>
        <p class="card" id="q-total" style="margin:0">בחרו שירותים</p>
        <p class="error" id="q-err" hidden></p>
        <button class="btn btn-brand btn-wide" type="submit">שמירת ההצעה</button></form>`, body => {
      const launch = $('#q-launch', body);
      $$('fieldset input', body).forEach(i => i.onchange = () => { i.checked ? pick.add(i.value) : pick.delete(i.value); render(launch.checked); });
      launch.onchange = () => render(launch.checked);
      const save = async () => {
        if (!pick.size) { const e = new Error('empty_quote'); e.code = 'empty_quote'; throw e; }
        return rpc('bo_save_quote', { p: { lead_id: lead ? lead.id : null, client_id: client ? client.id : null, launch_price: launch.checked, status: 'sent',
          valid_until: $('#q-valid', body).value, items: [...pick].map(key => ({ key })) } });
      };
      const err = $('#q-err', body);
      $('#qf', body).onsubmit = e => { e.preventDefault();
        // open WhatsApp in the same click (popup rules), then save
        const items = cat.filter(c => pick.has(c.key));
        if (!items.length) { err.textContent = 'בחרו לפחות שירות אחד.'; err.hidden = false; return; }
        busy(e.submitter, async () => { const q = await save(); sent(q); }, err).catch(() => {}); };
      // saved: show the text and a real link (a link the person taps opens WhatsApp; a script can't, after waiting)
      const sent = q => { const t = quoteText(who, q), url = who.phone ? Biz.wa(who.phone, t) : `https://wa.me/?text=${encodeURIComponent(t)}`;
        body.innerHTML = `<h2 class="sheet-title" id="sheet-t">ההצעה נשמרה</h2><p class="muted">הקמה ${nis(q.setup_total)} · חודשי ${nis(q.monthly_total)}</p>
          <pre class="card" style="white-space:pre-wrap;font:inherit;margin:12px 0;max-height:40vh;overflow:auto">${esc(t)}</pre>
          <div class="stack"><a class="btn btn-brand btn-wide" href="${esc(url)}" target="_blank" rel="noopener">${icon('b-whatsapp')}פתיחה בוואטסאפ</a>
          <button class="btn btn-ghost btn-wide" type="button" id="q-copy2">${icon('i-copy')}העתקה</button></div>`;
        $('#q-copy2', body).onclick = async () => { try { await navigator.clipboard.writeText(t); toast('הועתק'); } catch { toast('ההעתקה נחסמה בדפדפן'); } };
        Router.refresh(); };
    });
  }

  // ---------------------------------------------------------------- clients
  async function clients() {
    const xs = await rpc('bo_clients_list', { p_q: S.clientQ || null });
    return `${header('לקוחות', null, `<button class="btn btn-primary btn-sm" type="button" id="c-new">${icon('i-plus')}לקוח</button>`)}
      <div class="wrap"><section class="section">
        <div class="field"><label for="cq" class="vh">חיפוש</label><input id="cq" class="input" type="search" placeholder="שם או עסק" value="${esc(S.clientQ)}" autocomplete="off"></div>
        ${xs.length ? `<div class="list">${xs.map(c => `<a class="item with-av" href="#/client/${c.id}">
          <span class="avatar round" aria-hidden="true">${esc(ini(c.business || c.name))}</span>
          <span class="main"><strong>${esc(c.business || c.name)}</strong><span>${esc(c.projects.map(p => p.title).join(' · ') || 'בלי פרויקטים')}</span></span><span></span>
          <span class="num small">${c.mrr ? nis(c.mrr) + '/ח׳' : ''}</span></a>`).join('')}</div>`
        : '<div class="empty card">עוד אין לקוחות. ליד שנסגר הופך ללקוח בלחיצה.</div>'}</section></div>`;
  }
  function wireClients(app) {
    let t; $('#cq', app).oninput = e => { clearTimeout(t); t = setTimeout(() => { S.clientQ = e.target.value; Router.refresh(); }, 350); };
    $('#c-new', app).onclick = () => clientForm({});
  }
  async function clientForm(c) {
    const refs = await referrers();
    sheet(`<h2 class="sheet-title" id="sheet-t">${c.id ? 'עריכת לקוח' : 'לקוח חדש'}</h2><form id="cf" class="stack" novalidate>
      <div class="grid2"><div class="field"><label for="cf-n">שם</label><input id="cf-n" value="${esc(c.name || '')}" required autofocus></div>
        <div class="field"><label for="cf-b">עסק</label><input id="cf-b" value="${esc(c.business || '')}"></div></div>
      <div class="grid2"><div class="field"><label for="cf-p">טלפון</label><input id="cf-p" type="tel" dir="ltr" value="${esc(c.phone ? Biz.phone(c.phone).local : '')}"></div>
        <div class="field"><label for="cf-e">אימייל</label><input id="cf-e" type="email" dir="ltr" value="${esc(c.email || '')}"></div></div>
      <div class="field"><label for="cf-r">הגיע דרך מפיצה</label><select id="cf-r"><option value="">—</option>${refs.map(r => `<option value="${r.id}" ${r.id === c.referrer_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="cf-no">הערות</label><textarea id="cf-no">${esc(c.notes || '')}</textarea></div>
      <p class="error" id="cf-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      $('#cf', body).onsubmit = e => { e.preventDefault(); const v = id => $('#' + id, body).value.trim();
        if (!v('cf-n')) { $('#cf-err', body).textContent = 'צריך שם.'; $('#cf-err', body).hidden = false; return; }
        busy(e.target.querySelector('.btn-primary'), async () => {
          const r = await rpc('bo_save_client', { p: { id: c.id || null, name: v('cf-n'), business: v('cf-b'), phone: v('cf-p'), email: v('cf-e'), referrer_id: v('cf-r'), notes: v('cf-no') } });
          closeSheet(); toast('נשמר'); if (c.id) Router.refresh(); else location.hash = '#/client/' + r.id;
        }, $('#cf-err', body)).catch(() => {}); };
    });
  }
  let current = null;
  async function client(id) {
    const c = current = await rpc('bo_client', { p_id: id });
    return `${header(c.business || c.name, '/clients', `<button class="btn btn-ghost btn-sm" type="button" id="c-edit">עריכה</button>`)}
      <div class="wrap">
        <section class="section"><p class="muted">${esc([c.business ? c.name : '', c.phone ? Biz.phone(c.phone).local : '', c.referrer ? 'דרך ' + c.referrer.name : ''].filter(Boolean).join(' · '))}</p>
          <div class="row">${waBtn(c.phone, `היי ${c.name.split(' ')[0]}, `)}${c.phone ? `<a class="btn btn-ghost btn-sm" href="${Biz.tel(c.phone)}">${icon('i-phone')}חיוג</a>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" id="c-quote">${icon('i-copy')}הצעת מחיר</button></div>
          ${c.notes ? `<p class="hint">${esc(c.notes)}</p>` : ''}</section>
        <section class="section"><div class="row"><h2 class="grow">פרויקטים</h2><button class="btn btn-soft btn-sm" type="button" id="p-new">${icon('i-plus')}פרויקט</button></div>
          ${c.projects.length ? c.projects.map(p => `<article class="card stack" style="gap:8px">
            <div class="row"><strong class="grow" style="font-size:18px">${esc(p.title)}</strong>${chip(PROJ, p.status)}</div>
            <div class="row small muted"><span>הקמה ${nis(p.setup_agorot)}${p.launch_price ? ' (השקה)' : ''} · שולם ${nis(p.paid_setup)}</span>${p.monthly_agorot ? `<span>· חודשי ${nis(p.monthly_agorot)}${p.last_monthly ? `, אחרון ${dateHe(p.last_monthly)}` : ''}</span>` : ''}</div>
            ${p.setup_agorot > p.paid_setup ? `<p class="small" style="color:var(--bad);font-weight:700">נשאר לגבות מההקמה: ${nis(p.setup_agorot - p.paid_setup)}</p>` : ''}
            ${p.todo ? `<p class="small">נשאר: ${esc(p.todo)}</p>` : ''}
            ${p.tenant_slug ? `<p class="small">בפלטפורמה: <bdi dir="ltr">${esc(p.tenant_slug)}</bdi></p>` : p.url ? `<p class="small"><a href="${esc(p.url)}" target="_blank" rel="noopener" dir="ltr">${esc(p.url)}</a></p>` : ''}
            <div class="grid2"><button class="btn btn-primary btn-sm" type="button" data-pay="${p.id}">${icon('i-plus')}תשלום</button><button class="btn btn-ghost btn-sm" type="button" data-proj="${p.id}">עריכה</button></div>
          </article>`).join('') : '<div class="empty card">אין פרויקטים.</div>'}</section>
        ${c.income.length ? `<section class="section"><h2>תשלומים</h2><div class="list">${c.income.map(i => `<div class="item plain"><span class="main"><strong class="num">${nis(i.amount_agorot)}</strong>
          <span>${esc(i.project)} · ${{ setup: 'הקמה', monthly: 'חודשי', addon: 'תוספת', other: 'אחר' }[i.kind]} · ${METHOD[i.method] || ''}${i.reference ? ' · ' + esc(i.reference) : ''}</span></span><span class="small muted">${dateHe(i.paid_on)}</span></div>`).join('')}</div></section>` : ''}
      </div>`;
  }
  function wireClient(app) {
    const c = current; if (!c) return;
    $('#c-edit', app).onclick = () => clientForm(c);
    $('#c-quote', app).onclick = () => quoteSheet({ client: c });
    $('#p-new', app).onclick = () => projectForm({ client_id: c.id });
    $$('[data-proj]', app).forEach(b => b.onclick = () => projectForm(c.projects.find(p => p.id === b.dataset.proj)));
    $$('[data-pay]', app).forEach(b => b.onclick = () => incomeSheet(c.projects.find(p => p.id === b.dataset.pay)));
  }
  async function projectForm(p) {
    const cat = (await catalog()).filter(x => x.kind === 'service'), biz = await Platform.businesses().catch(() => []);
    sheet(`<h2 class="sheet-title" id="sheet-t">${p.id ? 'עריכת פרויקט' : 'פרויקט חדש'}</h2><form id="pf" class="stack" novalidate>
      ${p.id ? '' : `<div class="field"><label for="pf-c">מהמחירון</label><select id="pf-c"><option value="">אחר</option>${cat.map(x => `<option value="${x.key}">${esc(x.name)}</option>`).join('')}</select></div>
        <label class="check"><input type="checkbox" id="pf-l" checked>מחיר השקה</label>`}
      <div class="field"><label for="pf-t">שם</label><input id="pf-t" value="${esc(p.title || '')}" required></div>
      <div class="grid2"><div class="field"><label for="pf-st">מצב</label><select id="pf-st">${opts(PROJ, p.status || 'agreed')}</select></div>
        <div class="field"><label for="pf-cm">התחייבות (חודשים)</label><input id="pf-cm" type="number" min="0" max="36" dir="ltr" value="${p.commitment_months ?? 0}"></div></div>
      <div class="grid2"><div class="field"><label for="pf-s">הקמה ₪</label><input id="pf-s" type="number" min="0" dir="ltr" value="${(p.setup_agorot || 0) / 100}"></div>
        <div class="field"><label for="pf-m">חודשי ₪</label><input id="pf-m" type="number" min="0" dir="ltr" value="${(p.monthly_agorot || 0) / 100}"></div></div>
      <div class="field"><label for="pf-tn">עסק בפלטפורמה</label><select id="pf-tn"><option value="">לא בפלטפורמה</option>${biz.map(b => `<option value="${b.id}" ${b.id === p.tenant_id ? 'selected' : ''}>${esc(b.name)} (${esc(b.slug)})</option>`).join('')}</select>
        <span class="hint">כשמקושר, תשלום כאן מעדכן גם את החיוב בפלטפורמה.</span></div>
      <div class="field"><label for="pf-u">קישור</label><input id="pf-u" dir="ltr" value="${esc(p.url || '')}" placeholder="https://"></div>
      <div class="field"><label for="pf-td">מה נשאר לעשות</label><textarea id="pf-td">${esc(p.todo || '')}</textarea></div>
      <p class="error" id="pf-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      const cSel = $('#pf-c', body), launch = $('#pf-l', body);
      const fill = () => { const x = cat.find(c => c.key === cSel.value); if (!x) return; $('#pf-t', body).value = x.name;
        $('#pf-s', body).value = (launch.checked && x.setup_launch != null ? x.setup_launch : x.setup_regular) / 100; $('#pf-m', body).value = x.monthly / 100; $('#pf-cm', body).value = x.commitment; };
      if (cSel) { cSel.onchange = fill; launch.onchange = fill; }
      $('#pf', body).onsubmit = e => { e.preventDefault(); const v = id => $('#' + id, body).value.trim();
        if (!v('pf-t')) { $('#pf-err', body).textContent = 'צריך שם לפרויקט.'; $('#pf-err', body).hidden = false; return; }
        busy(e.target.querySelector('.btn-primary'), async () => {
          await rpc('bo_save_project', { p: { id: p.id || null, client_id: p.client_id, catalog_key: cSel ? cSel.value : undefined, title: v('pf-t'), status: v('pf-st'),
            setup_agorot: shekels(v('pf-s')), monthly_agorot: shekels(v('pf-m')), launch_price: launch ? launch.checked : undefined, commitment_months: +v('pf-cm') || 0,
            tenant_id: v('pf-tn'), url: v('pf-u'), todo: v('pf-td') } });
          closeSheet(); toast('נשמר'); Router.refresh();
        }, $('#pf-err', body)).catch(() => {}); };
    });
  }
  function incomeSheet(p, after) {
    const setupLeft = Math.max(0, p.setup_agorot - (p.paid_setup || 0));
    sheet(`<h2 class="sheet-title" id="sheet-t">תשלום</h2><p class="muted">${esc(p.title)}</p><form id="inf" class="stack" style="margin-top:10px" novalidate>
      <div class="grid2"><div class="field"><label for="in-k">על מה</label><select id="in-k">
          <option value="monthly" ${!setupLeft ? 'selected' : ''}>חודשי</option><option value="setup" ${setupLeft ? 'selected' : ''}>הקמה</option><option value="addon">תוספת</option><option value="other">אחר</option></select></div>
        <div class="field"><label for="in-a">סכום ₪</label><input id="in-a" type="number" inputmode="decimal" min="1" dir="ltr" value="${(setupLeft ? Math.round(setupLeft / 2) : p.monthly_agorot) / 100 || ''}" autofocus></div></div>
      <div class="grid2"><div class="field"><label for="in-m">איך</label><select id="in-m">${opts(METHOD, 'bit')}</select></div>
        <div class="field"><label for="in-d">תאריך</label><input id="in-d" type="date" value="${today()}"></div></div>
      <div class="field"><label for="in-r">מספר קבלה</label><input id="in-r" dir="ltr"></div>
      <p class="hint">${setupLeft ? `נשאר לגבות מההקמה: ${nis(setupLeft)} (הסכום המוצע: חצי, כמקדמה).` : ''}</p>
      <p class="error" id="in-err" hidden></p><button class="btn btn-primary btn-wide">רישום</button></form>`, body => {
      $('#in-k', body).onchange = e => { $('#in-a', body).value = (e.target.value === 'monthly' ? p.monthly_agorot : e.target.value === 'setup' ? setupLeft : 0) / 100 || ''; };
      $('#inf', body).onsubmit = e => { e.preventDefault(); const amt = shekels($('#in-a', body).value);
        if (amt <= 0) { $('#in-err', body).textContent = 'צריך סכום.'; $('#in-err', body).hidden = false; return; }
        busy(e.target.querySelector('.btn-primary'), async () => {
          await rpc('bo_record_income', { p: { project_id: p.id || p.project_id, amount_agorot: amt, kind: $('#in-k', body).value, method: $('#in-m', body).value, paid_on: $('#in-d', body).value, reference: $('#in-r', body).value } });
          closeSheet(); toast('התשלום נרשם'); after ? after() : Router.refresh();
        }, $('#in-err', body)).catch(() => {}); };
    });
  }

  // ---------------------------------------------------------------- money
  async function moneyView() {
    const m = await rpc('bo_money', { p_month: S.month ? S.month + '-01' : null });
    S.month = m.month;
    const inc = m.income.reduce((s, i) => s + i.amount_agorot, 0), exp = m.expenses.reduce((s, e) => s + e.amount_agorot, 0);
    const label = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(m.month + '-15'));
    const owed = m.referrers.filter(r => r.earned - r.paid > 0);
    S._money = m;
    return `${header('כסף')}<div class="wrap">
      <section class="section"><div class="daynav">
        <button class="icon-btn" type="button" data-mo="-1" aria-label="חודש קודם">${icon('i-chevron-right')}</button><span class="label">${esc(label)}</span>
        <button class="icon-btn" type="button" data-mo="1" aria-label="חודש הבא">${icon('i-chevron-left')}</button></div></section>
      <section class="hero" aria-label="סיכום החודש"><span class="lbl">רווח ${esc(label)}</span>
        <div class="hero-main"><span class="hero-time"><bdi dir="ltr">${nis(inc - exp)}</bdi></span></div>
        <div class="hero-stats"><div><span>נכנס</span><b>${nis(inc)}</b></div><div><span>יצא</span><b>${nis(exp)}</b></div><div><span>תשלומים</span><b>${m.income.length}</b></div></div></section>
      ${m.unpaid.length ? `<section class="section"><h2>עוד לא שילמו את החודשי</h2><div class="list">${m.unpaid.map((u, k) => `<div class="item plain">
        <span class="main"><strong>${esc(u.client)}</strong><span>${esc(u.title)} · ${nis(u.monthly)}</span></span>
        <span class="row">${waBtn(u.phone, `היי ${u.client.split(' ')[0]}, תזכורת קטנה לתשלום החודשי של ${u.title} (${Biz.money(u.monthly / 100)}). תודה!`, 'תזכורת')}
          <button class="btn btn-primary btn-sm" type="button" data-unpaid="${k}">שולם</button></span></div>`).join('')}</div></section>` : ''}
      ${owed.length ? `<section class="section"><h2>עמלות לתשלום</h2><div class="list">${owed.map(r => `<div class="item plain">
        <span class="main"><strong>${esc(r.name)}</strong><span>הרוויחה ${nis(r.earned)} · שולם ${nis(r.paid)}</span></span>
        <button class="btn btn-brand btn-sm" type="button" data-payref="${r.id}" data-amt="${r.earned - r.paid}">לשלם ${nis(r.earned - r.paid)}</button></div>`).join('')}</div></section>` : ''}
      <section class="section"><h2>נכנס</h2>${m.income.length ? `<div class="list">${m.income.map(i => `<a class="item plain" href="#/client/${i.client_id}">
        <span class="main"><strong class="num">${nis(i.amount_agorot)}</strong><span>${esc(i.client)} · ${esc(i.project)} · ${METHOD[i.method] || ''}</span></span><span class="small muted">${dateHe(i.paid_on)}</span></a>`).join('')}</div>` : '<p class="muted">אין תשלומים החודש.</p>'}</section>
      <section class="section"><div class="row"><h2 class="grow">יצא</h2><button class="btn btn-soft btn-sm" type="button" id="exp-new">${icon('i-plus')}הוצאה</button></div>
        ${m.expenses.length ? `<div class="list">${m.expenses.map(e => `<div class="item plain"><span class="main"><strong class="num">${nis(e.amount_agorot)}</strong>
          <span>${CAT[e.category]}${e.vendor ? ' · ' + esc(e.vendor) : ''}${e.monthly ? ' · כל חודש' : ''}${e.note ? ' · ' + esc(e.note) : ''}</span></span>
          <button class="icon-btn" type="button" data-delexp="${e.id}" aria-label="מחיקה">${icon('i-trash-2')}</button></div>`).join('')}</div>` : '<p class="muted">אין הוצאות החודש.</p>'}
        ${m.recurring.length ? `<p class="hint">הוצאות קבועות: ${m.recurring.map(e => `${esc(e.vendor || CAT[e.category])} ${nis(e.amount_agorot)}`).join(' · ')}. מוסיפים אותן כל חודש כשהן יורדות.</p>` : ''}</section></div>`;
  }
  function wireMoney(app) {
    const m = S._money;
    $$('[data-mo]', app).forEach(b => b.onclick = () => { const d = new Date(S.month + '-15'); d.setMonth(d.getMonth() + +b.dataset.mo); S.month = d.toISOString().slice(0, 7); Router.refresh(); });
    $$('[data-unpaid]', app).forEach(b => b.onclick = () => { const u = m.unpaid[+b.dataset.unpaid]; incomeSheet({ id: u.project_id, title: u.title, setup_agorot: 0, paid_setup: 0, monthly_agorot: u.monthly }); });
    $$('[data-payref]', app).forEach(b => b.onclick = () => busy(b, async () => { await rpc('bo_pay_referrer', { p_referrer: b.dataset.payref, p_amount: +b.dataset.amt, p_note: 'עמלה' }); S.referrers = null; toast('נרשם ששולם'); Router.refresh(); }).catch(() => {}));
    $$('[data-delexp]', app).forEach(b => b.onclick = () => busy(b, async () => { await rpc('bo_delete_expense', { p_id: b.dataset.delexp }); toast('נמחק'); Router.refresh(); }).catch(() => {}));
    $('#exp-new', app).onclick = () => sheet(`<h2 class="sheet-title" id="sheet-t">הוצאה</h2><form id="ef" class="stack" novalidate>
      <div class="grid2"><div class="field"><label for="ef-a">סכום ₪</label><input id="ef-a" type="number" inputmode="decimal" min="1" dir="ltr" autofocus></div>
        <div class="field"><label for="ef-c">סוג</label><select id="ef-c">${opts(CAT, 'servers')}</select></div></div>
      <div class="grid2"><div class="field"><label for="ef-v">למי</label><input id="ef-v" placeholder="Supabase, דומיין…"></div><div class="field"><label for="ef-d">תאריך</label><input id="ef-d" type="date" value="${today()}"></div></div>
      <div class="field"><label for="ef-n">הערה</label><input id="ef-n"></div>
      <label class="check"><input type="checkbox" id="ef-m">הוצאה קבועה כל חודש</label>
      <p class="error" id="ef-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      $('#ef', body).onsubmit = e => { e.preventDefault(); const amt = shekels($('#ef-a', body).value);
        if (amt <= 0) { $('#ef-err', body).textContent = 'צריך סכום.'; $('#ef-err', body).hidden = false; return; }
        busy(e.target.querySelector('.btn-primary'), async () => { await rpc('bo_save_expense', { p: { amount_agorot: amt, category: $('#ef-c', body).value, vendor: $('#ef-v', body).value, spent_on: $('#ef-d', body).value, note: $('#ef-n', body).value, monthly: $('#ef-m', body).checked } });
          closeSheet(); toast('נשמר'); Router.refresh(); }, $('#ef-err', body)).catch(() => {}); };
    });
  }

  // ---------------------------------------------------------------- more: platform, price list, referrers
  function more() {
    const link = (h, i, l) => `<a href="#${h}">${icon(i)}<span>${l}</span>${icon('i-chevron-left', 'go dir')}</a>`;
    return `${header('עוד')}<div class="wrap"><section class="section"><div class="menu">
      ${link('/platform', 'i-store', 'עסקים בפלטפורמה')}${link('/catalog', 'i-shopping-bag', 'מחירון')}${link('/referrers', 'i-users', 'מפיצות ועמלות')}
      <a href="${P.url('manage/')}">${icon('i-calendar')}<span>אפליקציית העסק</span></a>
      <button type="button" data-signout>${icon('i-arrow-left', 'dir')}<span>יציאה</span></button></div>
      <p class="hint">${esc(API.auth.user() && API.auth.user().email || '')}</p></section></div>`;
  }
  async function catalogView() {
    const cat = S.catalog = await rpc('bo_catalog_list');
    return `${header('מחירון', '/more')}<div class="wrap"><section class="section"><p class="hint">המחירים כאן נכנסים לכל הצעת מחיר חדשה. הצעות שכבר נשלחו לא משתנות.</p>
      <div class="list">${cat.map(c => `<button class="item plain ${c.active ? '' : 'is-off'}" type="button" data-cat="${c.key}"><span class="main"><strong>${esc(c.name)}</strong>
        <span>${c.setup_launch != null ? `השקה ${nis(c.setup_launch)} · רגיל ${nis(c.setup_regular)}` : nis(c.setup_regular)}${c.monthly ? ` · חודשי ${nis(c.monthly)}` : ''}${c.commitment ? ` · ${c.commitment} ח׳ התחייבות` : ''}</span></span>${icon('i-chevron-left', 'dir')}</button>`).join('')}</div></section></div>`;
  }
  function wireCatalog(app) {
    $$('[data-cat]', app).forEach(b => b.onclick = () => { const c = S.catalog.find(x => x.key === b.dataset.cat);
      sheet(`<h2 class="sheet-title" id="sheet-t">${esc(c.name)}</h2><form id="kf" class="stack" novalidate>
        <div class="field"><label for="kf-n">שם</label><input id="kf-n" value="${esc(c.name)}"></div>
        <div class="field"><label for="kf-d">תיאור (נכנס להצעה)</label><input id="kf-d" value="${esc(c.description || '')}"></div>
        <div class="grid2"><div class="field"><label for="kf-r">הקמה רגילה ₪</label><input id="kf-r" type="number" min="0" dir="ltr" value="${c.setup_regular / 100}"></div>
          <div class="field"><label for="kf-l">מחיר השקה ₪ <span class="hint">(ריק = בלי)</span></label><input id="kf-l" type="number" min="0" dir="ltr" value="${c.setup_launch == null ? '' : c.setup_launch / 100}"></div></div>
        <div class="grid2"><div class="field"><label for="kf-m">חודשי ₪</label><input id="kf-m" type="number" min="0" dir="ltr" value="${c.monthly / 100}"></div>
          <div class="field"><label for="kf-c">התחייבות (חודשים)</label><input id="kf-c" type="number" min="0" max="36" dir="ltr" value="${c.commitment}"></div></div>
        <label class="check"><input type="checkbox" id="kf-a" ${c.active ? 'checked' : ''}>פעיל במחירון</label>
        <p class="error" id="kf-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
        $('#kf', body).onsubmit = e => { e.preventDefault(); const v = id => $('#' + id, body).value.trim();
          busy(e.target.querySelector('.btn-primary'), async () => { await rpc('bo_save_catalog', { p: { key: c.key, name: v('kf-n'), description: v('kf-d'), setup_regular: shekels(v('kf-r')),
            setup_launch: v('kf-l') === '' ? null : shekels(v('kf-l')), monthly: shekels(v('kf-m')), commitment: +v('kf-c') || 0, active: $('#kf-a', body).checked } });
            S.catalog = null; closeSheet(); toast('המחירון עודכן'); Router.refresh(); }, $('#kf-err', body)).catch(() => {}); };
      }); });
  }
  async function referrersView() {
    const rs = await referrers(true);
    return `${header('מפיצות ועמלות', '/more', `<button class="btn btn-primary btn-sm" type="button" id="r-new">${icon('i-plus')}מפיצה</button>`)}<div class="wrap"><section class="section">
      ${rs.length ? `<div class="list">${rs.map(r => `<button class="item with-av ${r.active ? '' : 'is-off'}" type="button" data-ref="${r.id}"><span class="avatar round" aria-hidden="true">${esc(ini(r.name))}</span>
        <span class="main"><strong>${esc(r.name)}</strong><span>${r.leads} לידים · ${r.won} נסגרו · ${r.setup_pct}% הקמה, ${r.monthly_pct}% חודשי ל-${r.monthly_months} ח׳</span></span><span></span>
        <span class="num small">${r.earned - r.paid > 0 ? 'חוב ' + nis(r.earned - r.paid) : ''}</span></button>`).join('')}</div>`
      : '<div class="empty card">עוד אין מפיצות. מוסיפים את מי שמביאה לקוחות, ואת אחוזי העמלה שסגרתם.</div>'}</section></div>`;
  }
  function wireReferrers(app) {
    const form = r => sheet(`<h2 class="sheet-title" id="sheet-t">${r.id ? esc(r.name) : 'מפיצה חדשה'}</h2><form id="rf" class="stack" novalidate>
      <div class="grid2"><div class="field"><label for="rf-n">שם</label><input id="rf-n" value="${esc(r.name || '')}" autofocus></div>
        <div class="field"><label for="rf-p">טלפון</label><input id="rf-p" type="tel" dir="ltr" value="${esc(r.phone ? Biz.phone(r.phone).local : '')}"></div></div>
      <div class="grid2"><div class="field"><label for="rf-s">% מההקמה</label><input id="rf-s" type="number" min="0" max="100" step="0.5" dir="ltr" value="${r.setup_pct ?? 15}"></div>
        <div class="field"><label for="rf-m">% מהחודשי</label><input id="rf-m" type="number" min="0" max="100" step="0.5" dir="ltr" value="${r.monthly_pct ?? 10}"></div></div>
      <div class="field"><label for="rf-mm">כמה חודשים מקבלת מהחודשי</label><input id="rf-mm" type="number" min="0" max="120" dir="ltr" value="${r.monthly_months ?? 12}"></div>
      ${r.id ? `<label class="check"><input type="checkbox" id="rf-a" ${r.active ? 'checked' : ''}>פעילה</label>` : ''}
      <p class="error" id="rf-err" hidden></p><button class="btn btn-primary btn-wide">שמירה</button></form>`, body => {
      $('#rf', body).onsubmit = e => { e.preventDefault(); const v = id => $('#' + id, body).value.trim();
        if (!v('rf-n')) { $('#rf-err', body).textContent = 'צריך שם.'; $('#rf-err', body).hidden = false; return; }
        busy(e.target.querySelector('.btn-primary'), async () => { await rpc('bo_save_referrer', { p: { id: r.id || null, name: v('rf-n'), phone: v('rf-p'), setup_pct: +v('rf-s'), monthly_pct: +v('rf-m'), monthly_months: +v('rf-mm'),
          active: $('#rf-a', body) ? $('#rf-a', body).checked : true } }); S.referrers = null; closeSheet(); toast('נשמר'); Router.refresh(); }, $('#rf-err', body)).catch(() => {}); };
    });
    $('#r-new', app).onclick = () => form({});
    $$('[data-ref]', app).forEach(b => b.onclick = () => form(S.referrers.find(r => r.id === b.dataset.ref)));
  }

  // ---------------------------------------------------------------- routes
  Router.route('/login', () => { tabs(false); return Platform.loginView(); }, { title: 'כניסה', after: Platform.wireLogin })
    .route('/', screen(overview), { title: 'סקירה', after: wireOverview })
    .route('/leads', screen(leads), { title: 'לידים', after: wireLeads })
    .route('/clients', screen(clients), { title: 'לקוחות', after: wireClients })
    .route('/money', screen(moneyView), { title: 'כסף', after: wireMoney })
    .route('/more', screen(more), { title: 'עוד' })
    .route('/platform', screen(Platform.home), { title: 'עסקים בפלטפורמה', after: Platform.wireHome })
    .route('/catalog', screen(catalogView), { title: 'מחירון', after: wireCatalog })
    .route('/referrers', screen(referrersView), { title: 'מפיצות', after: wireReferrers })
    .route('*', screen(p => p.startsWith('/client/') ? client(p.slice(8)) : (Router.go('/'), '')), { title: 'לקוח', after: (app, p) => p.startsWith('/client/') && wireClient(app) });
  Router.start({ app: '#app', title: t => `${t} · ${P.name}` });
})();
