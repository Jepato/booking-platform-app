/* api.js — the apps' only door to the data: Supabase's REST endpoints, called with fetch (no SDK, nothing to build).
   API.rpc('public_slots', { p_tenant, … })  → the function's JSON, or throws an Error whose .code is the short code
   API.auth.signIn(email, pw) / signUp / signOut / recover / setPassword / user()
   API.upload(tenantId, file, name) → public URL      API.say(err) → a sentence in Hebrew for the person */
(() => {
  'use strict';
  const P = window.PLATFORM, KEY = 'platform.session';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set(s) { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {} },
  };
  let session = store.get(), refreshing = null;

  async function token() {
    if (!session) return null;
    if (session.expires_at && session.expires_at * 1000 - Date.now() < 60e3) {
      refreshing = refreshing || refresh().finally(() => { refreshing = null; });
      await refreshing;
    }
    return session && session.access_token;
  }
  async function refresh() {
    try { setSession(await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }, false)); }
    catch { setSession(null); }
  }
  function setSession(s) { session = s && s.access_token ? s : null; store.set(session); }

  async function call(path, body, auth = true, method = 'POST') {
    const headers = { apikey: P.anonKey, 'content-type': 'application/json' };
    const t = auth ? await token() : null;
    headers.authorization = 'Bearer ' + (t || P.anonKey);
    let res;
    try { res = await fetch(P.supabaseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { const e = new Error('offline'); e.code = 'offline'; throw e; }
    const text = await res.text(); let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.msg || data.error_description || data.error)) || res.statusText;
      const e = new Error(msg); e.status = res.status;
      e.code = /^[a-z_]+$/.test(msg) ? msg : res.status === 401 ? 'signed_out' : /permission denied|forbidden/i.test(msg) ? 'forbidden' : msg;
      if (res.status === 401 && auth && session) setSession(null);
      throw e;
    }
    return data;
  }

  const rpc = (fn, args = {}) => call('/rest/v1/rpc/' + fn, args);

  const auth = {
    get session() { return session; },
    user: () => session && session.user,
    async signIn(email, password) { setSession(await call('/auth/v1/token?grant_type=password', { email: email.trim(), password }, false)); return session.user; },
    // Supabase returns a session at once when e-mail confirmation is off, or only a user when it is on
    async signUp(email, password) {
      const r = await call('/auth/v1/signup', { email: email.trim(), password }, false);
      if (r && r.access_token) setSession(r);
      return { needsConfirm: !(r && r.access_token) };
    },
    async signOut() { try { await call('/auth/v1/logout', {}, true); } catch {} setSession(null); },
    recover: (email, redirectTo) => call('/auth/v1/recover' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), { email: email.trim() }, false),
    setPassword: password => call('/auth/v1/user', { password }, true, 'PUT'),
    // after an e-mail link (confirm / reset) Supabase lands on the page with #access_token=…&refresh_token=…
    takeFromUrl() {
      const h = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
      if (!h.get('access_token')) return null;
      setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_at: +h.get('expires_at') || 0, user: null });
      history.replaceState(null, '', location.pathname + location.search);
      return h.get('type') || 'signin';
    },
    async load() { if (session && !session.user) { session.user = await call('/auth/v1/user', undefined, true, 'GET'); store.set(session); } return session && session.user; },
  };

  // photos: resized and re-encoded in the browser (EXIF and location are dropped), then stored under the business's folder
  async function upload(tenantId, file, base = 'photo', max = 1600) {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.84)) || await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const name = `${base}-${Date.now().toString(36)}.${ext}`;
    const res = await fetch(`${P.supabaseUrl}/storage/v1/object/media/${tenantId}/${name}`, {
      method: 'POST', body: blob,
      headers: { apikey: P.anonKey, authorization: 'Bearer ' + await token(), 'content-type': blob.type, 'x-upsert': 'true' } });
    if (!res.ok) { const e = new Error('upload_failed'); e.code = res.status === 413 ? 'too_big' : 'upload_failed'; throw e; }
    return `${P.supabaseUrl}/storage/v1/object/public/media/${tenantId}/${name}`;
  }

  const SAY = {
    offline: 'אין חיבור לאינטרנט כרגע. נסו שוב בעוד רגע.',
    slot_taken: 'השעה הזו נתפסה הרגע. בחרו שעה אחרת.',
    too_many_open: 'יש כבר כמה תורים פתוחים על המספר הזה. לשינוי, דברו עם העסק.',
    invalid_phone: 'מספר הטלפון לא נראה תקין. 10 ספרות, מתחיל ב-05.',
    invalid_name: 'צריך שם (עד 60 תווים).',
    note_too_long: 'ההערה ארוכה מדי (עד 300 תווים).',
    rate_limited: 'נקבעו הרבה תורים מהמכשיר הזה בשעה האחרונה. נסו שוב מאוחר יותר או התקשרו לעסק.',
    not_found: 'לא מצאנו את זה. אולי הקישור ישן.',
    not_active: 'התור הזה כבר לא פעיל.',
    too_late_to_cancel: 'כבר מאוחר מדי לבטל דרך הקישור. כדאי להתקשר לעסק.',
    forbidden: 'אין הרשאה לפעולה הזו.',
    signed_out: 'צריך להתחבר שוב.',
    admin_only: 'רק מנהל המערכת יכול לשנות את זה.',
    last_owner: 'לעסק צריך להישאר לפחות בעלים אחד.',
    hours_overlap: 'יש שעות שחופפות באותו יום.',
    hours_invalid: 'שעת הסגירה צריכה להיות אחרי שעת הפתיחה.',
    invite_invalid: 'קישור ההזמנה לא בתוקף (כבר נוצל או פג תוקף). בקשו קישור חדש.',
    slug_taken: 'הכתובת הזו כבר תפוסה.',
    slug_invalid: 'כתובת: אותיות באנגלית קטנות, ספרות ומקף בלבד.',
    bad_range: 'טווח התאריכים לא תקין.',
    empty_quote: 'בחרו לפחות שירות אחד.',
    bot_check_failed: 'האימות האוטומטי לא עבר. נסו שוב.',
    bot_check_pending: 'רגע, בודקים שזה לא רובוט…',
    upload_failed: 'העלאת התמונה נכשלה. נסו שוב.',
    too_big: 'התמונה גדולה מדי.',
    'Invalid login credentials': 'אימייל או סיסמה לא נכונים.',
    'User already registered': 'כבר יש משתמש עם האימייל הזה. אפשר להתחבר.',
  };
  const say = e => SAY[e && e.code] || SAY[e && e.message] ||
    (/Password should be/.test(e && e.message) ? 'הסיסמה צריכה לפחות 8 תווים.' : 'משהו השתבש. נסו שוב.');

  // booking through the "book" Edge Function (when Turnstile bot protection is on)
  async function bookProtected(args, turnstileToken) {
    let res;
    try { res = await fetch(`${P.supabaseUrl}/functions/v1/book`, { method: 'POST',
      headers: { apikey: P.anonKey, authorization: 'Bearer ' + P.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ ...args, turnstile_token: turnstileToken }) }); }
    catch { const e = new Error('offline'); e.code = 'offline'; throw e; }
    const data = await res.json().catch(() => null);
    if (!res.ok) { const m = (data && data.message) || 'error'; const e = new Error(m); e.code = /^[a-z_]+$/.test(m) ? m : 'error'; throw e; }
    return data;
  }

  window.API = { rpc, auth, upload, say, bookProtected };
})();
