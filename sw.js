// ═══════════════════════════════════════════════════════════════════
//  PDFolia Service Worker — Cache-First + Background Sync
//  Versão: 1.0.0
// ═══════════════════════════════════════════════════════════════════

const CACHE_NAME      = 'pdfolia-shell-v1';
const RUNTIME_CACHE   = 'pdfolia-runtime-v1';

// Arquivos do app shell que devem ser cacheados no install
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './sw.js'
];

// ── INSTALL: pre-cache do app shell ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())   // ativa imediatamente
  );
});

// ── ACTIVATE: limpa caches antigos ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // controla todas as abas abertas
  );
});

// ── FETCH: estratégia cache-first para shell, network-first p/ resto ─
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora requisições non-GET e cross-origin (exceto CDNs conhecidos)
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin && !isTrustedCDN(url)) return;

  // App shell → cache-first (offline-ready)
  if (isAppShell(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Demais recursos → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

// ── ESTRATÉGIAS ─────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('App offline. Recarregue quando tiver conexão.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached); // fallback p/ cache se offline

  return cached || fetchPromise;
}

// ── HELPERS ─────────────────────────────────────────────────────────

function isAppShell(url) {
  return url.origin === location.origin &&
    (url.pathname.endsWith('index.html') ||
     url.pathname.endsWith('manifest.json') ||
     url.pathname === '/' ||
     url.pathname.endsWith('.js') ||
     url.pathname.endsWith('.css'));
}

function isTrustedCDN(url) {
  const trusted = [
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];
  return trusted.some(d => url.hostname.endsWith(d));
}

// ── MENSAGENS DA PÁGINA PRINCIPAL ───────────────────────────────────
// Permite que a página envie comandos ao SW (ex: limpar cache)
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_NAME });
  }
});
