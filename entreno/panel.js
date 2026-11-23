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
import { NS, marcas } from "./graficas.js";
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
pref.rangoSalud ??= 90; pref.metricaSalud ??= null; pref.rangoNado ??= 365; pref.rangoDep ??= 365;

function chips(nombre, opciones, extra = "") {
  return `<div class="chips chips-mini ${extra}" role="group">${opciones.map(([v, t]) =>
    `<button type="button" data-pref="${nombre}" data-valor="${v}" class="${pref[nombre] === v ? "activo" : ""}" aria-pressed="${pref[nombre] === v}">${t}</button>`).join("")}</div>`;
}
// Los botoncitos de cada apartado: guardan la elección y repintan ese apartado
function escucharChips(cont, repintar) {
  cont.querySelectorAll("[data-pref]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.valor;
    pref[b.dataset.pref] = v === "" || isNaN(v) ? v : Number(v);
    guardarPref();
    repintar();
  }));
}
const tarjeta = (titulo, cuerpo, { clase = "", accion = "", icono = "" } = {}) => `
  <section class="tarjeta-entreno ${clase}">
    <header class="tarjeta-cabecera"><h2>${icono ? `<span aria-hidden="true">${icono}</span>` : ""}${titulo}</h2>${accion}</header>
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
    <li data-deporte="${d}"><span class="punto-deporte"></span><a href="#entreno/deportes/${d}">${DEPORTES[d].icono} ${DEPORTES[d].nombre}</a>
      <b>${x.distancia ? (d === "nadar" ? `${num(x.distancia)} m` : `${num(x.distancia / 1000, 1)} km`) : `${x.sesiones} ${x.sesiones === 1 ? "sesión" : "sesiones"}`}</b>
      <span>${horas(x.horas)}</span></li>`).join("");
  const ultimas = lista.slice(0, 4);

  cont.innerHTML = `
    <section class="tarjetas-panel">
      <a class="tarjeta-dato" href="#entreno/actividades"><span>Esta semana</span><b>${horas(actual.horas)}</b>
        <em>${actual.sesiones} ${actual.sesiones === 1 ? "sesión" : "sesiones"} · antes ${horas(anterior.horas)}</em>${sparkline(semanas.map((s) => s.horas), "var(--suave)")}</a>
      <a class="tarjeta-dato" href="#entreno/forma"><span>Carga semanal</span><b>${num(actual.carga)}</b>
        <em>la anterior ${num(anterior.carga)}</em>${sparkline(semanas.map((s) => s.carga), "var(--forma-atl)")}</a>
      <a class="tarjeta-dato" href="#entreno/forma"><span>Forma física</span><b>${num(hoy.ctl)}</b>
        ${hace4 ? flecha(hoy.ctl - hace4.ctl) : ""}<em>en 4 semanas</em>${sparkline(dias.slice(-42).map((d) => d.ctl))}</a>
      <a class="tarjeta-dato forma-${zona.clase}" href="#entreno/forma"><span>Frescura</span><b>${conSigno(hoy.tsb)}</b>
        <em class="etiqueta-forma">${zona.nombre}</em>${sparkline(dias.slice(-42).map((d) => d.tsb), "var(--tsb-neg)")}</a>
    </section>

    ${tarjetaObjetivo(lista, dias)}

    ${tarjeta("Cómo estás hoy", `
      <ul class="estado-hoy">
        <li class="forma-${zona.clase}"><span class="semaforo"></span><div><b>${zona.nombre}</b><p>${zona.texto}</p></div></li>
        ${r ? `<li class="riesgo-${r.nivel}"><span class="semaforo"></span><div><b>${r.titulo}</b><p>${r.texto}</p></div></li>` : ""}
        ${vo2 ? `<li><span class="semaforo neutro"></span><div><b>VO2max ${num(vo2.vo2, 1)}</b><p>Último valor de Garmin (${fechaCorta(vo2.fecha)}).</p></div></li>` : ""}
      </ul>`, { accion: enlace("forma"), icono: "🧭" })}

    ${porDeporte ? tarjeta("Esta semana por deporte", `<ul class="por-deporte sin-borde">${porDeporte}</ul>`, { icono: "📅" }) : ""}

    ${tarjeta("Totales", `
      <div class="fila-chips">${chips("medida", [["horas", "Horas"], ["carga", "Carga"], ["sesiones", "Sesiones"]])}</div>
      <div class="hueco-grafica" data-grafica="totales"></div>
      <div class="leyenda-series" data-leyenda="totales">${Object.keys(DEPORTES).filter((d) => lista.some((a) => a.deporte === d)).map((d) =>
        `<button type="button" data-deporte="${d}" data-toggle-dep="${d}" aria-pressed="${!pref.ocultosTot.includes(d)}"><i class="muestra barras" style="--c:var(--dep-${d})"></i>${DEPORTES[d].nombre}</button>`).join("")}</div>`,
      { accion: chips("periodo", [["semana", "Semanas"], ["mes", "Meses"]]), icono: "📊" })}

    ${tarjeta("Últimas actividades", `<ul class="ultimas">${ultimas.map((a) => `
      <li><a href="#entreno/${encodeURIComponent(a.id)}" data-deporte="${a.deporte}">
        <span class="actividad-icono" aria-hidden="true">${iconoDe(a)}</span>
        <span><strong>${a.nombre}</strong><small>${new Date(a.inicio).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</small></span>
        <span class="ultimas-datos">${a.distancia ? (a.deporte === "nadar" ? `${num(a.distancia)} m` : `${num(a.distancia / 1000, 1)} km`) : horas((a.duracion || 0) / 3600)}<small>carga ${an.cargaDe(a, u).tss}</small></span>
      </a></li>`).join("")}</ul>`, { accion: enlace("actividades", "Ver todas"), icono: "🕑" })}`;

  dibujarTotales(cont.querySelector('[data-grafica="totales"]'), lista, u);
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
  const periodos = an.totales(lista, pref.periodo, 12, u);
  const deportes = Object.keys(DEPORTES).filter((d) => !pref.ocultosTot.includes(d));
  const valorDe = (x) => (pref.medida === "horas" ? x.horas : pref.medida === "carga" ? x.carga : x.sesiones);
  const sumaDe = (p) => deportes.reduce((s, d) => s + (p.deportes[d] ? valorDe(p.deportes[d]) : 0), 0);
  const fmt = (v) => (pref.medida === "horas" ? horas(v) : num(v));
  const etiqueta = (p) => (pref.periodo === "semana" ? fechaCorta(p.desde) : p.desde.toLocaleDateString("es-ES", { month: "short" }));
  const resumen = `Media ${fmt(periodos.reduce((s, p) => s + sumaDe(p), 0) / periodos.length)} por ${pref.periodo}`;
  const figura = document.createElement("figure");
  figura.className = "grafica grafica-series";
  figura.innerHTML = `<figcaption><b class="grafica-valor">${resumen}</b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Totales por ${pref.periodo}. ${resumen}`);
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
      const x = M.izq + i * w + w * 0.16, bw = w * 0.68;
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
    const partes = deportes.filter((d) => p.deportes[d]).map((d) => `${DEPORTES[d].icono} ${fmt(valorDe(p.deportes[d]))}`);
    const cuando = pref.periodo === "semana" ? `Semana del ${fechaCorta(p.desde)}` : p.desde.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
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

  cont.innerHTML = `
    ${tarjeta("Forma física, cansancio y frescura", `
      <div class="cifras-forma">
        <div><span><i style="background:var(--forma-ctl)"></i>Forma física</span><b>${num(hoy.ctl)}</b></div>
        <div><span><i style="background:var(--forma-atl)"></i>Cansancio</span><b>${num(hoy.atl)}</b></div>
        <div class="forma-${zona.clase}"><span><i class="barrita"></i>Frescura</span><b>${conSigno(hoy.tsb)}</b><em class="etiqueta-forma">${zona.nombre}</em></div>
      </div>
      <div class="fila-chips">${chips("rango", [[42, "6 sem"], [90, "3 meses"], [182, "6 meses"], [365, "1 año"], [0, "Todo"]])}</div>
      <div class="hueco-grafica" data-grafica="forma"></div>
      <p class="nota">Toca los nombres de debajo de la gráfica para enseñar u ocultar cada dato. La franja verde es la zona en la que mejoras.</p>`,
      { icono: "📈" })}
    ${tarjetaRiesgo(r)}
    ${tarjeta("Cómo se calcula", `
      <div class="explica-texto">
        <p>Cada entreno suma <b>carga</b> (100 = una hora a tope sostenible). La <b>forma física</b> es la media de tu carga de las últimas 6 semanas: sube despacio si entrenas con constancia. El <b>cansancio</b> es la media de la última semana: sube y baja rápido. La <b>frescura</b> es la diferencia.</p>
        <p>Frescura entre −10 y −30: estás mejorando. Por debajo de −30: demasiada carga. Por encima de +5: fresco para competir.</p>
        <p>Tu carga se calcula con el pulso (reposo ${u.fcReposo}, máximo ${u.fcMax}, umbral ${u.lthr} ppm)${u.css ? ` y en piscina con tu ritmo frente a tu CSS (${reloj(u.css)} /100 m)` : ""}. Cámbialo en ⚙️ Ajustes.</p>
      </div>`, { icono: "ℹ️", clase: "plegable" })}`;

  if (dias.length >= 2) {
    const xs = dias.map((d) => d.fecha.getTime());
    const vo2 = salud.serieDiaria(dSalud, salud.METRICAS.find((m) => m.id === "vo2"), dias[0].fecha, dias.at(-1).fecha).ys;
    const g = graficaSeries({
      id: "forma", xs, alto: 230,
      resumen: `Hoy: forma ${num(hoy.ctl)} · cansancio ${num(hoy.atl)} · frescura ${conSigno(hoy.tsb)}`,
      bandas: [{ desde: -30, hasta: -10, clase: "banda-optima" }],
      series: [
        { id: "tsb", nombre: "Frescura", tipo: "barras", valores: dias.map((d) => d.tsb), formato: (v) => conSigno(v),
          color: (v) => (v >= 0 ? "var(--tsb-pos)" : v < -30 ? "var(--tsb-riesgo)" : "var(--tsb-neg)") },
        { id: "ctl", nombre: "Forma física", tipo: "area", color: "var(--forma-ctl)", grosor: 2.5, valores: dias.map((d) => d.ctl) },
        { id: "atl", nombre: "Cansancio", tipo: "linea", color: "var(--forma-atl)", valores: dias.map((d) => d.atl) },
        { id: "carga", nombre: "Carga del día", tipo: "barras", eje: "der", color: "var(--carga-dia)", valores: dias.map((d) => d.carga || null), ocultaAlEmpezar: true },
        { id: "vo2", nombre: "VO2max", tipo: "linea", eje: "der", color: "var(--dep-correr)", discontinua: true, valores: vo2, formato: (v) => num(v, 1), ocultaAlEmpezar: true },
      ],
    });
    cont.querySelector('[data-grafica="forma"]').replaceChildren(g);
  } else {
    cont.querySelector('[data-grafica="forma"]').innerHTML = `<p class="nota">Hacen falta al menos un par de días de entrenos.</p>`;
  }
  escucharChips(cont, () => pintarForma(cont));
  if (!dSalud.length) salud.cargar().then((d) => { if (d.length && cont.isConnected) pintarForma(cont); });
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
      cont.innerHTML = tarjeta("Salud", `<p class="nota">Aún no han llegado datos de salud de Garmin. Llegan solos cada media hora (el historial del último año tarda un rato en completarse).</p>`, { icono: "❤️" });
      return;
    }
    if (!conDatos.some((x) => x.m.id === pref.metricaSalud)) pref.metricaSalud = conDatos[0]?.m.id ?? null;
    const sel = conDatos.find((x) => x.m.id === pref.metricaSalud);
    const fmt = (m, v) => (v == null ? "—" : `${num(v, m.decimales || 0)}${m.unidad ? ` ${m.unidad}` : ""}`);

    cont.innerHTML = `
      ${sinNoche || poco ? `<div class="aviso-salud"><b>⌚ Lleva el reloj también por la noche</b>
        <p>Ahora casi solo lo llevas para entrenar, así que Garmin no puede medir tu sueño, tu VFC ni tu Body Battery, y el pulso "en reposo" sale demasiado alto (por eso lo escondo en los días con pocas horas de reloj). Si duermes con él, aquí aparecerán solos.</p></div>` : ""}
      <div class="fila-chips">${chips("rangoSalud", [[30, "30 días"], [90, "3 meses"], [182, "6 meses"], [365, "1 año"]])}</div>
      <section class="tarjetas-salud">${conDatos.map(({ m, ys, validos }) => {
        const ult = [...ys].reverse().find((v) => v != null);
        const s7 = ys.slice(-7).filter((v) => v != null), s28 = ys.slice(-35, -7).filter((v) => v != null);
        const med = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
        const dif = med(s7) != null && med(s28) != null ? med(s7) - med(s28) : null;
        return `<button type="button" class="tarjeta-dato tarjeta-salud${m.id === pref.metricaSalud ? " elegida" : ""}" data-metrica="${m.id}" aria-pressed="${m.id === pref.metricaSalud}">
          <span>${m.nombre}</span><b>${fmt(m, ult)}</b>${dif != null && !m.escalonada ? flecha(dif, "", m.decimales || 0, m.mejorBajo) : `<small>${validos.length} días</small>`}
          ${sparkline(salud.mediaMovil(ys, 3), m.color)}</button>`;
      }).join("")}</section>
      ${sel ? tarjeta(sel.m.nombre, `<div class="hueco-grafica" data-grafica="salud"></div><p class="nota">${sel.m.texto}</p>`, { icono: "❤️" }) : ""}`;

    if (sel) {
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

  cont.innerHTML = `
    <section class="tarjetas-panel" data-deporte="nadar">
      <div class="tarjeta-dato"><span>CSS (ritmo umbral)</span><b>${u.css ? reloj(u.css) : "—"}</b><em>${u.css ? "por 100 m · " + (u.cssEstimada ? "estimada" : "la tuya") : "faltan series de 200 y 400 m"}</em></div>
      <div class="tarjeta-dato"><span>Sesiones</span><b>${enRango.length}</b><em>${pref.rangoNado ? "en el periodo" : "en total"}</em></div>
      <div class="tarjeta-dato"><span>Metros</span><b>${num(metros / 1000, 1)} km</b><em>${enRango.length ? `${num(metros / enRango.length)} m por sesión` : ""}</em></div>
      <div class="tarjeta-dato"><span>SWOLF medio</span><b>${swolfs.length ? num(swolfs.reduce((s, x) => s + x, 0) / swolfs.length) : "—"}</b><em>menos es mejor</em></div>
    </section>
    <div class="fila-chips">${chips("rangoNado", [[90, "3 meses"], [182, "6 meses"], [365, "1 año"], [0, "Todo"]])}</div>
    ${tarjeta("Técnica y ritmo", `<div class="hueco-grafica" data-grafica="nado"></div>
      <p class="nota">Cada punto es una sesión; la línea gruesa es la tendencia (media de 5 sesiones). Arriba es mejor en las dos. Toca la leyenda para elegir qué ver.</p>`, { icono: "🏊", clase: "", })}
    ${records.length ? tarjeta("Mejores tiempos", `
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

  if (enRango.length >= 2) {
    const tend = (ys) => ys.map((_, i) => { const v = ys.slice(Math.max(0, i - 4), i + 1).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; });
    const sw = enRango.map((a) => a.swolf || null), rt = enRango.map((a) => (a.velMedia && a.distancia >= 300 ? 100 / a.velMedia : null));
    const g = graficaSeries({
      id: "nado", xs: enRango.map((a) => new Date(a.inicio).getTime()), alto: 220, invertirIzq: true, invertirDer: true,
      resumen: `Últ. SWOLF ${num([...sw].reverse().find(Boolean))} · ritmo ${(() => { const r = [...rt].reverse().find(Boolean); return r ? reloj(r) : "—"; })()}`,
      series: [
        { id: "swolf", nombre: "SWOLF", tipo: "puntos", color: "var(--dep-nadar)", valores: sw, formatoEje: (v) => Math.round(v) },
        { id: "swolfT", nombre: "SWOLF tendencia", tipo: "linea", grosor: 2.5, color: "var(--dep-nadar)", valores: tend(sw), unir: true, formatoEje: (v) => Math.round(v) },
        { id: "ritmo", nombre: "Ritmo /100 m", tipo: "puntos", eje: "der", color: "var(--forma-atl)", valores: rt, formato: reloj, formatoEje: reloj, ocultaAlEmpezar: true },
        { id: "ritmoT", nombre: "Ritmo tendencia", tipo: "linea", eje: "der", grosor: 2.5, color: "var(--forma-atl)", valores: tend(rt), unir: true, formato: reloj, formatoEje: reloj },
      ],
    });
    cont.querySelector('[data-grafica="nado"]').replaceChildren(g);
  }
  escucharChips(cont, () => pintarNatacion(cont, { alCambiar }));
  if (nados.some((a) => a.mejores === undefined)) {
    cont.insertAdjacentHTML("afterbegin", `<p class="nota calculando">Calculando tus mejores tiempos…</p>`);
    an.completarNado(() => alCambiar?.()).finally(() => cont.querySelector(".calculando")?.remove());
  }
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
      <span class="objetivo-icono" aria-hidden="true">${tipo.icono}</span>
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
    <p class="nota sin-margen">Últimos 12 meses. Toca un deporte para ver su evolución${lista.some((a) => a.deporte === "correr") ? ", tus récords y predicciones" : ""}.</p>
    <section class="rejilla-deportes">${deportes.map(({ d, acts, anio, horas: h, dist }) => {
      const meses = porMes(acts, 12, u).map((p) => p.horas);
      const ult = acts[0];
      return `<a class="tarjeta-deporte" href="#entreno/deportes/${d}" data-deporte="${d}">
        <span class="tarjeta-deporte-icono" aria-hidden="true">${DEPORTES[d].icono}</span>
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
  const cabecera = `<header class="cabecera-deporte" data-deporte="${d}">${volver}<h2><span aria-hidden="true">${info.icono}</span>${info.nombre}</h2></header>`;
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
  cont.innerHTML = `
    ${cabecera}
    <section class="tarjetas-panel" data-deporte="${d}">${kpi.map(([t, v, e]) => `<div class="tarjeta-dato"><span>${t}</span><b>${v}</b><em>${e}</em></div>`).join("")}</section>
    <div class="fila-chips">${chips("rangoDep", [[182, "6 meses"], [365, "1 año"], [730, "2 años"], [0, "Todo"]])}</div>
    ${d === "correr" ? tarjetasCarrera(lista) : ""}
    ${tarjeta("Volumen por mes", `<div class="hueco-grafica" data-grafica="volumen"></div>`, { icono: "📊" })}
    ${conVel && cronol.filter((a) => a.velMedia).length >= 2 ? tarjeta(esRitmo ? "Ritmo y pulso" : "Velocidad y pulso", `<div class="hueco-grafica" data-grafica="ritmo"></div>
      <p class="nota">Cada punto es una sesión; la línea gruesa es la tendencia (media de 5). ${esRitmo ? "Más arriba = más rápido." : ""} Toca la leyenda para elegir qué ver.</p>`, { icono: "⏱️" }) : ""}
    ${tarjeta(`Últimas de ${info.nombre.toLowerCase()}`, `<ul class="ultimas">${todas.slice(0, 6).map((a) => `
      <li><a href="#entreno/${encodeURIComponent(a.id)}" data-deporte="${a.deporte}">
        <span class="actividad-icono" aria-hidden="true">${iconoDe(a)}</span>
        <span><strong>${escapar(a.nombre)}</strong><small>${new Date(a.inicio).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</small></span>
        <span class="ultimas-datos">${a.distancia && conDist ? distTexto(d, a.distancia) : horas((a.duracion || 0) / 3600)}<small>carga ${an.cargaDe(a, u).tss}</small></span>
      </a></li>`).join("")}</ul>`, { accion: `<a class="ver-mas" href="#entreno/actividades" data-ir-filtro="${d}">Ver todas ›</a>`, icono: "🕑" })}`;

  // Volumen por mes
  const meses = Math.max(6, Math.min(36, pref.rangoDep ? Math.ceil(pref.rangoDep / 30.4) : Math.ceil((Date.now() - new Date(todas.at(-1).inicio)) / (30.4 * DIA)) + 1));
  const periodos = porMes(todas, meses, u);
  const huecoVol = cont.querySelector('[data-grafica="volumen"]');
  huecoVol.replaceChildren(graficaSeries({
    id: `vol-${d}`, xs: periodos.map((p) => p.desde.getTime()), alto: 200,
    resumen: `Media ${horas(periodos.reduce((s, p) => s + p.horas, 0) / periodos.length)} al mes`,
    series: [
      { id: "horas", nombre: "Horas", tipo: "barras", color: `var(--dep-${d})`, valores: periodos.map((p) => p.horas || null), formato: horas, formatoEje: (v) => `${Math.round(v)} h` },
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
        { id: "v", nombre: esRitmo ? "Ritmo" : "Velocidad", tipo: "puntos", color: `var(--dep-${d})`, valores: vel, formato: fmtV, formatoEje: ejeV },
        { id: "vT", nombre: "Tendencia", tipo: "linea", grosor: 2.5, color: `var(--dep-${d})`, valores: tend(vel), formato: fmtV, formatoEje: ejeV, unir: true },
        { id: "fc", nombre: "Pulso medio", tipo: "linea", eje: "der", color: "var(--serie-pulso)", valores: tend(fc), formato: (v) => `${Math.round(v)} ppm`, unir: true, ocultaAlEmpezar: true },
      ],
    }));
  }
  escucharChips(cont, () => pintarDeporte(cont, d, { alCambiar }));
  if (d === "correr" && todas.some((a) => a.mejores === undefined)) {
    cont.querySelector(".cabecera-deporte").insertAdjacentHTML("afterend", `<p class="nota calculando">Buscando tus mejores tiempos en ${todas.filter((a) => a.mejores === undefined).length} carreras… (solo la primera vez)</p>`);
    an.completarCarrera(() => alCambiar?.()).finally(() => cont.querySelector(".calculando")?.remove());
  }
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
