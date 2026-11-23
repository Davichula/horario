// =====================================================================
// entreno/entreno.js — la sección "Entreno"
// ---------------------------------------------------------------------
// Dos pantallas:
//   - La LISTA de actividades (#entreno): resumen de la semana, filtros
//     por deporte y tus actividades agrupadas por mes.
//   - La FICHA de una actividad (#entreno/<id>): mapa, datos, gráficas,
//     zonas de pulso, vueltas, largos de piscina o series de gimnasio.
//
// secciones.js llama a iniciar() la primera vez que abres la pestaña y a
// mostrar() cada vez que cambia la dirección.
// =====================================================================

import { leerArchivos, DEPORTES, ESTILOS, iconoDe } from "./fit.js";
import * as almacen from "./almacen.js";
import * as garmin from "./garmin.js";
import { graficaLinea, graficaBarras, crearGrupo, suavizar, mapa } from "./graficas.js";
import { pintarResumen, pintarForma, pintarSalud, pintarDeportes } from "./panel.js";
import * as analisis from "./analisis.js";

let caja = null;
let filtro = "todo";
// Los apartados de Entreno: cada uno tiene su dirección (#entreno/forma...)
const APARTADOS = [
  { id: "resumen", nombre: "Resumen", icono: "◉" },
  { id: "forma", nombre: "Forma", icono: "📈" },
  { id: "salud", nombre: "Salud", icono: "❤️" },
  { id: "deportes", nombre: "Deportes", icono: "🏅" },
  { id: "actividades", nombre: "Actividades", icono: "☰" },
];
let apartado = "resumen";
let deporteSel = null; // dentro de Deportes: el deporte abierto (#entreno/deportes/correr)

export function iniciar(elemento) {
  caja = elemento;
  almacen.subirPendientes();
  traerDeGarmin();
  // Al volver a la app (p. ej. después de entrenar), miramos si hay algo nuevo
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") traerDeGarmin(); });
  // Mientras tienes Entreno abierto, cada minuto recogemos lo que haya traído Garmin
  setInterval(() => {
    if (document.visibilityState === "visible" && /^#\/?entreno/.test(location.hash)) traerDeGarmin();
  }, 60e3);
  // Si llegan actividades desde otro dispositivo, redibujamos la lista
  window.addEventListener("storage", (e) => { if (e.key === "mi-horario:entreno" && enApartado()) pintarLista(); });
  return { mostrar };
}

function mostrar(ruta) {
  const r = decodeURIComponent(ruta || "");
  if (r === "natacion") { location.replace("#entreno/deportes/nadar"); return; } // dirección antigua
  const [primero, sub] = r.split("/");
  if (!r || APARTADOS.some((a) => a.id === r) || (primero === "deportes" && sub)) {
    apartado = primero || "resumen";
    deporteSel = primero === "deportes" ? sub || null : null;
    pintarLista();
  } else pintarFicha(r);
}
const enApartado = () => !location.hash.includes("/") || /^#entreno\/deportes\//.test(location.hash) || APARTADOS.some((a) => location.hash === `#entreno/${a.id}`);

// =====================================================================
// Formatos: cómo escribir tiempos, distancias y ritmos
// =====================================================================
const dos = (n) => String(n).padStart(2, "0");
export function tiempo(seg, corto = false) {
  if (seg == null) return "—";
  seg = Math.round(seg);
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  if (corto) return h ? `${h} h ${dos(m)} min` : `${m} min`;
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}
const km = (m, dec = 2) => (m == null ? "—" : `${(m / 1000).toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec })} km`);
const metros = (m) => (m == null ? "—" : `${Math.round(m).toLocaleString("es-ES")} m`);
const ritmoKm = (v) => (v ? `${tiempo(1000 / v)} /km` : "—"); // v en m/s
const ritmo100 = (v) => (v ? `${tiempo(100 / v)} /100 m` : "—");
const kmh = (v) => (v ? `${(v * 3.6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} km/h` : "—");
const fechaLarga = (d) => d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const horaDe = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Distancia adecuada a cada deporte
const distanciaDe = (a) => (a.distancia ? (a.deporte === "nadar" ? metros(a.distancia) : km(a.distancia)) : null);
// El "ritmo" que interesa en cada deporte
function velocidadDe(a, v = a.velMedia) {
  if (!v) return null;
  if (a.deporte === "correr" || a.deporte === "andar") return ritmoKm(v);
  if (a.deporte === "nadar") return ritmo100(v);
  return kmh(v);
}

// =====================================================================
// LISTA
// =====================================================================
function pintarLista() {
  const todas = almacen.listar();
  const lista = filtro === "todo" ? todas : todas.filter((a) => a.deporte === filtro);
  const presentes = Object.keys(DEPORTES).filter((d) => todas.some((a) => a.deporte === d));
  const titulo = deporteSel && DEPORTES[deporteSel] ? DEPORTES[deporteSel].nombre : APARTADOS.find((a) => a.id === apartado)?.nombre;

  caja.innerHTML = `
    <header class="cabecera entreno-cabecera">
      <h1>Entreno${todas.length && apartado !== "resumen" ? `<small> · ${titulo}</small>` : ""}</h1>
      <button class="boton-icono" data-accion="sincronizar-garmin" aria-label="Traer actividades de Garmin" title="Traer de Garmin"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/></svg></button>
      <button class="boton-icono" data-accion="ajustes" aria-label="Ajustes de entreno" title="Ajustes"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>
      <label class="boton-principal boton-subir"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>Subir<input type="file" multiple data-accion="subir" hidden></label>
    </header>
    ${todas.length ? `<nav class="apartados" aria-label="Apartados de Entreno">
      ${APARTADOS.map((a) => `<a href="#entreno${a.id === "resumen" ? "" : "/" + a.id}" ${a.id === apartado ? 'aria-current="page"' : ""}>${a.nombre}</a>`).join("")}
    </nav>` : ""}
    <div class="entreno-cuerpo">
      ${!todas.length ? vacio() : apartado !== "actividades" ? `<div class="panel-entreno"></div>` : `${presentes.length > 1 ? `<div class="chips" role="group" aria-label="Filtrar por deporte">
        ${["todo", ...presentes].map((d) => `<button data-filtro="${d}" class="${filtro === d ? "activo" : ""}" aria-pressed="${filtro === d}">
          ${d === "todo" ? "Todo" : `<span class="punto-deporte" data-deporte="${d}"></span>${DEPORTES[d].nombre}`}</button>`).join("")}
      </div>` : ""}
      ${listaPorMes(lista)}`}
    </div>`;
  // Que el apartado elegido se vea en la barra (en el móvil puede quedar fuera)
  caja.querySelector('.apartados [aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  calcularAntiguas();
  avisoSinSesion();
  const panel = caja.querySelector(".panel-entreno");
  if (!panel) return;
  const repintar = () => { if (enApartado()) pintarLista(); };
  if (apartado === "forma") pintarForma(panel);
  else if (apartado === "salud") pintarSalud(panel);
  else if (apartado === "deportes") pintarDeportes(panel, { deporte: deporteSel, alCambiar: repintar });
  else pintarResumen(panel, { alCambiar: repintar });
}

// Si no has iniciado sesión (p. ej. tras reinstalar la app), lo decimos claro
async function avisoSinSesion() {
  if (!window.nube || !navigator.onLine || (await garmin.haySesion())) return;
  if (!enApartado() || caja.querySelector(".aviso-sesion")) return;
  caja.querySelector(".entreno-cuerpo")?.insertAdjacentHTML("afterbegin", `
    <section class="aviso-salud aviso-sesion"><b>Inicia sesión para que lleguen tus entrenos</b>
      <p>Tu Garmin sigue conectado y guardando todo en tu cuenta, pero este dispositivo no tiene la sesión abierta (pasa al borrar y volver a añadir la app).</p>
      <form class="form-entreno form-sesion" data-form="sesion">
        <input name="email" type="email" autocomplete="username" placeholder="tu@email.com" required>
        <input name="clave" type="password" autocomplete="current-password" placeholder="Tu contraseña" required>
        <button class="boton-principal">Iniciar sesión</button>
      </form></section>`);
}

// Las actividades guardadas antes de añadir cálculos nuevos (zonas,
// eficiencia, curvas...) se recalculan una vez leyendo su detalle.
let calculando = false;
function calcularAntiguas() {
  const n = analisis.faltanCalculos().length;
  const nota = () => caja.querySelector(".nota-calculando");
  const ponerNota = (texto) => {
    if (!enApartado()) return;
    if (!nota()) caja.querySelector(".entreno-cuerpo")?.insertAdjacentHTML("afterbegin", `<p class="nota nota-calculando" role="status"></p>`);
    if (nota()) nota().textContent = texto;
  };
  if (!n) return;
  ponerNota(`Analizando tus ${n} actividades para las estadísticas nuevas… (solo esta vez)`);
  if (calculando) return;
  calculando = true;
  analisis.completarCalculos((hechas, total) => ponerNota(`Analizando tus actividades… ${hechas} de ${total}`))
    .then((hechas) => { calculando = false; nota()?.remove(); if (hechas && enApartado()) pintarLista(); })
    .catch(() => { calculando = false; nota()?.remove(); });
}

function listaPorMes(lista) {
  if (!lista.length) return `<p class="nota">No hay actividades de este deporte.</p>`;
  const meses = new Map();
  for (const a of lista) {
    const d = new Date(a.inicio);
    const clave = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    if (!meses.has(clave)) meses.set(clave, []);
    meses.get(clave).push(a);
  }
  return [...meses].map(([mes, xs]) => `
    <section class="mes-entreno">
      <h2>${mes}<span>${xs.length} ${xs.length === 1 ? "actividad" : "actividades"} · ${tiempo(xs.reduce((s, a) => s + (a.duracion || 0), 0), true)}</span></h2>
      <ul class="actividades">${xs.map(tarjeta).join("")}</ul>
    </section>`).join("");
}

function tarjeta(a) {
  const d = new Date(a.inicio);
  const datos = [
    distanciaDe(a),
    tiempo(a.duracion),
    a.deporte !== "gimnasio" ? velocidadDe(a) : (a.seriesN ? `${a.seriesN} series` : null),
    a.fcMedia ? `♥ ${a.fcMedia}` : null,
  ].filter(Boolean);
  return `<li><a href="#entreno/${encodeURIComponent(a.id)}" class="actividad" data-deporte="${a.deporte}">
    <span class="actividad-icono" aria-hidden="true">${iconoDe(a)}</span>
    <span class="actividad-texto">
      <strong>${escapar(a.nombre)}</strong>
      <small>${d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })} · ${horaDe(d)}</small>
    </span>
    <span class="actividad-datos">${datos.map((x) => `<span>${x}</span>`).join("")}</span>
  </a></li>`;
}

function vacio() {
  return `
    <section class="tarjeta-entreno vacio">
      <div class="vacio-icono" aria-hidden="true">🏊 🏃 🚴 🏋️</div>
      <h2>Conecta tu Garmin</h2>
      <p>Así tus actividades llegan solas cada pocos minutos, con todo su detalle, y también tu historial antiguo.</p>
      <p><button class="boton-principal" data-accion="ajustes">Conectar Garmin</button></p>
      <details>
        <summary>¿Prefieres subir un archivo a mano?</summary>
        <ol>
          <li>Entra en <a href="https://connect.garmin.com/modern/activities" target="_blank" rel="noopener">connect.garmin.com</a> (en el iPhone, desde Safari).</li>
          <li>Abre la actividad y toca el engranaje ⚙️ de arriba a la derecha.</li>
          <li>Elige <b>Exportar original</b>. Se descarga un .zip (en el iPhone va a la app Archivos → Descargas).</li>
          <li>Vuelve aquí, toca <b>⬆ Subir</b> y elige ese .zip. Puedes elegir varios a la vez.</li>
        </ol>
      </details>
    </section>`;
}

// =====================================================================
// SUBIR ARCHIVOS
// =====================================================================
async function subir(archivos) {
  if (!archivos.length) return;
  const aviso = avisoFijo("Preparando el lector de Garmin…");
  try {
    const resultado = await leerArchivos(archivos, (i, n) => { aviso.textContent = `Leyendo ${i} de ${n}…`; });
    const buenas = resultado.filter((r) => r.actividad).map((r) => r.actividad);
    const malas = resultado.filter((r) => r.error);
    aviso.textContent = "Guardando…";
    const { nuevas, repetidas } = await almacen.guardar(buenas);
    aviso.remove();
    const partes = [];
    if (nuevas) partes.push(`${nuevas} ${nuevas === 1 ? "actividad nueva" : "actividades nuevas"}`);
    if (repetidas) partes.push(`${repetidas} ya ${repetidas === 1 ? "estaba" : "estaban"}`);
    if (malas.length) partes.push(`${malas.length} sin leer`);
    avisar(partes.join(" · ") || "No había nada que subir");
    if (malas.length) console.warn("Entreno: archivos sin leer", malas);
    if (nuevas === 1 && buenas.length === 1) location.hash = `#entreno/${encodeURIComponent(buenas[0].id)}`;
    else pintarLista();
  } catch (error) {
    console.error(error);
    aviso.remove();
    avisar(navigator.onLine ? "No he podido leer los archivos" : "Para subir actividades hace falta conexión");
  }
}

// Avisos pequeños abajo (reutilizamos el estilo .aviso del horario)
function avisar(texto) {
  const a = avisoFijo(texto);
  setTimeout(() => a.remove(), 3200);
}
function avisoFijo(texto) {
  document.querySelectorAll(".aviso").forEach((x) => x.remove());
  const a = document.createElement("div");
  a.className = "aviso";
  a.setAttribute("role", "status");
  a.textContent = texto;
  document.body.append(a);
  return a;
}

// =====================================================================
// GARMIN: lo que deja la función de Supabase, a la lista
// =====================================================================
async function traerDeGarmin() {
  let aviso = null;
  const total = await garmin.recoger((n) => {
    aviso ??= avisoFijo("");
    aviso.textContent = `Trayendo de Garmin… ${n} ${n === 1 ? "actividad" : "actividades"}`;
  }).catch((e) => { console.error("Garmin", e); return 0; });
  aviso?.remove();
  if (total) {
    avisar(`${total} ${total === 1 ? "actividad nueva" : "actividades nuevas"} de Garmin`);
    if (enApartado()) pintarLista();
  }
  return total;
}

async function sincronizarGarmin(boton) {
  boton?.classList.add("girando");
  const aviso = avisoFijo("Preguntando a Garmin…");
  try {
    const estado = await garmin.funcion("sincronizar");
    aviso.remove();
    if (!estado.conectada) { abrirAjustes(); return; }
    const total = await traerDeGarmin();
    if (!total) avisar(estado.error ? `Garmin: ${estado.error}` : "No hay nada nuevo");
  } catch (e) {
    aviso.remove();
    avisar(e.message);
  } finally {
    boton?.classList.remove("girando");
  }
}

// =====================================================================
// AJUSTES: Garmin y pulsaciones máximas para las zonas
// =====================================================================
function fcMaxima() {
  const a = almacen.ajustes();
  if (a.fcMax) return { valor: a.fcMax, estimada: false };
  const vistas = almacen.listar().map((x) => x.fcMax).filter(Boolean);
  return { valor: vistas.length ? Math.max(...vistas) : 190, estimada: true };
}

function abrirAjustes() {
  const hoja = document.getElementById("hoja");
  const fc = fcMaxima();
  const aj = almacen.ajustes();
  const u = analisis.umbrales();
  hoja.dataset.tipo = "entreno";
  hoja.querySelector(".hoja-contenido").innerHTML = `
    <header class="form-cabecera"><h2>⚙️ Ajustes de entreno</h2></header>
    <div class="form-cuerpo">
    <section class="garmin-ajustes" aria-live="polite"><p class="nota">Mirando tu conexión con Garmin…</p></section>
    <form class="form-entreno" id="form-ajustes-entreno">
      <label class="campo"><span>Pulsaciones máximas</span>
        <input name="fcMax" type="number" min="120" max="230" inputmode="numeric" value="${almacen.ajustes().fcMax || ""}" placeholder="${fc.valor}">
      </label>
      <p class="nota">Sirven para calcular tus zonas de pulso. ${fc.estimada ? `Ahora uso ${fc.valor}, el máximo que he visto en tus actividades.` : ""} Si la conoces de una prueba o de tu reloj (Garmin la muestra en Zonas de frecuencia cardiaca), escríbela aquí.</p>
      <label class="campo"><span>Pulso en reposo</span>
        <input name="fcReposo" type="number" min="30" max="100" inputmode="numeric" value="${aj.fcReposo || ""}" placeholder="50">
      </label>
      <p class="nota">El que tienes al despertar. Garmin lo enseña en Frecuencia cardiaca → En reposo. Si no lo pones, uso 50.</p>
      <label class="campo"><span>CSS de natación (min:seg por 100 m)</span>
        <input name="css" type="text" inputmode="numeric" pattern="\\d{1,2}:\\d{2}" value="${aj.css ? tiempo(aj.css) : ""}" placeholder="${u.css && u.cssEstimada ? tiempo(u.css) : "1:50"}">
      </label>
      <p class="nota">Tu ritmo umbral en piscina. Si lo dejas vacío lo calculo con tus mejores 200 y 400 m.</p>
      <label class="campo"><span>FTP de bici (vatios)</span>
        <input name="ftp" type="number" min="50" max="600" inputmode="numeric" value="${aj.ftp || ""}" placeholder="Solo si tienes medidor de potencia">
      </label>
      <div class="fila-botones"><button class="boton-principal">Guardar</button></div>
    </form>
    </div>`;
  hoja.showModal();
  pintarGarmin(hoja.querySelector(".garmin-ajustes"));
  hoja.querySelector("#form-ajustes-entreno").addEventListener("submit", (e) => {
    e.preventDefault();
    const datos = new FormData(e.target);
    const [m, sg] = String(datos.get("css") || "").split(":").map(Number);
    almacen.guardarAjustes({
      fcMax: Number(datos.get("fcMax")) || null,
      fcReposo: Number(datos.get("fcReposo")) || null,
      css: m >= 0 && sg >= 0 && m * 60 + sg > 30 ? m * 60 + sg : null,
      ftp: Number(datos.get("ftp")) || null,
    });
    hoja.close();
    mostrar(location.hash.split("/").slice(1).join("/"));
  });
}

// ----- Objetivo: una carrera con fecha -----
function abrirObjetivo() {
  const hoja = document.getElementById("hoja");
  const o = almacen.ajustes().objetivo || {};
  hoja.dataset.tipo = "entreno";
  hoja.querySelector(".hoja-contenido").innerHTML = `
    <header class="form-cabecera"><h2>🎯 Tu objetivo</h2></header>
    <div class="form-cuerpo">
    <form class="form-entreno" id="form-objetivo">
      <label class="campo"><span>Tipo de prueba</span>
        <select name="tipo">${Object.entries(analisis.TIPOS_OBJETIVO).map(([k, t]) => `<option value="${k}" ${o.tipo === k ? "selected" : ""}>${t.nombre}</option>`).join("")}</select>
      </label>
      <label class="campo"><span>Nombre (opcional)</span>
        <input name="nombre" type="text" maxlength="60" value="${escapar(o.nombre || "")}" placeholder="Por ejemplo: Medio Ironman de Valencia">
      </label>
      <label class="campo"><span>Fecha</span>
        <input name="fecha" type="date" required value="${o.fecha || ""}">
      </label>
      <label class="campo"><span>Tiempo que quieres hacer (opcional)</span>
        <input name="tiempo" type="text" inputmode="numeric" pattern="(\\d{1,2}:)?\\d{1,2}:\\d{2}" value="${o.tiempo ? tiempo(o.tiempo) : ""}" placeholder="h:mm:ss, p. ej. 1:45:00">
      </label>
      <p class="nota">Verás la cuenta atrás en el Resumen, en qué etapa del plan estás y con qué forma llegarías. En carreras a pie, también si tu predicción llega a tu tiempo.</p>
      <div class="fila-botones">
        ${o.fecha ? `<button type="button" class="boton-peligro" data-accion="quitar-objetivo">Quitar</button>` : ""}
        <button class="boton-principal">Guardar</button>
      </div>
    </form>
    </div>`;
  hoja.showModal();
  hoja.querySelector("#form-objetivo").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const partes = String(d.get("tiempo") || "").split(":").map(Number);
    const seg = partes.length >= 2 && partes.every((x) => x >= 0) ? partes.reduce((s, x) => s * 60 + x, 0) : null;
    almacen.guardarAjustes({ objetivo: { tipo: d.get("tipo"), nombre: String(d.get("nombre") || "").trim(), fecha: d.get("fecha"), tiempo: seg || null } });
    hoja.close();
    pintarLista();
  });
}

const haceCuanto = (iso) => {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

// Sin sesión de tu cuenta, la app no puede hablar con tu Garmin (aunque la
// conexión sigue guardada en el servidor y sigue trayendo tus actividades).
// Pasa, por ejemplo, al borrar y volver a añadir la app en el iPhone.
const formSesion = (error = "") => `
  <h3>⌚ Garmin</h3>
  <p class="nota"><b>Tu Garmin sigue conectado</b>, pero en este dispositivo tienes que iniciar sesión en tu cuenta para ver lo que trae. Pasa al borrar y volver a añadir la app.</p>
  <form class="form-entreno form-sesion" data-form="sesion">
    <input name="email" type="email" autocomplete="username" placeholder="tu@email.com" required>
    <input name="clave" type="password" autocomplete="current-password" placeholder="Tu contraseña" required>
    <button class="boton-principal">Iniciar sesión</button>
  </form>
  ${error ? `<p class="form-error">${escapar(error)}</p>` : ""}
  <p class="nota">El iPhone te ofrece rellenarla con la contraseña guardada (llavero).</p>`;

async function pintarGarmin(zona, estado = null, error = "") {
  if (!estado && window.nube && navigator.onLine && !(await garmin.haySesion())) { zona.innerHTML = formSesion(error); return; }
  if (!estado) {
    try { estado = await garmin.funcion("estado"); }
    catch (e) { estado = { conectada: false }; error = e.message; }
  }
  const fallo = error ? `<p class="form-error">${escapar(error)}</p>` : "";
  if (!estado.conectada) {
    zona.innerHTML = `
      <h3>⌚ Garmin</h3>
      <p class="nota">Conecta tu cuenta para que tus actividades lleguen solas. Solo hay que hacerlo una vez (y renovar la clave cuando caduque).</p>
      <ol class="pasos-garmin">
        <li>Abre <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">tu página de clave personal de Garmin</a> y entra con tu cuenta.</li>
        <li>Toca <b>Create Key</b>, acepta las condiciones y elige la caducidad más larga (1 año).</li>
        <li>Copia la clave (solo se enseña una vez) y pégala aquí:</li>
      </ol>
      <form class="form-entreno" data-form="garmin">
        <input name="clave" type="password" autocomplete="off" spellcheck="false" placeholder="Tu clave de Garmin" required>
        <button class="boton-principal">Conectar</button>
      </form>
      ${fallo}
      <p class="nota">La clave se guarda en tu Supabase, en una tabla que la web no puede leer.</p>`;
    return;
  }
  const partes = [];
  if (estado.ultimaSync) partes.push(`Última comprobación: ${haceCuanto(estado.ultimaSync)}.`);
  partes.push(`${estado.descargadas} ${estado.descargadas === 1 ? "actividad traída" : "actividades traídas"}.`);
  if (estado.pendientes) partes.push(`Faltan ${estado.pendientes} por traer (van llegando de 12 en 12 cada 10 minutos).`);
  if (!estado.historialCompleto) partes.push("Todavía estoy repasando tu historial antiguo.");
  if (estado.fallidas) partes.push(`${estado.fallidas} no se han podido descargar (por ejemplo, actividades sin archivo).`);
  zona.innerHTML = `
    <h3>⌚ Garmin <span class="garmin-ok">Conectado</span></h3>
    <p class="nota">${partes.join(" ")}</p>
    ${estado.error ? `<p class="form-error">Último problema: ${escapar(estado.error)}</p>` : ""}
    ${fallo}
    <div class="fila-botones">
      <button class="boton-secundario" data-accion="garmin-ya">🔄 Traer ahora</button>
      <button class="boton-peligro" data-accion="garmin-desconectar">Desconectar</button>
    </div>`;
}

document.addEventListener("submit", async (e) => {
  const sesionForm = e.target.closest?.('[data-form="sesion"]');
  if (sesionForm) {
    e.preventDefault();
    const zona = sesionForm.closest(".garmin-ajustes") || sesionForm.closest(".aviso-sesion");
    sesionForm.querySelector("button").disabled = true;
    try {
      const sb = await window.nube.supabase();
      const { error } = await sb.auth.signInWithPassword({ email: sesionForm.email.value.trim(), password: sesionForm.clave.value });
      if (error) throw new Error(/invalid login/i.test(error.message) ? "Email o contraseña incorrectos." : error.message);
      window.nube.sincronizar?.();
      if (zona?.classList.contains("garmin-ajustes")) await pintarGarmin(zona);
      else zona?.remove();
      traerDeGarmin();
      avisar("Sesión iniciada");
    } catch (err) {
      sesionForm.querySelector("button").disabled = false;
      if (zona?.classList.contains("garmin-ajustes")) zona.innerHTML = formSesion(err.message);
      else avisar(err.message);
    }
    return;
  }
  const form = e.target.closest?.('[data-form="garmin"]');
  if (!form) return;
  e.preventDefault();
  const zona = form.closest(".garmin-ajustes");
  const boton = form.querySelector("button");
  boton.disabled = true;
  boton.textContent = "Conectando…";
  try {
    const estado = await garmin.funcion("conectar", { clave: new FormData(form).get("clave") });
    await pintarGarmin(zona, estado);
    traerDeGarmin();
  } catch (err) {
    await pintarGarmin(zona, { conectada: false }, err.message);
  }
});

// =====================================================================
// FICHA DE UNA ACTIVIDAD
// =====================================================================
async function pintarFicha(id) {
  const resumen = almacen.buscar(id);
  caja.innerHTML = `
    <header class="cabecera entreno-cabecera">
      <a href="#entreno/actividades" class="volver" aria-label="Volver a tus actividades">‹ Actividades</a>
    </header>
    <div class="entreno-cuerpo"><p class="nota">Cargando la actividad…</p></div>`;
  window.scrollTo({ top: 0 });
  const act = resumen && (await almacen.detalle(id).catch(() => null));
  if (location.hash !== `#entreno/${encodeURIComponent(id)}`) return; // ya te fuiste a otra
  const cuerpo = caja.querySelector(".entreno-cuerpo");
  if (!resumen) { cuerpo.innerHTML = `<p class="nota">No encuentro esta actividad. Puede que la hayas borrado.</p>`; return; }
  const a = act || resumen; // sin detalle (p. ej. sin conexión) enseñamos al menos el resumen
  const inicio = new Date(a.inicio);

  cuerpo.innerHTML = `
    <section class="ficha-entreno-cabecera" data-deporte="${a.deporte}">
      <span class="actividad-icono grande" aria-hidden="true">${iconoDe(a)}</span>
      <div>
        <h1>${escapar(a.nombre)}</h1>
        <p>${fechaLarga(inicio)} · ${horaDe(inicio)}${a.dispositivo ? ` · ${escapar(a.dispositivo)}` : ""}</p>
      </div>
    </section>
    ${a.gps ? `<div class="mapa-entreno" data-deporte="${a.deporte}"></div>` : ""}
    <section class="cifras-grandes">${cifras(a)}</section>
    ${act ? "" : `<p class="nota">No he podido cargar el detalle (gráficas y vueltas). Comprueba la conexión.</p>`}
    <div class="graficas-entreno" data-deporte="${a.deporte}"></div>
    ${act ? zonasHtml(act) : ""}
    ${act?.deporte === "nadar" ? natacionHtml(act) : ""}
    ${act?.series?.length ? seriesHtml(act) : ""}
    ${act && act.deporte !== "nadar" && act.vueltas?.length > 1 ? vueltasHtml(act) : ""}
    <footer class="ficha-entreno-pie">
      <button class="boton-peligro" data-accion="borrar">Borrar actividad</button>
    </footer>`;

  if (!act) return;
  const grupo = crearGrupo();
  const mapaCaja = cuerpo.querySelector(".mapa-entreno");
  if (mapaCaja && act.puntos?.lat) mapa(mapaCaja, act.puntos.lat, act.puntos.lon, grupo).catch(() => mapaCaja.remove());
  dibujarGraficas(act, cuerpo.querySelector(".graficas-entreno"), grupo);
  if (act.deporte === "nadar") dibujarLargos(act, cuerpo.querySelector(".largos-grafica"));
}

// Los datos grandes de arriba (cambian según el deporte)
function cifras(a) {
  const c = [];
  const pon = (nombre, valor, extra = "") => valor && valor !== "—" && c.push(`<div><span>${nombre}</span><b>${valor}</b>${extra ? `<small>${extra}</small>` : ""}</div>`);
  pon("Distancia", distanciaDe(a));
  pon("Tiempo", tiempo(a.duracion), a.transcurrido && a.transcurrido - a.duracion > 60 ? `${tiempo(a.transcurrido)} con pausas` : "");
  if (a.deporte === "correr") pon("Ritmo medio", ritmoKm(a.velMedia));
  if (a.deporte === "nadar") pon("Ritmo medio", ritmo100(a.velMedia));
  if (a.deporte === "bici") pon("Velocidad media", kmh(a.velMedia), a.velMax ? `máx. ${kmh(a.velMax)}` : "");
  if (!["correr", "nadar", "bici", "gimnasio"].includes(a.deporte) && a.velMedia && a.distancia) pon(a.deporte === "andar" ? "Ritmo medio" : "Velocidad media", velocidadDe(a));
  pon("Pulso medio", a.fcMedia && `${a.fcMedia} ppm`, a.fcMax ? `máx. ${a.fcMax}` : "");
  if (a.deporte === "nadar") {
    pon("SWOLF", a.swolf);
    pon("Largos", a.largos, a.piscina ? `piscina de ${a.piscina} m` : "");
    pon("Brazadas", a.brazadas?.toLocaleString("es-ES"));
  }
  if (a.deporte === "gimnasio" && a.series) {
    const activas = a.series.filter((s) => !s.descanso);
    pon("Series", activas.length);
    pon("Repeticiones", activas.reduce((s, x) => s + (x.reps || 0), 0));
    const vol = activas.reduce((s, x) => s + (x.reps || 0) * (x.peso || 0), 0);
    if (vol) pon("Volumen", `${Math.round(vol).toLocaleString("es-ES")} kg`);
  }
  pon("Desnivel +", a.desnivel != null && a.desnivel > 0 && `${a.desnivel} m`);
  pon("Cadencia", a.cadencia && `${Math.round(a.cadencia)} ${a.deporte === "correr" ? "ppm" : "rpm"}`, a.deporte === "correr" ? "pasos por minuto" : "");
  pon("Potencia", a.potencia && `${a.potencia} W`, a.potenciaNormalizada ? `normalizada ${a.potenciaNormalizada} W` : "");
  pon("Calorías", a.calorias && `${a.calorias.toLocaleString("es-ES")} kcal`);
  pon("Efecto aeróbico", a.efectoAerobico, a.efectoAnaerobico != null ? `anaeróbico ${a.efectoAnaerobico}` : "");
  const carga = analisis.cargaDe(a, analisis.umbrales());
  pon("Carga (TSS)", carga.tss || null, analisis.NOMBRE_METODO[carga.metodo]);
  pon("Carga Garmin", a.carga);
  const x = a.puntos ? analisis.derivados(a) : a;
  pon("Eficiencia", x.ef && x.ef.toLocaleString("es-ES", { maximumFractionDigits: 2 }), x.efPot ? "vatios por latido" : "metros/min por latido");
  pon("Desacople", x.desacople != null && `${x.desacople.toLocaleString("es-ES")} %`, x.desacople != null ? (x.desacople < 5 ? "buena base aeróbica" : "se cae en la 2ª mitad") : "");
  return c.join("");
}

function dibujarGraficas(a, caja, grupo) {
  const p = a.puntos || {};
  if (!p.t?.length) return;
  // Eje horizontal: distancia si la hay (carrera, bici), si no tiempo
  const porDistancia = a.deporte !== "nadar" && p.d?.some((x) => x > 0);
  const xs = porDistancia ? p.d.map((x) => (x ?? 0) / 1000) : p.t.map((x) => x / 60);
  // Que no haya "marcha atrás" en el eje (puede pasar con el GPS)
  for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1]) xs[i] = xs[i - 1];
  const formatoX = porDistancia ? (v) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km` : (v) => tiempo(v * 60);
  const anadir = (g) => g && caja.append(g);

  if (p.v && a.deporte !== "nadar") {
    const v = suavizar(p.v, 6);
    if (a.deporte === "correr" || a.deporte === "andar") {
      // Ritmo en min/km. Lo muy lento (paradas) lo dejamos fuera para que no aplaste la gráfica
      const r = v.map((x) => (x && x > 1000 / 900 ? 1000 / x / 60 : null));
      anadir(graficaLinea({ xs, ys: r, titulo: "Ritmo", resumen: ritmoKm(a.velMedia), invertir: true, area: false, grupo, formatoX, color: "var(--c-ritmo)",
        formatoY: (m, eje) => (eje ? tiempo(m * 60) : `${tiempo(m * 60)} /km`) }));
    } else {
      anadir(graficaLinea({ xs, ys: v.map((x) => (x == null ? null : x * 3.6)), titulo: "Velocidad", resumen: kmh(a.velMedia), grupo, formatoX, min: 0, color: "var(--c-ritmo)",
        formatoY: (k, eje) => (eje ? Math.round(k) : `${k.toFixed(1)} km/h`) }));
    }
  }
  if (p.fc) anadir(graficaLinea({ xs, ys: suavizar(p.fc, 2), titulo: "Pulso", resumen: a.fcMedia ? `media ${a.fcMedia} ppm` : "", grupo, formatoX,
    color: "var(--c-pulso)", formatoY: (f, eje) => (eje ? Math.round(f) : `${Math.round(f)} ppm`) }));
  if (p.alt && a.gps) anadir(graficaLinea({ xs, ys: suavizar(p.alt, 3), titulo: "Altitud", resumen: a.desnivel ? `+${a.desnivel} m` : "", grupo, formatoX,
    color: "var(--c-altitud)", formatoY: (m, eje) => (eje ? Math.round(m) : `${Math.round(m)} m`) }));
  if (p.cad && a.deporte !== "nadar") anadir(graficaLinea({ xs, ys: suavizar(p.cad, 3), titulo: "Cadencia", resumen: a.cadencia ? `media ${Math.round(a.cadencia)}` : "", grupo, formatoX, area: false,
    color: "var(--c-cadencia)", formatoY: (c, eje) => (eje ? Math.round(c) : `${Math.round(c)} ${a.deporte === "correr" ? "ppm" : "rpm"}`) }));
  if (p.pot && a.deporte !== "correr") anadir(graficaLinea({ xs, ys: suavizar(p.pot, 5), titulo: "Potencia", resumen: a.potencia ? `media ${a.potencia} W` : "", grupo, formatoX,
    color: "var(--c-potencia)", formatoY: (w, eje) => (eje ? Math.round(w) : `${Math.round(w)} W`), min: 0 }));
}

// ----- Zonas de pulso -----
const ZONAS = [
  { nombre: "Z1", texto: "Muy suave", desde: 0.5 },
  { nombre: "Z2", texto: "Suave", desde: 0.6 },
  { nombre: "Z3", texto: "Moderado", desde: 0.7 },
  { nombre: "Z4", texto: "Fuerte", desde: 0.8 },
  { nombre: "Z5", texto: "Máximo", desde: 0.9 },
];
function zonasHtml(a) {
  const p = a.puntos || {};
  if (!p.fc || !p.t) return "";
  const fc = fcMaxima();
  const segundos = ZONAS.map(() => 0);
  for (let i = 1; i < p.t.length; i++) {
    const f = p.fc[i];
    const dt = Math.min(30, p.t[i] - p.t[i - 1]); // si hubo pausa larga no la contamos
    if (!f || dt <= 0) continue;
    const z = ZONAS.findLastIndex((zz) => f >= zz.desde * fc.valor);
    if (z >= 0) segundos[z] += dt;
  }
  const total = segundos.reduce((s, x) => s + x, 0);
  if (!total) return "";
  const max = Math.max(...segundos);
  return `
    <section class="tarjeta-entreno zonas">
      <h2>Zonas de pulso</h2>
      <ul>${ZONAS.map((z, i) => `
        <li>
          <span class="zona-nombre"><b>${z.nombre}</b> ${z.texto}<small>${Math.round(z.desde * fc.valor)}–${i < 4 ? Math.round(ZONAS[i + 1].desde * fc.valor) - 1 : fc.valor} ppm</small></span>
          <span class="zona-barra"><span style="width:${(segundos[i] / max) * 100}%;${segundos[i] ? "" : "min-width:0"}" data-zona="${i + 1}"></span></span>
          <span class="zona-tiempo">${tiempo(segundos[i], true)}<small>${Math.round((segundos[i] / total) * 100)} %</small></span>
        </li>`).join("")}
      </ul>
      <p class="nota">Calculadas con pulsaciones máximas de ${fc.valor}${fc.estimada ? " (estimadas)" : ""}. <button class="enlace" data-accion="ajustes">Cambiar</button></p>
    </section>`;
}

// ----- Vueltas (carrera, bici) -----
function vueltasHtml(a) {
  const vueltas = a.vueltas.filter((v) => v.dur > 0);
  const vels = vueltas.map((v) => v.vel).filter(Boolean);
  const vMax = Math.max(...vels), vMin = Math.min(...vels);
  const esCorrer = a.deporte === "correr";
  return `
    <section class="tarjeta-entreno vueltas">
      <h2>Vueltas</h2>
      <table>
        <thead><tr><th>#</th><th>Distancia</th><th>Tiempo</th><th>${esCorrer ? "Ritmo" : "Velocidad"}</th><th>Pulso</th></tr></thead>
        <tbody>${vueltas.map((v, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${km(v.dist)}</td>
            <td>${tiempo(v.dur)}</td>
            <td class="celda-barra"><span class="mini-barra" style="width:${vMax > vMin ? 35 + ((v.vel - vMin) / (vMax - vMin)) * 65 : 100}%"></span><span>${esCorrer ? ritmoKm(v.vel).replace(" /km", "") : kmh(v.vel)}</span></td>
            <td>${v.fcMedia ?? "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>`;
}

// ----- Natación: series y largos -----
function natacionHtml(a) {
  const series = a.vueltas.filter((v) => v.dist > 0);
  const largos = a.largosDetalle || [];
  const estilos = [...new Set(largos.filter((l) => l.activo && l.estilo).map((l) => l.estilo))];
  return `
    ${series.length ? `<section class="tarjeta-entreno series-natacion">
      <h2>Series</h2>
      <table>
        <thead><tr><th>#</th><th>Metros</th><th>Estilo</th><th>Tiempo</th><th>Ritmo /100 m</th></tr></thead>
        <tbody>${series.map((v, i) => `
          <tr><td>${i + 1}</td><td>${metros(v.dist)}</td><td>${ESTILOS[v.estilo] || "—"}</td><td>${tiempo(v.dur)}</td><td>${tiempo(100 * v.dur / v.dist)}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>` : ""}
    ${largos.some((l) => l.activo) ? `<section class="tarjeta-entreno">
      <h2>Largo a largo</h2>
      ${estilos.length > 1 ? `<p class="leyenda-estilos">${estilos.map((e, i) => `<span><i style="background:var(--estilo-${i + 1})"></i>${ESTILOS[e] || e}</span>`).join("")}</p>` : ""}
      <div class="largos-grafica"></div>
      <p class="nota">Cada barra es un largo: más alta = más lenta. Los huecos son descansos. SWOLF = segundos + brazadas por largo (cuanto más bajo, más eficiente).</p>
    </section>` : ""}`;
}

function dibujarLargos(a, caja) {
  if (!caja) return;
  const largos = a.largosDetalle || [];
  const estilos = [...new Set(largos.filter((l) => l.activo && l.estilo).map((l) => l.estilo))];
  let n = 0;
  const barras = largos.map((l) => {
    if (!l.activo) return { hueco: true };
    n++;
    const swolf = l.brazadas != null ? Math.round(l.dur + l.brazadas) : null;
    return {
      valor: l.dur,
      color: estilos.length > 1 ? `var(--estilo-${estilos.indexOf(l.estilo) + 1})` : "var(--serie)",
      etiqueta: `Largo ${n} · ${tiempo(l.dur)} · ${ESTILOS[l.estilo] || ""}${l.brazadas != null ? ` · ${l.brazadas} brazadas · SWOLF ${swolf}` : ""}`,
    };
  });
  const g = graficaBarras({ barras, titulo: "Tiempo por largo", resumen: a.swolf ? `SWOLF medio ${a.swolf}` : "", formatoY: (s, eje) => (eje ? `${Math.round(s)} s` : tiempo(s)) });
  if (g) caja.append(g);
}

// ----- Gimnasio: series agrupadas por ejercicio -----
function seriesHtml(a) {
  const grupos = new Map();
  for (const s of a.series.filter((x) => !x.descanso)) {
    if (!grupos.has(s.ejercicio)) grupos.set(s.ejercicio, []);
    grupos.get(s.ejercicio).push(s);
  }
  return `
    <section class="tarjeta-entreno ejercicios">
      <h2>Ejercicios</h2>
      <ul>${[...grupos].map(([nombre, xs]) => `
        <li>
          <strong>${escapar(nombre)}</strong>
          <span class="series-chips">${xs.map((s) => `<span>${s.reps ?? "?"}${s.peso ? ` × ${s.peso.toLocaleString("es-ES")} kg` : ""}</span>`).join("")}</span>
        </li>`).join("")}
      </ul>
    </section>`;
}

// =====================================================================
// Botones (un solo "escuchador" para toda la sección)
// =====================================================================
document.addEventListener("click", async (e) => {
  if (!caja?.contains(e.target) && !e.target.closest("#hoja")) return;
  const filtroBtn = e.target.closest("[data-filtro]");
  if (filtroBtn) { filtro = filtroBtn.dataset.filtro; pintarLista(); return; }
  const irFiltro = e.target.closest("[data-ir-filtro]");
  if (irFiltro) filtro = irFiltro.dataset.irFiltro; // "Ver todas" de un deporte: la lista ya filtrada
  const accion = e.target.closest("[data-accion]")?.dataset.accion;
  if (accion === "ajustes") abrirAjustes();
  if (accion === "objetivo") abrirObjetivo();
  if (accion === "quitar-objetivo") { almacen.guardarAjustes({ objetivo: null }); document.getElementById("hoja").close(); pintarLista(); }
  if (accion === "sincronizar-garmin") sincronizarGarmin(e.target.closest("button"));
  if (accion === "garmin-ya" || accion === "garmin-desconectar") {
    const zona = e.target.closest(".garmin-ajustes");
    const boton = e.target.closest("button");
    if (accion === "garmin-desconectar" && !boton.classList.contains("confirmar")) {
      boton.classList.add("confirmar");
      boton.textContent = "Toca otra vez";
      return;
    }
    zona.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      const estado = await garmin.funcion(accion === "garmin-ya" ? "sincronizar" : "desconectar");
      await pintarGarmin(zona, estado);
      if (accion === "garmin-ya") traerDeGarmin();
    } catch (err) {
      await pintarGarmin(zona, null, err.message);
    }
  }
  if (accion === "borrar") {
    const boton = e.target.closest("button");
    // Primer toque: pide confirmación. Segundo toque: borra.
    if (!boton.classList.contains("confirmar")) {
      boton.classList.add("confirmar");
      boton.textContent = "Toca otra vez para borrar";
      setTimeout(() => { boton.classList.remove("confirmar"); boton.textContent = "Borrar actividad"; }, 4000);
      return;
    }
    const id = decodeURIComponent(location.hash.split("/").slice(1).join("/"));
    await almacen.borrar(id);
    avisar("Actividad borrada");
    location.hash = "#entreno";
  }
});
document.addEventListener("change", (e) => {
  if (e.target.matches?.('[data-accion="subir"]') && caja?.contains(e.target)) {
    subir([...e.target.files]);
    e.target.value = "";
  }
});
