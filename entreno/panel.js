// =====================================================================
// entreno/panel.js — los apartados de Entreno (menos la lista)
// ---------------------------------------------------------------------
//   Resumen   → tarjetas con lo importante, la semana, totales y lo último
//   Forma     → forma física, cansancio, frescura y riesgo de lesión
//   Salud     → pulso en reposo, VFC, sueño, Body Battery, VO2max...
//   Deportes  → una tarjeta por cada deporte que haces y, dentro, su
//               página: volumen, ritmo, récords (carrera, natación)...
// Los cálculos están en analisis.js y salud.js; aquí solo se dibuja.
// En las gráficas, tocando los nombres de la leyenda escondes o muestras
// cada dato (series.js).
// =====================================================================

import { DEPORTES, iconoDe } from "./fit.js";
import * as almacen from "./almacen.js";
import * as an from "./analisis.js";
import * as salud from "./salud.js";
import { NS, marcas, donut } from "./graficas.js";
import { graficaSeries, sparkline } from "./series.js";

const DIA = 864e5;
const num = (x, d = 0) => (x == null || !isFinite(x) ? "—" : x.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d }));
const dos = (n) => String(n).padStart(2, "0");
const reloj = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${dos(m)}:${dos(s % 60)}` : `${m}:${dos(s % 60)}`; };
const horas = (h) => (h >= 1 ? `${Math.floor(h)} h ${dos(Math.round((h % 1) * 60))}` : `${Math.round(h * 60)} min`);
const fechaCorta = (d) => new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const conSigno = (x, d = 0) => { const r = Math.round(x * 10 ** d) / 10 ** d || 0; return `${r > 0 ? "+" : ""}${num(r, d)}`; };
const flecha = (x, unidad = "", d = 0, mejorBajo = false) => {
  if (x == null || !isFinite(x) || Math.abs(x) < 10 ** -d / 2) return `<small>= igual</small>`;
  const bueno = mejorBajo ? x < 0 : x > 0;
  return `<small class="${bueno ? "sube" : "baja"}">${x > 0 ? "▲" : "▼"} ${num(Math.abs(x), d)}${unidad}</small>`;
};

// Lo que eliges en cada apartado (se recuerda en este dispositivo)
const CLAVE_PREF = "mi-horario:entreno-panel";
const pref = (() => { try { return JSON.parse(localStorage.getItem(CLAVE_PREF)) || {}; } catch { return {}; } })();
const guardarPref = () => { try { localStorage.setItem(CLAVE_PREF, JSON.stringify(pref)); } catch {} };
pref.rango ??= 90; pref.periodo ??= "semana"; pref.medida ??= "horas"; pref.ocultosTot ??= [];
pref.rangoSalud ??= 90; pref.rangoTot ??= 90; pref.rangoZonas ??= 90; pref.rangoMono ??= 112; pref.vistaCal ??= "anio"; pref.metricaSalud ??= null; pref.rangoNado ??= 365; pref.rangoDep ??= 365; pref.deporteZonas ??= "todo";

function chips(nombre, opciones, extra = "") {
  return `<div class="chips chips-mini ${extra}" role="group">${opciones.map(([v, t]) =>
    `<button type="button" data-pref="${nombre}" data-valor="${v}" class="${pref[nombre] === v ? "activo" : ""}" aria-pressed="${pref[nombre] === v}">${t}</button>`).join("")}</div>`;
}
// Desplegable para elegir el periodo de una gráfica (va arriba a la derecha
// de cada tarjeta). valores: los periodos que tienen sentido en esa gráfica.
const RANGOS = { 7: "Última semana", 30: "Último mes", 42: "6 semanas", 90: "3 meses", 112: "16 semanas", 182: "6 meses", 365: "Último año", 730: "2 años", 0: "Todo" };
function desplegable(nombre, valores, etiquetas = RANGOS) {
  if (!valores.map(String).includes(String(pref[nombre]))) pref[nombre] = valores[Math.min(2, valores.length - 1)];
  return `<label class="desplegable"><select data-pref="${nombre}" aria-label="Periodo">${valores.map((v) =>
    `<option value="${v}"${String(pref[nombre]) === String(v) ? " selected" : ""}>${etiquetas[v] ?? v}</option>`).join("")}</select></label>`;
}
// Subpestañas: dentro de un apartado, cada pestaña enseña solo un tema
// (así no se amontona todo en una pantalla). Se recuerda la última.
function subpestanas(nombre, opciones) {
  if (!opciones.some(([v]) => v === pref[nombre])) pref[nombre] = opciones[0][0];
  return `<nav class="subpestanas" aria-label="Subapartados">${opciones.map(([v, t]) =>
    `<button type="button" data-pref="${nombre}" data-valor="${v}" class="${pref[nombre] === v ? "activo" : ""}" aria-pressed="${pref[nombre] === v}">${t}</button>`).join("")}</nav>`;
}
// Los botoncitos y desplegables de cada apartado: guardan la elección y repintan ese apartado
const valorDe = (v) => (v === "" || isNaN(v) ? v : Number(v));
function escucharChips(cont, repintar) {
  cont.querySelectorAll("button[data-pref]").forEach((b) => b.addEventListener("click", () => {
    pref[b.dataset.pref] = valorDe(b.dataset.valor);
    guardarPref();
    repintar();
  }));
  cont.querySelectorAll("select[data-pref]").forEach((s) => s.addEventListener("change", () => {
    pref[s.dataset.pref] = valorDe(s.value);
    guardarPref();
    repintar();
  }));
}
const tarjeta = (titulo, cuerpo, { clase = "", accion = "", icono = "" } = {}) => `
  <section class="tarjeta-entreno ${clase}">
    <header class="tarjeta-cabecera"><h2>${titulo}</h2>${accion}</header>
    ${cuerpo}
  </section>`;
const enlace = (seccion, texto = "Ver más") => `<a class="ver-mas" href="#entreno/${seccion}">${texto} ›</a>`;

function datosBase() {
  const lista = almacen.listar();
  const u = an.umbrales(lista);
  return { lista, u, dias: an.diario(lista, u) };
}

// =====================================================================
// RESUMEN
// =====================================================================
export function pintarResumen(cont, { alCambiar } = {}) {
  const { lista, u, dias } = datosBase();
  const semanas = an.totales(lista, "semana", 8, u);
  const [anterior, actual] = semanas.slice(-2);
  const hoy = dias.at(-1) || { ctl: 0, atl: 0, tsb: 0 };
  const hace4 = dias.at(-29);
  const zona = an.zonaForma(hoy.tsb);
  const r = an.riesgo(dias);
  const dSalud = salud.enCache();
  const vo2 = [...dSalud].reverse().find((d) => d.vo2);
  const porDeporte = Object.entries(actual.deportes).map(([d, x]) => `
    <li data-deporte="${d}"><span class="punto-deporte"></span><a href="#entreno/deportes/${d}">${DEPORTES[d].svg}${DEPORTES[d].nombre}</a>
      <b>${x.distancia ? (d === "nadar" ? `${num(x.distancia)} m` : `${num(x.distancia / 1000, 1)} km`) : `${x.sesiones} ${x.sesiones === 1 ? "sesión" : "sesiones"}`}</b>
      <span>${horas(x.horas)}</span></li>`).join("");
  const ultimas = lista.slice(0, 4);

  const sub = subpestanas("subResumen", [["hoy", "Hoy"], ["totales", "Totales"], ["constancia", "Constancia"]]);
  cont.innerHTML = sub + (pref.subResumen === "totales" ? `
    ${porDeporte ? tarjeta("Esta semana por deporte", `${Object.keys(actual.deportes).length < 2 ? "" : `<div class="donut-semana">${donut({
      segmentos: Object.entries(actual.deportes).map(([d, x]) => ({ valor: x.horas, color: `var(--dep-${d})`, etiqueta: `${DEPORTES[d].nombre} · ${horas(x.horas)}` })),
      centro: horas(Object.values(actual.deportes).reduce((t, x) => t + x.horas, 0)), sub: "en total", tam: 120, grosor: 13 })}</div>`}
      <ul class="por-deporte sin-borde">${porDeporte}</ul>`, { icono: "📅" }) : ""}

    ${tarjeta("Totales", `
      <div class="fila-chips">${chips("medida", [["horas", "Horas"], ["carga", "Carga"], ["sesiones", "Sesiones"]])}</div>
      <div class="hueco-grafica" data-grafica="totales"></div>
      <div class="leyenda-series" data-leyenda="totales">${Object.keys(DEPORTES).filter((d) => lista.some((a) => a.deporte === d)).map((d) =>
        `<button type="button" data-deporte="${d}" data-toggle-dep="${d}" aria-pressed="${!pref.ocultosTot.includes(d)}"><i class="muestra barras" style="--c:var(--dep-${d})"></i>${DEPORTES[d].nombre}</button>`).join("")}</div>`,
      { accion: desplegable("rangoTot", [7, 30, 90, 182, 365, 730]), icono: "📊" })}

` : pref.subResumen === "constancia" ? `
    ${tarjetaConstancia(lista)}

` : `
    <section class="tarjetas-panel">
      <a class="tarjeta-dato" href="#entreno/actividades"><span>Esta semana</span><b>${horas(actual.horas)}</b>
        <em>${actual.sesiones} ${actual.sesiones === 1 ? "sesión" : "sesiones"} · antes ${horas(anterior.horas)}</em>${sparkline(semanas.map((s) => s.horas), "var(--acento)")}</a>
      <a class="tarjeta-dato" href="#entreno/forma"><span>Carga semanal</span><b>${num(actual.carga)}</b>
        <em>la anterior ${num(anterior.carga)}</em>${sparkline(semanas.map((s) => s.carga), "var(--acento)")}</a>
      <a class="tarjeta-dato" href="#entreno/forma"><span>Forma física</span><b>${num(hoy.ctl)}</b>
        ${hace4 ? flecha(hoy.ctl - hace4.ctl) : ""}<em>en 4 semanas</em>${sparkline(dias.slice(-42).map((d) => d.ctl))}</a>
      <a class="tarjeta-dato forma-${zona.clase}" href="#entreno/forma"><span>Frescura</span><b>${conSigno(hoy.tsb)}</b>
        <em class="etiqueta-forma">${zona.nombre}</em>${sparkline(dias.slice(-42).map((d) => d.tsb), "var(--acento)")}</a>
    </section>

    ${tarjetaObjetivo(lista, dias)}

    ${tarjeta("Cómo estás hoy", `
      <ul class="estado-hoy">
        <li class="forma-${zona.clase}"><span class="semaforo"></span><div><b>${zona.nombre}</b><p>${zona.texto}</p></div></li>
        ${r ? `<li class="riesgo-${r.nivel}"><span class="semaforo"></span><div><b>${r.titulo}</b><p>${r.texto}</p></div></li>` : ""}
        ${vo2 ? `<li><span class="semaforo neutro"></span><div><b>VO2max ${num(vo2.vo2, 1)}</b><p>Último valor de Garmin (${fechaCorta(vo2.fecha)}).</p></div></li>` : ""}
      </ul>`, { accion: enlace("forma"), icono: "🧭" })}

    ${tarjeta("Últimas actividades", `<ul class="ultimas">${ultimas.map((a) => `
      <li><a href="#entreno/${encodeURIComponent(a.id)}" data-deporte="${a.deporte}">
        <span class="actividad-icono" aria-hidden="true">${iconoDe(a)}</span>
        <span><strong>${a.nombre}</strong><small>${new Date(a.inicio).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</small></span>
        <span class="ultimas-datos">${a.distancia ? (a.deporte === "nadar" ? `${num(a.distancia)} m` : `${num(a.distancia / 1000, 1)} km`) : horas((a.duracion || 0) / 3600)}<small>carga ${an.cargaDe(a, u).tss}</small></span>
      </a></li>`).join("")}</ul>`, { accion: enlace("actividades", "Ver todas"), icono: "🕑" })}`);
  if (cont.querySelector('[data-grafica="totales"]')) dibujarTotales(cont.querySelector('[data-grafica="totales"]'), lista, u);
  dibujarCalendario(cont.querySelector('[data-grafica="calendario"]'), lista, u);
  cont.querySelectorAll("[data-toggle-dep]").forEach((b) => b.addEventListener("click", () => {
    const d = b.dataset.toggleDep;
    pref.ocultosTot = pref.ocultosTot.includes(d) ? pref.ocultosTot.filter((x) => x !== d) : [...pref.ocultosTot, d];
    guardarPref();
    b.setAttribute("aria-pressed", !pref.ocultosTot.includes(d));
    dibujarTotales(cont.querySelector('[data-grafica="totales"]'), lista, u);
  }));
  escucharChips(cont, () => pintarResumen(cont, { alCambiar }));
  // La salud llega de la nube: si es la primera vez, repintamos al tenerla
  if (!dSalud.length) salud.cargar().then((d) => { if (d.length && cont.isConnected) pintarResumen(cont, { alCambiar }); });
}

// ---------------------------------------------------------------------
// Totales: barras apiladas por deporte (puedes esconder deportes)
// ---------------------------------------------------------------------
function dibujarTotales(hueco, lista, u) {
  const M = { izq: 40, der: 12, arr: 12, aba: 26 };
  // El periodo elegido decide si cada barra es un día, una semana o un mes
  const [periodo, n] = { 7: ["dia", 7], 30: ["dia", 30], 90: ["semana", 13], 182: ["semana", 26], 365: ["mes", 12], 730: ["mes", 24] }[pref.rangoTot] || ["semana", 13];
  const periodos = an.totales(lista, periodo, n, u);
  const deportes = Object.keys(DEPORTES).filter((d) => !pref.ocultosTot.includes(d));
  const valorDe = (x) => (pref.medida === "horas" ? x.horas : pref.medida === "carga" ? x.carga : x.sesiones);
  const sumaDe = (p) => deportes.reduce((s, d) => s + (p.deportes[d] ? valorDe(p.deportes[d]) : 0), 0);
  const fmt = (v) => (pref.medida === "horas" ? horas(v) : num(v));
  const etiqueta = (p) => (periodo === "semana" ? fechaCorta(p.desde) : periodo === "dia" ? (n <= 7 ? p.desde.toLocaleDateString("es-ES", { weekday: "short" }) : String(p.desde.getDate())) : p.desde.toLocaleDateString("es-ES", { month: "short" }));
  const resumen = `Total ${fmt(periodos.reduce((s, p) => s + sumaDe(p), 0))} · media ${fmt(periodos.reduce((s, p) => s + sumaDe(p), 0) / periodos.length)} por ${periodo === "dia" ? "día" : periodo}`;
  const figura = document.createElement("figure");
  figura.className = "grafica grafica-series";
  figura.innerHTML = `<figcaption><b class="grafica-valor">${resumen}</b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Totales por ${periodo}. ${resumen}`);
  figura.append(svg);
  hueco.replaceChildren(figura);
  const valor = figura.querySelector(".grafica-valor");
  const alto = 180;
  const yMax = Math.max(1, ...periodos.map(sumaDe)) * 1.1;
  let ancho = 0;
  function dibujar() {
    ancho = figura.clientWidth || 600;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    svg.setAttribute("width", ancho); svg.setAttribute("height", alto);
    const zona = alto - M.arr - M.aba;
    const w = (ancho - M.izq - M.der) / periodos.length;
    let h = "";
    for (const v of marcas(0, yMax, 4)) {
      const y = M.arr + (1 - v / yMax) * zona;
      h += `<line class="rejilla" x1="${M.izq}" x2="${ancho - M.der}" y1="${y}" y2="${y}"/>`;
      h += `<text class="eje" x="${M.izq - 6}" y="${y + 4}" text-anchor="end">${pref.medida === "horas" ? `${v} h` : v}</text>`;
    }
    const salto = Math.ceil(periodos.length / Math.max(2, Math.floor(ancho / 52)));
    periodos.forEach((p, i) => {
      let base = M.arr + zona;
      const bw = Math.min(w * 0.68, 28), x = M.izq + i * w + (w - bw) / 2;
      deportes.forEach((d) => {
        const v = p.deportes[d] ? valorDe(p.deportes[d]) : 0;
        if (!v) return;
        const hh = (v / yMax) * zona;
        base -= hh;
        h += `<rect class="barra" data-i="${i}" x="${x}" y="${base}" width="${bw}" height="${Math.max(0, hh - 1)}" rx="2" style="fill:var(--dep-${d})"/>`;
      });
      if ((periodos.length - 1 - i) % salto === 0) h += `<text class="eje" x="${x + bw / 2}" y="${alto - 7}" text-anchor="middle">${etiqueta(p)}</text>`;
    });
    svg.innerHTML = h;
  }
  const mostrar = (e) => {
    const r = svg.getBoundingClientRect();
    const i = Math.floor(((((e.clientX - r.left) / r.width) * ancho - M.izq) / (ancho - M.izq - M.der)) * periodos.length);
    if (i < 0 || i >= periodos.length) return;
    const p = periodos[i];
    svg.querySelectorAll(".barra").forEach((b) => b.classList.toggle("tenue", +b.dataset.i !== i));
    const partes = deportes.filter((d) => p.deportes[d]).map((d) => `${DEPORTES[d].nombre} ${fmt(valorDe(p.deportes[d]))}`);
    const cuando = periodo === "semana" ? `Semana del ${fechaCorta(p.desde)}` : periodo === "dia" ? p.desde.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" }) : p.desde.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    valor.textContent = `${cuando}: ${fmt(sumaDe(p))}${partes.length > 1 ? ` (${partes.join(" · ")})` : ""}`;
  };
  svg.addEventListener("pointermove", mostrar);
  svg.addEventListener("pointerdown", mostrar);
  svg.addEventListener("pointerleave", () => { svg.querySelectorAll(".barra").forEach((b) => b.classList.remove("tenue")); valor.textContent = resumen; });
  new ResizeObserver(() => { if (figura.clientWidth && figura.clientWidth !== ancho) dibujar(); }).observe(figura);
}

// =====================================================================
// FORMA
// =====================================================================
export function pintarForma(cont) {
  const { u, dias: todos } = datosBase();
  const dSalud = salud.enCache();
  const hoy = todos.at(-1) || { ctl: 0, atl: 0, tsb: 0 };
  const zona = an.zonaForma(hoy.tsb);
  const r = an.riesgo(todos);
  const dias = pref.rango ? todos.slice(-pref.rango) : todos;

  const sub = subpestanas("subForma", [["forma", "Forma"], ["intensidad", "Intensidad"], ["monotonia", "Monotonía"]]);
  cont.innerHTML = sub + (pref.subForma === "forma" ? `
    ${tarjeta("Estado de forma", `
      <div class="cifras-forma">
        <div><span><i style="background:var(--forma-ctl)"></i>Forma física</span><b>${num(hoy.ctl)}</b></div>
        <div><span><i style="background:var(--forma-atl)"></i>Cansancio</span><b>${num(hoy.atl)}</b></div>
        <div class="forma-${zona.clase}"><span><i class="barrita"></i>Frescura</span><b>${conSigno(hoy.tsb)}</b><em class="etiqueta-forma">${zona.nombre}</em></div>
      </div>
      <div class="hueco-grafica" data-grafica="forma"></div>
      <p class="nota">Las barras grises son la carga de cada día. En la zona "Construyendo" es donde mejoras.</p>
      <details class="explica"><summary>Cómo se calcula</summary>
      <div class="explica-texto">
        <p>Cada entreno suma <b>carga</b> (100 = una hora a tope sostenible). La <b>forma física</b> es la media de tu carga de las últimas 6 semanas: sube despacio si entrenas con constancia. El <b>cansancio</b> es la media de la última semana: sube y baja rápido. La <b>frescura</b> es la diferencia.</p>
        <p>Frescura entre −10 y −30: estás mejorando. Por debajo de −30: demasiada carga. Por encima de +5: fresco para competir.</p>
        <p>Tu carga se calcula con el pulso (reposo ${u.fcReposo}, máximo ${u.fcMax}, umbral ${u.lthr} ppm)${u.css ? ` y en piscina con tu ritmo frente a tu CSS (${reloj(u.css)} /100 m)` : ""}. Cámbialo en Ajustes (la rueda de arriba).</p>
      </div></details>`,
      { accion: desplegable("rango", [7, 30, 42, 90, 182, 365, 0]), clase: "plegable" })}
    ${tarjetaRiesgo(r)}` : pref.subForma === "intensidad" ? `
    ${tarjeta("Intensidad: suave y fuerte", `
      <div class="fila-chips">${chips("deporteZonas", [["todo", "Todo"], ["correr", "Carrera"], ["bici", "Bici"], ["nadar", "Natación"]])}</div>
      <div class="reparto-intensidad" data-reparto></div>
      <div class="hueco-grafica" data-grafica="zonas"></div>
      <p class="nota">Tiempo en cada zona de pulso. Los que más mejoran hacen un <b>80 %</b> suave (Z1–Z2) y un 20 % fuerte. Zonas con pulsaciones máximas de ${u.fcMax} (las mismas que tu Garmin).</p>`, { accion: desplegable("rangoZonas", [7, 30, 90, 182, 365]) })}` : `
    ${tarjeta("Monotonía y estrés", `<div class="hueco-grafica" data-grafica="monotonia"></div>
      <p class="nota">Monotonía = si cada día cargas lo mismo. Por encima de 2, entrenas siempre igual y sube el riesgo de sobrecarga o de enfermar: alterna días duros, suaves y de descanso. Estrés = carga de la semana × monotonía.</p>`, { accion: desplegable("rangoMono", [42, 112, 182, 365]) })}`);

  const huecoForma = cont.querySelector('[data-grafica="forma"]');
  if (huecoForma && dias.length >= 2) huecoForma.replaceChildren(graficaForma(dias));
  else if (huecoForma) huecoForma.innerHTML = `<p class="nota">Hacen falta al menos un par de días de entrenos.</p>`;
  dibujarZonas(cont, u);
  dibujarMonotonia(cont.querySelector('[data-grafica="monotonia"]'), todos);
  escucharChips(cont, () => pintarForma(cont));
  if (!dSalud.length) salud.cargar().then((d) => { if (d.length && cont.isConnected) pintarForma(cont); });
}

// ---------------------------------------------------------------------
// Gráfica de forma: dos paneles que comparten el eje de fechas
//   arriba → forma física (área verde), cansancio (línea morada) y la
//            carga de cada día (barras grises, con su propia escala)
//   abajo  → frescura (línea) sobre sus cinco zonas de color
// Al deslizar el dedo, una línea vertical cruza los dos paneles.
// ---------------------------------------------------------------------
const ZONAS_FRESCURA = [
  { desde: 25, hasta: Infinity, clase: "transicion", nombre: "Perdiendo forma" },
  { desde: 5, hasta: 25, clase: "fresco", nombre: "Fresco" },
  { desde: -10, hasta: 5, clase: "neutro", nombre: "Equilibrado" },
  { desde: -30, hasta: -10, clase: "optimo", nombre: "Construyendo" },
  { desde: -Infinity, hasta: -30, clase: "riesgo", nombre: "Sobrecarga" },
];
function graficaForma(dias) {
  const fig = document.createElement("figure");
  fig.className = "grafica grafica-series grafica-forma";
  fig.innerHTML = `<figcaption><b class="grafica-valor"></b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img");
  fig.append(svg);
  const valor = fig.querySelector(".grafica-valor");
  const ult = dias.at(-1);
  const resumen = "Desliza el dedo para ver cada día";
  svg.setAttribute("aria-label", `Forma física ${num(ult.ctl)}, cansancio ${num(ult.atl)}, frescura ${conSigno(ult.tsb)}`);
  valor.textContent = resumen;

  const n = dias.length;
  const M = { izq: 34, der: 10, arr: 10 }, ALTO_A = 150, HUECO = 30, ALTO_B = 100, ABA = 22;
  const alto = M.arr + ALTO_A + HUECO + ALTO_B + ABA;
  const maxA = Math.max(10, ...dias.map((d) => Math.max(d.ctl, d.atl))) * 1.12;
  const maxCarga = Math.max(1, ...dias.map((d) => d.carga));
  const tsbs = dias.map((d) => d.tsb);
  const loB = Math.min(-35, Math.min(...tsbs) - 4), hiB = Math.max(12, Math.max(...tsbs) + 4);
  const topB = M.arr + ALTO_A + HUECO;
  const yA = (v) => M.arr + (1 - v / maxA) * ALTO_A;
  const yB = (v) => topB + (1 - (v - loB) / (hiB - loB)) * ALTO_B;
  let ancho = 0;
  const zonaX = () => ancho - M.izq - M.der;
  // Con pocos días, cada día ocupa una "columna" y el punto va en su centro
  const xEn = (i) => M.izq + ((i + 0.5) / n) * zonaX();

  function dibujar() {
    ancho = fig.clientWidth || 600;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    svg.setAttribute("width", ancho); svg.setAttribute("height", alto);
    let h = "";
    // --- Panel de arriba ---
    for (const v of marcas(0, maxA, 3)) {
      h += `<line class="rejilla" x1="${M.izq}" x2="${ancho - M.der}" y1="${yA(v)}" y2="${yA(v)}"/>`;
      h += `<text class="eje" x="${M.izq - 6}" y="${yA(v) + 4}" text-anchor="end">${v}</text>`;
    }
    const bw = Math.max(1.5, Math.min(18, zonaX() / n - 1.5));
    dias.forEach((d, i) => {
      if (!d.carga) return;
      const hh = (d.carga / maxCarga) * ALTO_A * 0.45;
      h += `<rect class="barra-carga" x="${xEn(i) - bw / 2}" y="${M.arr + ALTO_A - hh}" width="${bw}" height="${hh}" rx="${Math.min(2, bw / 2)}"/>`;
    });
    const linea = (f) => dias.map((d, i) => `${i ? "L" : "M"}${xEn(i).toFixed(1)},${f(d).toFixed(1)}`).join("");
    const dCtl = linea((d) => yA(d.ctl));
    h += `<path class="grafica-area" style="fill:var(--forma-ctl)" d="${dCtl}L${xEn(n - 1)},${yA(0)}L${xEn(0)},${yA(0)}Z"/>`;
    h += `<path class="grafica-linea" style="stroke:var(--forma-ctl);stroke-width:2.5" d="${dCtl}"/>`;
    h += `<path class="grafica-linea" style="stroke:var(--forma-atl);stroke-width:1.8" d="${linea((d) => yA(d.atl))}"/>`;
    // --- Panel de abajo: zonas de frescura ---
    h += `<text class="eje titulo-panel" x="${M.izq}" y="${topB - 9}">FRESCURA</text>`;
    for (const z of ZONAS_FRESCURA) {
      const a = Math.min(hiB, z.hasta), b = Math.max(loB, z.desde);
      if (a <= b) continue;
      const y1 = yB(a), y2 = yB(b);
      h += `<rect class="zona-tsb zt-${z.clase}" x="${M.izq}" y="${y1}" width="${zonaX()}" height="${y2 - y1}"/>`;
      if (y2 - y1 > 13) h += `<text class="eje etiqueta-zona zt-txt-${z.clase}" x="${ancho - M.der - 4}" y="${(y1 + y2) / 2 + 3.5}" text-anchor="end">${z.nombre}</text>`;
    }
    for (const v of [-30, -10, 5, 25]) {
      if (v < loB || v > hiB) continue;
      h += `<text class="eje" x="${M.izq - 6}" y="${yB(v) + 3.5}" text-anchor="end">${v > 0 ? "+" + v : v}</text>`;
    }
    h += `<line class="rejilla cero" x1="${M.izq}" x2="${ancho - M.der}" y1="${yB(0)}" y2="${yB(0)}"/>`;
    h += `<path class="grafica-linea linea-tsb" d="${linea((d) => yB(d.tsb))}"/>`;
    if (n <= 45) dias.forEach((d, i) => { h += `<circle class="punto-tsb" cx="${xEn(i)}" cy="${yB(d.tsb)}" r="2.6"/>`; });
    // --- Fechas ---
    const cuantas = Math.min(n, Math.max(2, Math.floor(zonaX() / 70)));
    const fmtX = (f) => (n <= 7 ? f.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" }) : fechaCorta(f));
    for (let k = 0; k < cuantas; k++) {
      const i = cuantas === 1 ? n - 1 : Math.round((k / (cuantas - 1)) * (n - 1));
      h += `<text class="eje" x="${xEn(i)}" y="${alto - 6}" text-anchor="${n > 7 && k === 0 ? "start" : n > 7 && k === cuantas - 1 ? "end" : "middle"}">${fmtX(dias[i].fecha)}</text>`;
    }
    // --- Cursor ---
    h += `<g class="cursor" display="none"><line y1="${M.arr}" y2="${topB + ALTO_B}"/>
      <circle class="c-ctl" r="4" style="fill:var(--forma-ctl)"/><circle class="c-atl" r="3.5" style="fill:var(--forma-atl)"/><circle class="c-tsb" r="4" style="fill:var(--texto)"/></g>`;
    svg.innerHTML = h;
  }

  function mover(e) {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * ancho;
    const i = Math.max(0, Math.min(n - 1, Math.floor(((px - M.izq) / zonaX()) * n)));
    const d = dias[i], x = xEn(i);
    const g = svg.querySelector(".cursor");
    g.removeAttribute("display");
    g.querySelector("line").setAttribute("x1", x); g.querySelector("line").setAttribute("x2", x);
    for (const [c, y] of [["c-ctl", yA(d.ctl)], ["c-atl", yA(d.atl)], ["c-tsb", yB(d.tsb)]]) { const k = g.querySelector("." + c); k.setAttribute("cx", x); k.setAttribute("cy", y); }
    valor.textContent = `${d.fecha.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })} · forma ${num(d.ctl)} · cansancio ${num(d.atl)} · frescura ${conSigno(d.tsb)}${d.carga ? ` · carga ${num(d.carga)}` : " · descanso"}`;
    fig.classList.add("activa");
  }
  svg.addEventListener("pointermove", mover);
  svg.addEventListener("pointerdown", mover);
  svg.addEventListener("pointerleave", () => { svg.querySelector(".cursor")?.setAttribute("display", "none"); valor.textContent = resumen; fig.classList.remove("activa"); });
  new ResizeObserver(() => { if (fig.clientWidth && fig.clientWidth !== ancho) dibujar(); }).observe(fig);
  return fig;
}

function tarjetaRiesgo(r) {
  if (!r) return "";
  const pos = r.acwr == null ? 0 : Math.min(100, (r.acwr / 2) * 100);
  return tarjeta("Riesgo de lesión", `
      <p class="riesgo-titulo"><span class="semaforo" aria-hidden="true"></span>${r.titulo}</p>
      <p class="riesgo-texto">${r.texto}</p>
      ${r.acwr != null ? `
      <div class="medidor" role="img" aria-label="Relación de carga ${num(r.acwr, 2)}">
        <div class="medidor-zonas"><span class="z-bajo"></span><span class="z-bien"></span><span class="z-medio"></span><span class="z-alto"></span></div>
        <i style="left:${pos}%"></i>
      </div>
      <div class="medidor-marcas"><span>0</span><span style="left:40%">0,8</span><span style="left:65%">1,3</span><span style="left:100%">2</span></div>` : ""}
      <div class="riesgo-cifras">
        <div><span>Carga 7 días</span><b>${num(r.agudo)}</b></div>
        <div><span>Media semanal (4 sem.)</span><b>${num(r.cronico)}</b></div>
        <div><span>Relación</span><b>${num(r.acwr, 2)}</b></div>
        <div><span>Subida de forma (7 días)</span><b>${conSigno(r.rampa, 1)}</b></div>
      </div>
      <p class="nota">Lo seguro: relación entre 0,8 y 1,3 y que la forma física no suba más de 5 puntos por semana. Clave para volver a correr tras la lesión.</p>`,
    { clase: `panel-riesgo riesgo-${r.nivel}`, icono: "🩹" });
}

// =====================================================================
// SALUD
// =====================================================================
export function pintarSalud(cont) {
  const pintar = (dias) => {
    if (!cont.isConnected) return;
    const hasta = new Date(); hasta.setHours(0, 0, 0, 0);
    const desde = new Date(hasta.getTime() - (pref.rangoSalud - 1) * DIA);
    const conDatos = salud.METRICAS.map((m) => {
      const { xs, ys } = salud.serieDiaria(dias, m, desde, hasta);
      const validos = ys.filter((v) => v != null);
      return { m, xs, ys, validos };
    }).filter((x) => x.validos.length);
    const recientes = dias.filter((d) => new Date(d.fecha) >= new Date(hasta.getTime() - 14 * DIA));
    const sinNoche = !recientes.some((d) => d.sueno || d.vfc);
    const poco = recientes.length && recientes.filter((d) => !salud.fiable(d)).length > recientes.length / 2;

    if (!dias.length) {
      cont.innerHTML = tarjetaDiario() + tarjeta("Salud", `<p class="nota">Aún no han llegado datos de salud de Garmin. Llegan solos cada media hora (el historial del último año tarda un rato en completarse).</p>`, { icono: "❤️" });
      activarDiario(cont, () => pintar(dias));
      return;
    }
    if (!conDatos.some((x) => x.m.id === pref.metricaSalud)) pref.metricaSalud = conDatos[0]?.m.id ?? null;
    const sel = conDatos.find((x) => x.m.id === pref.metricaSalud);
    const fmt = (m, v) => (v == null ? "—" : `${num(v, m.decimales || 0)}${m.unidad ? ` ${m.unidad}` : ""}`);

    const sub = subpestanas("subSalud", [["datos", "Datos de Garmin"], ["diario", "Diario de molestias"]]);
    cont.innerHTML = sub + (pref.subSalud === "diario" ? tarjetaDiario() : `
      ${sinNoche || poco ? `<div class="aviso-salud"><b>⌚ Lleva el reloj también por la noche</b>
        <p>Ahora casi solo lo llevas para entrenar, así que Garmin no puede medir tu sueño, tu VFC ni tu Body Battery, y el pulso "en reposo" sale demasiado alto (por eso lo escondo en los días con pocas horas de reloj). Si duermes con él, aquí aparecerán solos.</p></div>` : ""}
      <div class="fila-chips fila-periodo"><span>Periodo</span>${desplegable("rangoSalud", [7, 30, 90, 182, 365])}</div>
      <section class="tarjetas-salud">${conDatos.map(({ m, ys, validos }) => {
        const ult = [...ys].reverse().find((v) => v != null);
        const s7 = ys.slice(-7).filter((v) => v != null), s28 = ys.slice(-35, -7).filter((v) => v != null);
        const med = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
        const dif = med(s7) != null && med(s28) != null ? med(s7) - med(s28) : null;
        return `<button type="button" class="tarjeta-dato tarjeta-salud${m.id === pref.metricaSalud ? " elegida" : ""}" data-metrica="${m.id}" aria-pressed="${m.id === pref.metricaSalud}">
          <span>${m.nombre}</span><b>${fmt(m, ult)}</b>${dif != null && !m.escalonada ? flecha(dif, "", m.decimales || 0, m.mejorBajo) : `<small>${validos.length} días</small>`}
          ${sparkline(salud.mediaMovil(ys, 3), m.id === pref.metricaSalud ? m.color : "var(--suave)")}</button>`;
      }).join("")}</section>
      ${sel ? tarjeta(sel.m.nombre, `<div class="hueco-grafica" data-grafica="salud"></div><p class="nota">${sel.m.texto}</p>`, { icono: "❤️" }) : ""}`);

    if (sel && cont.querySelector('[data-grafica="salud"]')) {
      const { dias: diasForma } = datosBase();
      const porDia = new Map(diasForma.map((d) => [d.fecha.getTime(), d]));
      const g = graficaSeries({
        id: `salud-${sel.m.id}`, xs: sel.xs, alto: 220,
        resumen: `Media del periodo ${fmt(sel.m, sel.validos.reduce((s, x) => s + x, 0) / sel.validos.length)}`,
        series: [
          { id: "dia", nombre: "Cada día", tipo: sel.m.escalonada ? "linea" : "puntos", color: sel.m.color, valores: sel.ys, formato: (v) => fmt(sel.m, v) },
          { id: "media", nombre: "Media 7 días", tipo: "linea", color: sel.m.color, grosor: 2.5, valores: sel.m.escalonada ? sel.ys.map(() => null) : salud.mediaMovil(sel.ys, 7), formato: (v) => fmt(sel.m, v) },
          { id: "forma", nombre: "Forma física", tipo: "linea", eje: "der", discontinua: true, color: "var(--forma-ctl)", valores: sel.xs.map((t) => porDia.get(t)?.ctl ?? null), ocultaAlEmpezar: true },
          { id: "carga", nombre: "Carga del día", tipo: "barras", eje: "der", color: "var(--carga-dia)", valores: sel.xs.map((t) => porDia.get(t)?.carga || null), ocultaAlEmpezar: true },
        ],
      });
      cont.querySelector('[data-grafica="salud"]').replaceChildren(g);
    }
    cont.querySelectorAll("[data-metrica]").forEach((b) => b.addEventListener("click", () => { pref.metricaSalud = b.dataset.metrica; guardarPref(); pintar(dias); }));
    activarDiario(cont, () => pintar(dias));
    escucharChips(cont, () => pintar(dias));
  };
  const cache = salud.enCache();
  if (cache.length) pintar(cache);
  else cont.innerHTML = `<p class="nota">Cargando tus datos de salud…</p>`;
  salud.cargar().then((d) => { if (JSON.stringify(d) !== JSON.stringify(cache) || !cache.length) pintar(d); });
}

// =====================================================================
// NATACIÓN (dentro de Deportes)
// =====================================================================
export function pintarNatacion(cont, { alCambiar } = {}) {
  const { lista, u } = datosBase();
  const nados = lista.filter((a) => a.deporte === "nadar").sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (!nados.length) { cont.innerHTML = tarjeta("Natación", `<p class="nota">Aún no hay sesiones de natación.</p>`, { icono: "🏊" }); return; }
  const records = an.recordsNado(lista);
  const ritmo = (t, d) => `${reloj((t / d) * 100)} /100 m`;
  const desde = pref.rangoNado ? Date.now() - pref.rangoNado * DIA : 0;
  const enRango = nados.filter((a) => new Date(a.inicio).getTime() >= desde);
  const metros = enRango.reduce((s, a) => s + (a.distancia || 0), 0);
  const swolfs = enRango.map((a) => a.swolf).filter(Boolean);

  const sub = subpestanas("subNado", [["progreso", "Progreso"], ["tecnica", "Técnica"], ["records", "Récords"]]);
  const ver = pref.subNado;
  cont.innerHTML = `
    ${sub}
    <div class="fila-chips fila-periodo"><span>Periodo</span>${desplegable("rangoNado", [30, 90, 182, 365, 0])}</div>
    <section class="tarjetas-panel" data-deporte="nadar">
      <div class="tarjeta-dato"><span>CSS (ritmo umbral)</span><b>${u.css ? reloj(u.css) : "—"}</b><em>${u.css ? "por 100 m · " + (u.cssEstimada ? "estimada" : "la tuya") : "faltan series de 200 y 400 m"}</em></div>
      <div class="tarjeta-dato"><span>Sesiones</span><b>${enRango.length}</b><em>${pref.rangoNado ? "en el periodo" : "en total"}</em></div>
      <div class="tarjeta-dato"><span>Metros</span><b>${num(metros / 1000, 1)} km</b><em>${enRango.length ? `${num(metros / enRango.length)} m por sesión` : ""}</em></div>
      <div class="tarjeta-dato"><span>SWOLF medio</span><b>${swolfs.length ? num(swolfs.reduce((s, x) => s + x, 0) / swolfs.length) : "—"}</b><em>menos es mejor</em></div>
    </section>
    ${ver !== "progreso" ? "" : tarjeta("Técnica y ritmo", `<div class="hueco-grafica" data-grafica="nado"></div>
      <p class="nota">Cada punto es una sesión; la línea gruesa es la tendencia (media de 5 sesiones). Arriba es mejor en las dos. Toca la leyenda para elegir qué ver.</p>`, { icono: "🏊", clase: "", })}
    ${ver === "tecnica" ? tarjetasNado(enRango, u) : ""}
    ${ver === "records" && records.length ? tarjeta("Mejores tiempos", `
      <div class="tabla-scroll"><table class="tabla-records" data-deporte="nadar">
        <thead><tr><th>Distancia</th><th>Mejor</th><th>Cuándo</th><th>Este año</th></tr></thead>
        <tbody>${records.map((r) => `<tr>
          <td><b>${r.distancia} m</b></td>
          <td><a href="#entreno/${encodeURIComponent(r.mejor.id)}">${reloj(r.mejor.t)}</a><small>${ritmo(r.mejor.t, r.distancia)}</small></td>
          <td>${new Date(r.mejor.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" })}</td>
          <td>${r.mejorAnio ? (r.mejorAnio.id === r.mejor.id ? "🏆" : reloj(r.mejorAnio.t)) : "—"}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <p class="nota">Largos seguidos sin parar dentro de una sesión. "Este año" son los últimos 12 meses; 🏆 = tu récord es de ahí.</p>`, { icono: "🏆" }) : ""}`;

  if (enRango.length >= 2 && cont.querySelector('[data-grafica="nado"]')) {
    const tend = (ys) => ys.map((_, i) => { const v = ys.slice(Math.max(0, i - 4), i + 1).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; });
    const sw = enRango.map((a) => a.swolf || null), rt = enRango.map((a) => (a.velMedia && a.distancia >= 300 ? 100 / a.velMedia : null));
    const g = graficaSeries({
      id: "nado", xs: enRango.map((a) => new Date(a.inicio).getTime()), alto: 220, invertirIzq: true, invertirDer: true,
      resumen: `Últ. SWOLF ${num([...sw].reverse().find(Boolean))} · ritmo ${(() => { const r = [...rt].reverse().find(Boolean); return r ? reloj(r) : "—"; })()}`,
      series: [
        { id: "swolf", nombre: "SWOLF", tipo: "puntos", color: "var(--acento)", valores: sw, formatoEje: (v) => Math.round(v) },
        { id: "swolfT", nombre: "SWOLF tendencia", tipo: "linea", grosor: 2.5, color: "var(--acento)", valores: tend(sw), unir: true, formatoEje: (v) => Math.round(v) },
        { id: "ritmo", nombre: "Ritmo /100 m", tipo: "puntos", eje: "der", color: "var(--c-ritmo)", valores: rt, formato: reloj, formatoEje: reloj, ocultaAlEmpezar: true },
        { id: "ritmoT", nombre: "Ritmo tendencia", tipo: "linea", eje: "der", grosor: 2.5, color: "var(--c-ritmo)", valores: tend(rt), unir: true, formato: reloj, formatoEje: reloj },
      ],
    });
    cont.querySelector('[data-grafica="nado"]').replaceChildren(g);
  }
  escucharChips(cont, () => pintarNatacion(cont, { alCambiar }));
}

// =====================================================================
// OBJETIVO (en el Resumen): cuenta atrás y cómo llegarás
// =====================================================================
const fechaLarga = (d) => new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
function tarjetaObjetivo(lista, dias) {
  const o = almacen.ajustes().objetivo;
  const editar = `<button type="button" class="ver-mas boton-texto" data-accion="objetivo">${o ? "Cambiar" : "Añadir"}</button>`;
  if (!o?.fecha) {
    return tarjeta("Objetivo", `<p class="nota sin-margen">¿Tienes una carrera o un triatlón en mente? Ponle fecha y verás la cuenta atrás, en qué etapa del plan estás y con qué forma llegarías.</p>`,
      { accion: editar, icono: "🎯", clase: "tarjeta-objetivo vacia" });
  }
  const tipo = an.TIPOS_OBJETIVO[o.tipo] || an.TIPOS_OBJETIVO.otro;
  const dia = new Date(o.fecha + "T00:00:00");
  const faltan = Math.round((dia - an.diaDe(new Date())) / DIA);
  const semanas = faltan / 7;
  const et = an.etapa(semanas);
  const p = an.proyectar(dias, dia);
  const zona = p && an.zonaForma(p.tsb);
  let pred = "";
  if (tipo.distancia && faltan >= 0) {
    const r = an.prediccionRiegel(lista)?.find((x) => x.distancia === tipo.distancia);
    const vo2 = [...salud.enCache()].reverse().find((d) => d.vo2)?.vo2;
    const t = r?.t ?? (vo2 ? an.tiempoPorVo2(vo2, tipo.distancia) : null);
    if (t) pred = `<div><span>Hoy harías</span><b>${reloj(t)}</b>${o.tiempo ? `<small class="${t <= o.tiempo ? "sube" : "baja"}">${t <= o.tiempo ? "✓ dentro" : `${reloj(t - o.tiempo)} más`} de tu objetivo</small>` : `<small>${r ? "por tus marcas" : "por tu VO2max"}</small>`}</div>`;
  }
  const cuenta = faltan < 0 ? "Ya pasó" : faltan === 0 ? "¡Es hoy!" : faltan < 21 ? `${faltan} días` : `${Math.floor(semanas)} semanas`;
  return tarjeta("Objetivo", `
    <div class="objetivo-cabecera">
      <span class="objetivo-icono" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg></span>
      <div><b>${o.nombre ? escapar(o.nombre) : tipo.nombre}</b><small>${o.nombre ? `${tipo.nombre} · ` : ""}${fechaLarga(dia)}</small></div>
      <strong class="cuenta-atras">${cuenta}</strong>
    </div>
    <div class="objetivo-cifras">
      <div><span>Etapa</span><b>${et.nombre}</b></div>
      ${o.tiempo ? `<div><span>Tu objetivo</span><b>${reloj(o.tiempo)}</b></div>` : ""}
      ${pred}
      ${p ? `<div class="forma-${zona.clase}"><span>Llegarías con</span><b>forma ${num(p.ctl)}</b><small>frescura ${conSigno(p.tsb)} · ${zona.nombre.toLowerCase()}</small></div>` : ""}
    </div>
    <p class="nota sin-margen">${et.texto}${p ? ` Cálculo: si sigues con tu carga de las últimas 4 semanas (${num(p.cargaSemanal)} por semana) y la bajas un 40 % las 2 últimas.` : ""}</p>`,
    { accion: editar, icono: "🎯", clase: "tarjeta-objetivo" });
}
const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// =====================================================================
// DEPORTES: una tarjeta por deporte y la página de cada uno
// =====================================================================
const distTexto = (d, m) => (d === "nadar" ? `${num(m)} m` : `${num(m / 1000, m >= 100000 ? 0 : 1)} km`);
// Meses (para las gráficas de volumen)
function porMes(acts, meses, u) { return an.totales(acts, "mes", meses, u); }

export function pintarDeportes(cont, { deporte, alCambiar } = {}) {
  if (deporte) return pintarDeporte(cont, deporte, { alCambiar });
  const { lista, u } = datosBase();
  const haceAnio = Date.now() - 365 * DIA;
  const deportes = Object.keys(DEPORTES).map((d) => {
    const acts = lista.filter((a) => a.deporte === d);
    const anio = acts.filter((a) => new Date(a.inicio) >= haceAnio);
    return { d, acts, anio, horas: anio.reduce((s, a) => s + (a.duracion || 0), 0) / 3600, dist: anio.reduce((s, a) => s + (a.distancia || 0), 0) };
  }).filter((x) => x.acts.length).sort((a, b) => b.horas - a.horas || b.acts.length - a.acts.length);
  cont.innerHTML = `
    ${tarjetaTriatlon(lista)}
    <p class="nota sin-margen">Últimos 12 meses. Toca un deporte para ver su evolución${lista.some((a) => a.deporte === "correr") ? ", tus récords y predicciones" : ""}.</p>
    <section class="rejilla-deportes">${deportes.map(({ d, acts, anio, horas: h, dist }) => {
      const meses = porMes(acts, 12, u).map((p) => p.horas);
      const ult = acts[0];
      return `<a class="tarjeta-deporte" href="#entreno/deportes/${d}" data-deporte="${d}">
        <span class="tarjeta-deporte-icono" aria-hidden="true">${DEPORTES[d].svg}</span>
        <span class="tarjeta-deporte-nombre">${DEPORTES[d].nombre}</span>
        <b>${anio.length ? horas(h) : "—"}</b>
        <em>${anio.length} ${anio.length === 1 ? "sesión" : "sesiones"}${dist && d !== "gimnasio" && d !== "escalada" ? ` · ${distTexto(d, dist)}` : ""}</em>
        ${sparkline(meses, `var(--dep-${d})`)}
        <small>Última: ${fechaCorta(ult.inicio)}${anio.length !== acts.length ? ` · ${acts.length} en total` : ""}</small>
      </a>`;
    }).join("")}</section>`;
}

function pintarDeporte(cont, d, { alCambiar } = {}) {
  const info = DEPORTES[d];
  const volver = `<a class="volver-deportes" href="#entreno/deportes">‹ Todos los deportes</a>`;
  if (!info) { cont.innerHTML = `${volver}<p class="nota">No conozco ese deporte.</p>`; return; }
  const cabecera = `<header class="cabecera-deporte" data-deporte="${d}">${volver}<h2><span aria-hidden="true">${info.svg}</span>${info.nombre}</h2></header>`;
  if (d === "nadar") {
    cont.innerHTML = `${cabecera}<div class="cuerpo-deporte"></div>`;
    pintarNatacion(cont.querySelector(".cuerpo-deporte"), { alCambiar });
    return;
  }
  const { lista, u } = datosBase();
  const todas = lista.filter((a) => a.deporte === d);
  const desde = pref.rangoDep ? Date.now() - pref.rangoDep * DIA : 0;
  const acts = todas.filter((a) => new Date(a.inicio).getTime() >= desde);
  const cronol = [...acts].reverse();
  const h = acts.reduce((s, a) => s + (a.duracion || 0), 0) / 3600;
  const dist = acts.reduce((s, a) => s + (a.distancia || 0), 0);
  const desn = acts.reduce((s, a) => s + (a.desnivel || 0), 0);
  const carga = acts.reduce((s, a) => s + an.cargaDe(a, u).tss, 0);
  const conVel = d === "correr" || d === "bici" || d === "andar";
  const esRitmo = d === "correr" || d === "andar";
  const conDist = dist > 0 && d !== "gimnasio" && d !== "escalada";
  const kpi = [
    ["Sesiones", acts.length, acts.length ? `${num(acts.length / Math.max(1, (pref.rangoDep || 365) / 7), 1)} por semana` : ""],
    ["Tiempo", horas(h), acts.length ? `${horas(h / acts.length)} por sesión` : ""],
    conDist ? ["Distancia", distTexto(d, dist), acts.length ? `${distTexto(d, dist / acts.length)} por sesión` : ""] : ["Carga", num(carga), acts.length ? `${num(carga / acts.length)} por sesión` : ""],
    conVel && dist && h ? [esRitmo ? "Ritmo medio" : "Velocidad media", esRitmo ? `${reloj(h * 3600 / (dist / 1000))}` : `${num(dist / 1000 / h, 1)} km/h`, esRitmo ? "por km" : ""]
      : desn > 0 ? ["Desnivel +", `${num(desn)} m`, ""] : ["Pulso medio", (() => { const f = acts.map((a) => a.fcMedia).filter(Boolean); return f.length ? `${num(f.reduce((s, x) => s + x, 0) / f.length)} ppm` : "—"; })(), ""],
  ];
  const conRecords = d === "correr" || d === "bici";
  const sub = subpestanas("subDep", [["progreso", "Progreso"], ...(conRecords ? [["records", "Récords"]] : []), ["sesiones", "Sesiones"]]);
  const ver = pref.subDep;
  cont.innerHTML = `
    ${cabecera}
    ${sub}
    <div class="fila-chips fila-periodo"><span>Periodo</span>${desplegable("rangoDep", [30, 90, 182, 365, 730, 0])}</div>
    <section class="tarjetas-panel" data-deporte="${d}">${kpi.map(([t, v, e]) => `<div class="tarjeta-dato"><span>${t}</span><b>${v}</b><em>${e}</em></div>`).join("")}</section>
    ${ver === "records" && d === "correr" ? tarjetasCarrera(lista) : ""}
    ${ver !== "progreso" ? "" : tarjeta("Volumen por mes", `<div class="hueco-grafica" data-grafica="volumen"></div>`, { icono: "📊" })}
    ${ver === "progreso" && conVel && cronol.filter((a) => a.velMedia).length >= 2 ? tarjeta(esRitmo ? "Ritmo y pulso" : "Velocidad y pulso", `<div class="hueco-grafica" data-grafica="ritmo"></div>
      <p class="nota">Cada punto es una sesión; la línea gruesa es la tendencia (media de 5). ${esRitmo ? "Más arriba = más rápido." : ""} Toca la leyenda para elegir qué ver.</p>`, { icono: "⏱️" }) : ""}
    ${ver === "records" ? tarjeta(d === "bici" && acts.some((a) => a.curvaPot) ? "Curva de potencia" : "Curva de ritmo", `<div class="hueco-grafica" data-grafica="curva"></div>
      <p class="nota">Tu mejor ${d === "bici" && acts.some((a) => a.curvaPot) ? "potencia media" : d === "correr" ? "ritmo" : "velocidad media"} para cada duración, dentro de cualquier entreno: el periodo elegido contra todo lo anterior.</p>`, { icono: "📉" }) : ""}
    ${ver === "progreso" && conVel && cronol.filter((a) => a.ef).length >= 3 ? tarjeta("Eficiencia aeróbica", `<div class="hueco-grafica" data-grafica="ef"></div>
      <p class="nota">Eficiencia = ${cronol.some((a) => a.efPot) ? "vatios" : "metros por minuto"} por cada latido: si sube, a igual pulso vas más ${d === "bici" ? "fuerte" : "rápido"} (mejora tu base). Desacople = cuánto se cae la eficiencia de la 1ª mitad a la 2ª en entrenos de más de 40 min: por debajo del 5 % tu base aguanta esa duración.</p>`, { icono: "🫁" }) : ""}
    ${ver === "progreso" && d === "gimnasio" ? tarjetasGimnasio(acts) : ""}
    ${ver !== "sesiones" ? "" : tarjeta(`Últimas de ${info.nombre.toLowerCase()}`, `<ul class="ultimas">${todas.slice(0, 15).map((a) => `
      <li><a href="#entreno/${encodeURIComponent(a.id)}" data-deporte="${a.deporte}">
        <span class="actividad-icono" aria-hidden="true">${iconoDe(a)}</span>
        <span><strong>${escapar(a.nombre)}</strong><small>${new Date(a.inicio).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</small></span>
        <span class="ultimas-datos">${a.distancia && conDist ? distTexto(d, a.distancia) : horas((a.duracion || 0) / 3600)}<small>carga ${an.cargaDe(a, u).tss}</small></span>
      </a></li>`).join("")}</ul>`, { accion: `<a class="ver-mas" href="#entreno/actividades" data-ir-filtro="${d}">Ver todas ›</a>`, icono: "🕑" })}`;

  // Volumen por mes
  const meses = Math.max(6, Math.min(36, pref.rangoDep ? Math.ceil(pref.rangoDep / 30.4) : Math.ceil((Date.now() - new Date(todas.at(-1).inicio)) / (30.4 * DIA)) + 1));
  const periodos = porMes(todas, meses, u);
  const huecoVol = cont.querySelector('[data-grafica="volumen"]');
  if (huecoVol) huecoVol.replaceChildren(graficaSeries({
    id: `vol-${d}`, xs: periodos.map((p) => p.desde.getTime()), alto: 200,
    resumen: `Media ${horas(periodos.reduce((s, p) => s + p.horas, 0) / periodos.length)} al mes`,
    series: [
      { id: "horas", nombre: "Horas", tipo: "barras", color: "var(--acento)", valores: periodos.map((p) => p.horas || null), formato: horas, formatoEje: (v) => `${Math.round(v)} h` },
      conDist ? { id: "dist", nombre: d === "nadar" ? "Metros" : "Km", tipo: "linea", eje: "der", color: "var(--texto)", valores: periodos.map((p) => (p.distancia ? p.distancia / 1000 : null)), formato: (v) => `${num(v, 1)} km`, formatoEje: (v) => Math.round(v), unir: true }
        : { id: "ses", nombre: "Sesiones", tipo: "linea", eje: "der", color: "var(--texto)", valores: periodos.map((p) => p.sesiones || null), formato: (v) => `${v} ses.`, unir: true },
      { id: "carga", nombre: "Carga", tipo: "linea", eje: "der", color: "var(--forma-atl)", discontinua: true, valores: periodos.map((p) => p.carga || null), formato: (v) => num(v), ocultaAlEmpezar: true, unir: true },
    ],
  }));

  // Ritmo o velocidad de cada sesión
  const huecoRit = cont.querySelector('[data-grafica="ritmo"]');
  if (huecoRit) {
    const ses = cronol.filter((a) => a.velMedia && (a.distancia || 0) >= (d === "bici" ? 5000 : 1000));
    const tend = (ys) => ys.map((_, i) => { const v = ys.slice(Math.max(0, i - 4), i + 1).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; });
    const vel = ses.map((a) => (esRitmo ? 1000 / a.velMedia : a.velMedia * 3.6));
    const fmtV = esRitmo ? (v) => `${reloj(v)} /km` : (v) => `${num(v, 1)} km/h`;
    const ejeV = esRitmo ? reloj : (v) => Math.round(v);
    const fc = ses.map((a) => a.fcMedia || null);
    huecoRit.replaceChildren(graficaSeries({
      id: `ritmo-${d}`, xs: ses.map((a) => new Date(a.inicio).getTime()), alto: 220, invertirIzq: esRitmo,
      resumen: ses.length ? `Última: ${fmtV(vel.at(-1))}` : "",
      series: [
        { id: "v", nombre: esRitmo ? "Ritmo" : "Velocidad", tipo: "puntos", color: "var(--c-ritmo)", valores: vel, formato: fmtV, formatoEje: ejeV },
        { id: "vT", nombre: "Tendencia", tipo: "linea", grosor: 2.5, color: "var(--c-ritmo)", valores: tend(vel), formato: fmtV, formatoEje: ejeV, unir: true },
        { id: "fc", nombre: "Pulso medio", tipo: "linea", eje: "der", color: "var(--c-pulso)", valores: tend(fc), formato: (v) => `${Math.round(v)} ppm`, unir: true, ocultaAlEmpezar: true },
      ],
    }));
  }
  dibujarCurva(cont.querySelector('[data-grafica="curva"]'), todas, desde, d);
  dibujarEficiencia(cont.querySelector('[data-grafica="ef"]'), cronol, d);
  escucharChips(cont, () => pintarDeporte(cont, d, { alCambiar }));
}

// Récords y predicciones de carrera
function tarjetasCarrera(lista) {
  const recs = an.recordsCarrera(lista);
  const ritmo = (t, d) => `${reloj(t / (d / 1000))} /km`;
  const fecha = (f) => new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" });
  let pred = an.prediccionRiegel(lista), antiguo = false;
  if (!pred) { pred = an.prediccionRiegel(lista, 1e5); antiguo = !!pred; }
  const vo2 = [...salud.enCache()].reverse().find((d) => d.vo2);
  const o = almacen.ajustes().objetivo;
  const tipoObj = o && an.TIPOS_OBJETIVO[o.tipo];
  if (!recs.length && !pred && !vo2) return "";
  const filasPred = an.DISTANCIAS_PREDICCION.map((D) => {
    const r = pred?.find((x) => x.distancia === D);
    const v = vo2 ? an.tiempoPorVo2(vo2.vo2, D) : null;
    const esObj = tipoObj?.distancia === D;
    return `<tr${esObj ? ' class="fila-objetivo"' : ""}>
      <td><b>${an.NOMBRE_DISTANCIA[D]}</b>${esObj && o.tiempo ? `<small>🎯 ${reloj(o.tiempo)}</small>` : ""}</td>
      <td>${r ? `${reloj(r.t)}<small>${ritmo(r.t, D)}</small>` : "—"}</td>
      ${vo2 ? `<td>${reloj(v)}<small>${ritmo(v, D)}</small></td>` : ""}
    </tr>`;
  }).join("");
  const base = pred?.find((x) => x.distancia === 10000)?.desde;
  return `
    ${recs.length ? tarjeta("Mejores tiempos", `
      <div class="tabla-scroll"><table class="tabla-records" data-deporte="correr">
        <thead><tr><th>Distancia</th><th>Mejor</th><th>Cuándo</th><th>Este año</th></tr></thead>
        <tbody>${recs.map((r) => `<tr>
          <td><b>${an.NOMBRE_DISTANCIA[r.distancia]}</b></td>
          <td><a href="#entreno/${encodeURIComponent(r.mejor.id)}">${reloj(r.mejor.t)}</a><small>${ritmo(r.mejor.t, r.distancia)}</small></td>
          <td>${fecha(r.mejor.fecha)}</td>
          <td>${r.mejorAnio ? (r.mejorAnio.id === r.mejor.id ? "🏆" : reloj(r.mejorAnio.t)) : "—"}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <p class="nota">El tramo más rápido de esa distancia dentro de cualquier carrera (como los "mejores esfuerzos" de Strava). "Este año" son los últimos 12 meses.</p>`, { icono: "🏆" }) : ""}
    ${pred || vo2 ? tarjeta("Predicción de carrera", `
      <div class="tabla-scroll"><table class="tabla-records tabla-prediccion" data-deporte="correr">
        <thead><tr><th>Prueba</th><th>Por tus marcas</th>${vo2 ? `<th>Por VO2max</th>` : ""}</tr></thead>
        <tbody>${filasPred}</tbody>
      </table></div>
      <p class="nota">${pred ? `"Por tus marcas" usa la fórmula de Riegel con tus mejores 5 km, 10 km y media ${antiguo ? "de siempre (no has corrido en el último año, así que será optimista)" : "del último año"}${base ? `; ahora sale de tu ${an.NOMBRE_DISTANCIA[base.d]} del ${fecha(base.fecha)}` : ""}. ` : ""}${vo2 ? `"Por VO2max" usa las tablas de Jack Daniels con tu VO2max de Garmin (${num(vo2.vo2, 1)}, ${fechaCorta(vo2.fecha)}), como el reloj.` : ""} Para media y maratón hace falta haber entrenado tiradas largas: si no, tardarás más.</p>`, { icono: "🔮" }) : ""}`;
}

// =====================================================================
// CONSTANCIA (Resumen): mapa de calor del año (tipo GitHub) o de un mes
// =====================================================================
let mesCal = 0; // en la vista de mes: 0 = este mes, -1 = el anterior...
function tarjetaConstancia(lista) {
  const r = an.rachas(lista);
  return tarjeta("Constancia", `
    <div class="cifras-constancia">
      <div><span>Racha actual</span><b>${r.actual} ${r.actual === 1 ? "día" : "días"}</b></div>
      <div><span>Racha más larga</span><b>${r.larga} días</b></div>
      <div><span>Semanas con 3+</span><b>${r.semanas} seguidas</b></div>
      <div><span>Días entrenados</span><b>${r.diasAnio}</b><small>en 12 meses</small></div>
    </div>
    <div data-grafica="calendario"></div>
    <p class="calendario-valor" aria-live="polite">Toca un día para verlo</p>
    <div class="leyenda-calendario"><span>Menos carga</span>${[0, 1, 2, 3, 4].map((n) => `<i class="nivel-${n}"></i>`).join("")}<span>Más</span></div>`,
    { accion: desplegable("vistaCal", ["mes", "anio"], { mes: "Mes", anio: "Año" }) });
}

function dibujarCalendario(hueco, lista, u) {
  if (!hueco) return;
  const porDia = new Map();
  for (const a of lista) {
    const k = an.claveDia(an.diaDe(a.inicio));
    const x = porDia.get(k) || { carga: 0, n: 0, deportes: new Set(), horas: 0 };
    x.carga += an.cargaDe(a, u).tss; x.n++; x.deportes.add(a.deporte); x.horas += (a.duracion || 0) / 3600;
    porDia.set(k, x);
  }
  const hoy = an.diaDe(new Date());
  const nivel = (c) => (!c ? 0 : c < 40 ? 1 : c < 80 ? 2 : c < 130 ? 3 : 4);
  const valor = hueco.parentElement.querySelector(".calendario-valor");
  const contar = (k) => {
    const x = porDia.get(k);
    const f = new Date(k + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    return x ? `${f}: ${[...x.deportes].map((d) => DEPORTES[d]?.nombre).join(", ")} · ${x.n} ${x.n === 1 ? "entreno" : "entrenos"} · carga ${Math.round(x.carga)}` : `${f}: descanso`;
  };
  const elegir = (celda) => {
    hueco.querySelectorAll(".elegido").forEach((x) => x.classList.remove("elegido"));
    celda.classList.add("elegido");
    valor.textContent = contar(celda.dataset.dia);
  };

  if (pref.vistaCal === "mes") {
    // ----- Un mes, como un calendario normal (L a D) -----
    const primero = new Date(hoy.getFullYear(), hoy.getMonth() + mesCal, 1);
    const finMes = new Date(primero.getFullYear(), primero.getMonth() + 1, 0);
    const hueco0 = (primero.getDay() + 6) % 7;
    let celdas = "", dias = 0, h = 0, carga = 0;
    for (let i = 0; i < hueco0; i++) celdas += `<span class="mes-dia vacio-dia"></span>`;
    for (let d = 1; d <= finMes.getDate(); d++) {
      const f = new Date(primero.getFullYear(), primero.getMonth(), d), k = an.claveDia(f), x = porDia.get(k);
      if (x) { dias++; h += x.horas; carga += x.carga; }
      const futuro = f > hoy;
      celdas += `<button type="button" class="mes-dia nivel-${nivel(x?.carga)}${k === an.claveDia(hoy) ? " hoy" : ""}${futuro ? " futuro" : ""}" data-dia="${k}"${futuro ? " disabled" : ""} aria-label="${contar(k)}"><span>${d}</span></button>`;
    }
    hueco.innerHTML = `
      <div class="calendario-nav">
        <button type="button" class="boton-icono" data-mes-cal="-1" aria-label="Mes anterior">‹</button>
        <div><b>${primero.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</b><small>${dias} ${dias === 1 ? "día" : "días"} · ${horas(h)} · carga ${num(carga)}</small></div>
        <button type="button" class="boton-icono" data-mes-cal="1" aria-label="Mes siguiente"${mesCal >= 0 ? " disabled" : ""}>›</button>
      </div>
      <div class="mes-cabecera">${["L", "M", "X", "J", "V", "S", "D"].map((t) => `<span>${t}</span>`).join("")}</div>
      <div class="mes-rejilla">${celdas}</div>`;
    hueco.querySelectorAll("[data-mes-cal]").forEach((b) => b.addEventListener("click", () => { mesCal = Math.min(0, mesCal + Number(b.dataset.mesCal)); dibujarCalendario(hueco, lista, u); valor.textContent = "Toca un día para verlo"; }));
    hueco.querySelector(".mes-rejilla").addEventListener("click", (e) => { const c = e.target.closest("[data-dia]"); if (c) elegir(c); });
    return;
  }

  // ----- El año: 53 columnas (semanas) × 7 filas (días) -----
  const C = 13, G = 3, IZQ = 22, ARR = 16, SEM = 53;
  const lunes = an.lunesDe(new Date());
  const inicio = new Date(lunes); inicio.setDate(inicio.getDate() - 7 * (SEM - 1));
  let h = "", mesAnt = -1;
  for (let s = 0; s < SEM; s++) {
    for (let d = 0; d < 7; d++) {
      const f = new Date(inicio); f.setDate(f.getDate() + s * 7 + d);
      if (f > hoy) continue;
      const k = an.claveDia(f), x = porDia.get(k);
      if (d === 0 && f.getMonth() !== mesAnt) {
        mesAnt = f.getMonth();
        if (s < SEM - 2) h += `<text class="eje" x="${IZQ + s * (C + G)}" y="10">${f.toLocaleDateString("es-ES", { month: "short" })}</text>`;
      }
      h += `<rect class="dia-cal nivel-${nivel(x?.carga)}${k === an.claveDia(hoy) ? " hoy" : ""}" data-dia="${k}" x="${IZQ + s * (C + G)}" y="${ARR + d * (C + G)}" width="${C}" height="${C}" rx="3"/>`;
    }
  }
  ["L", "", "X", "", "V", "", "D"].forEach((t, d) => { if (t) h += `<text class="eje" x="0" y="${ARR + d * (C + G) + 10}">${t}</text>`; });
  const ancho = IZQ + SEM * (C + G), alto = ARR + 7 * (C + G);
  hueco.innerHTML = `<div class="tabla-scroll calendario-scroll"><svg class="calendario" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Calendario de entrenos de los últimos 12 meses">${h}</svg></div>`;
  const scroll = hueco.firstElementChild;
  scroll.scrollLeft = scroll.scrollWidth;
  // Antes, al tocar un día el texto de arriba cambiaba de altura y movía el
  // calendario justo entre "dedo encima" y "toque": se elegía el de arriba.
  // Ahora el texto va debajo (con altura fija) y en el móvil solo cuenta el toque.
  scroll.addEventListener("pointerover", (e) => { if (e.pointerType === "mouse") { const c = e.target.closest?.("[data-dia]"); if (c) elegir(c); } });
  scroll.addEventListener("click", (e) => { const c = e.target.closest?.("[data-dia]"); if (c) elegir(c); });
}

// =====================================================================
// INTENSIDAD (Forma): tiempo en zonas por semana y reparto 80/20
// =====================================================================
const COLOR_ZONA = (i) => `var(--zona-${i + 1})`;
function dibujarZonas(cont, u) {
  const hueco = cont.querySelector('[data-grafica="zonas"]');
  if (!hueco) return;
  const lista = almacen.listar().filter((a) => pref.deporteZonas === "todo" || a.deporte === pref.deporteZonas);
  // Hasta un mes: barras por día; más: por semana
  const porDias = pref.rangoZonas <= 30;
  const semanas = porDias
    ? an.totales(lista, "dia", pref.rangoZonas, u).map((p) => ({ desde: p.desde, z: an.segundosEnZonas(lista.filter((a) => { const f = new Date(a.inicio); return f >= p.desde && f < p.hasta; }).map((a) => a.fcHist), u.fcMax) }))
    : an.zonasPorSemana(lista, Math.ceil(pref.rangoZonas / 7), u.fcMax);
  const ult4 = semanas.reduce((t, s) => t.map((x, i) => x + s.z[i]), [0, 0, 0, 0, 0]);
  const total = ult4.reduce((s, x) => s + x, 0);
  const reparto = cont.querySelector("[data-reparto]");
  if (!total) {
    reparto.innerHTML = "";
    hueco.innerHTML = `<p class="nota">No hay pulso en este periodo${an.faltanCalculos().length ? " (o todavía estoy calculando tus actividades antiguas)" : ""}.</p>`;
    return;
  }
  const pct = (a, b) => Math.round(((ult4.slice(a, b).reduce((s, x) => s + x, 0)) / total) * 100);
  const suave = pct(0, 2), medio = pct(2, 3), fuerte = 100 - suave - medio;
  reparto.innerHTML = `
    <div class="barra-reparto" role="img" aria-label="${RANGOS[pref.rangoZonas]}: ${suave} % suave, ${medio} % moderado, ${fuerte} % fuerte">
      <span style="flex:${suave};background:var(--zona-2)"></span><span style="flex:${medio};background:var(--zona-3)"></span><span style="flex:${fuerte};background:var(--zona-5)"></span>
    </div>
    <div class="leyenda-reparto"><span><b>${suave} %</b> suave</span><span><b>${medio} %</b> moderado</span><span><b>${fuerte} %</b> fuerte</span><span class="${suave >= 75 ? "sube" : "baja"}">${suave >= 75 ? "✓ buen reparto" : "Te falta suave"}</span></div>
    <p class="nota sin-margen">${RANGOS[pref.rangoZonas]}.</p>`;
  barrasApiladas(hueco, {
    periodos: semanas.map((s) => ({ etiqueta: porDias ? (pref.rangoZonas <= 7 ? s.desde.toLocaleDateString("es-ES", { weekday: "short" }) : String(s.desde.getDate())) : fechaCorta(s.desde),
      titulo: porDias ? s.desde.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" }) : `Semana del ${fechaCorta(s.desde)}`, valores: s.z.map((x) => x / 3600) })),
    nombres: an.ZONAS_FC.map((z) => `${z.nombre} ${z.texto.toLowerCase()}`), colores: an.ZONAS_FC.map((_, i) => COLOR_ZONA(i)),
    fmt: horas, unidadEje: " h", resumen: `Media ${horas(semanas.reduce((s, x) => s + x.z.reduce((a, b) => a + b, 0), 0) / semanas.length / 3600)} con pulso por ${porDias ? "día" : "semana"}`,
  });
}

// Barras apiladas sencillas (zonas por semana)
function barrasApiladas(hueco, { periodos, nombres, colores, fmt, unidadEje = "", resumen }) {
  const M = { izq: 40, der: 8, arr: 12, aba: 26 }, alto = 180;
  const figura = document.createElement("figure");
  figura.className = "grafica grafica-series";
  figura.innerHTML = `<figcaption><b class="grafica-valor">${resumen}</b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img"); svg.setAttribute("aria-label", resumen);
  figura.append(svg);
  figura.insertAdjacentHTML("beforeend", `<div class="leyenda-series estatica">${nombres.map((n, i) => `<span><i class="muestra barras" style="--c:${colores[i]}"></i>${n}</span>`).join("")}</div>`);
  hueco.replaceChildren(figura);
  const valor = figura.querySelector(".grafica-valor");
  const suma = (p) => p.valores.reduce((s, x) => s + x, 0);
  const yMax = Math.max(0.1, ...periodos.map(suma)) * 1.1;
  let ancho = 0;
  const dibujar = () => {
    ancho = figura.clientWidth || 600;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`); svg.setAttribute("width", ancho); svg.setAttribute("height", alto);
    const zona = alto - M.arr - M.aba, w = (ancho - M.izq - M.der) / periodos.length;
    let h = "";
    for (const v of marcas(0, yMax, 4)) {
      const y = M.arr + (1 - v / yMax) * zona;
      h += `<line class="rejilla" x1="${M.izq}" x2="${ancho - M.der}" y1="${y}" y2="${y}"/><text class="eje" x="${M.izq - 6}" y="${y + 4}" text-anchor="end">${v}${unidadEje}</text>`;
    }
    const salto = Math.ceil(periodos.length / Math.max(2, Math.floor(ancho / 52)));
    periodos.forEach((p, i) => {
      let base = M.arr + zona;
      const bw = Math.min(w * 0.68, 28), x = M.izq + i * w + (w - bw) / 2;
      p.valores.forEach((v, k) => {
        if (!v) return;
        const hh = (v / yMax) * zona; base -= hh;
        h += `<rect class="barra" data-i="${i}" x="${x}" y="${base}" width="${bw}" height="${Math.max(0, hh - 1)}" rx="2" style="fill:${colores[k]}"/>`;
      });
      if ((periodos.length - 1 - i) % salto === 0) h += `<text class="eje" x="${x + bw / 2}" y="${alto - 7}" text-anchor="middle">${p.etiqueta}</text>`;
    });
    svg.innerHTML = h;
  };
  const mostrar = (e) => {
    const r = svg.getBoundingClientRect();
    const i = Math.floor(((((e.clientX - r.left) / r.width) * ancho - M.izq) / (ancho - M.izq - M.der)) * periodos.length);
    if (i < 0 || i >= periodos.length) return;
    svg.querySelectorAll(".barra").forEach((b) => b.classList.toggle("tenue", +b.dataset.i !== i));
    const p = periodos[i], t = suma(p);
    valor.textContent = `${p.titulo}: ${fmt(t)}${t ? ` (${p.valores.map((v, k) => (v ? `${nombres[k].split(" ")[0]} ${Math.round((v / t) * 100)} %` : null)).filter(Boolean).join(" · ")})` : ""}`;
  };
  svg.addEventListener("pointermove", mostrar); svg.addEventListener("pointerdown", mostrar);
  svg.addEventListener("pointerleave", () => { svg.querySelectorAll(".barra").forEach((b) => b.classList.remove("tenue")); valor.textContent = resumen; });
  new ResizeObserver(() => { if (figura.clientWidth && figura.clientWidth !== ancho) dibujar(); }).observe(figura);
}

// =====================================================================
// MONOTONÍA (Forma)
// =====================================================================
function dibujarMonotonia(hueco, dias) {
  if (!hueco || dias.length < 14) { if (hueco) hueco.innerHTML = `<p class="nota">Hacen falta un par de semanas de entrenos.</p>`; return; }
  const { hoy, porSemana } = an.monotonia(dias, Math.round(pref.rangoMono / 7));
  hueco.replaceChildren(graficaSeries({
    id: "monotonia", xs: porSemana.map((s) => s.desde.getTime()), alto: 200, minIzq: 0,
    resumen: `Últimos 7 días: monotonía ${num(hoy.monotonia, 1)} · estrés ${num(hoy.estres)}`,
    bandas: [{ desde: 2, hasta: 4, clase: "banda-riesgo" }],
    series: [
      { id: "mono", nombre: "Monotonía", tipo: "linea", grosor: 2.5, color: "var(--forma-atl)", valores: porSemana.map((s) => s.monotonia), formato: (v) => num(v, 1), formatoEje: (v) => num(v, 1) },
      { id: "estres", nombre: "Estrés", tipo: "barras", eje: "der", color: "var(--carga-dia)", valores: porSemana.map((s) => s.estres || null), formato: (v) => num(v) },
      { id: "carga", nombre: "Carga semanal", tipo: "linea", eje: "der", discontinua: true, color: "var(--forma-ctl)", valores: porSemana.map((s) => s.carga || null), formato: (v) => num(v), ocultaAlEmpezar: true },
    ],
  }));
}

// =====================================================================
// NATACIÓN: zonas de ritmo con tu CSS, estilos y series
// =====================================================================
const NOMBRE_ESTILO = { freestyle: "Libre", backstroke: "Espalda", breaststroke: "Braza", butterfly: "Mariposa", drill: "Técnica", mixed: "Mixto", im: "Estilos" };
const COLOR_ESTILO = { freestyle: "var(--estilo-1)", breaststroke: "var(--estilo-2)", backstroke: "var(--estilo-3)", butterfly: "var(--estilo-4)", drill: "var(--estilo-5)" };
function tarjetasNado(acts, u) {
  let html = "";
  if (u.css) {
    const zonas = an.zonasCss(u.css);
    const seg = zonas.map(() => 0);
    for (const a of acts) for (const [r, s] of Object.entries(a.ritmoHist || {})) {
      const i = zonas.findIndex((z) => Number(r) + 1 >= z.desde && Number(r) + 1 < z.hasta);
      if (i >= 0) seg[i] += s;
    }
    const total = seg.reduce((s, x) => s + x, 0);
    html += tarjeta("Tus zonas de ritmo", `
      <ul class="zonas-css">${zonas.map((z, i) => `<li>
        <span class="zona-nombre"><b>${z.nombre}</b><small>${z.texto}</small></span>
        <span class="zona-ritmo">${z.hasta === Infinity ? `más de ${reloj(z.desde)}` : z.desde === 0 ? `menos de ${reloj(z.hasta)}` : `${reloj(z.desde)}–${reloj(z.hasta)}`}</span>
        ${total ? `<span class="zona-barra"><span style="width:${(seg[i] / Math.max(...seg)) * 100}%" data-zona="${i + 1}"></span></span><span class="zona-tiempo">${Math.round((seg[i] / total) * 100)} %</span>` : ""}
      </li>`).join("")}</ul>
      <p class="nota">Ritmos por 100 m calculados con tu CSS (${reloj(u.css)}${u.cssEstimada ? ", estimada" : ""}).${total ? " El % es el tiempo que has nadado en cada zona en el periodo, largo a largo." : ""}</p>`, { icono: "🎯" });
  }
  const estilos = {};
  for (const a of acts) for (const [e, m] of Object.entries(a.estilos || {})) estilos[e] = (estilos[e] || 0) + m;
  const tot = Object.values(estilos).reduce((s, x) => s + x, 0);
  const series = acts.filter((a) => a.seriesNado);
  if (tot) {
    const orden = Object.entries(estilos).sort((a, b) => b[1] - a[1]);
    html += tarjeta("Estilos y series", `
      <div class="barra-reparto">${orden.map(([e, m]) => `<span style="flex:${m};background:${COLOR_ESTILO[e] || "var(--dep-otro)"}"></span>`).join("")}</div>
      <ul class="lista-estilos">${orden.map(([e, m]) => `<li><i style="background:${COLOR_ESTILO[e] || "var(--dep-otro)"}"></i>${NOMBRE_ESTILO[e] || e}<b>${num(m / 1000, 1)} km</b><span>${Math.round((m / tot) * 100)} %</span></li>`).join("")}</ul>
      ${series.length ? `<div class="cifras-mini">
        <div><span>Series por sesión</span><b>${num(series.reduce((s, a) => s + a.seriesNado.n, 0) / series.length, 1)}</b></div>
        <div><span>Metros por serie</span><b>${num(series.reduce((s, a) => s + a.seriesNado.metros, 0) / series.length)} m</b></div>
      </div>` : ""}
      <p class="nota">Metros de cada estilo en el periodo. Las series son los bloques entre descansos.</p>`, { icono: "🏊" });
  }
  return html;
}

// =====================================================================
// CURVA DE RITMO / POTENCIA y EFICIENCIA (Carrera, Bici)
// =====================================================================
const ETIQ_DUR = { 60: "1 min", 180: "3 min", 300: "5 min", 600: "10 min", 1200: "20 min", 1800: "30 min", 3600: "1 h", 5400: "1 h 30", 7200: "2 h" };
function dibujarCurva(hueco, todas, desde, d) {
  if (!hueco) return;
  const pot = d === "bici" && todas.some((a) => a.curvaPot);
  const campo = pot ? "curvaPot" : "curva";
  const corte = desde || Date.now() - 365 * DIA;
  const recientes = todas.filter((a) => new Date(a.inicio).getTime() >= corte), antes = todas.filter((a) => new Date(a.inicio).getTime() < corte);
  const mejor = (acts) => an.DURACIONES_CURVA.map((t) => { const v = acts.map((a) => a[campo]?.[t]).filter(Boolean); return v.length ? Math.max(...v) : null; });
  const conv = (v) => (v == null ? null : pot ? v : d === "correr" ? 1000 / v : v * 3.6);
  const a = mejor(recientes).map(conv), b = mejor(antes).map(conv);
  const usadas = an.DURACIONES_CURVA.map((t, i) => (a[i] != null || b[i] != null ? i : -1)).filter((i) => i >= 0);
  if (usadas.length < 2) { hueco.innerHTML = `<p class="nota">Aún no hay bastantes datos${an.faltanCalculos().length ? " (estoy calculando tus actividades antiguas)" : ""}.</p>`; return; }
  const fmt = (v) => (v == null ? "—" : pot ? `${Math.round(v)} W` : d === "correr" ? `${reloj(v)} /km` : `${num(v, 1)} km/h`);
  const nombreA = desde ? "Periodo elegido" : "Últimos 12 meses", nombreB = desde ? "Antes" : "Antes de eso";
  const series = [{ nombre: nombreA, color: `var(--dep-${d})`, v: a }, { nombre: nombreB, color: "var(--suave)", v: b, discontinua: true }].filter((s) => s.v.some((x) => x != null));
  const vals = series.flatMap((s) => usadas.map((i) => s.v[i])).filter((x) => x != null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const inv = d === "correr"; // en carrera, ritmo más bajo = mejor: arriba
  const M = { izq: 46, der: 12, arr: 12, aba: 26 }, alto = 200;
  const figura = document.createElement("figure");
  figura.className = "grafica grafica-series";
  const resumen = `${ETIQ_DUR[an.DURACIONES_CURVA[usadas.at(-1)]]}: ${fmt(a[usadas.at(-1)])}`;
  figura.innerHTML = `<figcaption><b class="grafica-valor">${resumen}</b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `Curva: ${resumen}`);
  figura.append(svg);
  figura.insertAdjacentHTML("beforeend", `<div class="leyenda-series estatica">${series.map((s) => `<span><i class="muestra linea${s.discontinua ? " discontinua" : ""}" style="--c:${s.color}"></i>${s.nombre}</span>`).join("")}</div>`);
  hueco.replaceChildren(figura);
  const valor = figura.querySelector(".grafica-valor");
  let ancho = 0;
  const xDe = (k) => M.izq + (k / (usadas.length - 1)) * (ancho - M.izq - M.der);
  const yDe = (v) => M.arr + (inv ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * (alto - M.arr - M.aba);
  const dibujar = () => {
    ancho = figura.clientWidth || 600;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`); svg.setAttribute("width", ancho); svg.setAttribute("height", alto);
    let h = "";
    for (const v of marcas(lo, hi, 4)) h += `<line class="rejilla" x1="${M.izq}" x2="${ancho - M.der}" y1="${yDe(v)}" y2="${yDe(v)}"/><text class="eje" x="${M.izq - 6}" y="${yDe(v) + 4}" text-anchor="end">${pot ? Math.round(v) : d === "correr" ? reloj(v) : Math.round(v)}</text>`;
    const salto = Math.ceil(usadas.length / Math.max(2, Math.floor(ancho / 56)));
    usadas.forEach((i, k) => { if (k % salto === 0 || k === usadas.length - 1) h += `<text class="eje" x="${xDe(k)}" y="${alto - 7}" text-anchor="${k === 0 ? "start" : k === usadas.length - 1 ? "end" : "middle"}">${ETIQ_DUR[an.DURACIONES_CURVA[i]]}</text>`; });
    for (const s of [...series].reverse()) {
      let p = "", dentro = false;
      usadas.forEach((i, k) => { const v = s.v[i]; if (v == null) { dentro = false; return; } p += `${dentro ? "L" : "M"}${xDe(k).toFixed(1)},${yDe(v).toFixed(1)}`; dentro = true; });
      h += `<path class="grafica-linea${s.discontinua ? " discontinua" : ""}" style="stroke:${s.color};stroke-width:2.5" d="${p}"/>`;
      usadas.forEach((i, k) => { if (s.v[i] != null) h += `<circle class="punto-serie" cx="${xDe(k)}" cy="${yDe(s.v[i])}" r="3" style="fill:${s.color}"/>`; });
    }
    h += `<g class="cursor" display="none"><line y1="${M.arr}" y2="${alto - M.aba}"/></g>`;
    svg.innerHTML = h;
  };
  const mover = (e) => {
    const r = svg.getBoundingClientRect();
    const k = Math.max(0, Math.min(usadas.length - 1, Math.round(((((e.clientX - r.left) / r.width) * ancho - M.izq) / (ancho - M.izq - M.der)) * (usadas.length - 1))));
    const c = svg.querySelector(".cursor"); c.removeAttribute("display");
    c.querySelector("line").setAttribute("x1", xDe(k)); c.querySelector("line").setAttribute("x2", xDe(k));
    const i = usadas[k];
    valor.textContent = `${ETIQ_DUR[an.DURACIONES_CURVA[i]]}: ${series.map((s) => `${s.nombre.toLowerCase()} ${fmt(s.v[i])}`).join(" · ")}`;
  };
  svg.addEventListener("pointermove", mover); svg.addEventListener("pointerdown", mover);
  svg.addEventListener("pointerleave", () => { svg.querySelector(".cursor")?.setAttribute("display", "none"); valor.textContent = resumen; });
  new ResizeObserver(() => { if (figura.clientWidth && figura.clientWidth !== ancho) dibujar(); }).observe(figura);
}

function dibujarEficiencia(hueco, cronol, d) {
  if (!hueco) return;
  const ses = cronol.filter((a) => a.ef);
  const tend = (ys) => ys.map((_, i) => { const v = ys.slice(Math.max(0, i - 4), i + 1).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; });
  const ef = ses.map((a) => a.ef), des = ses.map((a) => a.desacople ?? null);
  const conDes = des.filter((x) => x != null);
  hueco.replaceChildren(graficaSeries({
    id: `ef-${d}`, xs: ses.map((a) => new Date(a.inicio).getTime()), alto: 210,
    resumen: `Última ${num(ef.at(-1), 2)}${conDes.length ? ` · desacople medio ${num(conDes.reduce((s, x) => s + x, 0) / conDes.length, 1)} %` : ""}`,
    series: [
      { id: "ef", nombre: "Eficiencia", tipo: "puntos", color: `var(--dep-${d})`, valores: ef, formato: (v) => num(v, 2), formatoEje: (v) => num(v, 2) },
      { id: "efT", nombre: "Tendencia", tipo: "linea", grosor: 2.5, color: `var(--dep-${d})`, valores: tend(ef), formato: (v) => num(v, 2), formatoEje: (v) => num(v, 2), unir: true },
      { id: "des", nombre: "Desacople %", tipo: "puntos", eje: "der", color: "var(--forma-atl)", valores: des, formato: (v) => `${num(v, 1)} %`, formatoEje: (v) => `${Math.round(v)}%`, ocultaAlEmpezar: true },
    ],
  }));
}

// =====================================================================
// GIMNASIO: grupos musculares y progresión de pesos
// =====================================================================
function tarjetasGimnasio(acts) {
  const grupos = {}, porEj = {};
  let sinNombre = 0, total = 0;
  for (const a of [...acts].reverse()) for (const [ej, x] of Object.entries(a.gym || {})) {
    total += x.series;
    if (ej === "Ejercicio") { sinNombre += x.series; continue; }
    const g = an.grupoDe(ej);
    grupos[g] = (grupos[g] || 0) + x.series;
    if (x.kgMax) (porEj[ej] ??= []).push({ fecha: a.inicio, kg: x.kgMax, id: a.id, series: x.series, reps: x.reps });
  }
  if (!total) return tarjeta("Ejercicios", `<p class="nota">${an.faltanCalculos().length ? "Estoy calculando tus sesiones antiguas…" : "Tus sesiones no tienen series apuntadas. En el reloj, usa la actividad Fuerza y marca cada serie: así verás aquí tus grupos musculares y cómo suben tus pesos."}</p>`, { icono: "💪" });
  const maxG = Math.max(1, ...Object.values(grupos));
  const ejs = Object.entries(porEj).sort((a, b) => b[1].length - a[1].length);
  return `
    ${tarjeta("Grupos musculares", Object.keys(grupos).length ? `<ul class="lista-grupos">${Object.entries(grupos).sort((a, b) => b[1] - a[1]).map(([g, n]) => `
      <li><span>${g}</span><span class="zona-barra"><span style="width:${(n / maxG) * 100}%"></span></span><b>${n}</b></li>`).join("")}</ul>
      <p class="nota">Series de cada grupo en el periodo.${sinNombre ? ` Otras ${sinNombre} series no tienen el ejercicio apuntado (${Math.round((sinNombre / total) * 100)} %): si lo eliges en el reloj al acabar cada serie, saldrán aquí.` : ""}</p>`
      : `<p class="nota">Ninguna serie del periodo tiene el ejercicio apuntado. En el reloj, al acabar cada serie puedes elegir qué ejercicio era.</p>`, { icono: "💪" })}
    ${ejs.length ? tarjeta("Progresión de pesos", `<div class="tabla-scroll"><table class="tabla-records" data-deporte="gimnasio">
      <thead><tr><th>Ejercicio</th><th>Primera</th><th>Última</th><th>Mejor</th><th></th></tr></thead>
      <tbody>${ejs.map(([ej, xs]) => { const best = Math.max(...xs.map((x) => x.kg)); return `<tr>
        <td><b>${escapar(ej)}</b><small>${xs.length} ${xs.length === 1 ? "sesión" : "sesiones"}</small></td>
        <td>${num(xs[0].kg, 1)} kg</td>
        <td><a href="#entreno/${encodeURIComponent(xs.at(-1).id)}">${num(xs.at(-1).kg, 1)} kg</a>${xs.length > 1 ? flecha(xs.at(-1).kg - xs[0].kg, " kg", 1) : ""}</td>
        <td>${num(best, 1)} kg</td>
        <td class="celda-spark">${sparkline(xs.map((x) => x.kg), "var(--dep-gimnasio)")}</td></tr>`; }).join("")}</tbody>
    </table></div><p class="nota">El peso más alto de cada sesión, de la primera a la última del periodo.</p>`, { icono: "📈" }) : ""}`;
}

// =====================================================================
// TRIATLÓN (Deportes): ¿cuánto te falta para tu distancia?
// =====================================================================
function tarjetaTriatlon(lista) {
  const o = almacen.ajustes().objetivo;
  const tipo = o && an.PLAN_TRI[o.tipo] ? o.tipo : "medio";
  const { plan, deportes } = an.preparacionTri(lista, tipo);
  const barra = (v, obj) => `<span class="zona-barra"><span style="width:${Math.min(100, (v / obj) * 100)}%"></span></span>`;
  const dist = (d, m) => (d === "nadar" ? `${num(m)} m` : `${num(m / 1000, 1)} km`);
  return tarjeta(`Preparación: ${plan.nombre}`, `
    <ul class="prep-tri">${deportes.map((x) => `<li data-deporte="${x.d}">
      <span class="prep-icono" aria-hidden="true">${DEPORTES[x.d].svg}</span>
      <div>
        <div class="prep-fila"><span>Horas por semana</span>${barra(x.horas, x.objetivoHoras)}<b>${horas(x.horas)}</b><small>de ${horas(x.objetivoHoras)}</small></div>
        <div class="prep-fila"><span>Sesión más larga</span>${barra(x.largo, x.objetivoLargo)}<b>${x.largo ? dist(x.d, x.largo) : "—"}</b><small>de ${dist(x.d, x.objetivoLargo)}</small></div>
      </div></li>`).join("")}</ul>
    <p class="nota sin-margen">Horas: media de las últimas 4 semanas frente a lo típico en la fase de construcción. Sesión más larga: de las últimas 6 semanas frente a la distancia de la prueba (en las semanas finales conviene acercarse). ${o && an.PLAN_TRI[o.tipo] ? "Según tu objetivo." : "Pon un triatlón como objetivo en el Resumen para cambiar la distancia."}</p>`,
    { icono: "🏊🚴🏃", clase: "tarjeta-tri" });
}

// =====================================================================
// DIARIO DE LESIÓN (Salud)
// =====================================================================
function tarjetaDiario() {
  const diario = (almacen.ajustes().diario || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hoy = an.claveDia(new Date());
  const deHoy = diario.find((x) => x.fecha === hoy);
  const zonas = [...new Set(diario.map((x) => x.zona).filter(Boolean))];
  return tarjeta("Diario de lesión", `
    <form class="form-diario" data-form="diario">
      <label class="campo-dolor"><span>Dolor hoy</span>
        <input name="dolor" type="range" min="0" max="10" step="1" value="${deHoy?.dolor ?? 0}" aria-describedby="dolor-valor">
        <output id="dolor-valor">${deHoy?.dolor ?? 0}</output>
      </label>
      <input name="zona" type="text" maxlength="40" list="zonas-dolor" placeholder="Dónde (p. ej. rodilla dcha.)" value="${escapar(deHoy?.zona || zonas.at(-1) || "")}">
      <datalist id="zonas-dolor">${zonas.map((z) => `<option value="${escapar(z)}">`).join("")}</datalist>
      <input name="nota" type="text" maxlength="140" placeholder="Nota (opcional)" value="${escapar(deHoy?.nota || "")}">
      <button class="boton-principal">${deHoy ? "Actualizar" : "Apuntar"}</button>
    </form>
    ${diario.length ? `<div class="hueco-grafica" data-grafica="diario"></div>
    <ul class="ultimas-diario">${diario.slice(-4).reverse().map((x) => `<li><b class="dolor-${x.dolor >= 6 ? "alto" : x.dolor >= 3 ? "medio" : "bajo"}">${x.dolor}</b><span>${new Date(x.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}${x.zona ? ` · ${escapar(x.zona)}` : ""}${x.nota ? `<small>${escapar(x.nota)}</small>` : ""}</span><button type="button" class="boton-texto" data-borrar-diario="${x.fecha}">Borrar</button></li>`).join("")}</ul>` : ""}
    <p class="nota sin-margen">0 = nada, 10 = no puedes ni andar. Apúntalo cada día que tengas molestias (mejor al día siguiente de correr) y verás si el dolor sube cuando subes los kilómetros. Si pasa de 3 o va a más, para y consúltalo.</p>`,
    { icono: "🩹", clase: "tarjeta-diario" });
}

function activarDiario(cont, repintar) {
  const form = cont.querySelector('[data-form="diario"]');
  if (!form) return;
  const rango = form.querySelector('[name="dolor"]');
  rango.addEventListener("input", () => (form.querySelector("output").textContent = rango.value));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(form), hoy = an.claveDia(new Date());
    const diario = (almacen.ajustes().diario || []).filter((x) => x.fecha !== hoy);
    diario.push({ fecha: hoy, dolor: Number(d.get("dolor")), zona: String(d.get("zona") || "").trim(), nota: String(d.get("nota") || "").trim() });
    almacen.guardarAjustes({ diario });
    repintar();
  });
  cont.querySelectorAll("[data-borrar-diario]").forEach((b) => b.addEventListener("click", () => {
    if (!b.classList.contains("confirmar")) { b.classList.add("confirmar"); b.textContent = "¿Seguro?"; return; }
    almacen.guardarAjustes({ diario: (almacen.ajustes().diario || []).filter((x) => x.fecha !== b.dataset.borrarDiario) });
    repintar();
  }));
  const hueco = cont.querySelector('[data-grafica="diario"]');
  if (!hueco) return;
  const diario = almacen.ajustes().diario || [];
  const primero = diario.reduce((m, x) => (x.fecha < m ? x.fecha : m), an.claveDia(new Date()));
  const hasta = an.diaDe(new Date());
  const desde = new Date(Math.max(new Date(primero + "T00:00").getTime() - 7 * DIA, hasta.getTime() - 120 * DIA));
  const porFecha = new Map(diario.map((x) => [x.fecha, x.dolor]));
  const km = new Map();
  for (const a of almacen.listar()) if (a.deporte === "correr") { const k = an.claveDia(an.diaDe(a.inicio)); km.set(k, (km.get(k) || 0) + (a.distancia || 0) / 1000); }
  const xs = [], dol = [], kms = [];
  for (let t = new Date(desde); t <= hasta; t.setDate(t.getDate() + 1)) { const k = an.claveDia(t); xs.push(t.getTime()); dol.push(porFecha.get(k) ?? null); kms.push(km.get(k) || null); }
  hueco.replaceChildren(graficaSeries({
    id: "diario", xs, alto: 180, minIzq: 0,
    resumen: `Último dolor ${diario.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1).dolor} de 10`,
    series: [
      { id: "dolor", nombre: "Dolor", tipo: "linea", grosor: 2.5, color: "var(--tsb-riesgo)", valores: dol, unir: true, formato: (v) => `${v}/10` },
      { id: "dolorP", nombre: "Cada día", tipo: "puntos", color: "var(--tsb-riesgo)", valores: dol, formato: (v) => `${v}/10` },
      { id: "km", nombre: "Km corriendo", tipo: "barras", eje: "der", color: "var(--dep-correr)", valores: kms, formato: (v) => `${num(v, 1)} km` },
    ],
  }));
}
