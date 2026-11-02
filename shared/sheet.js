/* sheet.js: a bottom sheet on phones / a centred panel on wide screens, built on the native <dialog>
   (focus is trapped, Esc closes, the page behind is inert, focus returns to the opener: the browser does all of that).
   Adds what <dialog> lacks: swipe down to close (thresholds from Vaul by Emil Kowalski, MIT: close when released
   faster than 0.4 px/ms or dragged past 25% of the sheet's height; dragging up is damped, never moves the sheet up),
   tap on the backdrop closes, scroll inside the sheet is never hijacked, and a reduced-motion path with no travel.

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
    let y0 = 0, t0 = 0, dy = 0, dragging = false, scroller = null;
    d.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || matchMedia('(min-width: 700px)').matches) return;
      if (e.target.closest('input, textarea, select, [data-no-drag]') || getSelection().toString()) return;
      scroller = e.target.closest('.sheet-body'); y0 = e.clientY; t0 = performance.now(); dy = 0; dragging = true;
    });
    d.addEventListener('pointermove', e => {
      if (!dragging) return;
      dy = e.clientY - y0;
      if (scroller && scroller.scrollTop > 0 && dy > 0) { y0 = e.clientY; dy = 0; return; }   /* let the content scroll first */
      if (Math.abs(dy) < 4) return;
      d.classList.add('dragging');
      d.style.transform = `translateY(${dy > 0 ? dy : -Math.min(12, 8 * (Math.log(-dy + 1) - 2) + 16)}px)`;
    });
    const end = () => {
      if (!dragging) return; dragging = false; d.classList.remove('dragging');
      const v = dy / Math.max(1, performance.now() - t0), h = d.getBoundingClientRect().height;
      if (dy > 0 && (v > VELOCITY || dy > h * CLOSE_AT)) close(d); else d.style.transform = '';
    };
    d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
  }
  window.Sheet = { open, close };
})();
