/* config.js — the ONLY file to edit when deploying (see README → "העלאה לאוויר").
   On localhost everything points at dev/server.mjs automatically. */
(() => {
  const dev = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const base = new URL('..', document.currentScript.src).pathname;          // the folder web/ is served from ("/" or "/repo/")
  const onPages = location.hostname.endsWith('.github.io');                 // GitHub Pages: no subdomains, no worker
  window.PLATFORM = {
    base,
    subdomains: !dev && !onPages,                                            // businesses at <slug>.<rootDomain> (own domain + Cloudflare)
    url: path => location.origin + base + path,                              // a page of this app ('manage/', 'admin/')
    businessUrl(slug) { return this.subdomains ? `https://${slug}.${this.rootDomain}` : `${location.origin}${base}?b=${slug}`; },
    name: 'המערכת',                                   // your brand: shown in the admin, the owner app and the small footer credit
    rootDomain: 'example.co.il',                       // businesses live at <slug>.<rootDomain>; the owner app at app.<rootDomain>
    supabaseUrl: dev ? location.origin : 'https://tlmziwrrnrzjzdcfaejd.supabase.co',
    anonKey: dev ? 'dev' : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsbXppd3JybnJ6anpkY2ZhZWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NDAxNjIsImV4cCI6MjEwOTIxNjE2Mn0.IuYi_A4HPt9rHzXOiw7gKvir-uYxpectIGKJ-qXE-Ac',   // public "anon" key: safe in the browser, RLS protects the data
    supportPhone: '0500000000',                        // your WhatsApp for business owners who need help
    turnstileSiteKey: '',                              // bot protection: empty = off (README → הגנה מבוטים)
    dev,
  };
})();
