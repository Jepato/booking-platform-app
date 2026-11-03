/* motion.js: the app motion kit. Zero dependencies, written for this skill (no third-party code).
   The numbers come from public guidance: Emil Kowalski's animation rules and Vaul (MIT) for drag thresholds,
   Apple's rubber-band formula, Taste Skill's motion study (MIT) for durations. See references/motion.md.

   Everything here checks reduced motion at call time: under prefers-reduced-motion the end state is applied at once
   (no travel), callbacks still run, so a flow never depends on an animation finishing.

   Motion.reduced()                            live check of prefers-reduced-motion (or <html data-motion="reduce">)
   Motion.spring({from, to, velocity, stiffness, damping, mass, onUpdate, onComplete}) → { stop(), value, velocity, finished }
                                                a real damped spring stepped per frame; interruptible: stop() it, read
                                                .value and .velocity, start the next spring from there (a grabbed sheet)
   Motion.springCSS({stiffness, damping, mass}) → { easing: 'linear(…)', duration }  a spring as a CSS/WAAPI easing
   Motion.SPRINGS                              snappy 520/38 (sheets, rows) · gentle 300/34 (dials) · soft 170/26 (big objects)
   Motion.drag(el, opts)                       pointer drag on one axis: capture, axis lock, multi-touch guard,
                                                rubber-band past the edges, release velocity → opts.onEnd({ value, velocity })
   Motion.swipeRow(face, opts)                 swipe a list row to reveal / commit an action (always pair with a button)
   Motion.transition(update, { type })         a View Transition with tap safety; type 'forward' | 'back' | 'fade' | 'none'
   Motion.morph(update, { from, to, name })    shared-element morph: `from` becomes `to` (pill → sheet → ticket)
   Motion.flood(update, { x, y })              radial flood from the tap point (theme switch, a new world opens)
   Motion.indicator(container, active)         one sliding indicator under tabs / chips / a day strip (RTL-safe)
   Motion.swap(el, text)                       a number changes as a whole value: old slides out, new slides in
   Motion.roll(el)                             digits roll up to their value once (3-4 figures at display size only)
   Motion.check(path)                          draw an SVG check mark
   Motion.hold(button, { ms, onDone })         hold-to-confirm for destructive actions (fill + release snaps back)
   Motion.stagger(els, keyframes, { each })    one entrance for a small group, 4-8 items, then no stagger
   Motion.haptic(ms)                           a short vibration where the phone supports it (Android Chrome); silent elsewhere */
(() => {
  'use strict';
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mq.matches || document.documentElement.dataset.motion === 'reduce';
  const rtl = el => getComputedStyle(el || document.documentElement).direction === 'rtl';
  const SPRINGS = { snappy: { stiffness: 520, damping: 38 }, gentle: { stiffness: 300, damping: 34 }, soft: { stiffness: 170, damping: 26 } };

  /* ---------- spring: semi-implicit Euler at 240 Hz substeps, so it is stable at any frame rate ---------- */
  /* restDelta (units) and restSpeed (units per second) default to pixels; pass smaller ones for 0-1 values */
  function spring({ from = 0, to = 1, velocity = 0, stiffness = 520, damping = 38, mass = 1, restDelta = 0.5, restSpeed = 10,
                    onUpdate, onComplete } = {}) {
    let x = from, v = velocity / 1000, raf = 0, last = 0, done = false, resolve;   /* v in units per ms internally */
    const finished = new Promise(r => { resolve = r; });
    const end = () => { done = true; x = to; v = 0; onUpdate && onUpdate(x); onComplete && onComplete(x); resolve(x); };
    const h = { stop() { if (!done) { done = true; cancelAnimationFrame(raf); resolve(x); } }, get value() { return x; },
                get velocity() { return v * 1000; }, finished };
    if (reduced() || from === to && !velocity) { end(); return h; }
    const tick = now => {
      if (done) return;
      let dt = Math.min(64, last ? now - last : 16); last = now;
      while (dt > 0) { const s = Math.min(dt, 1000 / 240) / 1000;
        const a = (-stiffness * (x - to) - damping * v * 1000) / mass;             /* units per s² */
        v += a * s / 1000; x += v * s * 1000; dt -= s * 1000; }
      if (Math.abs(x - to) < restDelta && Math.abs(v * 1000) < restSpeed) return end();
      onUpdate && onUpdate(x); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return h;
  }

  /* the same spring as a CSS linear() easing, normalised 0 → 1; duration is where it settles */
  function springCSS({ stiffness = 520, damping = 38, mass = 1, points = 40 } = {}) {
    const step = 1 / 240, out = []; let x = 0, v = 0, t = 0, settle = 0;
    for (; t < 3; t += step) { const a = (-stiffness * (x - 1) - damping * v) / mass; v += a * step; x += v * step;
      out.push(x); if (Math.abs(x - 1) > 0.001 || Math.abs(v) > 0.01) settle = t; }
    const dur = Math.max(0.12, settle + step), n = Math.round(dur / step), pts = [];
    for (let i = 0; i <= points; i++) pts.push(+(i === 0 ? 0 : i === points ? 1 : out[Math.min(out.length - 1, Math.round(i / points * n))]).toFixed(3));
    return { easing: `linear(${pts.join(', ')})`, duration: Math.round(dur * 1000) };
  }

  /* ---------- drag on one axis ---------- */
  const rubber = (over, size, c = 0.55) => (1 - 1 / (Math.abs(over) * c / size + 1)) * size * Math.sign(over);
  function drag(el, { axis = 'x', min = -Infinity, max = Infinity, value = 0, set, onStart, onMove, onEnd, lock = 8, handle } = {}) {
    let start = null, base = value, pos = value, samples = [], active = false, id = null;
    const apply = set || (v => { el.style.transform = axis === 'x' ? `translate3d(${v}px,0,0)` : `translate3d(0,${v}px,0)`; });
    const size = () => (axis === 'x' ? el.offsetWidth : el.offsetHeight) || 300;
    const target = handle || el;
    const down = e => {
      if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;  /* a second finger never takes over */
      if (e.target.closest('input, textarea, select, [data-no-drag]')) return;
      id = e.pointerId; start = { x: e.clientX, y: e.clientY }; active = false; samples = [];
      base = onStart ? (onStart() ?? pos) : pos;
    };
    const move = e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y, d = axis === 'x' ? dx : dy, other = axis === 'x' ? dy : dx;
      if (!active) {
        if (Math.abs(other) > lock && Math.abs(other) > Math.abs(d)) { id = null; return; }   /* the page wants to scroll */
        if (Math.abs(d) < lock) return;
        active = true; target.setPointerCapture(id); el.classList.add('is-dragging');
        document.documentElement.classList.add('m-no-select');
      }
      e.preventDefault();
      let v = base + d;
      if (v < min) v = min + rubber(v - min, size()); else if (v > max) v = max + rubber(v - max, size());
      pos = v; apply(v); onMove && onMove(v);
      const now = performance.now(); samples.push([now, v]); while (samples.length > 2 && now - samples[0][0] > 100) samples.shift();
    };
    const up = e => {
      if (e.pointerId !== id) return; id = null;
      if (!active) return; active = false; el.classList.remove('is-dragging'); document.documentElement.classList.remove('m-no-select');
      const [a, b] = [samples[0], samples[samples.length - 1]];
      const velocity = a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;   /* px per ms */
      onEnd && onEnd({ value: pos, velocity });
    };
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move, { passive: false });
    target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', up);
    return { set value(v) { pos = v; apply(v); }, get value() { return pos; },
             destroy() { target.removeEventListener('pointerdown', down); target.removeEventListener('pointermove', move);
                         target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); } };
  }

  /* ---------- swipe a row (the face slides, the action sits underneath) ---------- */
  function swipeRow(face, { side = 'end', reveal = 88, commitAt = 0.45, velocity: flick = 0.5, onCommit, onOpen } = {}) {
    /* side 'end' = the action sits at the inline end; in RTL that is the left, so the face moves right (+x) */
    const sign = (side === 'end') === rtl(face) ? 1 : -1;
    let anim = null;
    const to = (target, v = 0, done) => { anim && anim.stop();
      anim = spring({ from: d.value, to: target, velocity: v * 1000, ...SPRINGS.snappy, onUpdate: x => { d.value = x; }, onComplete: done }); };
    const d = drag(face, {
      axis: 'x', min: sign > 0 ? 0 : -Infinity, max: sign > 0 ? Infinity : 0,
      onStart: () => { if (anim) { anim.stop(); anim = null; } return d.value; },
      onEnd: ({ value, velocity }) => {
        const w = face.offsetWidth, far = Math.abs(value) > w * commitAt, fast = Math.abs(velocity) > flick && Math.sign(velocity) === sign;
        if (far || (fast && Math.abs(value) > reveal)) { haptic(10); to(sign * w * 1.05, velocity, () => onCommit && onCommit()); }
        else if (Math.abs(value) > reveal * 0.6 || fast) { to(sign * reveal, velocity); onOpen && onOpen(); }
        else to(0, velocity);
      } });
    return { close: () => to(0), open: () => to(sign * reveal), reset: () => { anim && anim.stop(); d.value = 0; } };
  }

  /* ---------- view transitions: the tap is never lost, failures still swap ---------- */
  let current = null;
  document.addEventListener('pointerdown', () => { if (current) try { current.skipTransition(); } catch (e) {} }, true);
  function transition(update, { type = 'fade' } = {}) {
    const root = document.documentElement;
    if (!document.startViewTransition || reduced() || type === 'none') { update(); return Promise.resolve(); }
    root.dataset.vt = type;
    try { current = document.startViewTransition(update); } catch (e) { delete root.dataset.vt; update(); return Promise.resolve(); }
    const vt = current; vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
    return vt.finished.catch(() => {}).finally(() => { if (current === vt) current = null; delete root.dataset.vt; });
  }
  /* from: the element now on screen; to: a selector or function that finds its new self after update() */
  function morph(update, { from, to, name = 'morph', type = 'fade' } = {}) {
    if (from) from.style.viewTransitionName = name;
    return transition(() => { update(); if (from) from.style.viewTransitionName = '';
      const t = typeof to === 'function' ? to() : document.querySelector(to); if (t) t.style.viewTransitionName = name; }, { type })
      .finally(() => { const t = typeof to === 'function' ? to() : to && document.querySelector(to); if (t) t.style.viewTransitionName = ''; });
  }
  function flood(update, { x = innerWidth / 2, y = innerHeight / 2, duration = 420 } = {}) {
    if (!document.startViewTransition || reduced()) { update(); return Promise.resolve(); }
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const root = document.documentElement; root.dataset.vt = 'flood';
    const vt = document.startViewTransition(update); current = vt;
    vt.updateCallbackDone.catch(() => {});
    vt.ready.then(() => root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration, easing: 'cubic-bezier(.45,0,.15,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
    return vt.finished.catch(() => {}).finally(() => { if (current === vt) current = null; delete root.dataset.vt; });
  }

  /* ---------- one sliding indicator (tabs, chips, segmented control, day strip) ---------- */
  function indicator(container, active, { instant = false } = {}) {
    let ind = container.querySelector(':scope > .m-indicator');
    if (!ind) { ind = document.createElement('span'); ind.className = 'm-indicator'; ind.setAttribute('aria-hidden', 'true'); container.prepend(ind);
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative'; }
    if (!active) { ind.style.opacity = '0'; return; }
    if (instant || reduced() || !ind.dataset.ready) ind.style.transition = 'none';
    ind.style.width = active.offsetWidth + 'px'; ind.style.height = active.offsetHeight + 'px';
    ind.style.transform = `translate3d(${active.offsetLeft}px, ${active.offsetTop}px, 0)`; ind.style.opacity = '1';
    if (ind.style.transition === 'none') { ind.offsetWidth; ind.style.transition = ''; }
    ind.dataset.ready = '1';
    return ind;
  }

  /* ---------- numbers ---------- */
  /* the text changes at once (screen readers, tests and copy-paste see the real value); the old value leaves as a
     ::after ghost that inherits every style of the number (motion.css → .m-swapping) */
  function swap(el, text) {
    text = String(text); const before = el.textContent; if (before === text) return;
    el.textContent = text;
    if (reduced() || !el.animate) return;
    const old = parseFloat(before.replace(/[^\d.-]/g, '')), next = parseFloat(text.replace(/[^\d.-]/g, ''));
    const dy = isNaN(old) || isNaN(next) || next >= old ? 40 : -40;
    el.dataset.swapOld = before; el.classList.add('m-swapping');
    clearTimeout(el._swapT); el._swapT = setTimeout(() => el.classList.remove('m-swapping'), 200);
    try { el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-dy}%)`, opacity: 0 }],
      { duration: 160, easing: 'cubic-bezier(.55,.055,.675,.19)', fill: 'forwards', pseudoElement: '::after' }); } catch (e) {}
    el.animate([{ transform: `translateY(${dy}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 260, delay: 40, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'backwards' });
  }
  function roll(el, { delay = 0 } = {}) {
    const value = el.textContent.trim();
    const said = Object.assign(document.createElement('span'), { className: 'vh', textContent: value });
    const shown = Object.assign(document.createElement('span'), { className: 'm-roll' });
    shown.setAttribute('aria-hidden', 'true');
    let i = 0;
    for (const ch of value) {
      if (!/\d/.test(ch)) { shown.append(ch); continue; }
      const col = Object.assign(document.createElement('span'), { className: 'm-roll-col' }), strip = Object.assign(document.createElement('span'), { className: 'm-roll-strip' });
      for (let n = 0; n <= 9; n++) strip.append(Object.assign(document.createElement('span'), { textContent: n }));
      strip.style.setProperty('--d', ch); strip.style.setProperty('--i', i++); col.append(strip); shown.append(col);
    }
    el.replaceChildren(said, shown);
    if (reduced()) return el.classList.add('is-in');
    const go = () => setTimeout(() => el.classList.add('is-in'), delay);
    if (!('IntersectionObserver' in window)) return go();
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { go(); io.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
  }
  function check(path, { duration = 360, delay = 0 } = {}) {
    if (!path || reduced()) return Promise.resolve();
    const len = path.getTotalLength(); path.style.strokeDasharray = len;
    return path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration, delay, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' }).finished.catch(() => {});
  }

  /* ---------- hold to confirm: the deliberate phase is slow and linear, the release snaps back ---------- */
  function hold(btn, { ms = 1200, onDone } = {}) {
    let fill = btn.querySelector('.m-hold-fill');
    if (!fill) { fill = document.createElement('span'); fill.className = 'm-hold-fill'; fill.setAttribute('aria-hidden', 'true'); btn.prepend(fill); }
    let a = null;
    const startHold = e => { if (e.button > 0) return; a && a.cancel();
      a = fill.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: reduced() ? 1 : ms, easing: 'linear', fill: 'forwards' });
      a.finished.then(() => { haptic(20); onDone && onDone(); }).catch(() => {}); };
    const cancel = () => { if (!a || a.playState === 'finished') return; const t = a.currentTime || 0; a.cancel();
      a = fill.animate([{ clipPath: `inset(0 ${100 - t / ms * 100}% 0 0)` }, { clipPath: 'inset(0 100% 0 0)' }], { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)' }); };
    btn.addEventListener('pointerdown', startHold); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, cancel));
    /* keyboard: Enter/Space held works the same; a click alone never fires the action */
    btn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); startHold(e); } });
    btn.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') cancel(); });
  }

  function stagger(els, keyframes = [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { each = 50, duration = 300, max = 6 } = {}) {
    if (reduced()) return;
    [...els].forEach((el, i) => el.animate(keyframes, { duration, delay: Math.min(i, max) * each, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'backwards' }));
  }
  const haptic = (ms = 10) => { try { if (navigator.vibrate && !reduced()) navigator.vibrate(ms); } catch (e) {} };

  window.Motion = { reduced, spring, springCSS, SPRINGS, drag, rubber, swipeRow, transition, morph, flood, indicator, swap, roll, check, hold, stagger, haptic };
})();
