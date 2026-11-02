/* book.js — the customer booking app, the same code for every business.
   Which business: ?b=<slug> (dev / shared links), <slug>.<rootDomain>, or the business's own domain.
   Screens: #/ home (the poster) · #/book?s=<service> day + time, summary bar → details sheet · #/t/<token> the ticket. */
(() => {
  'use strict';
  const P = window.PLATFORM, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="${P.base}shared/icons.svg#${id}"/></svg>`;
  const qs = () => new URLSearchParams((location.hash.split('?')[1]) || '');

  let biz = null, TZ = 'Asia/Jerusalem';
  const pick = { service: null, staff: null, day: null, time: null };
  const slotCache = new Map();
  const g = forms => Biz.g((biz && biz.config.audience) || 'n', forms);

  // ---------------------------------------------------------------- time, in the business's timezone
  const ymdOf = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const hm = d => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const minOfDay = d => { const [h, m] = hm(d).split(':'); return +h * 60 + +m; };
  const longDay = d => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  const monthOf = ymd => new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(ymd + 'T12:00:00Z'));
  const addDays = (ymd, n) => { const t = new Date(ymd + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const wdOf = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
  const dm = d => { const [, m, day] = ymdOf(d).split('-'); return `${day}.${m}`; };
  const price = s => s.price_agorot == null ? '' : (s.price_from ? 'מ-' : '') + Biz.money(s.price_agorot / 100);
  const hoursMap = () => { const m = {}; for (const h of biz.hours) (m[h.weekday] = m[h.weekday] || []).push([h.opens_min, h.closes_min]); return m; };
  const dayWord = ymd => { const t = ymdOf(new Date()); return ymd === t ? 'היום' : ymd === addDays(t, 1) ? 'מחר' : 'יום ' + Biz.DAY_LETTER[wdOf(ymd)]; };

  // ---------------------------------------------------------------- which business
  function which() {
    const q = new URLSearchParams(location.search).get('b');
    if (q) return { p_slug: q };
    const h = location.hostname.toLowerCase(), root = P.rootDomain.toLowerCase();
    if (h.endsWith('.' + root)) return { p_slug: h.slice(0, -(root.length + 1)).split('.').pop() };
    return { p_host: h.replace(/^www\./, '') };
  }
  const bookingUrl = token => `${location.origin}${location.pathname}${location.search}#/t/${token}`;

  // ---------------------------------------------------------------- home: the poster
  function home() {
    const c = biz.config || {}, ph = c.photos || {}, hours = hoursMap(), skin = Themes.skinOf(c);
    const open = biz.hours.length ? Biz.openNow(hours, { closed: closedDays() }) : null;
    const addr = biz.address, svc = biz.services, gallery = (ph.gallery || []).filter(Boolean);
    const city = addr ? addr.split(',').pop().trim() : '';
    const contact = [
      addr ? `<a href="${Biz.waze(addr)}" target="_blank" rel="noopener">${icon('i-map-pin')}איך מגיעים</a>` : '',
      biz.phone && Biz.phone(biz.phone).mobile ? `<a href="${Biz.wa(biz.phone, `שלום ${biz.name}, `)}" target="_blank" rel="noopener">${icon('b-whatsapp')}וואטסאפ</a>` : '',
      c.instagram ? `<a href="https://instagram.com/${encodeURIComponent(c.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener">${icon('b-instagram')}אינסטגרם</a>` : '',
      biz.phone ? `<a href="${Biz.tel(biz.phone)}">${icon('i-phone')}חיוג</a>` : '',
    ].join('');
    const nameBlock = `<h1 class="title">${esc(biz.name)}</h1>${c.tagline ? `<p class="tagline">${esc(c.tagline)}</p>` : ''}`;
    document.body.classList.add('has-bar'); document.body.classList.remove('has-sum');
    setTimeout(nearest, 0);
    return `
      <header class="home-head"><div class="wrap">
        <div class="topline"><span class="mark" aria-hidden="true">${ph.logo ? `<img src="${esc(ph.logo)}" alt="">` : esc([...biz.name][0])}</span></div>
        ${ph.cover ? `<div class="cover"><img src="${esc(ph.cover)}" alt="" fetchpriority="high"></div>
            ${skin === 'ink' ? `<div class="ink-band">${nameBlock}</div>` : `<div style="margin-top:18px">${nameBlock}</div>`}`
          : `<div class="poster"><span class="giant" aria-hidden="true">${esc(posterWord())}</span>
               ${biz.hours.length ? `<span class="meta">${todayHours()}</span>` : ''}</div>
             <div style="margin-top:14px">${nameBlock}</div>`}
      </div></header>
      <div class="wrap">
        <div class="chips-row">
          ${city ? `<span class="pill">${esc(city)}</span>` : ''}
          ${open ? `<span class="pill"><span class="dot ${open.open ? 'on' : ''}"></span>${esc(open.open ? `פתוח עד ${Biz.hhmm(open.closesAt)}` : open.label.replace('סגור עכשיו · ', ''))}</span>` : ''}
        </div>
        ${contact ? `<nav class="contact" aria-label="יצירת קשר">${contact}</nav>` : ''}
        <section class="section" aria-labelledby="h-svc">
          <h2 id="h-svc">${g({ f: 'הטיפולים', m: 'השירותים', n: 'השירותים' })}</h2>
          ${svc.length ? `<div class="services">${svc.map(s => `
            <a class="service ${s.photo_url ? 'with-photo' : ''}" href="#/book?s=${s.id}">
              ${s.photo_url ? `<img src="${esc(s.photo_url)}" alt="" loading="lazy">` : ''}
              <span class="name">${esc(s.name)}</span>
              <span class="meta">${Biz.dur(s.duration_min)}</span>
              ${price(s) ? `<span class="price">${price(s)}</span>` : ''}
              ${s.description ? `<span class="desc">${esc(s.description)}</span>` : ''}
            </a>`).join('')}</div>`
          : `<div class="empty">אין עדיין שירותים לקביעה אונליין.${biz.phone ? ` <a class="link" href="${Biz.tel(biz.phone)}">להתקשר לקביעת תור</a>` : ''}</div>`}
        </section>
        ${gallery.length >= 3 ? `<section class="section" aria-labelledby="h-gal"><h2 id="h-gal">מהעבודות</h2>
          <div class="gallery">${gallery.map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div></section>` : ''}
        ${c.about ? `<section class="section" aria-labelledby="h-about"><h2 id="h-about">עלינו</h2><p class="about">${esc(c.about)}</p></section>` : ''}
        ${biz.hours.length || addr ? `<section class="section hours" aria-labelledby="h-hours"><h2 id="h-hours">שעות ומיקום</h2>
          ${biz.hours.length ? `<ul>${Biz.hoursText(hours).map(l => { const [d, ...r] = l.split(' '); return `<li><span>${esc(d)}</span><bdi dir="ltr">${esc(r.join(' '))}</bdi></li>`; }).join('')}</ul>` : ''}
          ${closedNotes()}
          ${addr ? `<p>${esc(addr)} · <a class="link" href="${Biz.waze(addr)}" target="_blank" rel="noopener">ניווט בוויז</a></p>` : ''}
        </section>` : ''}
      </div>
      <footer class="foot">קביעת תורים: ${esc(P.name)} · <a href="#/privacy">פרטיות</a></footer>
      ${svc.length ? `<div class="cta-bar"><div><a class="slab" href="#/book"><span>${g({ f: 'קבעי תור', m: 'קבע תור', n: 'קביעת תור' })}</span><span class="key">${icon('i-chevron-left', 'dir')}</span></a>
        <p class="cta-note" id="nearest" aria-live="polite"></p></div></div>` : ''}`;
  }
  // the poster word: the business's own word, not the generic one ("סטודיו נועה" → "נועה"); config.poster overrides
  const GENERIC = /^(ה?סטודיו|ה?מספרה|מספרת|ה?סלון|סלון|קליניקת|ה?קליניקה|מכון|ה?מכון|של|ה?בית|בית|ציפורניים|ה?טיפוח|אטלייה|מעבדת|by)$/;
  const posterWord = () => (biz.config.poster || biz.name.split(/[\s·\-]+/).find(w => w && !GENERIC.test(w)) || biz.name.split(/\s/)[0]);
  const todayHours = () => { const n = Biz.nowIL(), r = hoursMap()[n.wd] || []; return r.length ? `${Biz.DAY_HE[n.wd]} · <bdi dir="ltr">${r.map(([a, b]) => `${Biz.hhmm(a)}–${Biz.hhmm(b)}`).join(', ')}</bdi>` : `${Biz.DAY_HE[n.wd]} · סגור`; };
  // a true line under the button: the nearest free time (not a promise)
  async function nearest() {
    const el = $('#nearest'); if (!el || !biz.services.length) return;
    try {
      const xs = await API.rpc('public_slots', { p_tenant: biz.id, p_service: biz.services[0].id, p_from: ymdOf(new Date()), p_days: 7 });
      if (xs.length) { const d = new Date(xs[0].starts_at); el.textContent = `התור הפנוי הקרוב: ${dayWord(ymdOf(d))} ב-${hm(d)}`; }
    } catch {}
  }
  function closedDays() {
    const out = [];
    for (const c of biz.closed) { let d = ymdOf(new Date(c.starts_at)); const end = ymdOf(new Date(new Date(c.ends_at) - 1));
      for (let i = 0; i < 90 && d <= end; i++, d = addDays(d, 1)) out.push(d); }
    return out;
  }
  function closedNotes() {
    const soon = biz.closed.filter(c => new Date(c.starts_at) < Date.now() + 21 * 864e5).slice(0, 3);
    return soon.length ? `<p class="closed-note">${soon.map(c => `סגור ${esc(longDay(new Date(c.starts_at)))}${ymdOf(new Date(c.starts_at)) !== ymdOf(new Date(new Date(c.ends_at) - 1)) ? ' עד ' + esc(longDay(new Date(new Date(c.ends_at) - 1))) : ''}`).join(' · ')}</p>` : '';
  }

  // ---------------------------------------------------------------- pick a day and a time
  const eligibleStaff = sid => biz.staff.filter(st => !st.service_ids.length || st.service_ids.includes(sid)
    || !biz.staff.some(x => x.service_ids.includes(sid)));
  function book() {
    document.body.classList.remove('has-bar');
    const sid = qs().get('s');
    if (sid && biz.services.some(s => s.id === sid)) { if (pick.service !== sid) { pick.service = sid; pick.staff = null; pick.day = null; pick.time = null; } }
    const s = biz.services.find(x => x.id === pick.service);
    const staff = s ? eligibleStaff(s.id) : [];
    const chooseStaff = biz.rules.choose_staff && staff.length > 1;
    document.body.classList.toggle('has-sum', !!s);
    return `
      <div class="wrap">
        <div class="flow-top">
          <a class="icon-btn" href="${s ? '#/' : '#/'}" aria-label="חזרה">${icon('i-arrow-right')}</a>
          <span class="steps" aria-hidden="true"><i class="on"></i><i class="${s ? 'on' : ''}"></i><i></i></span>
          <span class="lbl">${s ? 'שלב 2 מתוך 3' : 'שלב 1 מתוך 3'}</span>
        </div>
        ${s ? `
          <h1 class="flow-title">${g({ f: 'בחרי יום ושעה', m: 'בחר יום ושעה', n: 'בחירת יום ושעה' })}</h1>
          <p class="flow-sub"><b id="month"></b> · ${Biz.dur(s.duration_min)} · שעון ישראל</p>
          <div class="chosen" style="margin-top:14px"><div><span class="step-label">שירות</span><br><strong>${esc(s.name)}</strong></div>
            <button class="btn btn-quiet" type="button" id="change-svc">שינוי</button></div>
          ${chooseStaff ? `<section class="step" aria-labelledby="st-staff"><h2 id="st-staff" class="step-label">אצל מי</h2>
            <div class="chips" role="group" aria-labelledby="st-staff">
              <button class="chip" type="button" data-staff="" aria-pressed="${!pick.staff}">לא משנה לי</button>
              ${staff.map(st => `<button class="chip" type="button" data-staff="${st.id}" aria-pressed="${pick.staff === st.id}">${esc(st.name)}</button>`).join('')}
            </div></section>` : ''}
          <section class="step" aria-label="יום"><div class="days" id="days" role="group" aria-label="יום"></div></section>
          <div class="bigtime" aria-live="polite"><span class="num" id="big-time">--:--</span><p id="big-sub">&nbsp;</p></div>
          <section class="step" aria-label="שעה" style="padding-top:4px"><div id="times" class="times"></div></section>`
        : `
          <h1 class="flow-title">${g({ f: 'מה עושות היום?', m: 'מה עושים היום?', n: 'איזה שירות?' })}</h1>
          <div class="services" style="margin-top:18px">${biz.services.map(x => `<a class="service" href="#/book?s=${x.id}"><span class="name">${esc(x.name)}</span><span class="meta">${Biz.dur(x.duration_min)}</span>${price(x) ? `<span class="price">${price(x)}</span>` : ''}</a>`).join('')}</div>`}
      </div>
      ${s ? `<div class="sumbar" role="region" aria-label="סיכום">
        <div class="what"><strong>${esc(s.name)}</strong><span id="sum-when">בחירת שעה</span></div>
        ${price(s) ? `<span class="price">${price(s)}</span>` : ''}
        <button class="btn" type="button" id="continue" disabled>המשך ${icon('i-chevron-left', 'dir')}</button></div>` : ''}`;
  }
  function wireBook(app) {
    const b = app.querySelector('#change-svc'); if (b) b.onclick = () => { pick.service = null; history.replaceState(null, '', '#/book'); Router.refresh(); };
    app.querySelectorAll('[data-staff]').forEach(btn => btn.onclick = () => {
      pick.staff = btn.dataset.staff || null; pick.day = null; pick.time = null;
      app.querySelectorAll('[data-staff]').forEach(x => x.setAttribute('aria-pressed', x === btn)); loadDays();
    });
    const go = app.querySelector('#continue'); if (go) go.onclick = () => pick.time && openDetails(pick.time);
    if (pick.service) loadDays();
  }

  async function slots(from, days) {
    const key = [pick.service, pick.staff, from, days].join('|');
    if (!slotCache.has(key)) slotCache.set(key, API.rpc('public_slots', { p_tenant: biz.id, p_service: pick.service, p_from: from, p_days: days, p_staff: pick.staff })
      .then(list => list.map(x => ({ at: new Date(x.starts_at), staff: x.staff_ids })))
      .catch(e => { slotCache.delete(key); throw e; }));
    return slotCache.get(key);
  }
  let byDay = new Map();
  async function loadDays() {
    const daysEl = $('#days'), timesEl = $('#times'); if (!daysEl) return;
    const today = ymdOf(new Date()), horizon = Math.min(biz.rules.max_days_ahead, 28);
    daysEl.innerHTML = Array.from({ length: 7 }, () => '<div class="day" aria-hidden="true"><span class="d2">·</span></div>').join('');
    timesEl.innerHTML = '<div class="grid-times">' + '<div class="skeleton"></div>'.repeat(6) + '</div>';
    let all;
    try {
      const parts = []; for (let k = 0; k < horizon; k += 14) parts.push(slots(addDays(today, k), Math.min(14, horizon - k)));
      all = (await Promise.all(parts)).flat();
    } catch (e) { timesEl.innerHTML = `<div class="empty">${esc(API.say(e))}<button class="btn btn-ghost" type="button" id="retry">לנסות שוב</button></div>`; daysEl.innerHTML = '';
      $('#retry').onclick = loadDays; return; }
    byDay = new Map(); for (const s of all) { const k = ymdOf(s.at); (byDay.get(k) || byDay.set(k, []).get(k)).push(s); }
    const list = Array.from({ length: horizon }, (_, k) => addDays(today, k));
    if (!pick.day || !byDay.has(pick.day)) pick.day = list.find(d => byDay.has(d)) || null;
    daysEl.innerHTML = list.map((d, k) => {
      const n = (byDay.get(d) || []).length, closed = !(hoursMap()[wdOf(d)] || []).length;
      return `<button class="day" type="button" data-day="${d}" aria-pressed="${d === pick.day}" ${n ? '' : 'disabled'}
        aria-label="${k === 0 ? 'היום' : k === 1 ? 'מחר' : 'יום ' + Biz.DAY_HE[wdOf(d)]} ${+d.slice(8)}.${+d.slice(5, 7)}${n ? '' : ', אין תורים'}">
        <span class="d1">${Biz.DAY_LETTER[wdOf(d)]}</span><span class="d2">${+d.slice(8)}</span><span class="d3">${k === 0 ? 'היום' : !n ? (closed ? 'סגור' : 'מלא') : ''}</span></button>`;
    }).join('');
    daysEl.querySelectorAll('[data-day]').forEach(btn => btn.onclick = () => {
      pick.day = btn.dataset.day; pick.time = null; daysEl.querySelectorAll('[data-day]').forEach(x => x.setAttribute('aria-pressed', x === btn)); showTimes();
    });
    const sel = daysEl.querySelector('[aria-pressed=true]'); if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
    showTimes();
  }
  function setTime(at) {
    pick.time = at;
    const s = biz.services.find(x => x.id === pick.service);
    $('#big-time').textContent = at ? hm(at) : '--:--';
    $('#big-sub').textContent = at ? `פנוי · מסתיים ב-${hm(new Date(at.getTime() + s.duration_min * 60000))}` : ' ';
    $('#sum-when').textContent = at ? `${dayWord(pick.day)} · ${hm(at)}` : 'בחירת שעה';
    $('#continue').disabled = !at;
    document.querySelectorAll('#times [data-at]').forEach(b => b.setAttribute('aria-pressed', !!at && b.dataset.at === at.toISOString()));
  }
  function showTimes() {
    const el = $('#times'), list = byDay.get(pick.day) || [];
    $('#month').textContent = pick.day ? monthOf(pick.day) : '';
    if (!pick.day) {
      setTime(null);
      el.innerHTML = `<div class="empty">אין תורים פנויים ב-${Math.min(biz.rules.max_days_ahead, 28)} הימים הקרובים${pick.staff ? ' אצל מי שנבחר/ה. אפשר לבחור "לא משנה לי".' : '.'}
        ${biz.phone && Biz.phone(biz.phone).mobile ? `<a class="btn btn-ghost" href="${Biz.wa(biz.phone, `שלום, אני מחפש/ת תור ל${(biz.services.find(s => s.id === pick.service) || {}).name || ''}. יש משהו פנוי?`)}" target="_blank" rel="noopener">${icon('b-whatsapp')}לשאול בוואטסאפ</a>` : ''}</div>`;
      return;
    }
    const parts = [['בוקר', 0, 720], ['צהריים', 720, 1020], ['ערב', 1020, 1440]];
    el.innerHTML = `<div><button class="earliest" type="button" data-at="${list[0].at.toISOString()}">${icon('i-clock')}המוקדם ביותר · ${hm(list[0].at)}</button></div>` +
      parts.map(([label, a, b]) => {
        const xs = list.filter(s => { const m = minOfDay(s.at); return m >= a && m < b; });
        return xs.length ? `<div><h3>${label}</h3><div class="grid-times">${xs.map(s => `<button class="time" type="button" aria-pressed="false" data-at="${s.at.toISOString()}">${hm(s.at)}</button>`).join('')}</div></div>` : '';
      }).join('');
    el.querySelectorAll('[data-at]').forEach(btn => btn.onclick = () => setTime(new Date(btn.dataset.at)));
    setTime(pick.time && list.some(s => s.at.getTime() === pick.time.getTime()) ? pick.time : list[0].at);
  }

  // ---------------------------------------------------------------- details → book
  const remember = { get() { try { return JSON.parse(localStorage.getItem('book.me')) || {}; } catch { return {}; } },
                     set(v) { try { localStorage.setItem('book.me', JSON.stringify(v)); } catch {} } };
  function openDetails(at) {
    pick.time = at;
    const s = biz.services.find(x => x.id === pick.service), st = biz.staff.find(x => x.id === pick.staff);
    $('#details-sum').textContent = `${s.name} · ${longDay(at)} · ${hm(at)}${st ? ' · אצל ' + st.name : ''}`;
    const me = remember.get(), f = $('#details-form');
    if (!f.name.value) f.name.value = me.name || ''; if (!f.phone.value) f.phone.value = me.phone || '';
    $('#details-error').hidden = true; [f.name, f.phone].forEach(i => i.removeAttribute('aria-invalid'));
    Sheet.open('#details');
    if (P.turnstileSiteKey) turnstile();
  }
  // bot protection (Cloudflare Turnstile), only when a site key is configured; usually invisible to people
  let tsWidget = null;
  function turnstile() {
    const box = $('#ts'); box.hidden = false;
    const render = () => { if (tsWidget === null) tsWidget = window.turnstile.render(box, { sitekey: P.turnstileSiteKey, language: 'he', appearance: 'interaction-only' }); else window.turnstile.reset(tsWidget); };
    if (window.turnstile) return render();
    if (!document.getElementById('ts-script')) {
      const s = document.createElement('script'); s.id = 'ts-script'; s.async = true;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.onload = render; document.head.appendChild(s);
    }
  }
  $('#details-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = $('#details-error'), btn = $('#details-submit');
    const name = f.name.value.trim(), ph = Biz.phone(f.phone.value);
    f.name.setAttribute('aria-invalid', !name); f.phone.setAttribute('aria-invalid', !ph.ok);
    if (!name || !ph.ok) { err.textContent = !name ? 'צריך שם.' : 'מספר נייד: 10 ספרות, מתחיל ב-05.'; err.hidden = false; (!name ? f.name : f.phone).focus(); return; }
    btn.setAttribute('aria-busy', 'true'); btn.textContent = 'קובעים…'; err.hidden = true;
    try {
      const args = { p_tenant: biz.id, p_service: pick.service, p_starts_at: pick.time.toISOString(),
        p_name: name, p_phone: ph.digits, p_staff: pick.staff, p_note: f.note.value.trim() || null };
      let r;
      if (P.turnstileSiteKey) {
        const tok = window.turnstile && tsWidget !== null ? window.turnstile.getResponse(tsWidget) : '';
        if (!tok) { const e = new Error('bot_check_pending'); e.code = 'bot_check_pending'; throw e; }
        r = await API.bookProtected(args, tok);
        window.turnstile.reset(tsWidget);
      } else r = await API.rpc('public_book', args);
      remember.set({ name, phone: ph.local }); f.note.value = '';
      slotCache.clear(); pick.time = null;
      Sheet.close('#details'); location.hash = '#/t/' + r.token;
    } catch (ex) {
      err.textContent = API.say(ex); err.hidden = false;
      if (ex.code === 'slot_taken') { slotCache.clear(); pick.time = null; setTimeout(() => { Sheet.close('#details'); loadDays(); }, 1600); }
    } finally { btn.removeAttribute('aria-busy'); btn.textContent = 'קביעת התור'; }
  });

  // ---------------------------------------------------------------- the ticket
  function barcode(token) {   // decorative, drawn from the booking's own code (not a scannable barcode)
    let x = 0, bars = '';
    for (const ch of token.slice(0, 28)) { const v = parseInt(ch, 16) || 0, w = 1 + (v % 3); bars += `<rect x="${x}" width="${w}" height="34"/>`; x += w + 1 + ((v >> 2) % 2); }
    return `<svg class="barcode" viewBox="0 0 ${x} 34" width="${x * 1.6}" height="34" aria-hidden="true" fill="currentColor">${bars}</svg>`;
  }
  async function ticket(token) {
    document.body.classList.remove('has-bar', 'has-sum');
    let b;
    try { b = await API.rpc('public_booking', { p_token: token }); }
    catch (e) { return `<div class="state"><h1>לא מצאנו את התור</h1><p>${esc(API.say(e))}</p><a class="btn btn-primary" href="#/">לעמוד של ${esc(biz.name)}</a></div>`; }
    const at = new Date(b.starts_at), end = new Date(b.ends_at), cancelled = b.status === 'cancelled';
    let fresh = false;
    try { fresh = sessionStorage.getItem('t.' + token) === null; sessionStorage.setItem('t.' + token, '1'); } catch {}
    const title = `${b.service} · ${b.business.name}`;
    const cal = { title, start: at, minutes: b.duration_min, location: b.business.address || '', description: `ניהול התור: ${bookingUrl(token)}` };
    const hours = Math.round(b.cancel_until_min / 60);
    ticket.current = { b, token };
    return `
      <div class="wrap">
        <div class="flow-top"><a class="icon-btn" href="#/" aria-label="לעמוד העסק">${icon('i-arrow-right')}</a><span class="lbl">${esc(b.business.name)}</span></div>
        <div class="done-head">
          <span class="check">${icon(cancelled ? 'i-x' : 'i-check')}</span>
          <div><h1>${cancelled ? 'התור בוטל' : fresh ? 'התור נקבע' : 'התור שלך'}</h1>
            <p>${esc(b.service)}, ${esc(longDay(at))} ב-${hm(at)}</p></div>
        </div>
        <article class="ticket ${cancelled ? 'is-cancelled' : ''}" aria-label="פרטי התור">
          <div class="ticket-top">
            <div class="ticket-row"><span class="code">קוד התור <bdi dir="ltr">${esc(token.slice(0, 4).toUpperCase())}</bdi></span><span class="status">${cancelled ? 'בוטל' : 'מאושר'}</span></div>
            <div><div class="ticket-biz">${esc(b.business.name)}</div><div class="ticket-svc">${esc(b.service)} · אצל ${esc(b.staff)}</div></div>
            <div class="ticket-when">
              <div><span class="lbl">${esc(dayWord(ymdOf(at)))}</span><div class="num"><bdi dir="ltr">${dm(at)}</bdi></div><small>${esc(longDay(at).split(',')[0])}</small></div>
              <div><span class="lbl">שעה</span><div class="num"><bdi dir="ltr">${hm(at)}</bdi></div><small>עד ${hm(end)}</small></div>
            </div>
          </div>
          <div class="perf" aria-hidden="true"></div>
          <div class="ticket-stub">
            <div><span class="lbl">על שם</span><b>${esc(b.customer_name)}</b></div>
            ${barcode(token)}
            <div><span class="lbl">מחיר</span><b class="num" style="font-size:20px">${b.price_agorot != null ? (b.price_from ? 'מ-' : '') + Biz.money(b.price_agorot / 100) : '–'}</b></div>
          </div>
        </article>
        ${cancelled ? `<div class="actions"><a class="btn btn-ink btn-wide" href="#/book">לקבוע תור חדש</a></div>` : `
        <div class="actions">
          <div class="actions-row">
            <a class="btn btn-ink" href="${Biz.ics(cal)}" download="tor.ics">${icon('i-calendar-plus')}הוספה ליומן</a>
            ${b.business.phone && Biz.phone(b.business.phone).mobile ? `<a class="btn btn-ghost" href="${Biz.wa(b.business.phone, `שלום, קבעתי תור ל${b.service} ב${longDay(at)} ב-${hm(at)} על שם ${b.customer_name}.`)}" target="_blank" rel="noopener">${icon('b-whatsapp')}הודעה לעסק</a>`
              : `<a class="btn btn-ghost" href="${Biz.gcal(cal)}" target="_blank" rel="noopener">${icon('i-calendar')}גוגל</a>`}
          </div>
          ${b.business.address ? `<a class="btn btn-soft btn-wide" href="${Biz.waze(b.business.address)}" target="_blank" rel="noopener">${icon('b-waze')}ניווט בוויז</a>` : ''}
          ${b.cancellable ? `<button class="btn btn-soft btn-wide" type="button" id="t-cancel">ביטול התור</button>
            <p class="hint" style="text-align:center">אפשר לבטל כאן עד ${hours >= 1 ? hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : hours + ' שעות' : b.cancel_until_min + ' דקות'} לפני התור.</p>`
          : `<p class="hint" style="text-align:center">לביטול או שינוי עכשיו: ${b.business.phone ? `<a class="link" href="${Biz.tel(b.business.phone)}">להתקשר לעסק</a>` : 'צריך לפנות לעסק'}.</p>`}
        </div>
        <div class="note-box">
          <p>זה הקישור לתור. אפשר לחזור אליו כדי לראות או לבטל.</p>
          <div class="copy-row" style="margin-top:8px"><input id="t-link" readonly value="${esc(bookingUrl(token))}" aria-label="הקישור לתור" dir="ltr"><button class="btn btn-ghost" type="button" id="t-copy">${icon('i-copy')}העתקה</button></div>
        </div>`}
        <div style="height:28px"></div>
      </div>`;
  }
  function wireTicket(app) {
    const copy = app.querySelector('#t-copy');
    if (copy) copy.onclick = async () => { const i = $('#t-link');
      try { await navigator.clipboard.writeText(i.value); copy.lastChild.textContent = 'הועתק'; } catch { i.select(); } };
    const c = app.querySelector('#t-cancel');
    if (c) c.onclick = () => { const { b } = ticket.current; $('#cancel-sum').textContent = `${b.service} · ${longDay(new Date(b.starts_at))} · ${hm(new Date(b.starts_at))}`;
      $('#cancel-error').hidden = true; Sheet.open('#cancel'); };
  }
  $('#cancel-yes').onclick = async () => {
    const btn = $('#cancel-yes'); btn.setAttribute('aria-busy', 'true');
    try { await API.rpc('public_cancel', { p_token: ticket.current.token }); slotCache.clear(); Sheet.close('#cancel'); Router.refresh(); }
    catch (e) { $('#cancel-error').textContent = API.say(e); $('#cancel-error').hidden = false; }
    finally { btn.removeAttribute('aria-busy'); }
  };

  // ---------------------------------------------------------------- privacy (a plain, honest page per business; a draft for a lawyer to approve)
  function privacy() {
    document.body.classList.remove('has-bar', 'has-sum');
    const n = esc(biz.name), contact = biz.phone ? `<bdi dir="ltr">${esc(Biz.phone(biz.phone).local || biz.phone)}</bdi>` : 'דרך פרטי הקשר בעמוד';
    return `<div class="wrap" style="padding-bottom:40px">
      <div class="flow-top"><a class="icon-btn" href="#/" aria-label="חזרה">${icon('i-arrow-right')}</a><span class="lbl">${n}</span></div>
      <h1 class="flow-title">מדיניות פרטיות</h1>
      <div class="stack" style="gap:14px;margin-top:16px">
        <p><b>מי אחראי על המידע.</b> ${n} (״העסק״) הוא בעל המידע שנמסר בעמוד הזה. המערכת שמפעילה את העמוד, ${esc(P.name)}, שומרת אותו בשביל העסק ולא משתמשת בו לשום מטרה אחרת.</p>
        <p><b>מה נשמר.</b> השם, מספר הטלפון וההערה שכתבת בקביעת התור, וגם פרטי התורים שלך (שירות, מועד, הגעה או ביטול). לא נאספים כרטיס אשראי, מיקום או פרטים אחרים.</p>
        <p><b>למה.</b> כדי לנהל את התור: לשמור לך מקום, ליצור קשר לגבי התור, לשלוח תזכורת, ולהציג לעסק את היסטוריית הביקורים שלך. המידע לא נמכר ולא מועבר לפרסום.</p>
        <p><b>מי רואה.</b> העסק והצוות שלו, כל אחד רק את מה שהוא צריך. מסד הנתונים מוגן בהרשאות, והתקשורת מוצפנת (HTTPS).</p>
        <p><b>במכשיר שלך.</b> כדי לחסוך הקלדה בפעם הבאה, השם והטלפון נשמרים גם בדפדפן שלך בלבד. אפשר למחוק אותם בניקוי נתוני האתר. אין עוגיות פרסום ואין מעקב.</p>
        <p><b>כמה זמן.</b> כל עוד העסק משתמש במערכת, או עד שתבקש/י למחוק.</p>
        <p><b>הזכויות שלך.</b> אפשר לבקש מהעסק לראות, לתקן או למחוק את הפרטים שלך ואת כל התורים, ב-${contact}. המחיקה מוחקת גם את היסטוריית התורים, ולא ניתן לשחזר אותה.</p>
        <p class="hint">עודכן: נובמבר 2026.</p>
      </div></div>`;
  }

  // ---------------------------------------------------------------- start
  async function start() {
    try { biz = await API.rpc('public_business', which()); }
    catch (e) {
      $('#app').innerHTML = `<div class="state"><h1>${e.code === 'not_found' ? 'העמוד הזה לא פעיל' : 'לא הצלחנו לטעון'}</h1><p>${esc(e.code === 'not_found' ? 'בדקו את הכתובת, או פנו לעסק ישירות.' : API.say(e))}</p>${e.code === 'not_found' ? '' : '<button class="btn btn-primary" data-reload>לנסות שוב</button>'}</div>`;
      return;
    }
    TZ = biz.timezone || TZ; biz.config = biz.config || {};
    Themes.apply(biz.config);
    document.title = `${biz.name} · קביעת תור`;
    // "add to home screen" installs THIS business's app: its name, colour and icon
    const q = new URLSearchParams(location.search).get('b') ? `?b=${encodeURIComponent(new URLSearchParams(location.search).get('b'))}` : '';
    const head = (tag, attrs) => { const el = document.createElement(tag); Object.assign(el, attrs); document.head.appendChild(el); };
    if (P.subdomains) {   // the per-business manifest and icon come from the Cloudflare worker (not on GitHub Pages / localhost dev)
      head('link', { rel: 'manifest', href: P.base + 'manifest.webmanifest' + q });
      head('link', { rel: 'icon', href: P.base + 'icon.svg' + q, type: 'image/svg+xml' });
    }
    if ((biz.config.photos || {}).logo) head('link', { rel: 'apple-touch-icon', href: biz.config.photos.logo });
    head('meta', { name: 'apple-mobile-web-app-title', content: biz.name });
    head('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    const d = document.querySelector('meta[name=description]'); if (d) d.content = biz.config.tagline || `קביעת תור ב${biz.name}`;
    Router.route('/', home, { title: biz.name })
      .route('/book', book, { title: 'קביעת תור', after: wireBook })
      .route('/privacy', privacy, { title: 'מדיניות פרטיות' })
      .route('*', async p => p.startsWith('/t/') ? ticket(p.slice(3)) : home(), { after: (app, p) => p.startsWith('/t/') && wireTicket(app) });
    Router.start({ app: '#app', title: t => t ? `${t} · ${biz.name}` : biz.name });
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-reload]')) location.reload(); });
  start();
})();
