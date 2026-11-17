// Service worker do HydrantRoute SP: deixa o app instalável e faz a "casca" do app abrir sem internet.
//  - Página (navegação): busca na rede primeiro, para uma versão nova chegar na hora; sem internet, usa a cópia.
//  - Arquivos com hash no nome (/assets/): guardados na primeira vez; o nome muda a cada versão.
//  - API, mapas e qualquer outro site: sempre pela rede, sem guardar (os dados precisam estar atualizados).
const CACHE = "hydrantroute-v1";
const SHELL = ["/", "/favicon.svg", "/icon-192.png", "/manifest.webmanifest"];
const MAX_ASSETS = 40; // limita as versões antigas de /assets/ guardadas

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function trimAssets(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith("/assets/"));
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((r) => cache.delete(r)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put("/", response.clone()));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy).then(() => trimAssets(cache)));
        }
        return response;
      })),
    );
  }
});
