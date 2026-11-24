// Planet Teller – Offline-Unterstützung.
// Online wird immer zuerst die aktuelle Datei geholt (Änderungen sind sofort sichtbar);
// nur ohne Netz kommt die zuletzt gespeicherte Fassung aus dem Cache.
// Bei Änderungen an den App-Dateien: CACHE_NAME und das "?v=" in index.html gemeinsam erhöhen.
const CACHE_NAME = "planet-teller-v8";
const APP_SHELL = [
  "./",
  "./index.html",
  "./foods.js?v=6",
  "./app.js?v=6",
  "./sync.js?v=6",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    // "reload": am Zwischenspeicher des Browsers vorbei, damit keine alte Fassung im Cache landet
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, {cache: "reload"}))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.includes("/api/")) return; // Online-Suche nie aus dem Cache

  event.respondWith(
    fetch(event.request.url, {cache: "no-cache"}) // immer beim Server nachfragen, ob es eine neuere Fassung gibt
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
  );
});
