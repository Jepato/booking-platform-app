/* sheet.js: a bottom sheet on phones / a centred panel on wide screens, built on the native <dialog>
   (focus is trapped, Esc closes, the page behind is inert, focus returns to the opener: the browser does all of that).
   Adds what <dialog> lacks: swipe down to close (thresholds from Vaul by Emil Kowalski, MIT: close when released
   faster than 0.4 px/ms or dragged past 25% of the sheet's height; dragging up is damped, never moves the sheet up),
   tap on the backdrop closes, scroll inside the sheet is never hijacked, and a reduced-motion path with no travel.
   With assets/motion.js loaded, the release is a spring that keeps the finger's speed, and grabbing the sheet while it
   settles catches it where it is (interruptible) instead of waiting for the animation.

   Markup (CSS in base.css → "sheet"):
     <dialog class="sheet" id="slot-sheet" aria-labelledby="slot-sheet-t">
       <div class="sheet-grip" aria-hidden="true"></div>
       <h2 id="slot-sheet-t">…</h2> … <button type="button" data-close>סגירה</button>
     </dialog>
   JS: Sheet.open('#slot-sheet', { onClose(result) {} })  ·  Sheet.close('#slot-sheet', 'saved')
   Use a sheet for a short task that belongs to the current screen (pick a time, confirm, move/remove a photo).
   A whole new task gets its own screen; a one-line "done" gets a status line, not a sheet. */
(() => {
  'use strict';
  const VELOCITY = 0.4, CLOSE_AT = 0.25, reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => typeof s === 'string' ? document.querySelector(s) : s;

  function open(sel, { onClose } = {}) {
    const d = $(sel); if (!d || d.open) return;
    d._onClose = onClose; d.returnValue = '';
    d.showModal();
    d.classList.remove('closing'); d.style.transform = '';
    if (!d._wired) wire(d);
  }
  function close(sel, result = '') {
    const d = $(sel); if (!d || !d.open || d.classList.contains('closing')) return;
    const done = () => { d.classList.remove('closing'); d.style.transform = ''; d.close(result); };
    if (reduce()) return done();
    d.classList.add('closing');                       /* CSS slides it down / fades it; then really close */
    let fired = false; const fin = () => { if (!fired) { fired = true; done(); } };
    d.addEventListener('animationend', fin, { once: true }); setTimeout(fin, 320);
  }
  function wire(d) {
    d._wired = true;
    d.addEventListener('close', () => { const cb = d._onClose; d._onClose = null; cb && cb(d.returnValue); });
    d.addEventListener('cancel', e => { e.preventDefault(); close(d); });           /* Esc → animate out too */
    d.addEventListener('click', e => {
      if (e.target === d) close(d);                                                 /* the backdrop is the dialog itself */
      const c = e.target.closest('[data-close]'); if (c && d.contains(c)) close(d, c.value || '');
    });
    /* swipe down to close (touch and pen; a mouse uses the buttons) */
    let y0 = 0, t0 = 0, dy = 0, dragging = false, scroller = null, anim = null, last = [];
    const M = () => !reduce() && window.Motion;
    const setY = y => { d.style.transform = y ? `translateY(${y}px)` : ''; };
    d.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || matchMedia('(min-width: 700px)').matches) return;
      if (e.target.closest('input, textarea, select, [data-no-drag]') || getSelection().toString()) return;
      let from = 0; if (anim) { from = anim.value; anim.stop(); anim = null; d.classList.add('dragging'); }   /* caught mid-flight */
      scroller = e.target.closest('.sheet-body'); y0 = e.clientY - from; t0 = performance.now(); dy = from; last = []; dragging = true;
    });
    d.addEventListener('pointermove', e => {
      if (!dragging) return;
      dy = e.clientY - y0;
      if (scroller && scroller.scrollTop > 0 && dy > 0) { y0 = e.clientY; dy = 0; return; }   /* let the content scroll first */
      if (Math.abs(dy) < 4) return;
      d.classList.add('dragging');
      setY(dy > 0 ? dy : -Math.min(12, 8 * (Math.log(-dy + 1) - 2) + 16));
      const now = performance.now(); last.push([now, dy]); while (last.length > 2 && now - last[0][0] > 100) last.shift();
    });
    const end = () => {
      if (!dragging) return; dragging = false;
      const h = d.getBoundingClientRect().height, a = last[0], b = last[last.length - 1];
      const v = a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : dy / Math.max(1, performance.now() - t0);   /* px/ms, last 100ms */
      const shut = dy > 0 && (v > VELOCITY || dy > h * CLOSE_AT);
      if (M()) {                                     /* spring from where the finger let go, with its speed */
        anim = Motion.spring({ from: Math.max(dy, 0), to: shut ? h + 40 : 0, velocity: v * 1000, ...Motion.SPRINGS.snappy, onUpdate: setY,
          onComplete: () => { anim = null; d.classList.remove('dragging'); if (shut) { setY(0); d.close(''); } } });
        return;
      }
      d.classList.remove('dragging');
      if (shut) close(d); else setY(0);
    };
    d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
  }
  window.Sheet = { open, close };
})();
