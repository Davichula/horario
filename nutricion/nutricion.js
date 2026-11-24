// =====================================================================
// nutricion/nutricion.js — la sección "Nutrición"
// ---------------------------------------------------------------------
// Tres subpestañas:
//   Hoy       → anillo de calorías, macros y las comidas del día (con el buscador)
//   Progreso  → tu peso (media de 7 días) y su ritmo
//   Objetivo  → tus datos y cómo se calcula tu objetivo de calorías y macros
// secciones.js llama a iniciar() la primera vez que abres la pestaña.
// =====================================================================
import { ALIMENTOS } from "./alimentos.js";
import * as D from "./datos.js";
import * as almacen from "../entreno/almacen.js";
import { anillo } from "../entreno/graficas.js";
import * as off from "./openfoodfacts.js";

const COMIDAS = ["Desayuno", "Comida", "Merienda", "Cena"];
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const n0 = (x) => Math.round(x).toLocaleString("es-ES");
const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
const quitarTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let caja = null;
const est = { sub: "hoy", fecha: D.hoy(), anadiendo: null, busca: "", elegido: null, creando: false, escaner: false, escMsg: "", offRes: null, offMsg: "", codigoManual: "" };

export function iniciar(elemento) {
  caja = elemento;
  // Reutilizamos el aspecto de las tarjetas y pestañas de Entreno (si aún no se ha cargado)
  if (!document.querySelector('link[href$="entreno/entreno.css"]')) {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "entreno/entreno.css";
    document.head.append(css);
  }
  caja.addEventListener("click", alTocar);
  caja.addEventListener("input", alEscribir);
  caja.addEventListener("submit", alEnviar);
  window.addEventListener("storage", (e) => { if (e.key?.startsWith("mi-horario:nutricion") && !est.anadiendo) pintar(); });
  return { mostrar: () => { est.fecha = est.fecha || D.hoy(); pintar(); } };
}

// ----- Datos auxiliares -----
// Calorías que gastaste entrenando ese día (según tus actividades de Garmin)
function kcalEntreno(fecha) {
  let t = 0; const lista = [];
  for (const a of almacen.listar()) {
    if (!a.calorias || D.aTexto(new Date(a.inicio)) !== fecha) continue;
    t += a.calorias; lista.push(a);
  }
  return { total: t, lista };
}
const todosAlimentos = () => [...D.propios(), ...ALIMENTOS];
// Los últimos alimentos que has comido (para "Recientes")
function recientes() {
  const vistos = new Set(), r = [];
  const d = D.diario();
  for (const f of Object.keys(d).sort().reverse()) for (const e of [...d[f]].reverse()) {
    if (vistos.has(e.nombre) || !e.base) continue;
    vistos.add(e.nombre); r.push({ ...e.base, nombre: e.nombre, ultimoG: e.cant });
    if (r.length >= 8) return r;
  }
  return r;
}

// =====================================================================
// Pintar
// =====================================================================
function pintar() {
  if (est.anadiendo) return pintarAnadir();
  const subs = [["hoy", "Hoy"], ["progreso", "Progreso"], ["objetivo", "Objetivo"]];
  caja.innerHTML = `
    <header class="cabecera"><h1>Nutrición</h1></header>
    <nav class="subpestanas nutri-sub" aria-label="Subapartados">${subs.map(([v, t]) =>
      `<button type="button" data-acc="sub" data-v="${v}" class="${est.sub === v ? "activo" : ""}" aria-pressed="${est.sub === v}">${t}</button>`).join("")}</nav>
    <div class="entreno-cuerpo">${est.sub === "hoy" ? htmlHoy() : est.sub === "progreso" ? htmlProgreso() : htmlObjetivo()}</div>`;
}

// ----- HOY -----
function htmlHoy() {
  const p = D.perfil();
  const entradas = D.dia(est.fecha);
  const t = D.totales(entradas);
  const en = kcalEntreno(est.fecha);
  const obj = D.objetivoDia(p, en.total);
  const esHoy = est.fecha === D.hoy();
  const etiqueta = esHoy ? "Hoy" : new Date(est.fecha + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const nav = `<div class="nutri-fecha">
    <button type="button" data-acc="dia" data-v="-1" aria-label="Día anterior">‹</button><b>${etiqueta}</b>
    <button type="button" data-acc="dia" data-v="1" aria-label="Día siguiente" ${esHoy ? "disabled" : ""}>›</button></div>`;

  let resumen;
  if (!obj) {
    resumen = `<section class="tarjeta-entreno"><h2>Tu objetivo</h2>
      <p class="nota">Todavía no tengo tus datos. Rellénalos (1 minuto) y calculo tus calorías y macros.</p>
      <button type="button" class="boton-principal" data-acc="sub" data-v="objetivo">Calcular mi objetivo</button>
      <p class="nota">Mientras tanto ya puedes anotar comidas.</p>
      <div class="cifras nutri-cifras"><div><span>Comido</span><b>${n0(t.kcal)} <small>kcal</small></b></div><div><span>Proteína</span><b>${n0(t.p)} <small>g</small></b></div><div><span>Carbos</span><b>${n0(t.c)} <small>g</small></b></div></div></section>`;
  } else {
    const quedan = obj.kcal - t.kcal;
    resumen = `<section class="tarjeta-entreno"><div class="nutri-resumen">
      ${anillo({ valor: t.kcal, max: obj.kcal, color: quedan < 0 ? "var(--c-pulso)" : "var(--acento)", centro: n0(Math.abs(quedan)), sub: quedan < 0 ? "kcal de más" : "kcal quedan", tam: 150, grosor: 14 })}
      <dl class="nutri-datos">
        <div><dt>Objetivo</dt><dd>${n0(obj.kcal)}</dd></div>
        <div><dt>Comido</dt><dd>${n0(t.kcal)}</dd></div>
        ${obj.extra ? `<div class="extra"><dt>+ Entreno</dt><dd>${n0(obj.extra)}</dd></div>` : ""}
      </dl></div>
      ${obj.extra ? `<p class="nota">${en.lista.map((a) => esc(a.nombre)).join(" + ")}: ${n0(en.total)} kcal según Garmin (cuento el ${p.pctEntreno} %).</p>` : ""}
      ${macro("Proteína", t.p, obj.prot, "var(--nutri-prot)")}
      ${macro("Carbohidratos", t.c, obj.carbos, "var(--nutri-carb)")}
      ${macro("Grasas", t.g, obj.grasa, "var(--nutri-grasa)")}
      <div class="nutri-chips"><span>Azúcar ${n0(t.az)} g</span><span>Fibra ${n0(t.fi)} / ${n0(14 * obj.kcal / 1000)} g</span></div></section>`;
  }

  const comidas = COMIDAS.map((c) => {
    const l = entradas.filter((e) => e.comida === c);
    const k = l.reduce((s, e) => s + e.kcal, 0);
    return `<div class="nutri-comida"><div class="nutri-comida-cab"><div><b>${c}</b>${l.length ? `<span> · ${n0(k)} kcal</span>` : ""}</div>
      <button type="button" class="nutri-mas" data-acc="anadir" data-v="${c}" aria-label="Añadir a ${c}">+</button></div>
      ${l.map((e) => `<div class="nutri-item"><span>${esc(e.nombre)} <small>${n0(e.cant ?? 0)} g</small></span><span>${n0(e.kcal)}<button type="button" class="nutri-quitar" data-acc="quitar" data-v="${e.id}" aria-label="Quitar ${esc(e.nombre)}">✕</button></span></div>`).join("")}</div>`;
  }).join("");
  const ayer = D.dia(D.sumarDias(est.fecha, -1)).length;
  return `${nav}${resumen}<section class="tarjeta-entreno nutri-comidas">${comidas}
    ${ayer && !entradas.length ? `<button type="button" class="boton-secundario" data-acc="copiar">Copiar las comidas de ayer</button>` : ""}</section>`;
}
function macro(nombre, v, obj, color) {
  const pct = Math.min(100, obj ? (v / obj) * 100 : 0);
  return `<div class="nutri-macro"><div><span>${nombre}</span><span><b>${n0(v)}</b> / ${n0(obj)} g</span></div>
    <div class="nutri-barra"><i style="width:${pct}%;background:${color}"></i></div></div>`;
}

// ----- AÑADIR (buscador) -----
function pintarAnadir() {
  const c = est.anadiendo;
  if (est.creando) {
    caja.innerHTML = `<header class="cabecera"><h1>Nuevo alimento</h1></header><div class="entreno-cuerpo">
      <form class="tarjeta-entreno nutri-form" data-form="crear">
        <label>Nombre<input name="nombre" required value="${esc(est.busca)}" autocomplete="off"></label>
        <p class="nota">Valores por 100 g (los pone la etiqueta del envase).</p>
        <div class="nutri-campos">
          <label>Calorías (kcal)<input name="kcal" type="number" inputmode="decimal" step="any" required></label>
          <label>Proteína (g)<input name="p" type="number" inputmode="decimal" step="any" value="0"></label>
          <label>Carbohidratos (g)<input name="c" type="number" inputmode="decimal" step="any" value="0"></label>
          <label>Grasas (g)<input name="g" type="number" inputmode="decimal" step="any" value="0"></label>
          <label>Azúcares (g)<input name="az" type="number" inputmode="decimal" step="any" value="0"></label>
          <label>Fibra (g)<input name="fi" type="number" inputmode="decimal" step="any" value="0"></label>
        </div>
        <button class="boton-principal" type="submit">Guardar alimento</button>
        <button type="button" class="boton-secundario" data-acc="cancelar-crear">Cancelar</button></form></div>`;
    return;
  }
  if (est.elegido) {
    const a = est.elegido, g = est.gramos ?? a.racion ?? 100, t = D.porciones(a, g);
    caja.innerHTML = `<header class="cabecera"><h1>${esc(c)}</h1></header><div class="entreno-cuerpo">
      <section class="tarjeta-entreno nutri-form"><h2>${esc(a.nombre)}${a.origen === "off" ? ' <em class="etq etq-off">Open Food Facts</em>' : ""}</h2>
        ${a.origen === "off" ? '<p class="nota">Datos aportados por usuarios: si no cuadran con la etiqueta, usa «Crear alimento nuevo» con los de tu envase.</p>' : ""}
        <label>Cantidad (gramos o ml)<input data-campo="gramos" type="number" inputmode="decimal" min="1" step="any" value="${g}"></label>
        <div class="chips chips-mini">${[[0.5, "½"], [1, "1"], [1.5, "1½"], [2, "2"]].map(([m, tx]) => a.racion ? `<button type="button" data-acc="racion" data-v="${m}">× ${tx}</button>` : "").join("")}</div>
        ${a.racion ? `<p class="nota">1 ${esc(a.unidad || "ración")} ≈ ${a.racion} g</p>` : ""}
        <div class="cifras nutri-cifras cuatro" id="nutri-prev">${previa(t)}</div>
        <button class="boton-principal" type="button" data-acc="confirmar">Añadir a ${esc(c)}</button>
        <button type="button" class="boton-secundario" data-acc="volver-lista">Volver</button></section></div>`;
    return;
  }
  const q = quitarTildes(est.busca.trim());
  const lista = q ? todosAlimentos().filter((a) => quitarTildes(a.nombre).includes(q)).slice(0, 30)
    : [...recientes(), ...D.propios()].slice(0, 12);
  const fila = (a) => `<button type="button" class="nutri-res" data-acc="elegir" data-v="${esc(a.id || "")}" data-n="${esc(a.nombre)}">
        <span>${esc(a.nombre)}${a.origen === "propio" ? ' <em class="etq">tuyo</em>' : ""}${a.origen === "off" ? ' <em class="etq etq-off">Open Food Facts</em>' : ""}<small>por 100 g · P ${n1(a.p)} · C ${n1(a.c)} · G ${n1(a.g)}</small></span><b>${n0(a.kcal)}</b></button>`;
  const icoCamara = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8"/></svg>`;
  caja.innerHTML = `<header class="cabecera"><h1>${esc(c)}</h1></header><div class="entreno-cuerpo">
    <div class="nutri-buscar-fila"><input class="nutri-buscar" data-campo="busca" type="search" placeholder="Buscar alimento…" value="${esc(est.busca)}" autocomplete="off" enterkeyhint="search">
      <button type="button" class="nutri-camara" data-acc="${est.escaner ? "escaner-cerrar" : "escaner"}" aria-label="Escanear código de barras">${icoCamara}</button></div>
    ${est.escaner ? `<section class="tarjeta-entreno nutri-escaner"><h2>Escanear código de barras</h2>
        <div class="nutri-visor"><video id="nutri-video" playsinline muted></video><div class="nutri-marco"></div></div>
        <p class="nota" id="nutri-esc-msg">${esc(est.escMsg)}</p>
        <div class="nutri-buscar-fila"><input class="nutri-buscar" data-campo="codigo" type="text" inputmode="numeric" placeholder="O escribe el código" value="${esc(est.codigoManual)}" autocomplete="off">
          <button type="button" class="boton-principal nutri-ir" data-acc="codigo-buscar">Buscar</button></div></section>` : ""}
    <section class="tarjeta-entreno nutri-lista">
      <h2>${q ? "Resultados" : "Recientes y tuyos"}</h2>
      ${lista.map(fila).join("") || `<p class="nota">${q ? "No lo encuentro en tu lista." : "Aún no has anotado nada. Busca un alimento arriba o escanea un código."}</p>`}
    </section>
    ${est.busca.trim().length >= 3 ? `<button type="button" class="boton-secundario" data-acc="off-buscar">Buscar «${esc(est.busca.trim())}» en productos de supermercado</button>` : ""}
    ${est.offMsg ? `<p class="nota">${esc(est.offMsg)}</p>` : ""}
    ${est.offRes?.length ? `<section class="tarjeta-entreno nutri-lista"><h2>Productos (Open Food Facts)</h2>${est.offRes.map(fila).join("")}</section>` : ""}
    <button type="button" class="boton-secundario" data-acc="crear">+ Crear alimento nuevo</button>
    <button type="button" class="boton-secundario" data-acc="cerrar">Cerrar</button></div>`;
  const inp = caja.querySelector('.nutri-buscar[data-campo="busca"]');
  if (inp && !est.escaner && document.activeElement !== inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  if (est.escaner && !est.sinCamara) arrancarCamara();
}
const previa = (t) => `<div><span>kcal</span><b>${n0(t.kcal)}</b></div><div><span>Prot.</span><b>${n1(t.p)} <small>g</small></b></div><div><span>Carbos</span><b>${n1(t.c)} <small>g</small></b></div><div><span>Grasa</span><b>${n1(t.g)} <small>g</small></b></div>`;

// ----- PROGRESO -----
function htmlAtajo() {
  const url = est.atajoUrl;
  return `<section class="tarjeta-entreno nutri-atajo"><h2>Báscula Renpho (automático)</h2>
    <p class="nota">Cada vez que te peses, el iPhone puede mandar tu peso y % de grasa aquí sin que hagas nada. Se hace con un Atajo (una sola vez).</p>
    ${url ? `<div class="nutri-url">${esc(url)}</div>
      <button type="button" class="boton-principal" data-acc="atajo-copiar">Copiar mi enlace</button>
      <details class="nutri-como" open><summary>Pasos en la app Atajos</summary>
        <ol>
          <li>Abre <b>Atajos</b> → pestaña <b>Automatización</b> → <b>+</b> → <b>App</b> → elige <b>Renpho Health</b> → marca <b>Está cerrada</b> → <b>Ejecutar inmediatamente</b>.</li>
          <li>Añade la acción <b>Buscar muestras de Salud</b>: Tipo <b>Peso</b>, ordenar por fecha de inicio (más reciente primero), límite 1.</li>
          <li>Añade otra igual con <b>Porcentaje de grasa corporal</b> (para el % de grasa).</li>
          <li>Añade <b>Obtener contenido de URL</b> y pega mi enlace. Detrás escribe <code>&amp;kg=</code> y toca la variable del peso, y luego <code>&amp;grasa=</code> con la variable de la grasa.</li>
          <li>Guarda. Pésate, cierra la app de Renpho y el dato aparece aquí.</li>
        </ol>
        <p class="nota">Si algo no te cuadra en tu pantalla, mándame una captura y lo ajustamos. Este enlace es secreto: no lo compartas.</p></details>`
    : `<button type="button" class="boton-principal" data-acc="atajo-preparar">Preparar mi enlace</button>${est.atajoError ? `<p class="nota" style="color:var(--c-pulso)">${esc(est.atajoError)}</p>` : ""}`}</section>`;
}
function htmlProgreso() {
  const pesos = D.pesos();
  const hoy = D.hoy();
  const dias = Object.keys(pesos).sort();
  const media = D.mediaPeso(pesos, hoy);
  const mediaAnt = D.mediaPeso(pesos, D.sumarDias(hoy, -7));
  const ritmo = media && mediaAnt ? media - mediaAnt : null;
  const ult = dias.length ? pesos[dias[dias.length - 1]] : null;
  const form = `<form class="tarjeta-entreno nutri-form" data-form="peso"><h2>Anotar peso</h2>
    <div class="nutri-campos">
      <label>Día<input name="fecha" type="date" value="${hoy}" max="${hoy}" required></label>
      <label>Peso (kg)<input name="kg" type="number" inputmode="decimal" step="any" min="30" max="250" required placeholder="${ult?.kg ?? ""}"></label>
      <label>% grasa (opcional)<input name="grasa" type="number" inputmode="decimal" step="any" min="2" max="60" placeholder="${ult?.grasa ?? ""}"></label>
    </div><button class="boton-principal" type="submit">Guardar</button></form>`;
  if (!dias.length) return `<section class="tarjeta-entreno"><h2>Tu peso</h2><p class="nota">Pésate por la mañana en ayunas y anótalo aquí. Con unas semanas de datos calculo tu gasto real y ajusto tu objetivo.</p></section>${form}${htmlAtajo()}`;
  return `<section class="tarjeta-entreno"><h2>Peso · media de 7 días</h2>
    <div class="nutri-peso-cab"><div><b class="nutri-grande">${media ? n1(media) : "—"}</b> <span>kg</span></div>
    <div class="nutri-ritmo"><span>Ritmo semanal</span><b>${ritmo == null ? "—" : (ritmo > 0 ? "+" : "") + n1(ritmo) + " kg"}</b></div></div>
    ${graficaPeso(pesos)}
    ${ult?.grasa ? `<p class="nota">Última grasa corporal: ${ult.grasa} %</p>` : ""}</section>${form}
    <section class="tarjeta-entreno"><h2>Últimas medidas</h2>${dias.slice(-8).reverse().map((f) => `<div class="nutri-item"><span>${new Date(f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</span><span>${pesos[f].kg ? n1(pesos[f].kg) + " kg" : ""}${pesos[f].grasa ? " · " + n1(pesos[f].grasa) + " % grasa" : ""}${pesos[f].magra ? " · " + n1(pesos[f].magra) + " kg magra" : ""}<button type="button" class="nutri-quitar" data-acc="borrar-peso" data-v="${f}" aria-label="Borrar medida">✕</button></span></div>`).join("")}</section>${htmlAtajo()}`;
}
// Puntos de cada día + línea de la media de 7 días (últimas 8 semanas)
function graficaPeso(pesos) {
  const hoy = D.hoy();
  // La gráfica empieza en tu primera medida (máximo 8 semanas atrás)
  const primera = Object.keys(pesos).filter((f) => f >= D.sumarDias(hoy, -56)).sort()[0] || hoy;
  const N = Math.max(7, Math.round((new Date(hoy) - new Date(primera)) / 864e5));
  const pts = [], med = [];
  for (let i = N; i >= 0; i--) {
    const f = D.sumarDias(hoy, -i);
    if (pesos[f]?.kg) pts.push([N - i, pesos[f].kg]);
    const m = D.mediaPeso(pesos, f);
    if (m && pesos[f]?.kg) med.push([N - i, m]);
  }
  if (pts.length < 2) return "";
  const vals = pts.map((p) => p[1]);
  const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const W = 340, H = 130, x = (i) => 8 + (i / N) * (W - 16), y = (v) => H - 10 - ((v - lo) / (hi - lo)) * (H - 20);
  return `<svg class="nutri-grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del peso">
    <text x="4" y="12" class="nutri-eje">${n1(hi)}</text><text x="4" y="${H - 2}" class="nutri-eje">${n1(lo)}</text>
    ${pts.map(([i, v]) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="var(--suave)"/>`).join("")}
    ${med.length > 1 ? `<polyline points="${med.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--acento)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ""}</svg>`;
}

// ----- OBJETIVO -----
function htmlObjetivo() {
  const p = D.perfil();
  const o = D.objetivoBase(p);
  const campo = (n, et, v, extra = "") => `<label>${et}<input name="${n}" type="number" inputmode="decimal" step="any" value="${v ?? ""}" ${extra}></label>`;
  const form = `<form class="tarjeta-entreno nutri-form" data-form="perfil"><h2>Tus datos</h2>
    <div class="nutri-campos">
      <label>Sexo<select name="sexo"><option value="h" ${p.sexo === "h" ? "selected" : ""}>Hombre</option><option value="m" ${p.sexo === "m" ? "selected" : ""}>Mujer</option></select></label>
      ${campo("edad", "Edad", p.edad, "required min=10 max=100")}
      ${campo("altura", "Altura (cm)", p.altura, "required min=120 max=230")}
      ${campo("peso", "Peso (kg)", p.peso, "required min=30 max=250")}
      ${campo("grasa", "% grasa (opcional)", p.grasa, "min=3 max=60")}
    </div>
    <label>Tu día sin contar el deporte
      <select name="factor">${[[1.2, "Casi todo sentado"], [1.4, "Estudiar + 8.000–10.000 pasos"], [1.55, "Activo (de pie / 12.000+ pasos)"], [1.7, "Muy activo (trabajo físico)"]].map(([v, t]) => `<option value="${v}" ${Number(p.factor) === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label>Déficit diario (kcal)<input name="deficit" type="number" inputmode="numeric" step="50" min="0" max="800" value="${p.deficit}"></label>
    <button class="boton-principal" type="submit">Calcular</button></form>`;
  const res = o ? `<section class="tarjeta-entreno"><h2>Tu objetivo (día sin entreno)</h2>
    <div class="cifras nutri-cifras"><div><span>Calorías</span><b>${n0(o.kcal)} <small>kcal</small></b></div><div><span>Proteína</span><b>${o.prot} <small>g</small></b></div><div><span>Grasas</span><b>${o.grasa} <small>g</small></b></div></div>
    <div class="cifras nutri-cifras"><div><span>Carbos</span><b>${o.carbos} <small>g</small></b></div><div><span>Basal</span><b>${n0(o.basal)} <small>kcal</small></b></div><div><span>Mantenimiento</span><b>${n0(o.mantenimiento)} <small>kcal</small></b></div></div>
    <p class="nota">Los días que entrenes se suma el ${p.pctEntreno} % de las kcal de tu Garmin, y esas calorías extra se reparten en carbohidratos.</p></section>
    <details class="tarjeta-entreno nutri-como"><summary>¿Cómo se calcula?</summary>
      <p><b>Basal:</b> ${p.grasa ? "fórmula de Katch-McArdle (usa tu masa magra)" : "fórmula de Mifflin-St Jeor"}. Es lo que gastas en reposo.</p>
      <p><b>Mantenimiento:</b> basal × ${p.factor} (tu día normal). Garmin añade el entreno aparte.</p>
      <p><b>Déficit:</b> ${p.deficit} kcal menos. Para perder grasa sin perder músculo, lo normal es bajar entre 0,3 y 0,7 % del peso por semana.</p>
      <p><b>Proteína:</b> ${p.protKg} g por kg. <b>Grasa:</b> ${p.grasaKg} g por kg. <b>Carbos:</b> lo que sobra.</p>
      <p class="nota">Son estimaciones (±10 %). Con tu peso de varias semanas lo ajustaremos a tu gasto real. No sustituye a un dietista-nutricionista.</p></details>` : "";
  return `${res}${form}`;
}

// =====================================================================
// Eventos
// =====================================================================
function alTocar(e) {
  const b = e.target.closest("[data-acc]");
  if (!b) return;
  const v = b.dataset.v;
  switch (b.dataset.acc) {
    case "sub": detenerCamara(); est.escaner = false; est.sub = v; est.anadiendo = null; pintar(); scrollTo(0, 0); break;
    case "dia": est.fecha = D.sumarDias(est.fecha, Number(v)); pintar(); break;
    case "anadir": est.anadiendo = v; est.busca = ""; est.elegido = null; est.creando = false; est.escaner = false; est.offRes = null; est.offMsg = ""; pintar(); scrollTo(0, 0); break;
    case "cerrar": detenerCamara(); est.anadiendo = null; est.escaner = false; est.offRes = null; est.offMsg = ""; pintar(); break;
    case "escaner": est.sinCamara = false; est.escaner = true; est.escMsg = "Abriendo la cámara…"; pintar(); break;
    case "escaner-cerrar": detenerCamara(); est.escaner = false; pintar(); break;
    case "codigo-buscar": detenerCamara(); buscarCodigo(est.codigoManual); break;
    case "off-buscar": buscarEnOff(); break;
    case "quitar": D.quitar(est.fecha, v); pintar(); break;
    case "copiar": D.copiarDia(D.sumarDias(est.fecha, -1), est.fecha); pintar(); break;
    case "elegir": {
      est.elegido = (est.offRes || []).find((a) => a.id === v) || todosAlimentos().find((a) => (v && a.id === v) || a.nombre === b.dataset.n) || null;
      est.gramos = null; pintar(); break;
    }
    case "volver-lista": est.elegido = null; pintar(); break;
    case "racion": est.gramos = Math.round(est.elegido.racion * Number(v)); pintar(); break;
    case "crear": est.creando = true; pintar(); break;
    case "cancelar-crear": est.creando = false; pintar(); break;
    case "confirmar": {
      const a = est.elegido, g = Number(est.gramos ?? a.racion ?? 100);
      if (!(g > 0)) return;
      D.anadir(est.fecha, { comida: est.anadiendo, nombre: a.nombre, cant: g, ...D.porciones(a, g), base: { id: a.id, nombre: a.nombre, kcal: a.kcal, p: a.p, c: a.c, g: a.g, az: a.az, fi: a.fi, racion: a.racion, unidad: a.unidad, origen: a.origen, codigo: a.codigo } });
      detenerCamara(); est.anadiendo = null; est.elegido = null; est.escaner = false; est.offRes = null; pintar(); scrollTo(0, 0); break;
    }
    case "atajo-preparar": atajoPreparar(); break;
    case "atajo-copiar": navigator.clipboard?.writeText(est.atajoUrl).then(() => { b.textContent = "¡Copiado!"; }, () => { b.textContent = "No se pudo copiar: mantén pulsado el enlace"; }); break;
    case "borrar-peso": D.borrarPeso(v); pintar(); break;
  }
}
function alEscribir(e) {
  const c = e.target.dataset.campo;
  if (c === "busca") { est.busca = e.target.value; est.offMsg = ""; if (est.escaner) { detenerCamara(); est.escaner = false; } pintarAnadir(); }
  else if (c === "codigo") est.codigoManual = e.target.value;
  else if (c === "gramos") {
    est.gramos = Number(e.target.value) || 0;
    const prev = caja.querySelector("#nutri-prev");
    if (prev) prev.innerHTML = previa(D.porciones(est.elegido, est.gramos));
  }
}
function alEnviar(e) {
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  const num = (x) => (x === "" || x == null ? null : Number(String(x).replace(",", ".")));
  if (f.dataset.form === "perfil") {
    D.guardarPerfil({ sexo: d.sexo, edad: num(d.edad), altura: num(d.altura), peso: num(d.peso), grasa: num(d.grasa), factor: num(d.factor), deficit: num(d.deficit) ?? 300 });
    // Si cambias el peso aquí, queda anotado hoy (así no lo pisa una medida antigua)
    if (num(d.peso) && num(d.peso) !== D.perfil().peso || !Object.keys(D.pesos()).length) D.guardarPeso(D.hoy(), { kg: num(d.peso), ...(num(d.grasa) ? { grasa: num(d.grasa) } : {}) });
    pintar();
  } else if (f.dataset.form === "peso") {
    D.guardarPeso(d.fecha, { kg: num(d.kg), ...(num(d.grasa) ? { grasa: num(d.grasa) } : {}) });
    pintar();
  } else if (f.dataset.form === "crear") {
    const a = D.guardarPropio({ nombre: d.nombre.trim(), kcal: num(d.kcal) || 0, p: num(d.p) || 0, c: num(d.c) || 0, g: num(d.g) || 0, az: num(d.az) || 0, fi: num(d.fi) || 0, racion: null });
    est.creando = false; est.elegido = a; est.gramos = 100; pintar();
  }
}

// Pide a la función "peso" tu enlace secreto para el Atajo
async function atajoPreparar() {
  est.atajoError = "";
  try {
    if (!window.nube) throw new Error("Inicia sesión en Sincronizar (panel del Horario) primero");
    const sb = await window.nube.supabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Inicia sesión en Sincronizar (panel del Horario) primero");
    const { data, error } = await sb.functions.invoke("peso", { body: { accion: "token" } });
    if (error || !data?.token) throw new Error(data?.error || "No se pudo crear el enlace");
    est.atajoUrl = `${sb.supabaseUrl}/functions/v1/peso?token=${data.token}`;
  } catch (e) { est.atajoError = e.message; }
  pintar();
}

// =====================================================================
// Escáner de código de barras (librería ZXing, solo se descarga al usarlo)
// =====================================================================
let lector = null;
function cargarZXing() {
  if (window.ZXing) return Promise.resolve();
  return new Promise((ok, mal) => {
    const sc = document.createElement("script");
    sc.src = "vendor/zxing.js";
    sc.onload = ok; sc.onerror = () => mal(new Error("No se pudo cargar el lector"));
    document.head.append(sc);
  });
}
function mensajeEscaner(t) { est.escMsg = t; const el = caja.querySelector("#nutri-esc-msg"); if (el) el.textContent = t; }
function detenerCamara() { try { lector?.reset(); } catch {} lector = null; }
async function arrancarCamara() {
  const video = caja.querySelector("#nutri-video");
  if (!video || lector) return;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no deja usar la cámara");
    await cargarZXing();
    const Z = window.ZXing;
    const pistas = new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]]]);
    lector = new Z.BrowserMultiFormatReader(pistas, 250);
    mensajeEscaner("Apunta al código de barras");
    await lector.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video, (res) => {
      if (res) { detenerCamara(); buscarCodigo(res.getText()); }
    });
  } catch (e) {
    detenerCamara();
    mensajeEscaner(/Permission|NotAllowed/i.test(e.name + e.message) ? "Sin permiso para la cámara: actívalo en Ajustes del iPhone o escribe el código." : `No pude abrir la cámara (${e.message}). Escribe el código.`);
  }
}
// Pregunta a Open Food Facts por un código
async function buscarCodigo(codigo) {
  est.escaner = true; est.sinCamara = true;
  est.codigoManual = codigo;
  pintarAnadir();
  mensajeEscaner(`Buscando ${codigo}…`);
  try {
    const p = await off.porCodigo(codigo);
    if (p) { est.escaner = false; est.elegido = p; est.gramos = null; pintar(); scrollTo(0, 0); return; }
    detenerCamara();
    mensajeEscaner(`No encuentro el código ${codigo} en Open Food Facts. Puedes crearlo tú con «Crear alimento nuevo» (queda guardado).`);
  } catch (e) {
    mensajeEscaner(navigator.onLine ? `No pude consultar Open Food Facts (${e.message}).` : "Sin conexión: no puedo buscar productos nuevos. Los que ya usaste siguen en Recientes.");
  }
}
// Búsqueda de productos por nombre
async function buscarEnOff() {
  est.offMsg = "Buscando…"; est.offRes = null; pintarAnadir();
  try {
    est.offRes = await off.buscar(est.busca);
    est.offMsg = est.offRes.length ? "" : "No encuentro productos con ese nombre.";
  } catch (e) { est.offMsg = navigator.onLine ? `No pude consultar Open Food Facts (${e.message}).` : "Sin conexión."; }
  pintarAnadir();
}
