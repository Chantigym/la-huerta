// Service worker: que la app abra en la chacra sin señal.
//
// Estrategia: primero la red, y si no hay, lo guardado. Así siempre ves la
// última versión cuando hay internet, y seguís trabajando cuando no.
// Los datos de tus listas no pasan por acá: viven en IndexedDB.

const VERSION = 'lahuerta-v3';

const BASICOS = [
  './',
  './index.html',
  './css/estilo.css',
  './manifest.webmanifest',
  './js/ui/app.js',
  './js/core/pdf-grilla.js',
  './js/core/tabla.js',
  './js/core/encabezado.js',
  './js/core/celda.js',
  './js/core/precios.js',
  './js/core/cosecha.js',
  './js/core/pedidos.js',
  './js/core/cobros.js',
  './js/core/formato.js',
  './js/core/csv.js',
  './js/core/categorias.js',
  './js/core/cuentacorriente.js',
  './js/datos/db.js',
  './js/datos/xlsx.js',
  './js/datos/informes-xlsx.js',
  './js/img/cuenta-jpg.js',
  './js/img/zip.js',
  './vendor/pdf.mjs',
  './vendor/pdf.worker.mjs',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      // addAll falla entero si falta uno solo; guardamos de a uno para que
      // un archivo que no esté no deje la app sin nada guardado.
      .then((cache) => Promise.all(BASICOS.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(pedido)
      .then((respuesta) => {
        if (respuesta && respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(pedido, copia)).catch(() => {});
        }
        return respuesta;
      })
      .catch(() => caches.match(pedido).then((guardada) => guardada ||
        (pedido.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
