// Service worker: o app precisa abrir no corredor do mercado, com ou sem sinal.
//
// Shell em cache-first (é versionado, muda só quando eu publico), fontes em
// stale-while-revalidate. A API do GitHub nunca entra em cache: dado
// financeiro servido de cache velho seria pior que erro de rede.

const VERSAO = 'money-v1';
const SHELL = `${VERSAO}-shell`;
const FONTES = `${VERSAO}-fontes`;

const ARQUIVOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/ui.js',
  './js/store.js',
  './js/budget.js',
  './js/sync-github.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((k) => !k.startsWith(VERSAO)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const { request } = ev;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // nunca interceptar a sincronizacao
  if (url.hostname === 'api.github.com') return;

  // fontes do Google: serve o que tem e atualiza por baixo
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    ev.respondWith(
      caches.open(FONTES).then(async (cache) => {
        const guardado = await cache.match(request);
        const rede = fetch(request)
          .then((resp) => { if (resp.ok) cache.put(request, resp.clone()); return resp; })
          .catch(() => guardado);
        return guardado || rede;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // navegacao: cache primeiro, rede como reforco, index como ultimo recurso
  if (request.mode === 'navigate') {
    ev.respondWith(
      caches.match('./index.html').then((guardado) =>
        guardado || fetch(request).catch(() => caches.match('./'))
      )
    );
    return;
  }

  ev.respondWith(
    caches.match(request).then((guardado) => {
      if (guardado) return guardado;
      return fetch(request).then((resp) => {
        if (resp.ok && resp.type === 'basic') {
          const copia = resp.clone();
          caches.open(SHELL).then((c) => c.put(request, copia));
        }
        return resp;
      });
    })
  );
});
