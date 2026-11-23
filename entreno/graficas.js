// =====================================================================
// entreno/graficas.js — las gráficas y el mapa
// ---------------------------------------------------------------------
// Las gráficas se dibujan a mano con SVG (dibujos hechos de líneas y
// rectángulos que el navegador sabe pintar). Así no dependemos de
// ninguna librería y se adaptan solas al modo oscuro.
//
// Al pasar el dedo (o el ratón) por una gráfica aparece una línea
// vertical con el valor. Todas las gráficas de una actividad se mueven a
// la vez y el punto del mapa también, para que veas qué pasaba en cada
// momento.
// =====================================================================

const NS = "http://www.w3.org/2000/svg";
const ALTO = 150;
const MARGEN = { izq: 44, der: 10, arr: 10, aba: 24 };

// Media móvil: suaviza los picos (el GPS da saltos de ritmo)
export function suavizar(ys, ventana = 5) {
  const salida = new Array(ys.length);
  for (let i = 0; i < ys.length; i++) {
    let suma = 0, n = 0;
    for (let j = Math.max(0, i - ventana); j <= Math.min(ys.length - 1, i + ventana); j++)
      if (ys[j] != null) { suma += ys[j]; n++; }
    salida[i] = n ? suma / n : null;
  }
  return salida;
}

// Unos valores "redondos" para las marcas del eje (0, 5, 10...)
function marcas(min, max, cuantas = 4) {
  const rango = max - min || 1;
  const paso0 = rango / cuantas;
  const pot = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= paso0);
  const salida = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) salida.push(+v.toFixed(6));
  return salida;
}

// Un "grupo" coordina varias gráficas y el mapa: al mover una, se mueven todas
export function crearGrupo() {
  const oyentes = new Set();
  return {
    unir: (f) => oyentes.add(f),
    mover: (i) => oyentes.forEach((f) => f(i)),
  };
}

/**
 * Gráfica de línea.
 *   xs, ys       → los datos
 *   titulo       → "Ritmo", "Pulso"...
 *   formatoY(v)  → cómo escribir un valor ("5:12 /km", "152 ppm")
 *   formatoX(v)  → cómo escribir el eje horizontal ("3 km", "12:00")
 *   invertir     → true para el ritmo: más rápido (menos min/km) va arriba
 *   area         → rellenar por debajo de la línea
 */
export function graficaLinea({ xs, ys, titulo, resumen = "", formatoY, formatoX, invertir = false, area = true, color = "var(--serie)", grupo, min, max }) {
  const caja = document.createElement("figure");
  caja.className = "grafica";
  caja.innerHTML = `<figcaption><span>${titulo}</span><b class="grafica-valor">${resumen}</b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${titulo}. ${resumen}`);
  caja.append(svg);

  const validos = ys.filter((y) => y != null);
  if (!validos.length) return null;
  const yMin = min ?? Math.min(...validos);
  const yMax = max ?? Math.max(...validos);
  const pad = (yMax - yMin) * 0.08 || 1;
  const y0 = Math.max(min ?? -Infinity, yMin - pad), y1 = yMax + pad;
  const xMin = xs[0], xMax = xs[xs.length - 1] || 1;

  let ancho = 0;
  const xEn = (x) => MARGEN.izq + ((x - xMin) / (xMax - xMin || 1)) * (ancho - MARGEN.izq - MARGEN.der);
  const yEn = (y) => {
    const f = (y - y0) / (y1 - y0);
    return MARGEN.arr + (invertir ? f : 1 - f) * (ALTO - MARGEN.arr - MARGEN.aba);
  };

  function dibujar() {
    ancho = caja.clientWidth || 600;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${ALTO}`);
    svg.setAttribute("width", ancho);
    svg.setAttribute("height", ALTO);
    let html = "";
    // Rejilla y eje vertical
    for (const v of marcas(y0, y1)) {
      const y = yEn(v);
      if (y < MARGEN.arr - 1 || y > ALTO - MARGEN.aba + 1) continue;
      html += `<line class="rejilla" x1="${MARGEN.izq}" x2="${ancho - MARGEN.der}" y1="${y}" y2="${y}"/>`;
      html += `<text class="eje" x="${MARGEN.izq - 6}" y="${y + 4}" text-anchor="end">${formatoY(v, true)}</text>`;
    }
    // Eje horizontal
    for (const v of marcas(xMin, xMax, Math.max(2, Math.floor(ancho / 75)))) {
      html += `<text class="eje" x="${xEn(v)}" y="${ALTO - 6}" text-anchor="middle">${formatoX(v)}</text>`;
    }
    // La línea (los huecos sin dato la cortan)
    let d = "", dentro = false, primero = null, ultimo = null;
    const tramos = [];
    xs.forEach((x, i) => {
      const y = ys[i];
      if (y == null) { if (dentro) tramos.push([primero, ultimo]); dentro = false; return; }
      const px = xEn(x).toFixed(1), py = yEn(y).toFixed(1);
      d += `${dentro ? "L" : "M"}${px},${py}`;
      if (!dentro) primero = px;
      ultimo = px; dentro = true;
    });
    if (dentro) tramos.push([primero, ultimo]);
    if (area && !invertir) {
      const base = ALTO - MARGEN.aba;
      // Rellenamos cada tramo hasta abajo
      const partes = d.split("M").filter(Boolean);
      html += partes.map((p, k) => `<path class="grafica-area" style="fill:${color}" d="M${p}L${tramos[k][1]},${base}L${tramos[k][0]},${base}Z"/>`).join("");
    }
    html += `<path class="grafica-linea" style="stroke:${color}" d="${d}"/>`;
    html += `<g class="cursor" display="none"><line y1="${MARGEN.arr}" y2="${ALTO - MARGEN.aba}"/><circle r="4" style="fill:${color}"/></g>`;
    svg.innerHTML = html;
  }

  // El cursor: línea vertical + punto + valor arriba
  const valor = caja.querySelector(".grafica-valor");
  function mostrar(i) {
    const g = svg.querySelector(".cursor");
    if (i == null || ys[i] == null) { g?.setAttribute("display", "none"); valor.textContent = resumen; caja.classList.remove("activa"); return; }
    g.removeAttribute("display");
    const x = xEn(xs[i]), y = yEn(ys[i]);
    g.querySelector("line").setAttribute("x1", x);
    g.querySelector("line").setAttribute("x2", x);
    g.querySelector("circle").setAttribute("cx", x);
    g.querySelector("circle").setAttribute("cy", y);
    valor.textContent = `${formatoY(ys[i])} · ${formatoX(xs[i])}`;
    caja.classList.add("activa");
  }
  grupo?.unir(mostrar);

  // Del dedo/ratón al punto más cercano
  function indiceEn(evento) {
    const r = svg.getBoundingClientRect();
    const px = ((evento.clientX - r.left) / r.width) * ancho;
    const x = xMin + ((px - MARGEN.izq) / (ancho - MARGEN.izq - MARGEN.der)) * (xMax - xMin);
    let lo = 0, hi = xs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }
  svg.addEventListener("pointermove", (e) => (grupo ? grupo.mover(indiceEn(e)) : mostrar(indiceEn(e))));
  svg.addEventListener("pointerdown", (e) => (grupo ? grupo.mover(indiceEn(e)) : mostrar(indiceEn(e))));
  svg.addEventListener("pointerleave", () => (grupo ? grupo.mover(null) : mostrar(null)));

  new ResizeObserver(() => { if (caja.clientWidth && caja.clientWidth !== ancho) dibujar(); }).observe(caja);
  return caja;
}

/**
 * Barras verticales (p. ej. un largo de piscina por barra).
 *   barras: [{ valor, color, etiqueta, hueco }]  — hueco = descanso
 */
export function graficaBarras({ barras, titulo, resumen = "", formatoY }) {
  const caja = document.createElement("figure");
  caja.className = "grafica";
  caja.innerHTML = `<figcaption><span>${titulo}</span><b class="grafica-valor">${resumen}</b></figcaption>`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${titulo}. ${resumen}`);
  caja.append(svg);
  const valores = barras.filter((b) => !b.hueco).map((b) => b.valor);
  if (!valores.length) return null;
  const yMax = Math.max(...valores) * 1.1;
  const valor = caja.querySelector(".grafica-valor");
  let ancho = 0;

  function dibujar() {
    ancho = caja.clientWidth || 600;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${ALTO}`);
    svg.setAttribute("width", ancho);
    svg.setAttribute("height", ALTO);
    const zona = ancho - MARGEN.izq - MARGEN.der;
    const alto = ALTO - MARGEN.arr - MARGEN.aba;
    const w = zona / barras.length;
    let html = "";
    for (const v of marcas(0, yMax)) {
      const y = MARGEN.arr + (1 - v / yMax) * alto;
      html += `<line class="rejilla" x1="${MARGEN.izq}" x2="${ancho - MARGEN.der}" y1="${y}" y2="${y}"/>`;
      html += `<text class="eje" x="${MARGEN.izq - 6}" y="${y + 4}" text-anchor="end">${formatoY(v, true)}</text>`;
    }
    barras.forEach((b, i) => {
      if (b.hueco) return;
      const h = (b.valor / yMax) * alto;
      const x = MARGEN.izq + i * w + Math.min(1, w * 0.1);
      const bw = Math.max(1, w - Math.min(2, w * 0.2));
      html += `<rect class="barra" data-i="${i}" x="${x}" y="${MARGEN.arr + alto - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 2)}" style="fill:${b.color}"/>`;
    });
    html += `<text class="eje" x="${MARGEN.izq}" y="${ALTO - 6}">Inicio</text><text class="eje" x="${ancho - MARGEN.der}" y="${ALTO - 6}" text-anchor="end">Final</text>`;
    svg.innerHTML = html;
  }
  function mostrar(i) {
    svg.querySelectorAll(".barra").forEach((r) => r.classList.toggle("tenue", i != null && +r.dataset.i !== i));
    valor.textContent = i == null || barras[i]?.hueco ? resumen : barras[i].etiqueta;
  }
  svg.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * ancho;
    const i = Math.floor(((px - MARGEN.izq) / (ancho - MARGEN.izq - MARGEN.der)) * barras.length);
    mostrar(i >= 0 && i < barras.length ? i : null);
  });
  svg.addEventListener("pointerleave", () => mostrar(null));
  new ResizeObserver(() => { if (caja.clientWidth && caja.clientWidth !== ancho) dibujar(); }).observe(caja);
  return caja;
}

// ----- El mapa (Leaflet, una librería libre para mapas) -----
let leaflet = null;
function cargarLeaflet() {
  leaflet ??= new Promise((ok, mal) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "entreno/vendor/leaflet/leaflet.css";
    document.head.append(css);
    const s = document.createElement("script");
    s.src = "entreno/vendor/leaflet/leaflet.js";
    s.onload = () => ok(window.L);
    s.onerror = () => { leaflet = null; mal(new Error("No se pudo cargar el mapa")); };
    document.head.append(s);
  });
  return leaflet;
}

export async function mapa(caja, lat, lon, grupo) {
  const L = await cargarLeaflet();
  const ruta = lat.map((la, i) => (la != null && lon[i] != null ? [la, lon[i]] : null));
  const linea = ruta.filter(Boolean);
  if (linea.length < 2) { caja.remove(); return; }
  const oscuro = getComputedStyle(document.documentElement).colorScheme === "dark";
  const m = L.map(caja, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${oscuro ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`, {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(m);
  L.control.zoom({ position: "topright" }).addTo(m);
  const color = getComputedStyle(caja).getPropertyValue("--serie").trim() || "#eb6834";
  const trazo = L.polyline(linea, { color, weight: 4, opacity: 0.95 }).addTo(m);
  L.circleMarker(linea[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#0ca30c", fillOpacity: 1 }).addTo(m).bindTooltip("Salida");
  L.circleMarker(linea.at(-1), { radius: 6, color: "#fff", weight: 2, fillColor: "#d03b3b", fillOpacity: 1 }).addTo(m).bindTooltip("Llegada");
  m.fitBounds(trazo.getBounds(), { padding: [20, 20] });
  const punto = L.circleMarker(linea[0], { radius: 7, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 });
  grupo?.unir((i) => {
    if (i == null || !ruta[i]) { punto.remove(); return; }
    punto.setLatLng(ruta[i]).addTo(m);
  });
  new ResizeObserver(() => m.invalidateSize()).observe(caja);
}
