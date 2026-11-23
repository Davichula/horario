// =====================================================================
// entreno/panel.js — el PANEL de Entreno (lo primero que ves)
// ---------------------------------------------------------------------
//   1. Tarjetas: esta semana, carga, forma física y frescura.
//   2. Gráfica de forma física, cansancio y frescura.
//   3. Riesgo de lesión (si subes la carga demasiado deprisa).
//   4. Totales por semana o mes, por deporte.
//   5. Natación: récords, CSS y evolución del SWOLF.
// Los cálculos están en analisis.js; aquí solo se dibuja.
// =====================================================================

import { DEPORTES } from "./fit.js";
import * as almacen from "./almacen.js";
import * as an from "./analisis.js";
import { NS, marcas, graficaLinea, suavizar } from "./graficas.js";

const ALTO = 190;
const M = { izq: 40, der: 12, arr: 12, aba: 26 };
const DIA = 864e5;
const num = (x, d = 0) => (x == null || !isFinite(x) ? "—" : x.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d }));
const dos = (n) => String(n).padStart(2, "0");
const reloj = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${dos(m)}:${dos(s % 60)}` : `${m}:${dos(s % 60)}`; };
const horas = (h) => (h >= 1 ? `${Math.floor(h)} h ${dos(Math.round((h % 1) * 60))}` : `${Math.round(h * 60)} min`);
const fechaCorta = (d) => new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const flecha = (x, unidad = "", d = 0) => (x == null || !isFinite(x) ? "" : `<small class="${x > 0 ? "sube" : x < 0 ? "baja" : ""}">${x > 0 ? "▲" : x < 0 ? "▼" : "="} ${num(Math.abs(x), d)}${unidad}</small>`);

// Lo que el usuario eligió en cada gráfica (se recuerda en este dispositivo)
const CLAVE_PREF = "mi-horario:entreno-panel";
const pref = (() => { try { return JSON.parse(localStorage.getItem(CLAVE_PREF)) || {}; } catch { return {}; } })();
const guardarPref = () => { try { localStorage.setItem(CLAVE_PREF, JSON.stringify(pref)); } catch {} };
pref.rango ??= 90; pref.periodo ??= "semana"; pref.medida ??= "horas";

export function pintarPanel(contenedor, { alCambiar } = {}) {
  const lista = almacen.listar();
  const u = an.umbrales(lista);
  const dias = an.diario(lista, u);
  contenedor.innerHTML = `
    ${tarjetas(lista, dias, u)}
    <section class="tarjeta-entreno panel-forma">
      <div class="panel-titulo"><h2>Forma física, cansancio y frescura</h2>${chips("rango", [[42, "6 sem"], [90, "3 meses"], [182, "6 meses"], [365, "1 año"], [0, "Todo"]])}</div>
      <div class="hueco-grafica" data-grafica="forma"></div>
      <ul class="leyenda">
        <li><i style="background:var(--forma-ctl)"></i>Forma física <span>media de 6 semanas</span></li>
        <li><i style="background:var(--forma-atl)"></i>Cansancio <span>media de 7 días</span></li>
        <li><i class="barrita"></i>Frescura <span>forma − cansancio</span></li>
      </ul>
      <details class="explica"><summary>¿Cómo se lee?</summary>
        <p>Cada entreno suma <b>carga</b> (100 = una hora a tope sostenible). La <b>forma física</b> sube despacio cuando entrenas con constancia; el <b>cansancio</b> sube y baja rápido. Si la <b>frescura</b> está entre −10 y −30 estás mejorando; por debajo de −30 vas sobrecargado; por encima de +5 estás fresco para competir.</p>
        <p>La carga se calcula con tu pulso (reposo ${u.fcReposo}, máximo ${u.fcMax}, umbral ${u.lthr} ppm)${u.css ? ` y en piscina con tu ritmo frente a tu CSS (${reloj(u.css)} /100 m)` : ""}. Puedes cambiarlo en ⚙️ Ajustes.</p>
      </details>
    </section>
    ${tarjetaRiesgo(an.riesgo(dias))}
    <section class="tarjeta-entreno panel-totales">
      <div class="panel-titulo"><h2>Totales</h2>${chips("periodo", [["semana", "Semanas"], ["mes", "Meses"]])}</div>
      ${chips("medida", [["horas", "Horas"], ["carga", "Carga"], ["sesiones", "Sesiones"]])}
      <div class="hueco-grafica" data-grafica="totales"></div>
      <ul class="leyenda">${Object.keys(DEPORTES).filter((d) => lista.some((a) => a.deporte === d)).map((d) => `<li data-deporte="${d}"><i style="background:var(--serie)"></i>${DEPORTES[d].nombre}</li>`).join("")}</ul>
    </section>
    ${lista.some((a) => a.deporte === "nadar") ? `<section class="tarjeta-entreno panel-nado" data-deporte="nadar">
      <h2>Natación</h2>
      <div class="nado-contenido"></div>
    </section>` : ""}`;

  dibujarForma(contenedor.querySelector('[data-grafica="forma"]'), dias);
  dibujarTotales(contenedor.querySelector('[data-grafica="totales"]'), lista, u);
  const nado = contenedor.querySelector(".nado-contenido");
  if (nado) {
    pintarNado(nado, lista, u);
    // Las natación antiguas aún no tienen sus mejores tiempos: los calculamos y redibujamos
    if (lista.some((a) => a.deporte === "nadar" && a.mejores === undefined)) {
      nado.insertAdjacentHTML("afterbegin", `<p class="nota calculando">Calculando tus mejores tiempos…</p>`);
      an.completarNado(() => alCambiar?.()).finally(() => nado.querySelector(".calculando")?.remove());
    }
  }

  contenedor.querySelectorAll("[data-pref]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.valor;
    pref[b.dataset.pref] = isNaN(v) ? v : Number(v);
    guardarPref();
    pintarPanel(contenedor, { alCambiar });
  }));
}

function chips(nombre, opciones) {
  return `<div class="chips chips-mini" role="group">${opciones.map(([v, t]) =>
    `<button data-pref="${nombre}" data-valor="${v}" class="${pref[nombre] === v ? "activo" : ""}" aria-pressed="${pref[nombre] === v}">${t}</button>`).join("")}</div>`;
}

// ---------------------------------------------------------------------
// 1. Tarjetas de arriba
// ---------------------------------------------------------------------
function tarjetas(lista, dias, u) {
  const [anterior, actual] = an.totales(lista, "semana", 2, u);
  const hoy = dias.at(-1) || { ctl: 0, atl: 0, tsb: 0 };
  const hace4 = dias.at(-29);
  const zona = an.zonaForma(hoy.tsb);
  const porDeporte = Object.entries(actual.deportes).map(([d, x]) => `
    <li data-deporte="${d}"><span class="punto-deporte"></span>${DEPORTES[d].icono} ${DEPORTES[d].nombre}
      <b>${x.distancia ? (d === "nadar" ? `${num(x.distancia)} m` : `${num(x.distancia / 1000, 1)} km`) : `${x.sesiones} ${x.sesiones === 1 ? "sesión" : "sesiones"}`}</b>
      <span>${horas(x.horas)}</span></li>`).join("");
  return `
    <section class="tarjetas-panel">
      <div class="tarjeta-dato"><span>Esta semana</span><b>${horas(actual.horas)}</b><em>${actual.sesiones} ${actual.sesiones === 1 ? "sesión" : "sesiones"} · la anterior ${horas(anterior.horas)}</em></div>
      <div class="tarjeta-dato"><span>Carga semanal</span><b>${num(actual.carga)}</b><em>la anterior ${num(anterior.carga)}</em></div>
      <div class="tarjeta-dato"><span>Forma física</span><b>${num(hoy.ctl)}</b>${hace4 ? flecha(hoy.ctl - hace4.ctl) : ""}<em>vs hace 4 semanas</em></div>
      <div class="tarjeta-dato forma-${zona.clase}"><span>Frescura</span><b>${hoy.tsb > 0 ? "+" : ""}${num(hoy.tsb)}</b><em class="etiqueta-forma">${zona.nombre}</em></div>
    </section>
    ${porDeporte ? `<section class="tarjeta-entreno"><h2>Esta semana por deporte</h2><ul class="por-deporte sin-borde">${porDeporte}</ul></section>` : ""}`;
}

// ---------------------------------------------------------------------
// 2. Gráfica de forma (dos líneas + barras de frescura)
// ---------------------------------------------------------------------
function svgEn(hueco, alto = ALTO) {
  const figura = document.createElement("figure");
  figura.className = "grafica grafica-panel";
  figura.innerHTML = `<figcaption><span class="grafica-pie"></span><b class="grafica-valor"></b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img");
  figura.append(svg);
  hueco.replaceChildren(figura);
  return { figura, svg, valor: figura.querySelector(".grafica-valor"), pie: figura.querySelector(".grafica-pie"), alto };
}

function dibujarForma(hueco, todos) {
  if (todos.length < 2) { hueco.innerHTML = `<p class="nota">Hacen falta al menos un par de días de entrenos.</p>`; return; }
  const dias = pref.rango ? todos.slice(-pref.rango) : todos;
  const g = svgEn(hueco);
  g.svg.setAttribute("aria-label", `Forma física ${num(dias.at(-1).ctl)}, cansancio ${num(dias.at(-1).atl)}, frescura ${num(dias.at(-1).tsb)}`);
  const resumen = `Hoy: forma ${num(dias.at(-1).ctl)} · cansancio ${num(dias.at(-1).atl)}`;
  g.valor.textContent = resumen;
  const yMax = Math.max(20, ...dias.map((d) => Math.max(d.ctl, d.atl))) * 1.08;
  const yMin = Math.min(-10, ...dias.map((d) => d.tsb)) * 1.08;
  let ancho = 0;
  const xEn = (i) => M.izq + (i / (dias.length - 1)) * (ancho - M.izq - M.der);
  const yEn = (v) => M.arr + (1 - (v - yMin) / (yMax - yMin)) * (g.alto - M.arr - M.aba);

  function dibujar() {
    ancho = g.figura.clientWidth || 600;
    g.svg.setAttribute("viewBox", `0 0 ${ancho} ${g.alto}`);
    g.svg.setAttribute("width", ancho); g.svg.setAttribute("height", g.alto);
    let h = "";
    // Franja de "construyendo" (frescura entre −30 y −10)
    h += `<rect class="franja-optima" x="${M.izq}" width="${ancho - M.izq - M.der}" y="${yEn(-10)}" height="${Math.max(0, yEn(Math.max(-30, yMin)) - yEn(-10))}"/>`;
    for (const v of marcas(yMin, yMax, 5)) {
      h += `<line class="${v === 0 ? "rejilla cero" : "rejilla"}" x1="${M.izq}" x2="${ancho - M.der}" y1="${yEn(v)}" y2="${yEn(v)}"/>`;
      h += `<text class="eje" x="${M.izq - 6}" y="${yEn(v) + 4}" text-anchor="end">${v}</text>`;
    }
    // Fechas en el eje
    const cuantas = Math.max(2, Math.floor(ancho / 90));
    for (let k = 0; k < cuantas; k++) {
      const i = Math.round((k / (cuantas - 1)) * (dias.length - 1));
      h += `<text class="eje" x="${xEn(i)}" y="${g.alto - 7}" text-anchor="${k === 0 ? "start" : k === cuantas - 1 ? "end" : "middle"}">${fechaCorta(dias[i].fecha)}</text>`;
    }
    // Frescura: barras finas desde el cero
    const w = Math.max(1, (ancho - M.izq - M.der) / dias.length - 1);
    dias.forEach((d, i) => {
      const y0 = yEn(0), y = yEn(d.tsb);
      h += `<rect class="barra-tsb ${d.tsb >= 0 ? "pos" : d.tsb < -30 ? "riesgo" : "neg"}" x="${xEn(i) - w / 2}" y="${Math.min(y, y0)}" width="${w}" height="${Math.abs(y - y0)}"/>`;
    });
    const linea = (k) => dias.map((d, i) => `${i ? "L" : "M"}${xEn(i).toFixed(1)},${yEn(d[k]).toFixed(1)}`).join("");
    h += `<path class="grafica-linea" style="stroke:var(--forma-atl)" d="${linea("atl")}"/>`;
    h += `<path class="grafica-area" style="fill:var(--forma-ctl)" d="${linea("ctl")}L${xEn(dias.length - 1)},${yEn(Math.max(0, yMin))}L${xEn(0)},${yEn(Math.max(0, yMin))}Z"/>`;
    h += `<path class="grafica-linea gruesa" style="stroke:var(--forma-ctl)" d="${linea("ctl")}"/>`;
    h += `<g class="cursor" display="none"><line y1="${M.arr}" y2="${g.alto - M.aba}"/><circle r="4" style="fill:var(--forma-ctl)"/></g>`;
    g.svg.innerHTML = h;
  }
  cursor(g, dias.length, (i) => (ancho ? xEn(i) : 0), (i) => {
    const d = dias[i];
    g.svg.querySelector(".cursor circle")?.setAttribute("cy", yEn(d.ctl));
    return `${fechaCorta(d.fecha)} · carga ${num(d.carga)} · forma ${num(d.ctl)} · cansancio ${num(d.atl)} · frescura ${d.tsb > 0 ? "+" : ""}${num(d.tsb)}`;
  }, resumen);
  new ResizeObserver(() => { if (g.figura.clientWidth && g.figura.clientWidth !== ancho) dibujar(); }).observe(g.figura);
}

// Cursor común: línea vertical que sigue al dedo y texto arriba
function cursor(g, n, xDe, texto, resumen) {
  const indice = (e) => {
    const r = g.svg.getBoundingClientRect();
    const ancho = g.svg.viewBox.baseVal?.width || r.width;
    const px = ((e.clientX - r.left) / r.width) * ancho;
    const i = Math.round(((px - M.izq) / (ancho - M.izq - M.der)) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  };
  const mover = (e) => {
    const i = indice(e);
    const c = g.svg.querySelector(".cursor");
    if (!c) return;
    c.removeAttribute("display");
    const x = xDe(i);
    c.querySelector("line").setAttribute("x1", x); c.querySelector("line").setAttribute("x2", x);
    c.querySelector("circle")?.setAttribute("cx", x);
    g.valor.textContent = texto(i);
    g.figura.classList.add("activa");
  };
  g.svg.addEventListener("pointermove", mover);
  g.svg.addEventListener("pointerdown", mover);
  g.svg.addEventListener("pointerleave", () => {
    g.svg.querySelector(".cursor")?.setAttribute("display", "none");
    g.valor.textContent = resumen;
    g.figura.classList.remove("activa");
  });
}

// ---------------------------------------------------------------------
// 3. Riesgo
// ---------------------------------------------------------------------
function tarjetaRiesgo(r) {
  if (!r) return "";
  const pos = r.acwr == null ? 0 : Math.min(100, (r.acwr / 2) * 100);
  return `
    <section class="tarjeta-entreno panel-riesgo riesgo-${r.nivel}">
      <h2>Riesgo de lesión</h2>
      <p class="riesgo-titulo"><span class="semaforo" aria-hidden="true"></span>${r.titulo}</p>
      <p class="riesgo-texto">${r.texto}</p>
      ${r.acwr != null ? `
      <div class="medidor" role="img" aria-label="Relación de carga ${num(r.acwr, 2)}">
        <div class="medidor-zonas"><span class="z-bajo"></span><span class="z-bien"></span><span class="z-medio"></span><span class="z-alto"></span></div>
        <i style="left:${pos}%"></i>
      </div>
      <div class="medidor-marcas"><span>0</span><span style="left:40%">0,8</span><span style="left:65%">1,3</span><span style="left:75%">1,5</span><span style="left:100%">2</span></div>` : ""}
      <div class="riesgo-cifras">
        <div><span>Carga últimos 7 días</span><b>${num(r.agudo)}</b></div>
        <div><span>Media semanal (4 sem.)</span><b>${num(r.cronico)}</b></div>
        <div><span>Relación</span><b>${num(r.acwr, 2)}</b></div>
        <div><span>Subida de forma en 7 días</span><b>${r.rampa > 0 ? "+" : ""}${num(r.rampa, 1)}</b></div>
      </div>
      <p class="nota">Lo seguro es una relación entre 0,8 y 1,3 y que la forma física no suba más de 5 puntos por semana. Muy útil para volver a correr tras la lesión.</p>
    </section>`;
}

// ---------------------------------------------------------------------
// 4. Totales: barras apiladas por deporte
// ---------------------------------------------------------------------
function dibujarTotales(hueco, lista, u) {
  const n = pref.periodo === "semana" ? 12 : 12;
  const periodos = an.totales(lista, pref.periodo, n, u);
  const deportes = Object.keys(DEPORTES);
  const valorDe = (x) => (pref.medida === "horas" ? x.horas : pref.medida === "carga" ? x.carga : x.sesiones);
  const fmt = (v) => (pref.medida === "horas" ? horas(v) : num(v));
  const etiqueta = (p) => (pref.periodo === "semana" ? fechaCorta(p.desde) : p.desde.toLocaleDateString("es-ES", { month: "short" }));
  const total = periodos.reduce((s, p) => s + valorDe(p), 0);
  const conDatos = periodos.filter((p) => p.sesiones);
  const mediaP = conDatos.length ? total / periodos.length : 0;
  const resumen = `Media ${fmt(mediaP)} por ${pref.periodo}`;
  const g = svgEn(hueco, 180);
  g.valor.textContent = resumen;
  const yMax = Math.max(...periodos.map(valorDe), pref.medida === "horas" ? 1 : 1) * 1.1;
  let ancho = 0;

  function dibujar() {
    ancho = g.figura.clientWidth || 600;
    g.svg.setAttribute("viewBox", `0 0 ${ancho} ${g.alto}`);
    g.svg.setAttribute("width", ancho); g.svg.setAttribute("height", g.alto);
    const alto = g.alto - M.arr - M.aba;
    const w = (ancho - M.izq - M.der) / periodos.length;
    let h = "";
    for (const v of marcas(0, yMax, 4)) {
      const y = M.arr + (1 - v / yMax) * alto;
      h += `<line class="rejilla" x1="${M.izq}" x2="${ancho - M.der}" y1="${y}" y2="${y}"/>`;
      h += `<text class="eje" x="${M.izq - 6}" y="${y + 4}" text-anchor="end">${pref.medida === "horas" ? `${v} h` : v}</text>`;
    }
    const salto = Math.ceil(periodos.length / Math.max(2, Math.floor(ancho / 48)));
    periodos.forEach((p, i) => {
      let base = M.arr + alto;
      const x = M.izq + i * w + w * 0.15, bw = w * 0.7;
      for (const d of deportes) {
        const v = p.deportes[d] ? valorDe(p.deportes[d]) : 0;
        if (!v) continue;
        const hh = (v / yMax) * alto;
        base -= hh;
        h += `<rect class="barra" data-i="${i}" x="${x}" y="${base}" width="${bw}" height="${Math.max(0, hh - 1)}" style="fill:var(--dep-${d})"/>`;
      }
      if ((periodos.length - 1 - i) % salto === 0) // contando desde el final: la última siempre se ve
        h += `<text class="eje" x="${x + bw / 2}" y="${g.alto - 7}" text-anchor="middle">${etiqueta(p)}</text>`;
    });
    g.svg.innerHTML = h;
  }
  const texto = (i) => {
    const p = periodos[i];
    const partes = deportes.filter((d) => p.deportes[d]).map((d) => `${DEPORTES[d].icono} ${fmt(valorDe(p.deportes[d]))}`);
    const cuando = pref.periodo === "semana" ? `Semana del ${fechaCorta(p.desde)}` : p.desde.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return `${cuando}: ${fmt(valorDe(p))}${partes.length > 1 ? ` (${partes.join(" · ")})` : ""}`;
  };
  const mostrar = (e) => {
    const r = g.svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * ancho;
    const i = Math.floor(((px - M.izq) / (ancho - M.izq - M.der)) * periodos.length);
    if (i < 0 || i >= periodos.length) return;
    g.svg.querySelectorAll(".barra").forEach((b) => b.classList.toggle("tenue", +b.dataset.i !== i));
    g.valor.textContent = texto(i);
  };
  g.svg.addEventListener("pointermove", mostrar);
  g.svg.addEventListener("pointerdown", mostrar);
  g.svg.addEventListener("pointerleave", () => { g.svg.querySelectorAll(".barra").forEach((b) => b.classList.remove("tenue")); g.valor.textContent = resumen; });
  new ResizeObserver(() => { if (g.figura.clientWidth && g.figura.clientWidth !== ancho) dibujar(); }).observe(g.figura);
}

// ---------------------------------------------------------------------
// 5. Natación
// ---------------------------------------------------------------------
function pintarNado(caja, lista, u) {
  const records = an.recordsNado(lista);
  const nados = lista.filter((a) => a.deporte === "nadar").sort((a, b) => a.inicio.localeCompare(b.inicio));
  const ritmo = (t, d) => `${reloj((t / d) * 100)} /100 m`;
  caja.innerHTML = `
    ${u.css ? `<div class="css-caja"><div><span>Tu CSS (ritmo umbral)</span><b>${reloj(u.css)} /100 m</b></div>
      <p class="nota">${u.cssEstimada ? "Calculado con tus mejores 200 y 400 m de los últimos 6 meses." : "El que pusiste en Ajustes."} Es el ritmo que aguantarías unos 30 minutos; sirve para tus zonas de nado.</p></div>` : ""}
    ${records.length ? `
    <h3>Mejores tiempos</h3>
    <div class="tabla-scroll"><table class="tabla-records">
      <thead><tr><th>Distancia</th><th>Mejor</th><th>Cuándo</th><th>Este año</th></tr></thead>
      <tbody>${records.map((r) => `<tr>
        <td><b>${r.distancia} m</b></td>
        <td><a href="#entreno/${encodeURIComponent(r.mejor.id)}">${reloj(r.mejor.t)}</a><small>${ritmo(r.mejor.t, r.distancia)}</small></td>
        <td>${new Date(r.mejor.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" })}</td>
        <td>${r.mejorAnio ? (r.mejorAnio.id === r.mejor.id ? "🏆" : reloj(r.mejorAnio.t)) : "—"}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <p class="nota">Largos seguidos sin parar dentro de una sesión. "Este año" son los últimos 12 meses; 🏆 = tu récord es de ahí.</p>` : ""}
    <div class="graficas-nado"></div>`;

  const graf = caja.querySelector(".graficas-nado");
  const conSwolf = nados.filter((a) => a.swolf);
  const dia = (a) => new Date(a.inicio).getTime() / DIA;
  const fx = (v) => fechaCorta(v * DIA);
  if (conSwolf.length >= 3) {
    const ys = conSwolf.map((a) => a.swolf);
    // Media de 5 sesiones para ver la tendencia sin el ruido de cada día
    const g = graficaLinea({ xs: conSwolf.map(dia), ys: suavizar(ys, 2), titulo: "SWOLF, tendencia (menos es mejor)", resumen: `Último ${conSwolf.at(-1).swolf} · media ${Math.round(ys.reduce((s, x) => s + x, 0) / ys.length)}`,
      formatoX: fx, formatoY: (v, eje) => (eje ? Math.round(v) : `SWOLF ${Math.round(v)}`), invertir: true, area: false });
    if (g) graf.append(g);
  }
  const conRitmo = nados.filter((a) => a.velMedia && a.distancia >= 300);
  if (conRitmo.length >= 3) {
    const g = graficaLinea({ xs: conRitmo.map(dia), ys: suavizar(conRitmo.map((a) => 100 / a.velMedia), 2), titulo: "Ritmo medio, tendencia",
      resumen: `Último ${reloj(100 / conRitmo.at(-1).velMedia)} /100 m`, formatoX: fx,
      formatoY: (v, eje) => (eje ? reloj(v) : `${reloj(v)} /100 m`), invertir: true, area: false });
    if (g) graf.append(g);
  }
}
