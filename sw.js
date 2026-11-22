// sw.js — el "service worker": un pequeño ayudante que el navegador deja
// funcionando por detrás de la página. Lo usamos para dos cosas:
//
//   1. Que la app abra aunque no tengas internet (en el metro, en un aula
//      sin cobertura...). Cada vez que descarga un archivo, guarda una copia.
//   2. Que siempre veas la última versión. Por eso primero intenta la red
//      ("red primero") y solo si falla usa la copia guardada.
//
// No hace falta tocar este archivo cuando cambies el resto de la web:
// como siempre pregunta primero a la red, las novedades llegan solas.

const CACHE = "mi-horario-v1";

// Lo mínimo para que la app arranque sin conexión
const ESENCIALES = [
  "./", "index.html", "styles.css", "instalable.css",
  "config.js", "personal.js", "moodle.js", "app.js", "instalable.js",
  "tareas.js", "resumen.js", "estudio.js", "estadisticas.js",
  "sincronizar.js", "vendor/supabase.js",
  "calendario.ics", "manifest.json", "icono.svg", "icono-180.png", "icono-512.png",
];

// Si la red tarda más que esto, enseñamos la copia y seguimos esperando por detrás
const ESPERA_MAXIMA_MS = 3000;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ESENCIALES.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  // Solo nos ocupamos de lo que pide la propia web (no de otras páginas)
  if (peticion.method !== "GET" || new URL(peticion.url).origin !== self.location.origin) return;
  evento.respondWith(redPrimero(peticion));
});

async function redPrimero(peticion) {
  const cache = await caches.open(CACHE);
  const desdeRed = fetch(peticion, { cache: "no-cache" }).then((r) => {
    if (r.ok) cache.put(peticion, r.clone());
    return r;
  });
  const copia = await cache.match(peticion, { ignoreSearch: true });
  if (!copia) return desdeRed;
  // Hay copia: si la red contesta rápido usamos la red; si no, la copia
  const plazo = new Promise((resolver) => setTimeout(() => resolver(copia), ESPERA_MAXIMA_MS));
  return Promise.race([desdeRed.catch(() => copia), plazo]);
}
