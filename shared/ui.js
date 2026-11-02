/* ui.js — small helpers shared by the owner app and the admin: escaping, icons, toast, one reusable sheet,
   busy buttons, Israel-time formatting, the sign-in screens. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="${PLATFORM.base}shared/icons.svg#${id}"/></svg>`;

  let toastT;
  function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  // the one sheet: sheet(html, wire) fills it, opens it, and calls wire(body) to attach handlers
  function sheet(html, wire) {
    const body = $('#sheet-body'); body.innerHTML = html;
    Sheet.open('#sheet'); wire && wire(body);
    const f = body.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 50);
  }
  const closeSheet = () => Sheet.close('#sheet');

  // run an async action on a button: busy state, error into the sheet / toast
  async function busy(btn, fn, errEl) {
    if (btn) btn.setAttribute('aria-busy', 'true'); if (errEl) errEl.hidden = true;
    try { return await fn(); }
    catch (e) { if (errEl) { errEl.textContent = API.say(e); errEl.hidden = false; } else toast(API.say(e)); throw e; }
    finally { if (btn) btn.removeAttribute('aria-busy'); }
  }

  // ---- time in the business's timezone
  let TZ = 'Asia/Jerusalem';
  const tz = v => { if (v) TZ = v; return TZ; };
  const fmt = (o) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, ...o });
  const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const hm = d => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const dayLong = d => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  const addDays = (s, n) => { const t = new Date(s + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const wd = s => new Date(s + 'T12:00:00Z').getUTCDay();
  const at = (day, minutes) => Biz.ilDate(day, minutes);    // Israel-time day + minutes → Date
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const money = ag => ag == null ? '' : Biz.money(ag / 100);

  // no inline handlers anywhere (the CSP forbids them): [data-reload] buttons reload the page
  document.addEventListener('click', e => { if (e.target.closest('[data-reload]')) location.reload(); });

  window.UI = { $, $$, esc, icon, toast, sheet, closeSheet, busy, tz, ymd, hm, dayLong, addDays, wd, at, hhmm, money };
})();
