// Service worker: app start ook zonder bereik (bv. in de supermarkt).
const CACHE = "lijstjes-v2"; // zelfde naam: de bestaande opslag blijft bewaard
const SHELL = ["./", "index.html", "firebase-config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const sdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (sdk) {
    // Firebase SDK: versie staat in de URL, dus cache eerst.
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
    })));
  } else if (url.origin === location.origin && !url.pathname.startsWith("/__/")) {
    // Eigen bestanden: eerst netwerk (zodat updates direct binnenkomen), anders cache.
    // Bij heel slecht bereik niet blijven wachten: na 2,5 seconden de opgeslagen versie tonen.
    // Het netwerkverzoek loopt dan op de achtergrond door en werkt de cache bij voor de volgende keer.
    const net = fetch(e.request, {cache:"no-cache"}).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    const cached = () => caches.match(e.request).then(hit => hit || caches.match("index.html"));
    const slow = new Promise(res => setTimeout(res, 2500)).then(cached).then(hit => hit || net);
    // Alleen de app zelf (de pagina) wacht kort op internet; de rest (config, icoontjes) komt direct uit de cache.
    const page = e.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
    if (!page) { e.respondWith(caches.match(e.request).then(hit => hit || net)); return; }
    e.respondWith(Promise.race([net, slow]).catch(() => cached()).then(r => r || net));
  }
});
