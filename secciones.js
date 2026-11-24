// =====================================================================
// secciones.js — las pestañas de la app (Horario, Entreno...)
// ---------------------------------------------------------------------
// La web sigue siendo UNA sola página. Lo que cambia al tocar una pestaña
// es qué parte se ve. Para recordarlo usamos lo que va detrás de "#" en la
// dirección:
//     .../horario/            → Horario
//     .../horario/#entreno    → Entreno (lista de actividades)
//     .../horario/#entreno/x  → Entreno, ficha de la actividad x
// Así el botón "atrás" del móvil funciona y cada sección se puede guardar
// como acceso directo.
//
// El código de cada sección nueva vive en su propia carpeta (entreno/) y
// solo se descarga la primera vez que la abres, para que la app arranque
// igual de rápido que antes.
// =====================================================================

(() => {
  // Iconos dibujados con SVG: toman el color del texto, así la pestaña
  // activa se ve oscura y las demás grises (también en modo oscuro)
  const svg = (trazos) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${trazos}</svg>`;
  const ICONOS = {
    calendario: svg(`<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>`),
    pulso: svg(`<path d="M2.5 12h4l2.5-6 4 12 2.5-6h6"/>`),
    manzana: svg(`<path d="M12 7c-3-2-7-1-7 4 0 5 3 9 5 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-9 0-5-4-6-7-4z"/><path d="M12 7c0-2 1-4 3-4"/>`),
  };

  // Para añadir una sección en el futuro basta con una línea más aquí
  const SECCIONES = [
    { id: "horario", nombre: "Horario", icono: ICONOS.calendario },
    { id: "entreno", nombre: "Entreno", icono: ICONOS.pulso, codigo: "entreno/entreno.js", estilos: "entreno/entreno.css" },
    { id: "nutricion", nombre: "Nutrición", icono: ICONOS.manzana, codigo: "nutricion/nutricion.js", estilos: "nutricion/nutricion.css" },
  ];

  // ----- La barra de pestañas -----
  const barra = document.createElement("nav");
  barra.className = "barra-secciones";
  barra.setAttribute("aria-label", "Secciones");
  barra.innerHTML = SECCIONES.map((s) =>
    `<a href="#${s.id === "horario" ? "" : s.id}" data-seccion="${s.id}">
       <span class="seccion-icono" aria-hidden="true">${s.icono}</span><span>${s.nombre}</span>
     </a>`).join("");
  document.body.append(barra);
  document.body.classList.add("con-pestanas");

  // Cada sección tiene su "caja" en la página. La del horario ya existe (.app)
  const cajas = { horario: [document.querySelector(".app"), document.getElementById("btn-anadir")] };
  const cargadas = {};

  async function cargar(seccion) {
    if (cargadas[seccion.id]) return cargadas[seccion.id];
    const caja = document.createElement("div");
    caja.id = `seccion-${seccion.id}`;
    caja.className = "seccion";
    caja.innerHTML = `<p class="seccion-cargando">Cargando…</p>`;
    document.body.insertBefore(caja, barra);
    cajas[seccion.id] = [caja];
    if (seccion.estilos) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = seccion.estilos;
      document.head.append(css);
    }
    // import() descarga el archivo .js de la sección solo cuando hace falta
    cargadas[seccion.id] = import(`./${seccion.codigo}`).then((m) => m.iniciar(caja));
    return cargadas[seccion.id];
  }

  async function mostrar() {
    const [nombre, ...resto] = location.hash.replace(/^#\/?/, "").split("/");
    const seccion = SECCIONES.find((s) => s.id === nombre) || SECCIONES[0];
    document.body.dataset.seccion = seccion.id;
    for (const a of barra.querySelectorAll("a")) {
      const activa = a.dataset.seccion === seccion.id;
      a.classList.toggle("activa", activa);
      if (activa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    for (const [id, elementos] of Object.entries(cajas))
      for (const el of elementos) if (el) el.hidden = id !== seccion.id;
    if (seccion.codigo) {
      try {
        const modulo = await cargar(seccion);
        modulo?.mostrar?.(resto.join("/"));
      } catch (error) {
        console.error(error);
        cajas[seccion.id][0].innerHTML = `<p class="seccion-cargando">No he podido abrir ${seccion.nombre}. Comprueba la conexión y vuelve a intentarlo.</p>`;
        delete cargadas[seccion.id];
      }
    }
  }

  window.addEventListener("hashchange", () => { mostrar(); window.scrollTo({ top: 0 }); });
  mostrar();
})();
