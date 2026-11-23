// =====================================================================
// entreno/series.js — gráfica de varias series que puedes encender/apagar
// ---------------------------------------------------------------------
// La usan Forma, Salud y Natación. Cada serie es una línea, un área o
// unas barras. Debajo hay una leyenda: tocando cada nombre la escondes o
// la vuelves a mostrar (y se recuerda en este dispositivo).
//
// Dos ejes verticales: el izquierdo y, si alguna serie lo pide, el
// derecho (para mezclar cosas con unidades distintas, como la carga
// diaria y la forma física).
// =====================================================================

import { NS, marcas } from "./graficas.js";

const M = { izq: 40, der: 12, arr: 12, aba: 26 };
const CLAVE = "mi-horario:entreno-series"; // qué series has escondido en cada gráfica
const leerOcultas = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; } };
const guardarOcultas = (o) => { try { localStorage.setItem(CLAVE, JSON.stringify(o)); } catch {} };
const fechaCorta = (t) => new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

/**
 * xs: marcas de tiempo (ms), en orden
 * series: [{ id, nombre, color, valores, tipo: "linea"|"area"|"barras"|"puntos",
 *            eje: "izq"|"der", formato(v), ocultaAlEmpezar, discontinua }]
 * id: nombre de la gráfica (para recordar qué series escondiste)
 * bandas: [{ desde, hasta, clase }] franjas de fondo en el eje izquierdo
 * resumen: texto arriba a la derecha cuando no tocas la gráfica
 * invertirIzq / invertirDer: más bajo arriba (p. ej. ritmos)
 */
export function graficaSeries({ id, xs, series, alto = 200, bandas = [], resumen = "", invertirIzq = false, invertirDer = false, minIzq, minDer, alTocar }) {
  const caja = document.createElement("figure");
  caja.className = "grafica grafica-series";
  caja.innerHTML = `<figcaption><b class="grafica-valor"></b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img");
  caja.append(svg);
  const leyenda = document.createElement("div");
  leyenda.className = "leyenda-series";
  leyenda.setAttribute("role", "group");
  leyenda.setAttribute("aria-label", "Series que se muestran");
  caja.append(leyenda);
  const valor = caja.querySelector(".grafica-valor");

  const ocultasTodas = leerOcultas();
  const ocultas = new Set(ocultasTodas[id] ?? series.filter((s) => s.ocultaAlEmpezar).map((s) => s.id));
  const visibles = () => series.filter((s) => !ocultas.has(s.id) && s.valores.some((v) => v != null));

  leyenda.innerHTML = series.filter((s) => s.valores.some((v) => v != null)).map((s) => `
    <button type="button" data-serie="${s.id}" aria-pressed="${!ocultas.has(s.id)}">
      <i class="muestra ${s.tipo}${s.discontinua ? " discontinua" : ""}" style="--c:${s.color}"></i>${s.nombre}
    </button>`).join("");
  leyenda.addEventListener("click", (e) => {
    const b = e.target.closest("[data-serie]");
    if (!b) return;
    const sid = b.dataset.serie;
    if (ocultas.has(sid)) ocultas.delete(sid);
    else if (visibles().length > 1) ocultas.add(sid); // siempre dejamos al menos una
    b.setAttribute("aria-pressed", !ocultas.has(sid));
    leyenda.querySelectorAll("[data-serie]").forEach((x) => x.setAttribute("aria-pressed", !ocultas.has(x.dataset.serie)));
    ocultasTodas[id] = [...ocultas];
    guardarOcultas(ocultasTodas);
    dibujar();
  });

  let ancho = 0, ejes = null;
  const x0 = xs[0], x1 = xs.at(-1) === x0 ? x0 + 864e5 : xs.at(-1);
  const xEn = (t) => M.izq + ((t - x0) / (x1 - x0)) * (ancho - M.izq - ejes.der - 0);

  function rango(lado) {
    const vals = visibles().filter((s) => (s.eje || "izq") === lado).flatMap((s) => s.valores.filter((v) => v != null));
    if (!vals.length) return null;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const hayBarras = visibles().some((s) => (s.eje || "izq") === lado && s.tipo === "barras");
    const minimo = lado === "izq" ? minIzq : minDer;
    if (hayBarras) lo = Math.min(0, lo);
    if (minimo != null) lo = Math.min(lo, minimo);
    if (lado === "izq") for (const b of bandas) { if (b.desde >= lo - 40 && b.desde <= hi + 40) lo = Math.min(lo, b.desde); }
    const pad = (hi - lo) * 0.08 || 1;
    return { lo: hayBarras && lo === 0 ? 0 : lo - pad, hi: hi + pad };
  }

  function dibujar() {
    ancho = caja.clientWidth || 600;
    const rI = rango("izq"), rD = rango("der");
    ejes = { der: rD ? 40 : M.der };
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    svg.setAttribute("width", ancho); svg.setAttribute("height", alto);
    const zona = alto - M.arr - M.aba;
    const yDe = (r, inv) => (v) => M.arr + (inv ? (v - r.lo) / (r.hi - r.lo) : 1 - (v - r.lo) / (r.hi - r.lo)) * zona;
    const yI = rI && yDe(rI, invertirIzq), yD = rD && yDe(rD, invertirDer);
    const formatoEje = (lado) => visibles().find((s) => (s.eje || "izq") === lado)?.formatoEje ?? ((v) => v);
    let h = "";
    if (rI) for (const b of bandas) {
      const a = yI(Math.min(rI.hi, Math.max(rI.lo, b.hasta))), z = yI(Math.min(rI.hi, Math.max(rI.lo, b.desde)));
      h += `<rect class="banda ${b.clase}" x="${M.izq}" width="${ancho - M.izq - ejes.der}" y="${Math.min(a, z)}" height="${Math.abs(z - a)}"/>`;
    }
    if (rI) for (const v of marcas(rI.lo, rI.hi, 4)) {
      h += `<line class="rejilla${v === 0 ? " cero" : ""}" x1="${M.izq}" x2="${ancho - ejes.der}" y1="${yI(v)}" y2="${yI(v)}"/>`;
      h += `<text class="eje" x="${M.izq - 6}" y="${yI(v) + 4}" text-anchor="end">${formatoEje("izq")(v)}</text>`;
    }
    if (rD) for (const v of marcas(rD.lo, rD.hi, 4)) {
      h += `<text class="eje eje-der" x="${ancho - ejes.der + 6}" y="${yD(v) + 4}">${formatoEje("der")(v)}</text>`;
    }
    const cuantas = Math.max(2, Math.floor(ancho / 90));
    for (let k = 0; k < cuantas; k++) {
      const t = x0 + (k / (cuantas - 1)) * (x1 - x0);
      h += `<text class="eje" x="${xEn(t)}" y="${alto - 7}" text-anchor="${k === 0 ? "start" : k === cuantas - 1 ? "end" : "middle"}">${fechaCorta(t)}</text>`;
    }
    // Barras primero (al fondo), luego áreas, líneas y puntos
    const orden = { barras: 0, area: 1, linea: 2, puntos: 3 };
    const ancho1 = Math.max(1.5, (ancho - M.izq - ejes.der) / Math.max(1, xs.length) - 1);
    for (const s of [...visibles()].sort((a, b) => orden[a.tipo] - orden[b.tipo])) {
      const y = (s.eje || "izq") === "der" ? yD : yI;
      if (!y) continue;
      if (s.tipo === "barras") {
        const base = y(Math.max(s.eje === "der" ? rD.lo : rI.lo, 0));
        s.valores.forEach((v, i) => {
          if (v == null || v === 0) return;
          const yy = y(v), color = typeof s.color === "function" ? s.color(v) : s.color;
          h += `<rect class="barra-serie" x="${xEn(xs[i]) - ancho1 / 2}" y="${Math.min(yy, base)}" width="${ancho1}" height="${Math.abs(base - yy)}" style="fill:${color}"/>`;
        });
        continue;
      }
      if (s.tipo === "puntos") {
        s.valores.forEach((v, i) => { if (v != null) h += `<circle class="punto-serie" cx="${xEn(xs[i])}" cy="${y(v)}" r="2.6" style="fill:${s.color}"/>`; });
        continue;
      }
      let d = "", dentro = false;
      s.valores.forEach((v, i) => {
        if (v == null) { if (!s.unir) dentro = false; return; }
        d += `${dentro ? "L" : "M"}${xEn(xs[i]).toFixed(1)},${y(v).toFixed(1)}`;
        dentro = true;
      });
      if (s.tipo === "area") {
        const base = y(Math.max((s.eje === "der" ? rD : rI).lo, 0)).toFixed(1);
        h += d.split("M").filter(Boolean).map((p) => {
          const pts = p.split("L");
          const xa = pts[0].split(",")[0], xb = pts.at(-1).split(",")[0];
          return `<path class="grafica-area" style="fill:${s.color}" d="M${p}L${xb},${base}L${xa},${base}Z"/>`;
        }).join("");
      }
      h += `<path class="grafica-linea${s.discontinua ? " discontinua" : ""}" style="stroke:${s.color};stroke-width:${s.grosor || 2}" d="${d}"/>`;
    }
    h += `<g class="cursor" display="none"><line y1="${M.arr}" y2="${alto - M.aba}"/></g>`;
    svg.innerHTML = h;
    svg.setAttribute("aria-label", `${visibles().map((s) => s.nombre).join(", ")}. ${resumen}`);
    valor.textContent = resumen;
  }

  // Cursor: el punto más cercano al dedo
  function indice(e) {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * ancho;
    const t = x0 + ((px - M.izq) / (ancho - M.izq - ejes.der)) * (x1 - x0);
    let lo = 0, hi = xs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < t) lo = mid + 1; else hi = mid; }
    if (lo > 0 && Math.abs(xs[lo - 1] - t) < Math.abs(xs[lo] - t)) lo--;
    return lo;
  }
  function mover(e) {
    const i = indice(e);
    const c = svg.querySelector(".cursor");
    c.removeAttribute("display");
    const x = xEn(xs[i]);
    c.querySelector("line").setAttribute("x1", x); c.querySelector("line").setAttribute("x2", x);
    const partes = visibles().filter((s) => s.valores[i] != null).map((s) => `${s.nombre.toLowerCase()} ${s.formato ? s.formato(s.valores[i]) : Math.round(s.valores[i])}`);
    valor.textContent = `${fechaCorta(xs[i])}${partes.length ? " · " + partes.join(" · ") : " · sin datos"}`;
    caja.classList.add("activa");
    alTocar?.(i);
  }
  svg.addEventListener("pointermove", mover);
  svg.addEventListener("pointerdown", mover);
  svg.addEventListener("pointerleave", () => {
    svg.querySelector(".cursor")?.setAttribute("display", "none");
    valor.textContent = resumen;
    caja.classList.remove("activa");
  });
  new ResizeObserver(() => { if (caja.clientWidth && caja.clientWidth !== ancho) dibujar(); }).observe(caja);
  return caja;
}

// Mini gráfica sin ejes para las tarjetas (una línea suave)
export function sparkline(valores, color = "var(--forma-ctl)") {
  const v = valores.filter((x) => x != null);
  if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), W = 100, H = 28;
  const pts = valores.map((x, i) => (x == null ? null : `${((i / (valores.length - 1)) * W).toFixed(1)},${(H - 2 - ((x - lo) / (hi - lo || 1)) * (H - 4)).toFixed(1)}`)).filter(Boolean);
  return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(" ")}" style="stroke:${color}"/></svg>`;
}
