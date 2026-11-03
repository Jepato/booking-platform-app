/* router.js: hash routes for an app-like page (#/, #/book, #/owner) that feel native and stay accessible.
   - each route renders into <main id="app">; a View Transition cross-fades screens where the browser has it
   - taps during a transition are not lost: Chrome doesn't hit-test elements captured by a View Transition, so the
     first pointerdown skips the transition (bug found in the reference build: "I tapped and nothing happened")
   - scroll position is kept per route (back returns to where you were); a new screen starts at the top
   - focus moves to the new screen's h1 (tabindex=-1) and the title is announced, so screen readers know the screen changed
   - with motion.css loaded, forward screens slide 16px in reading direction and Back slides the other way
   - reduced motion: no transition at all
   Usage:
     Router.route('/', () => homeHTML());          // return HTML string or a Node; may be async
     Router.route('/book', () => bookHTML(), { title: 'קביעת תור', after: wireBook });
     Router.start({ app: '#app', title: name => `${name} · טל ריסים` });
     Router.go('/book')                             // or a normal <a href="#/book"> */
(() => {
  'use strict';
  const routes = new Map(), scrolls = new Map();
  let app, fmt = t => t, vt = null, current = null, lastNav = 'push';
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const path = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];

  document.addEventListener('pointerdown', () => { if (vt) { try { vt.skipTransition(); } catch (e) {} } }, true);
  /* in-page links (#bouquets) are not routes: scroll to the section and move focus there, the route stays */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a || a.getAttribute('href').startsWith('#/') || a.getAttribute('href') === '#') return;
    const el = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); if (!el) return;
    e.preventDefault(); el.scrollIntoView({ behavior: reduce() ? 'instant' : 'smooth', block: 'start' });
    if (!el.hasAttribute('tabindex')) el.tabIndex = -1; el.focus({ preventScroll: true });
  });
  addEventListener('popstate', () => { lastNav = 'pop'; });

  async function render() {
    const p = path(), r = routes.get(p) || routes.get('*') || routes.get('/');
    if (current) scrolls.set(current, scrollY);
    const html = await r.view(p);
    const swap = () => {
      if (typeof html === 'string') app.innerHTML = html; else app.replaceChildren(html);
      document.title = fmt(r.title || '');
      const restore = lastNav === 'pop' && scrolls.has(p) ? scrolls.get(p) : 0;
      scrollTo({ top: restore, behavior: 'instant' });
      r.after && r.after(app, p);
      const h = app.querySelector('h1');
      if (h && current !== null) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      current = p; lastNav = 'push';
    };
    if (document.startViewTransition && !reduce() && current !== null) {
      /* forward / back tells motion.css which way the screens slide (flipped for RTL); base.css alone just cross-fades */
      const root = document.documentElement; root.dataset.vt = lastNav === 'pop' ? 'back' : 'forward';
      vt = document.startViewTransition(swap);
      vt.finished.catch(() => {}).finally(() => { if (root.dataset.vt !== 'flood') delete root.dataset.vt; });
      // a transition the browser skips (page hidden, a newer one) rejects these; the swap itself still happens
      vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
      vt.finished.catch(() => {}).finally(() => { vt = null; });
    } else swap();
  }
  window.Router = {
    route(p, view, opts = {}) { routes.set(p, { view, ...opts }); return this; },
    start({ app: a = '#app', title } = {}) { app = document.querySelector(a); if (title) fmt = title; addEventListener('hashchange', render); render(); },
    go(p) { if (path() === p) render(); else location.hash = '#' + p; },
    refresh: render,
    get path() { return path(); },
  };
})();
