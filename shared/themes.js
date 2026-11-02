/* themes.js — how one booking app looks like many businesses. Taken from the nail-bot demo's design system:
   ONE brand colour per business; every neutral (paper, ink, lines, the black hero card) is derived from it and
   tinted toward its hue; a skin changes the material (radii, display face, where the colour sits), never the layout.
     paper → "פוסטר": blush paper, huge serif name, small radii          (nail demo skin A)
     color → "צבע מלא": the brand colour as a full field, round corners  (skin B)
     ink   → "ניגודיות": a black band under the photo, sharp corners      (skin C)
     night → "לילה": the same, as a tinted dark world (never pure black)
   Themes.apply(config) sets data-skin / data-mode + --brand / --on-brand / --brand-text on <html> and loads the fonts. */
(() => {
  'use strict';
  const T = {
    paper: { label: 'פוסטר', display: 'Frank Ruhl Libre', dw: '500;700;900', accent: '#b4705e' },
    color: { label: 'צבע מלא', display: 'Rubik', dw: '700;800;900', accent: '#e0606e' },
    ink:   { label: 'ניגודיות', display: 'Frank Ruhl Libre', dw: '500;700;900', accent: '#c2410c' },
    night: { label: 'לילה', display: 'Frank Ruhl Libre', dw: '500;700;900', accent: '#d9a75e', dark: true },
  };
  const ALIAS = { warm: 'paper', clean: 'paper', soft: 'color', bold: 'ink' };   // names used before the restyle
  const skinOf = c => T[c && c.theme] ? c.theme : ALIAS[c && c.theme] || 'paper';

  const rgb = hex => (hex || '#000000').replace('#', '').match(/../g).map(x => parseInt(x, 16));
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lum = hex => { const c = rgb(hex).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const mix = (a, b, t) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
  const onAccent = a => contrast(a, '#ffffff') >= 3.2 ? '#ffffff' : '#1b1412';
  // the brand colour as TEXT on paper: darken (light skins) or lighten (dark) until it reads at 4.5:1
  const textStep = (a, paper, dark) => { for (let t = 0; t <= 1; t += 0.05) { const c = mix(a, dark ? '#ffffff' : '#140c0a', t); if (contrast(c, paper) >= 4.5) return c; } return dark ? '#ffffff' : '#140c0a'; };
  const okAccent = a => /^#[0-9a-f]{6}$/i.test(a || '');

  function apply(config = {}, root = document.documentElement) {
    const skin = skinOf(config), t = T[skin];
    const brand = okAccent(config.accent) ? config.accent : t.accent;
    const paper = t.dark ? mix('#141010', brand, 0.06) : mix('#fdfaf9', brand, 0.06);
    root.dataset.skin = skin; root.dataset.mode = t.dark ? 'dark' : 'light';
    root.style.setProperty('--brand', brand);
    root.style.setProperty('--on-brand', onAccent(brand));
    root.style.setProperty('--brand-text', textStep(brand, paper, t.dark));
    root.style.setProperty('--font-display', `'${t.display}', 'Frank Ruhl Libre', Georgia, serif`);
    root.style.colorScheme = t.dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = skin === 'color' ? brand : paper;
    const fams = [...new Set([`${t.display}:wght@${t.dw}`, 'Frank Ruhl Libre:wght@500;700;900', 'Assistant:wght@400;600;700;800'])].map(f => 'family=' + f.replace(/ /g, '+')).join('&');
    let link = document.getElementById('theme-fonts');
    if (!link) { link = document.createElement('link'); link.id = 'theme-fonts'; link.rel = 'stylesheet'; document.head.appendChild(link); }
    link.href = `https://fonts.googleapis.com/css2?${fams}&display=swap`;
    return { skin, brand, ...t };
  }

  window.Themes = { list: T, skinOf, apply, contrast, onAccent, okAccent, textStep };
})();
