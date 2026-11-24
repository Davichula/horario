// =====================================================================
// entreno/entrenos.js — tus ENTRENAMIENTOS planificados
// ---------------------------------------------------------------------
// Aquí diseñas una sesión (calentamiento, series, recuperaciones...) y la
// descargas como archivo .FIT de entrenamiento, el formato que entiende
// tu Garmin, o la mandas a tu calendario de Garmin Connect a través de
// Intervals.icu (función "intervals" de Supabase): de ahí llega sola al reloj.
//
// Cómo se guarda un entrenamiento (en localStorage, clave
// "mi-horario:entreno-planes", y sincronizado con Supabase):
//   { id, nombre, deporte: "correr" | "bici" | "nadar", fecha: "2026-11-26",
//     pasos: [ paso, { id, tipo: "repetir", veces: 6, pasos: [paso, paso] }, ... ] }
//   paso = { id, tipo: "calentar" | "trabajo" | "recuperar" | "enfriar",
//            dur: { tipo: "tiempo" | "distancia" | "boton", valor },   (segundos o metros)
//            obj: { tipo: "libre" | "ritmo" | "pulso", ref, min, max } }
//   El ritmo se guarda en segundos por km (min = más rápido) y el pulso en ppm.
// =====================================================================

import * as almacen from "./almacen.js";
import * as an from "./analisis.js";
import { DEPORTES } from "./fit.js";

const CLAVE = "mi-horario:entreno-planes";
const FIT_SDK = "https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.222.0/src/index.js";

const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; } };
const guardarTodos = (l) => localStorage.setItem(CLAVE, JSON.stringify(l));
const nuevoId = () => Math.random().toString(36).slice(2, 10);
export const listar = () => leer().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creado || 0) - (a.creado || 0));
const buscar = (id) => leer().find((w) => w.id === id);
function guardar(w) {
  const l = leer();
  const i = l.findIndex((x) => x.id === w.id);
  if (i >= 0) l[i] = w; else l.push(w);
  guardarTodos(l);
}
function borrar(id) { guardarTodos(leer().filter((w) => w.id !== id)); }

// ---------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------
const dos = (n) => String(n).padStart(2, "0");
const mmss = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${dos(s % 60)}`; };
const duracionTexto = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${dos(m)} min` : `${m} min`; };
const distTexto = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);
const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const NOMBRE_TIPO = { calentar: "Calentamiento", trabajo: "Trabajo", recuperar: "Recuperar", enfriar: "Enfriamiento" };
const verbo = (deporte) => ({ correr: "Correr", bici: "Pedalear", nadar: "Nadar" })[deporte] || "Trabajo";

// ---------------------------------------------------------------------
// Tus ritmos y zonas de referencia (salen de tus récords y tu pulso máximo)
// ---------------------------------------------------------------------
// Ritmos de carrera, como múltiplos de tu ritmo de 5 km
const RITMOS = [
  { ref: "suave", nombre: "Suave", f: 1.3 },
  { ref: "maraton", nombre: "Maratón", f: 1.15 },
  { ref: "umbral", nombre: "Umbral", f: 1.07 },
  { ref: "10k", nombre: "10 km", f: 1.04 },
  { ref: "5k", nombre: "5 km", f: 1.0 },
  { ref: "1k", nombre: "1 km", f: 0.93 },
];
function referencias() {
  const lista = almacen.listar();
  const u = an.umbrales(lista);
  const pred = an.prediccionRiegel(lista)?.find((p) => p.distancia === 5000);
  const ritmo5k = pred ? pred.t / 5 : 300; // segundos por km (si no hay marcas: 5:00 /km)
  const ritmos = Object.fromEntries(RITMOS.map((r) => [r.ref, { ...r, centro: ritmo5k * r.f }]));
  const zonas = an.ZONAS_FC.map((z, i, todas) => ({
    ref: z.nombre, nombre: `${z.nombre} ${z.texto.toLowerCase()}`,
    min: Math.round(z.desde * u.fcMax), max: Math.round((todas[i + 1]?.desde ?? 1) * u.fcMax) - 1,
  }));
  return { ritmo5k, ritmos, zonas, fcMax: u.fcMax, deMarcas: !!pred };
}
const rangoRitmo = (R, ref) => ({ tipo: "ritmo", ref, min: Math.round(R.ritmos[ref].centro - 5), max: Math.round(R.ritmos[ref].centro + 5) });
const rangoPulso = (R, z) => { const x = R.zonas.find((y) => y.ref === z); return { tipo: "pulso", ref: z, min: x.min, max: x.max }; };

// ---------------------------------------------------------------------
// Plantillas: un punto de partida que luego cambias
// ---------------------------------------------------------------------
const p = (tipo, dur, obj = { tipo: "libre" }) => ({ id: nuevoId(), tipo, dur, obj });
const t = (s) => ({ tipo: "tiempo", valor: s });
const d = (m) => ({ tipo: "distancia", valor: m });
const rep = (veces, pasos) => ({ id: nuevoId(), tipo: "repetir", veces, pasos });
const PLANTILLAS = {
  correr: [
    { nombre: "Series cortas", hacer: (R) => [p("calentar", t(900), rangoPulso(R, "Z2")), rep(8, [p("trabajo", d(400), rangoRitmo(R, "1k")), p("recuperar", t(90))]), p("enfriar", t(600), rangoPulso(R, "Z1"))] },
    { nombre: "Series largas", hacer: (R) => [p("calentar", t(900), rangoPulso(R, "Z2")), rep(6, [p("trabajo", d(800), rangoRitmo(R, "5k")), p("recuperar", t(120))]), p("enfriar", t(600), rangoPulso(R, "Z1"))] },
    { nombre: "Umbral", hacer: (R) => [p("calentar", t(900), rangoPulso(R, "Z2")), rep(2, [p("trabajo", t(900), rangoRitmo(R, "umbral")), p("recuperar", t(180))]), p("enfriar", t(600), rangoPulso(R, "Z1"))] },
    { nombre: "Fartlek", hacer: (R) => [p("calentar", t(600), rangoPulso(R, "Z2")), rep(10, [p("trabajo", t(60), rangoRitmo(R, "10k")), p("recuperar", t(60), rangoRitmo(R, "suave"))]), p("enfriar", t(600), rangoPulso(R, "Z1"))] },
    { nombre: "Rodaje suave", hacer: (R) => [p("trabajo", t(2700), rangoPulso(R, "Z2"))] },
    { nombre: "Tirada larga", hacer: (R) => [p("trabajo", d(16000), rangoPulso(R, "Z2"))] },
  ],
  bici: [
    { nombre: "Fondo Z2", hacer: (R) => [p("trabajo", t(5400), rangoPulso(R, "Z2"))] },
    { nombre: "Sweet spot", hacer: (R) => [p("calentar", t(900), rangoPulso(R, "Z2")), rep(3, [p("trabajo", t(600), rangoPulso(R, "Z4")), p("recuperar", t(300), rangoPulso(R, "Z1"))]), p("enfriar", t(600), rangoPulso(R, "Z1"))] },
    { nombre: "VO2max", hacer: (R) => [p("calentar", t(900), rangoPulso(R, "Z2")), rep(5, [p("trabajo", t(180), rangoPulso(R, "Z5")), p("recuperar", t(180), rangoPulso(R, "Z1"))]), p("enfriar", t(600), rangoPulso(R, "Z1"))] },
  ],
  nadar: [
    { nombre: "Series 100", hacer: () => [p("calentar", d(400)), rep(10, [p("trabajo", d(100)), p("recuperar", t(20))]), p("enfriar", d(200))] },
    { nombre: "Series 400", hacer: () => [p("calentar", d(400)), rep(4, [p("trabajo", d(400)), p("recuperar", t(45))]), p("enfriar", d(200))] },
    { nombre: "Continuo", hacer: () => [p("trabajo", d(2000))] },
  ],
};

function nuevo(deporte = "correr", plantilla = 0) {
  const R = referencias();
  const pl = PLANTILLAS[deporte][plantilla];
  const hoy = new Date(); hoy.setDate(hoy.getDate() + 1);
  return { id: nuevoId(), nombre: pl.nombre, deporte, fecha: an.claveDia(hoy), creado: Date.now(), pasos: pl.hacer(R) };
}

// ---------------------------------------------------------------------
// Estimaciones: cuánto dura y cuántos km tiene
// ---------------------------------------------------------------------
// Velocidad (m/s) que suponemos en cada paso para estimar
function velocidad(paso, w, R) {
  if (w.deporte === "bici") return { calentar: 7, trabajo: paso.obj.tipo === "pulso" && /Z[45]/.test(paso.obj.ref) ? 9 : 8, recuperar: 6.5, enfriar: 7 }[paso.tipo];
  if (w.deporte === "nadar") return { calentar: 0.8, trabajo: 0.95, recuperar: 0, enfriar: 0.8 }[paso.tipo];
  if (paso.obj.tipo === "ritmo") return 1000 / ((paso.obj.min + paso.obj.max) / 2);
  const ref = { calentar: "suave", trabajo: paso.obj.tipo === "pulso" && /Z[12]/.test(paso.obj.ref) ? "suave" : "umbral", recuperar: "suave", enfriar: "suave" }[paso.tipo];
  return (1000 / R.ritmos[ref].centro) * (paso.tipo === "recuperar" ? 0.85 : 1);
}
function plano(pasos) { // los pasos en orden, con las repeticiones desplegadas
  return pasos.flatMap((x) => (x.tipo === "repetir" ? Array.from({ length: x.veces }, () => plano(x.pasos)).flat() : [x]));
}
function estimar(w, R) {
  let tiempo = 0, dist = 0;
  const tramos = plano(w.pasos).map((x) => {
    const v = velocidad(x, w, R);
    const s = x.dur.tipo === "tiempo" ? x.dur.valor : x.dur.tipo === "distancia" ? (v ? x.dur.valor / v : 0) : 300;
    const m = x.dur.tipo === "distancia" ? x.dur.valor : s * v;
    tiempo += s; dist += m;
    return { paso: x, s };
  });
  return { tiempo, dist, tramos };
}

// Perfil: un bloque por paso, ancho = duración, alto = intensidad
const ALTURA = { calentar: 0.35, trabajo: 1, recuperar: 0.22, enfriar: 0.3 };
function altura(paso) {
  if (paso.tipo !== "trabajo") return ALTURA[paso.tipo];
  if (paso.obj.tipo === "pulso") return 0.35 + 0.13 * Number(paso.obj.ref.slice(1));
  if (paso.obj.tipo === "ritmo") return { suave: 0.4, maraton: 0.6, umbral: 0.75, "10k": 0.85, "5k": 0.92, "1k": 1 }[paso.obj.ref] ?? 0.8;
  return 0.8;
}
function perfil(w, R, alto = 70) {
  const { tiempo, tramos } = estimar(w, R);
  if (!tiempo) return "";
  const W = 340, hueco = tramos.length > 40 ? 1 : 2;
  let x = 0, h = "";
  for (const { paso, s } of tramos) {
    const ancho = Math.max(1.5, (s / tiempo) * (W - hueco * tramos.length));
    const hh = Math.max(6, altura(paso) * alto);
    const clase = paso.tipo === "trabajo" ? "bloque-trabajo" : paso.tipo === "recuperar" ? "bloque-recuperar" : "bloque-suave";
    h += `<rect class="${clase}" x="${x.toFixed(1)}" y="${(alto - hh).toFixed(1)}" width="${ancho.toFixed(1)}" height="${hh.toFixed(1)}" rx="${Math.min(3, ancho / 2)}"/>`;
    x += ancho + hueco;
  }
  return `<svg class="perfil-entreno" viewBox="0 0 ${W} ${alto}" preserveAspectRatio="none" aria-hidden="true">${h}</svg>`;
}

// Resumen de un paso en una línea
function textoDur(x) { return x.dur.tipo === "tiempo" ? duracionTexto(x.dur.valor).replace(" min", x.dur.valor % 60 ? "" : " min").replace(/^0 min$/, "0") .replace(/^(\d+) min$/, "$1 min") : x.dur.tipo === "distancia" ? distTexto(x.dur.valor) : "Hasta pulsar vuelta"; }
function textoDurExacto(x) {
  if (x.dur.tipo !== "tiempo") return textoDur(x);
  const s = x.dur.valor;
  return s < 3600 && s % 60 ? mmss(s) : duracionTexto(s);
}
function textoObj(x, R) {
  if (x.obj.tipo === "ritmo") return { grande: `${mmss(x.obj.min)}–${mmss(x.obj.max)}`, peque: `/km · ritmo ${R.ritmos[x.obj.ref]?.nombre.toLowerCase() || "propio"}` };
  if (x.obj.tipo === "pulso") return { grande: x.obj.ref || "Pulso", peque: `${x.obj.min}–${x.obj.max} ppm` };
  return { grande: "Libre", peque: x.tipo === "recuperar" ? "trotando o parado" : "sin objetivo" };
}

// =====================================================================
// LISTA de entrenamientos
// =====================================================================
export function pintarPlanes(cont) {
  const R = referencias();
  const lista = listar();
  const hoy = an.claveDia(new Date());
  const proximos = lista.filter((w) => !w.fecha || w.fecha >= hoy), pasados = lista.filter((w) => w.fecha && w.fecha < hoy);
  const tarjetaW = (w) => {
    const e = estimar(w, R);
    return `<li><a class="tarjeta-plan" href="#entreno/plan/${w.id}" data-deporte="${w.deporte}">
      <div class="plan-cab"><span class="actividad-icono" aria-hidden="true">${DEPORTES[w.deporte].svg}</span>
        <span><strong>${escapar(w.nombre)}</strong><small>${w.fecha ? new Date(w.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" }) : "Sin fecha"}</small></span>
        <span class="plan-total">${duracionTexto(e.tiempo)}<small>≈ ${distTexto(e.dist)}</small></span></div>
      ${perfil(w, R, 34)}</a></li>`;
  };
  cont.innerHTML = `
    <section class="tarjeta-entreno">
      <header class="tarjeta-cabecera"><h2>Nuevo entrenamiento</h2></header>
      <div class="plantillas-nuevas">${Object.entries(PLANTILLAS).map(([dep, pls]) => `
        <div class="fila-plantillas" data-deporte="${dep}"><span class="plantilla-dep" aria-hidden="true">${DEPORTES[dep].svg}</span>
          <div class="chips envolver">${pls.map((pl, i) => `<button type="button" data-nuevo="${dep}:${i}">${pl.nombre}</button>`).join("")}</div></div>`).join("")}
      </div>
      <p class="nota sin-margen">Elige una plantilla y cámbiala a tu gusto. ${R.deMarcas ? `Los ritmos salen de tu 5 km (${mmss(R.ritmo5k)} /km).` : "Aún no tengo marcas tuyas de carrera, así que uso 5:00 /km de base."}</p>
    </section>
    ${proximos.length ? `<section><h2 class="titulo-lista">Próximos</h2><ul class="lista-planes">${proximos.map(tarjetaW).join("")}</ul></section>` : ""}
    ${pasados.length ? `<section><h2 class="titulo-lista">Anteriores</h2><ul class="lista-planes">${pasados.slice(0, 20).map(tarjetaW).join("")}</ul></section>` : ""}`;
  cont.querySelectorAll("[data-nuevo]").forEach((b) => b.addEventListener("click", () => {
    const [dep, i] = b.dataset.nuevo.split(":");
    const w = nuevo(dep, Number(i));
    guardar(w);
    location.hash = `#entreno/plan/${w.id}`;
  }));
}

// =====================================================================
// EDITOR de un entrenamiento
// =====================================================================
const abiertos = new Set(); // qué pasos tienes desplegados
const TIEMPOS_MIN = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240];
const DISTANCIAS = { correr: [100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 1600, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 21097, 25000, 30000],
  bici: [1000, 2000, 5000, 10000, 15000, 20000, 30000, 40000, 50000, 60000, 80000, 90000, 100000], nadar: [25, 50, 75, 100, 150, 200, 300, 400, 500, 800, 1000, 1500, 1900, 2000, 3000, 3800] };

export function pintarEditor(cont, id) {
  const w = buscar(id);
  if (!w) { cont.innerHTML = `<p class="nota">No encuentro este entrenamiento. Puede que lo hayas borrado.</p>`; return; }
  const R = referencias();
  const e = estimar(w, R);
  const seleccion = (nombre, opciones, actual, attrs = "") => `<label class="desplegable"><select ${attrs} data-campo="${nombre}">${opciones.map(([v, t]) => `<option value="${v}"${String(v) === String(actual) ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
  const segmento = (nombre, opciones, actual) => `<div class="segmento" role="group">${opciones.map(([v, t]) => `<button type="button" data-campo="${nombre}" data-valor="${v}" class="${v === actual ? "activo" : ""}" aria-pressed="${v === actual}">${t}</button>`).join("")}</div>`;

  const editorPaso = (x) => {
    const minutos = Math.floor(x.dur.valor / 60), segundos = x.dur.valor % 60;
    const dists = DISTANCIAS[w.deporte].includes(x.dur.valor) ? DISTANCIAS[w.deporte] : [...DISTANCIAS[w.deporte], x.dur.valor].sort((a, b) => a - b);
    return `<div class="editor-paso" data-paso="${x.id}">
      <span class="etiqueta-campo">Tipo</span>${segmento("tipo", [["calentar", "Calentar"], ["trabajo", verbo(w.deporte)], ["recuperar", "Recuperar"], ["enfriar", "Enfriar"]], x.tipo)}
      <span class="etiqueta-campo">Duración</span>${segmento("durTipo", [["tiempo", "Tiempo"], ["distancia", "Distancia"], ["boton", "Botón vuelta"]], x.dur.tipo)}
      ${x.dur.tipo === "tiempo" ? `<div class="fila-campos">${seleccion("min", TIEMPOS_MIN.includes(minutos) ? TIEMPOS_MIN.map((m) => [m, `${m} min`]) : [...TIEMPOS_MIN, minutos].sort((a, b) => a - b).map((m) => [m, `${m} min`]), minutos)}${seleccion("seg", [0, 10, 15, 20, 30, 40, 45, 50].map((s) => [s, `${s} s`]), segundos)}</div>`
        : x.dur.tipo === "distancia" ? `<div class="fila-campos">${seleccion("dist", dists.map((m) => [m, distTexto(m)]), x.dur.valor)}</div>`
        : `<p class="nota sin-margen">El paso acaba cuando pulses el botón de vuelta del reloj.</p>`}
      ${w.deporte === "nadar" ? "" : `<span class="etiqueta-campo">Objetivo</span>${segmento("objTipo", [["libre", "Libre"], ...(w.deporte === "correr" ? [["ritmo", "Ritmo"]] : []), ["pulso", "Pulso"]], x.obj.tipo)}
      ${x.obj.tipo === "ritmo" ? `<div class="chips chips-mini envolver">${RITMOS.map((r) => `<button type="button" data-campo="ritmoRef" data-valor="${r.ref}" class="${x.obj.ref === r.ref ? "activo" : ""}">${r.nombre} · ${mmss(R.ritmos[r.ref].centro)}</button>`).join("")}</div>
        <div class="ajuste-ritmo"><button type="button" class="boton-icono" data-campo="ritmoMas" aria-label="Más rápido">−5 s</button><b>${mmss(x.obj.min)} – ${mmss(x.obj.max)} /km</b><button type="button" class="boton-icono" data-campo="ritmoMenos" aria-label="Más lento">+5 s</button></div>`
        : x.obj.tipo === "pulso" ? `<div class="chips chips-mini envolver">${R.zonas.map((z) => `<button type="button" data-campo="zona" data-valor="${z.ref}" class="${x.obj.ref === z.ref ? "activo" : ""}">${z.ref} · ${z.min}–${z.max}</button>`).join("")}</div>` : ""}`}
      <div class="acciones-paso">
        <button type="button" class="boton-texto" data-accion-paso="subir">↑ Subir</button>
        <button type="button" class="boton-texto" data-accion-paso="bajar">↓ Bajar</button>
        <button type="button" class="boton-texto" data-accion-paso="duplicar">Duplicar</button>
        <button type="button" class="boton-texto confirmar" data-accion-paso="borrar">Borrar</button>
      </div>
    </div>`;
  };
  const tarjetaPaso = (x) => {
    const o = textoObj(x, R);
    const abierto = abiertos.has(x.id);
    return `<div class="paso tipo-${x.tipo}${abierto ? " abierto" : ""}" data-id="${x.id}">
      <button type="button" class="paso-resumen" data-abrir="${x.id}" aria-expanded="${abierto}">
        <i aria-hidden="true"></i>
        <span><b>${x.tipo === "trabajo" ? verbo(w.deporte) : NOMBRE_TIPO[x.tipo]}</b><small>${textoDurExacto(x)}</small></span>
        <span class="obj">${o.grande}<small>${o.peque}</small></span>
      </button>
      ${abierto ? editorPaso(x) : ""}
    </div>`;
  };
  const pasoHtml = (x) => x.tipo !== "repetir" ? tarjetaPaso(x) : `
    <section class="repe" data-id="${x.id}">
      <div class="repe-cab"><span>Repetir</span>
        <span class="contador-repe"><button type="button" data-repe="-1" aria-label="Una vez menos">−</button><b>${x.veces} veces</b><button type="button" data-repe="1" aria-label="Una vez más">+</button></span></div>
      ${x.pasos.map(tarjetaPaso).join("")}
      <div class="repe-pie"><button type="button" class="boton-texto" data-anadir-en="${x.id}">+ Paso dentro</button><button type="button" class="boton-texto confirmar" data-borrar-repe="${x.id}">Quitar bloque</button></div>
    </section>`;

  cont.innerHTML = `
    <a class="volver-deportes" href="#entreno/planes">‹ Planes</a>
    <section class="cabecera-plan" data-deporte="${w.deporte}">
      <input class="nombre-plan" value="${escapar(w.nombre)}" maxlength="40" aria-label="Nombre del entrenamiento" data-campo-plan="nombre">
      <div class="fila-campos">
        ${seleccion("deporte", Object.keys(PLANTILLAS).map((dep) => [dep, DEPORTES[dep].nombre]), w.deporte, 'data-campo-plan="deporte"')}
        <input type="date" class="fecha-plan" value="${w.fecha || ""}" data-campo-plan="fecha" aria-label="Fecha">
      </div>
    </section>
    <section class="tarjeta-entreno">
      <div class="mini-cab"><span>Perfil</span><b>≈ ${duracionTexto(e.tiempo)} · ${distTexto(e.dist)}</b></div>
      ${perfil(w, R)}
    </section>
    <div class="pasos" data-deporte="${w.deporte}">${w.pasos.map(pasoHtml).join("")}</div>
    <div class="botones-anadir"><button type="button" data-anadir="paso">+ Paso</button><button type="button" data-anadir="repetir">+ Repetición</button></div>
    <div class="botones-plan">
      <button type="button" class="boton-secundario" data-plan="fit">Descargar .FIT</button>
      <button type="button" class="boton-principal" data-plan="garmin">${firma(w) === w.enviado ? "Enviado ✓" : w.enviado ? "Enviar cambios" : "Enviar a Garmin"}</button>
    </div>
    <div class="caja-intervals" hidden></div>
    <p class="nota">${!w.fecha ? "Ponle fecha para poder enviarlo. " : ""}"Enviar a Garmin" lo pone en tu calendario de Garmin Connect (vía Intervals.icu) y el reloj lo recibe al sincronizar. El .FIT sirve para copiarlo con cable (carpeta GARMIN/NewFiles).</p>
    <footer class="ficha-entreno-pie"><button class="boton-peligro" data-plan="borrar">Borrar entrenamiento</button></footer>`;

  const repintar = () => { guardar(w); pintarEditor(cont, id); };
  // Buscar un paso (y la lista en la que está) por su id
  const localizar = (pid, pasos = w.pasos) => {
    for (let i = 0; i < pasos.length; i++) {
      if (pasos[i].id === pid) return { lista: pasos, i, paso: pasos[i] };
      if (pasos[i].tipo === "repetir") { const r = localizar(pid, pasos[i].pasos); if (r) return r; }
    }
    return null;
  };

  // Datos del entrenamiento
  cont.querySelectorAll("[data-campo-plan]").forEach((c) => c.addEventListener("change", () => {
    const campo = c.dataset.campoPlan;
    if (campo === "deporte" && c.value !== w.deporte) {
      w.deporte = c.value;
      // Al cambiar de deporte, quitamos lo que no tiene sentido (ritmo en natación...)
      plano(w.pasos).forEach((x) => { if (x.obj.tipo === "ritmo" && w.deporte !== "correr") x.obj = { tipo: "libre" }; if (w.deporte === "nadar") x.obj = { tipo: "libre" }; });
    } else if (campo === "nombre") w.nombre = c.value.trim() || "Entrenamiento";
    else if (campo === "fecha") w.fecha = c.value || null;
    repintar();
  }));
  // Abrir/cerrar un paso
  cont.querySelectorAll("[data-abrir]").forEach((b) => b.addEventListener("click", () => {
    const pid = b.dataset.abrir;
    if (abiertos.has(pid)) abiertos.delete(pid); else { abiertos.clear(); abiertos.add(pid); }
    pintarEditor(cont, id);
  }));
  // Cambios dentro de un paso
  const cambiar = (el, valor) => {
    const { paso: x } = localizar(el.closest("[data-paso]").dataset.paso);
    const campo = el.dataset.campo;
    if (campo === "tipo") x.tipo = valor;
    else if (campo === "durTipo") x.dur = valor === "tiempo" ? t(x.tipo === "trabajo" ? 300 : 600) : valor === "distancia" ? d(w.deporte === "nadar" ? 100 : w.deporte === "bici" ? 10000 : 1000) : { tipo: "boton", valor: 0 };
    else if (campo === "min") x.dur.valor = Number(valor) * 60 + (x.dur.valor % 60);
    else if (campo === "seg") x.dur.valor = Math.floor(x.dur.valor / 60) * 60 + Number(valor);
    else if (campo === "dist") x.dur.valor = Number(valor);
    else if (campo === "objTipo") x.obj = valor === "ritmo" ? rangoRitmo(R, x.tipo === "trabajo" ? "5k" : "suave") : valor === "pulso" ? rangoPulso(R, x.tipo === "trabajo" ? "Z3" : "Z2") : { tipo: "libre" };
    else if (campo === "ritmoRef") x.obj = rangoRitmo(R, valor);
    else if (campo === "ritmoMas") { x.obj.min -= 5; x.obj.max -= 5; x.obj.ref = "propio"; }
    else if (campo === "ritmoMenos") { x.obj.min += 5; x.obj.max += 5; x.obj.ref = "propio"; }
    else if (campo === "zona") x.obj = rangoPulso(R, valor);
    if (x.dur.tipo === "tiempo" && x.dur.valor <= 0) x.dur.valor = 10;
    repintar();
  };
  cont.querySelectorAll(".editor-paso [data-campo]").forEach((el) => {
    if (el.tagName === "SELECT") el.addEventListener("change", () => cambiar(el, el.value));
    else el.addEventListener("click", () => cambiar(el, el.dataset.valor));
  });
  cont.querySelectorAll("[data-accion-paso]").forEach((b) => b.addEventListener("click", () => {
    const { lista, i, paso: x } = localizar(b.closest("[data-paso]").dataset.paso);
    const a = b.dataset.accionPaso;
    if (a === "subir" && i > 0) [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
    else if (a === "bajar" && i < lista.length - 1) [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
    else if (a === "duplicar") { const c = { ...structuredClone(x), id: nuevoId() }; lista.splice(i + 1, 0, c); abiertos.clear(); abiertos.add(c.id); }
    else if (a === "borrar") { lista.splice(i, 1); w.pasos = w.pasos.filter((y) => y.tipo !== "repetir" || y.pasos.length); }
    repintar();
  }));
  cont.querySelectorAll("[data-repe]").forEach((b) => b.addEventListener("click", () => {
    const { paso: r } = localizar(b.closest(".repe").dataset.id);
    r.veces = Math.max(1, Math.min(50, r.veces + Number(b.dataset.repe)));
    repintar();
  }));
  cont.querySelectorAll("[data-anadir-en]").forEach((b) => b.addEventListener("click", () => {
    const { paso: r } = localizar(b.dataset.anadirEn);
    const x = p("recuperar", t(60)); r.pasos.push(x); abiertos.clear(); abiertos.add(x.id); repintar();
  }));
  cont.querySelectorAll("[data-borrar-repe]").forEach((b) => b.addEventListener("click", () => {
    const { lista, i } = localizar(b.dataset.borrarRepe); lista.splice(i, 1); repintar();
  }));
  cont.querySelectorAll("[data-anadir]").forEach((b) => b.addEventListener("click", () => {
    // Se añade antes del enfriamiento, si lo hay
    const fin = w.pasos.at(-1)?.tipo === "enfriar" ? w.pasos.length - 1 : w.pasos.length;
    if (b.dataset.anadir === "paso") {
      const x = p("trabajo", w.deporte === "nadar" ? d(100) : t(300), w.deporte === "correr" ? rangoRitmo(R, "umbral") : w.deporte === "bici" ? rangoPulso(R, "Z3") : { tipo: "libre" });
      w.pasos.splice(fin, 0, x); abiertos.clear(); abiertos.add(x.id);
    } else {
      w.pasos.splice(fin, 0, rep(4, [p("trabajo", w.deporte === "nadar" ? d(100) : t(180), w.deporte === "correr" ? rangoRitmo(R, "10k") : w.deporte === "bici" ? rangoPulso(R, "Z4") : { tipo: "libre" }), p("recuperar", t(90))]));
    }
    repintar();
  }));
  cont.querySelector('[data-plan="fit"]').addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = "Preparando…";
    try { await descargarFit(w); b.textContent = "Descargado ✓"; }
    catch (err) { console.error(err); b.textContent = "No se pudo crear"; }
    setTimeout(() => { b.disabled = false; b.textContent = "Descargar .FIT"; }, 2500);
  });
  const caja = cont.querySelector(".caja-intervals");
  const botonGarmin = cont.querySelector('[data-plan="garmin"]');
  const enviar = async () => {
    if (!w.fecha) { botonGarmin.textContent = "Ponle fecha primero"; return; }
    botonGarmin.disabled = true; botonGarmin.textContent = "Enviando…";
    try {
      await intervals("enviar", { entreno: { id: w.id, nombre: w.nombre, tipo: TIPO_INTERVALS[w.deporte], fecha: w.fecha, texto: textoIntervals(w, R) } });
      w.enviado = firma(w); guardar(w);
      botonGarmin.textContent = "Enviado ✓";
    } catch (err) {
      if (/Conecta primero/.test(err.message)) { pedirClave(); botonGarmin.textContent = "Enviar a Garmin"; }
      else { botonGarmin.textContent = "No se pudo enviar"; caja.hidden = false; caja.innerHTML = `<p class="form-error">${escapar(err.message)}</p>`; }
    }
    botonGarmin.disabled = false;
  };
  // Primera vez: pegar la API key de Intervals.icu (se guarda en Supabase, la web no la ve)
  const pedirClave = () => {
    caja.hidden = false;
    caja.innerHTML = `
      <b>Conecta Intervals.icu</b>
      <p class="nota sin-margen">En intervals.icu → Settings → Developer Settings, copia tu API key y pégala aquí. Solo hace falta una vez.</p>
      <div class="fila-campos"><input type="password" class="clave-intervals" placeholder="API key" autocomplete="off"><button type="button" class="boton-principal" data-intervals="conectar">Conectar</button></div>`;
    caja.querySelector('[data-intervals="conectar"]').addEventListener("click", async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = "Comprobando…";
      try {
        const r = await intervals("conectar", { clave: caja.querySelector(".clave-intervals").value });
        caja.innerHTML = `<p class="nota sin-margen">Conectado a Intervals.icu (${escapar(r.atleta)}). Enviando…</p>`;
        await enviar();
        caja.hidden = true;
      } catch (err) {
        b.disabled = false; b.textContent = "Conectar";
        caja.querySelector(".form-error")?.remove();
        caja.insertAdjacentHTML("beforeend", `<p class="form-error">${escapar(err.message)}</p>`);
      }
    });
  };
  botonGarmin.addEventListener("click", enviar);
  cont.querySelector('[data-plan="borrar"]').addEventListener("click", (ev) => {
    const b = ev.currentTarget;
    if (!b.dataset.seguro) { b.dataset.seguro = "1"; b.textContent = "Toca otra vez para borrarlo"; return; }
    if (w.enviado) intervals("quitar", { id: w.id }).catch(() => {}); // también de tu calendario
    borrar(w.id);
    location.hash = "#entreno/planes";
  });
}

// =====================================================================
// .FIT de entrenamiento (el formato de los relojes Garmin)
// ---------------------------------------------------------------------
// Un archivo con: file_id (tipo "workout"), workout (nombre, deporte,
// número de pasos) y un workout_step por paso. Una repetición es un paso
// especial "repetir desde el paso N, X veces".
// Unidades que pide el formato: tiempo en milisegundos, distancia en
// centímetros, velocidad en mm/s y pulso en ppm + 100.
// =====================================================================
// =====================================================================
// ENVIAR a Garmin a través de Intervals.icu
// ---------------------------------------------------------------------
// Intervals entiende los entrenos escritos como texto, una línea por paso:
//   - Calentamiento 15m 60-70% HR
//
//   6x
//   - Correr 800mtr 4:16/km-4:26/km Pace
//   - Recuperar 90s
// (m = minutos, mtr = metros; el pulso va en % de tu máximo)
// =====================================================================
const TIPO_INTERVALS = { correr: "Run", bici: "Ride", nadar: "Swim" };
async function intervals(accion, datos = {}) {
  if (!window.nube || !navigator.onLine) throw new Error("Necesitas conexión a internet");
  const sb = await window.nube.supabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Inicia sesión en Sincronizar (panel del Horario) para enviar a Garmin");
  const { data, error } = await sb.functions.invoke("intervals", { body: { accion, ...datos } });
  if (error) {
    let mensaje = error.message;
    try { mensaje = (await error.context?.json())?.error || mensaje; } catch {}
    if (/Failed to send|not found|404/i.test(mensaje)) mensaje = "La función «intervals» aún no está instalada en Supabase";
    throw new Error(mensaje);
  }
  return data;
}
const durIntervals = (x) => {
  if (x.dur.tipo === "distancia") return `${Math.round(x.dur.valor)}mtr`;
  if (x.dur.tipo === "boton") return "5m"; // Intervals no tiene "hasta pulsar vuelta": 5 min y lo avisamos en el nombre
  const s = Math.round(x.dur.valor), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h ? h + "h" : ""}${m ? m + "m" : ""}${r ? r + "s" : ""}` || "10s";
};
export function textoIntervals(w, R = referencias()) {
  const linea = (x) => {
    const nombre = x.tipo === "trabajo" ? verbo(w.deporte) : NOMBRE_TIPO[x.tipo];
    let obj = "";
    if (x.obj.tipo === "ritmo") obj = ` ${mmss(x.obj.min)}/km-${mmss(x.obj.max)}/km Pace`;
    else if (x.obj.tipo === "pulso") obj = ` ${Math.round((x.obj.min / R.fcMax) * 100)}-${Math.round((x.obj.max / R.fcMax) * 100)}% HR`;
    return `- ${nombre}${x.dur.tipo === "boton" ? " (pulsa vuelta)" : ""} ${durIntervals(x)}${obj}`;
  };
  return w.pasos.map((x) => x.tipo === "repetir" ? `\n${x.veces}x\n${x.pasos.map(linea).join("\n")}\n` : linea(x)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
// Para saber si lo enviado sigue igual que lo que ves
const firma = (w) => JSON.stringify([w.nombre, w.fecha, w.deporte, w.pasos]).length + ":" + [...JSON.stringify([w.nombre, w.fecha, w.deporte, w.pasos])].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);

export function pasosFit(w) {
  const salida = [];
  const INTENSIDAD = { calentar: "warmup", trabajo: "active", recuperar: "recovery", enfriar: "cooldown" };
  const paso = (x) => {
    const m = { messageIndex: salida.length, intensity: INTENSIDAD[x.tipo], targetType: "open" };
    if (x.dur.tipo === "tiempo") { m.durationType = "time"; m.durationValue = Math.round(x.dur.valor * 1000); }
    else if (x.dur.tipo === "distancia") { m.durationType = "distance"; m.durationValue = Math.round(x.dur.valor * 100); }
    else m.durationType = "open";
    if (x.obj.tipo === "ritmo") {
      // Ritmo (s/km) → velocidad (mm/s). El más rápido es el límite alto.
      m.targetType = "speed"; m.targetValue = 0;
      m.customTargetValueLow = Math.round((1000 / x.obj.max) * 1000);
      m.customTargetValueHigh = Math.round((1000 / x.obj.min) * 1000);
    } else if (x.obj.tipo === "pulso") {
      m.targetType = "heartRate"; m.targetValue = 0;
      m.customTargetValueLow = x.obj.min + 100;
      m.customTargetValueHigh = x.obj.max + 100;
    }
    salida.push(m);
  };
  for (const x of w.pasos) {
    if (x.tipo !== "repetir") { paso(x); continue; }
    const desde = salida.length;
    x.pasos.forEach(paso);
    salida.push({ messageIndex: salida.length, durationType: "repeatUntilStepsCmplt", durationValue: desde, targetType: "open", targetValue: x.veces });
  }
  return salida;
}
async function descargarFit(w) {
  const { Encoder, Profile } = await import(FIT_SDK);
  const enc = new Encoder();
  const pasos = pasosFit(w);
  enc.onMesg(Profile.MesgNum.FILE_ID, { type: "workout", manufacturer: "development", product: 0, timeCreated: new Date(), serialNumber: Math.floor(Math.random() * 1e9) });
  enc.onMesg(Profile.MesgNum.WORKOUT, { wktName: w.nombre.slice(0, 30), sport: { correr: "running", bici: "cycling", nadar: "swimming" }[w.deporte], numValidSteps: pasos.length,
    ...(w.deporte === "nadar" ? { subSport: "lapSwimming", poolLength: almacen.ajustes().piscina || 25, poolLengthUnit: "metric" } : {}) });
  for (const m of pasos) enc.onMesg(Profile.MesgNum.WORKOUT_STEP, m);
  const bytes = enc.close();
  const nombre = `${w.nombre.normalize("NFD").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || "entreno"}.fit`;
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.ant.fit" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10e3);
}
