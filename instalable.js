// instalable.js — todo lo que hace que la web se comporte como una app:
//
//   - Pone en marcha sw.js (para abrir sin internet y coger las novedades).
//   - Si la app lleva un rato en segundo plano y mientras tanto hemos
//     publicado cambios, se recarga sola al volver a ella.
//   - En el iPhone, si aún no la has añadido a la pantalla de inicio,
//     te explica cómo hacerlo con un aviso que puedes cerrar.

(() => {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(console.error);
  });

  // ----- ¿Hay versión nueva? -----
  // Calculamos una "huella" de los archivos principales. Si al volver a la
  // app la huella es distinta, es que hay cambios publicados: recargamos.
  const ARCHIVOS = ["index.html", "app.js", "styles.css", "config.js", "personal.js", "calendario.ics"];
  const MINUTOS_ENTRE_COMPROBACIONES = 5;
  let huellaInicial = null;
  let ultimaComprobacion = 0;

  async function huellaActual() {
    const textos = await Promise.all(
      ARCHIVOS.map((a) => fetch(a, { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")))
    );
    // Un "hash" sencillo: convierte todo el texto en un número
    let h = 5381;
    for (const ch of textos.join("|")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    return h;
  }

  async function comprobarNovedades() {
    if (!navigator.onLine) return;
    ultimaComprobacion = Date.now();
    try {
      const h = await huellaActual();
      if (huellaInicial === null) huellaInicial = h;
      else if (h !== huellaInicial && !document.querySelector("dialog[open]")) {
        location.reload();
      }
    } catch {}
  }

  window.addEventListener("load", () => setTimeout(comprobarNovedades, 4000));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - ultimaComprobacion > MINUTOS_ENTRE_COMPROBACIONES * 60000) comprobarNovedades();
  });
})();

// ----- Aviso "Instálala en tu iPhone" -----
(() => {
  const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const yaInstalada = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  let cerrado = false;
  try { cerrado = localStorage.getItem("mi-horario:aviso-instalar") === "cerrado"; } catch {}
  if (!esIphone || yaInstalada || cerrado) return;

  const aviso = document.createElement("div");
  aviso.className = "aviso-instalar";
  aviso.innerHTML = `
    <img src="icono-180.png" alt="" width="40" height="40">
    <div>
      <strong>Tenla como una app</strong>
      <span>Toca <b>Compartir</b> <span class="icono-compartir" aria-hidden="true">⬆︎</span> y luego <b>Añadir a pantalla de inicio</b>.</span>
    </div>
    <button aria-label="Cerrar">✕</button>`;
  aviso.querySelector("button").onclick = () => {
    aviso.remove();
    try { localStorage.setItem("mi-horario:aviso-instalar", "cerrado"); } catch {}
  };
  document.addEventListener("DOMContentLoaded", () => document.body.append(aviso));
})();
