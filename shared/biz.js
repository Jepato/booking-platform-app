/* biz.js: the small, boring helpers every Israeli business page needs, done once and right. No dependencies.
   window.Biz = { phone, wa, tel, waze, maps, hours, openNow, days, dur, money, greet, g, ics, gcal, qr }
   Copy it into the site (js/biz.js) and use what you need; delete the rest if you like. Pure functions except ics/qr.
   Times are minutes from midnight; weekdays are 0 = Sunday (יום א׳) … 6 = Saturday (שבת), in Israel time. */
(() => {
  'use strict';
  const TZ = 'Asia/Jerusalem';
  const DAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const DAY_LETTER = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const pad = n => String(n).padStart(2, '0');
  const hhmm = m => `${Math.floor(m / 60) % 24}:${pad(m % 60)}`;

  /* ---- phone: accepts 050-123-4567, 0501234567, +972 50 123 4567, 02-1234567, 077-1234567 ---- */
  function phone(raw) {
    let d = String(raw || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('972')) d = '0' + d.slice(3);
    const mobile = /^05\d{8}$/.test(d), voip = /^07\d{8}$/.test(d), land = /^0[2-489]\d{7}$/.test(d);
    if (!(mobile || voip || land)) return { ok: false, raw, msg: 'מספר טלפון צריך 10 ספרות ולהתחיל ב-05 (או 9 ספרות לקווי)' };
    const local = d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return { ok: true, mobile, local, intl: '972' + d.slice(1), digits: d };
  }
  /* wa.me opens WhatsApp with the text typed in; nothing is sent until the person taps send. Only mobiles have WhatsApp. */
  const wa = (num, text = '') => { const p = phone(num); return p.ok ? `https://wa.me/${p.intl}${text ? '?text=' + encodeURIComponent(text) : ''}` : ''; };
  const tel = num => { const p = phone(num); return p.ok ? `tel:+${p.intl}` : ''; };
  /* Waze: by coordinates when you have them (exact), else by address text */
  const waze = (place) => typeof place === 'object' && place.lat ? `https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(place)}&navigate=yes`;
  const maps = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(typeof place === 'object' && place.lat ? place.lat + ',' + place.lng : place)}`;

  /* ---- Israel time, whatever the visitor's phone is set to ---- */
  function nowIL(date = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date).map(x => [x.type, x.value]));
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { wd, min: +p.hour * 60 + +p.minute, ymd: `${p.year}-${p.month}-${p.day}` };
  }
  const addDays = (ymd, n) => { const t = new Date(ymd + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

  /* hours: { 0:[[540,1140]], 5:[[540,780]], 6:[] }  (several ranges a day are fine: [[540,780],[960,1200]])
     closed: ['2026-12-25', …] dates she is closed (holidays, vacation): she gives them, you don't guess the Hebrew calendar. */
  function openNow(hours, { closed = [], date } = {}) {
    const n = nowIL(date), today = (hours[n.wd] || []);
    const isClosedDay = ymd => closed.includes(ymd);
    if (!isClosedDay(n.ymd)) for (const [a, b] of today) if (n.min >= a && n.min < b)
      return { open: true, closesAt: b, soon: b - n.min <= 45, label: `פתוח עכשיו · עד ${hhmm(b)}` };
    for (let k = 0; k < 14; k++) {             /* the next opening, today later or the coming days */
      const wd = (n.wd + k) % 7, ymd = addDays(n.ymd, k);
      if (isClosedDay(ymd)) continue;
      const r = (hours[wd] || []).find(([a]) => k > 0 || a > n.min);
      if (r) return { open: false, opensAt: r[0], inDays: k, label: `סגור עכשיו · ${k === 0 ? 'נפתח היום' : k === 1 ? 'נפתח מחר' : 'נפתח ביום ' + DAY_LETTER[wd]} ב-${hhmm(r[0])}` };
    }
    return { open: false, label: 'סגור כרגע' };
  }
  /* "א׳–ה׳ 9:00–19:00 · ו׳ 9:00–13:00 · שבת סגור": groups equal days, for the hours section */
  function hoursText(hours, { html = false } = {}) {
    /* html:true wraps each range in ONE <bdi dir="ltr">: two separately isolated times around a dash flip in RTL ("20:00–7:00") */
    const range = (a, b) => html ? `<bdi dir="ltr">${hhmm(a)}–${hhmm(b)}</bdi>` : `${hhmm(a)}–${hhmm(b)}`;
    const key = wd => (hours[wd] || []).map(([a, b]) => range(a, b)).join(', ') || 'סגור';
    const out = []; let s = 0;
    for (let wd = 1; wd <= 7; wd++) if (wd === 7 || key(wd) !== key(s)) { out.push({ days: s === wd - 1 ? DAY_LETTER[s] : `${DAY_LETTER[s]}–${DAY_LETTER[wd - 1]}`, hours: key(s) }); s = wd; }
    return out.map(o => o.days === 'ש׳' && o.hours === 'סגור' ? 'שבת סגור' : `${o.days} ${o.hours}`);
  }

  /* day strip for a picker: [{ ymd, wd, label:'היום'|'מחר'|'יום ג׳', date:'27.5', closed }] */
  function days(n = 14, hours, { closed = [], date } = {}) {
    const t = nowIL(date);
    return Array.from({ length: n }, (_, k) => {
      const ymd = addDays(t.ymd, k), wd = (t.wd + k) % 7, [, m, d] = ymd.split('-');
      return { ymd, wd, label: k === 0 ? 'היום' : k === 1 ? 'מחר' : 'יום ' + DAY_LETTER[wd], date: `${+d}.${+m}`, closed: closed.includes(ymd) || !(hours && hours[wd] && hours[wd].length) };
    });
  }
  /* free slots for a service length inside a day's ranges, minus taken [start,end] pairs, every `step` minutes */
  function slots(ranges = [], minutes, taken = [], step = 15, { after = -1 } = {}) {
    const out = [];
    for (const [a, b] of ranges) for (let s = Math.ceil(a / step) * step; s + minutes <= b; s += step)
      if (s > after && !taken.some(([x, y]) => s < y && s + minutes > x)) out.push({ start: s, label: hhmm(s) });
    return out;
  }

  /* 60 → "שעה", 90 → "שעה וחצי", 120 → "שעתיים", 45 → "45 דק׳" */
  function dur(m) {
    const h = Math.floor(m / 60), r = m % 60, H = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h ? `${h} שעות` : '';
    if (!h) return `${m} דק׳`; if (!r) return H; if (r === 30) return `${H} וחצי`; if (r === 15) return `${H} ורבע`; return `${H} ו-${r} דק׳`;
  }
  const money = (n, cur = 'ILS') => new Intl.NumberFormat('he-IL', { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

  /* greeting by the hour in Israel: for a menu header or a "hello" line, never as a page headline */
  function greet(date) { const h = Math.floor(nowIL(date).min / 60);
    return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 16 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב'; }
  /* Hebrew gender: pick by the business's audience setting ('f' | 'm' | 'n' neutral/plural). g('f', {f:'קבעי תור', m:'קבע תור', n:'לקביעת תור'}) */
  const g = (who, forms) => forms[who] ?? forms.n ?? forms.f ?? forms.m;

  /* ---- add to calendar ---- */
  const icsDate = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  /* returns an object URL for a .ics file: <a href=… download="tor.ics">. start is a Date (build it from the ILyyyy-mm-dd + minutes with ilDate) */
  function ics({ title, start, minutes = 60, location = '', description = '', uid }) {
    const end = new Date(start.getTime() + minutes * 60000);
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bespoke-site//he', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${uid || icsDate(start) + '-' + Math.random().toString(36).slice(2)}@local`, `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${esc(title)}`, `LOCATION:${esc(location)}`, `DESCRIPTION:${esc(description)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  }
  const gcal = ({ title, start, minutes = 60, location = '', description = '' }) =>
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${icsDate(start)}/${icsDate(new Date(start.getTime() + minutes * 60000))}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(description)}`;
  /* an Israel-time date + minutes → a real Date (handles summer/winter time) */
  function ilDate(ymd, min) {
    const guess = new Date(`${ymd}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00Z`);
    const off = (() => { const p = nowIL(guess); return (p.min - (guess.getUTCHours() * 60 + guess.getUTCMinutes()) + 1440) % 1440; })();
    return new Date(guess.getTime() - off * 60000);
  }

  /* ---- QR as inline SVG (needs assets/vendor/qrcode.js, MIT, Kazuhiko Arase). For "share my page" on the owner side. ---- */
  function qr(text, { size = 220, dark = 'currentColor', label = 'קוד QR לעמוד' } = {}) {
    if (typeof qrcode !== 'function') return '';
    const q = qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(text))); q.make();
    const n = q.getModuleCount(), m = 4, s = n + m * 2; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg role="img" aria-label="${label}" viewBox="0 0 ${s} ${s}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="${dark}"/></svg>`;
  }

  const api = { phone, wa, tel, waze, maps, nowIL, openNow, hoursText, days, slots, dur, money, greet, g, ics, gcal, ilDate, qr, hhmm, DAY_HE, DAY_LETTER };
  if (typeof window !== 'undefined') window.Biz = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
