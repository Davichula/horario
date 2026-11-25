// =====================================================================
// nutricion/nutricion.js — la sección "Nutrición"
// ---------------------------------------------------------------------
// Tres subpestañas:
//   Hoy       → anillo de calorías, macros y las comidas del día (con el buscador)
//   Progreso  → tu peso (media de 7 días) y su ritmo
//   Objetivo  → tus datos y cómo se calcula tu objetivo de calorías y macros
// secciones.js llama a iniciar() la primera vez que abres la pestaña.
// =====================================================================
import { ALIMENTOS, unidadesDe, textoCantidad, numBonito } from "./alimentos.js";
import * as D from "./datos.js";
import * as almacen from "../entreno/almacen.js";
import { anillo } from "../entreno/graficas.js";
import * as off from "./openfoodfacts.js";
import * as hoyE from "../entreno/hoy.js";

const COMIDAS = ["Desayuno", "Comida", "Merienda", "Cena"];
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const n0 = (x) => Math.round(x).toLocaleString("es-ES");
const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
const quitarTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let caja = null;
const est = { sub: "hoy", fecha: D.hoy(), anadiendo: null, busca: "", elegido: null, creando: false, escaner: false, escMsg: "", offRes: null, offMsg: "", codigoManual: "",
  abiertas: new Set(), // comidas desplegadas en Hoy
  editando: null,      // id del alimento anotado que estás cambiando
  uds: [], ud: 0, n: 1 // formas de medir el alimento elegido, cuál usas y cuántas
};

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
  // Las cabeceras de las comidas se pueden abrir también con el teclado
  caja.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-acc]')) { e.preventDefault(); alTocar(e); } });
  window.addEventListener("storage", (e) => { if (e.key?.startsWith("mi-horario:nutricion") && !est.anadiendo) pintar(); });
  return { mostrar: () => { est.fecha = est.fecha || D.hoy(); pintar(); } };
}

// ----- Datos auxiliares -----
// Calorías de entreno de ese día: lo que gastaste según Garmin y, si aún no
// has hecho el entreno planeado de hoy (Entreno → Planes), lo previsto
const kcalEntreno = (fecha) => hoyE.kcalEntreno(fecha);
const todosAlimentos = () => [...D.propios(), ...ALIMENTOS];
// Lo que has comido, del más nuevo al más viejo: primero lo de ESTA comida
// (desayuno, comida…) y luego el resto. Cada alimento va una sola vez, con
// la última entrada (para proponer la misma cantidad).
// Se calcula una vez al abrir el buscador, no en cada letra.
function recientes(comida) {
  const enEsta = new Map(), todas = new Map();
  const d = D.diario();
  for (const f of Object.keys(d).sort().reverse()) for (const e of [...d[f]].reverse()) {
    if (!e.base) continue;
    const r = { a: { ...e.base, nombre: e.nombre }, e };
    if (e.comida === comida && !enEsta.has(e.nombre)) enEsta.set(e.nombre, r);
    if (!todas.has(e.nombre)) todas.set(e.nombre, r);
  }
  return { enEsta: [...enEsta.values()], otras: [...todas.values()].filter((r) => !enEsta.has(r.a.nombre)) };
}
// El último día (antes del que miras) en que anotaste esa comida
function ultimaComida(comida) {
  const d = D.diario();
  const f = Object.keys(d).filter((x) => x < est.fecha && d[x].some((e) => e.comida === comida)).sort().pop();
  return f ? { f, l: d[f].filter((e) => e.comida === comida) } : null;
}
// Prepara el buscador: recientes y una lista de nombres ya "limpios" (sin
// tildes) para que buscar al escribir sea instantáneo y no toque la red
function prepararBuscador() {
  const r = recientes(est.anadiendo);
  const porNombre = new Map();
  // Tus alimentos, los de supermercado que ya usaste y los básicos
  for (const a of [...D.propios(), ...r.enEsta.map((x) => x.a), ...r.otras.map((x) => x.a), ...ALIMENTOS])
    if (!porNombre.has(a.nombre)) porNombre.set(a.nombre, a);
  est.rec = r;
  est.indice = [...porNombre.values()].map((a) => ({ a, n: quitarTildes(a.nombre) }));
}
// Busca en tu lista: todas las palabras deben aparecer; primero lo que
// empieza por lo que escribes, luego lo que ya has comido
function buscarLocal(q) {
  const pal = q.split(/\s+/).filter(Boolean);
  const comidos = new Set([...est.rec.enEsta, ...est.rec.otras].map((x) => x.a.nombre));
  return est.indice.filter((x) => pal.every((w) => x.n.includes(w)))
    .map((x) => ({ x, p: (x.n.startsWith(q) ? 0 : x.n.includes(" " + pal[0]) ? 1 : 2) - (comidos.has(x.a.nombre) ? 0.5 : 0) }))
    .sort((a, b) => a.p - b.p).slice(0, 30).map((y) => y.x.a);
}

// =====================================================================
// Pintar
// =====================================================================
function pintar() {
  if (est.anadiendo) return pintarAnadir();
  const subs = [["hoy", "Hoy"], ["semana", "Semana"], ["progreso", "Progreso"], ["objetivo", "Objetivo"]];
  caja.innerHTML = `
    <header class="cabecera"><h1>Nutrición</h1></header>
    <nav class="subpestanas nutri-sub" aria-label="Subapartados">${subs.map(([v, t]) =>
      `<button type="button" data-acc="sub" data-v="${v}" class="${est.sub === v ? "activo" : ""}" aria-pressed="${est.sub === v}">${t}</button>`).join("")}</nav>
    <div class="entreno-cuerpo">${est.sub === "hoy" ? htmlHoy() : est.sub === "semana" ? htmlSemana() : est.sub === "progreso" ? htmlProgreso() : htmlObjetivo()}</div>`;
}

// ----- HOY -----
function htmlHoy() {
  const p = D.perfil();
  const entradas = D.dia(est.fecha);
  const t = D.totales(entradas);
  const en = kcalEntreno(est.fecha);
  const obj = D.objetivoDia(p, en.total);
  const esHoy = est.fecha === D.hoy();
  const nav = franjaSemana();

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
      ${obj.extra ? `<p class="nota">${en.lista.map((a) => esc(a.nombre) + (a.previsto ? " (previsto)" : "")).join(" + ")}: ${n0(en.total)} kcal${en.lista.some((a) => a.previsto) ? " estimadas" : " según Garmin"} (cuento el ${p.pctEntreno} %).</p>` : ""}
      ${macro("Proteína", t.p, obj.prot, "var(--nutri-prot)")}
      ${macro("Carbohidratos", t.c, obj.carbos, "var(--nutri-carb)")}
      ${macro("Grasas", t.g, obj.grasa, "var(--nutri-grasa)")}
      <div class="nutri-chips"><span>Azúcar ${n0(t.az)} g</span><span>Fibra ${n0(t.fi)} / ${n0(14 * obj.kcal / 1000)} g</span></div></section>`;
  }

  // Cada comida plegada enseña solo su resumen; al tocarla se despliegan sus alimentos
  const comidas = COMIDAS.map((c) => {
    const l = entradas.filter((e) => e.comida === c);
    const k = l.reduce((x, e) => x + e.kcal, 0);
    const pr = l.reduce((x, e) => x + (e.p || 0), 0);
    const cb = l.reduce((x, e) => x + (e.c || 0), 0);
    const buena = c !== "Merienda" && pr >= 30;
    const abierta = l.length > 0 && est.abiertas.has(c);
    const cab = l.length
      ? `data-acc="plegar" data-v="${c}" role="button" tabindex="0" aria-expanded="${abierta}" aria-label="${c}: ${abierta ? "plegar" : "ver alimentos"}"`
      : `data-acc="anadir" data-v="${c}" role="button" tabindex="0" aria-label="Añadir a ${c}"`;
    const sub = l.length
      ? `<span class="nm-p">P ${n0(pr)} g</span> · <span class="nm-c">C ${n0(cb)} g</span>${buena ? ' <em class="nutri-ok" title="30 g o más de proteína">✓ 30+</em>' : ""}`
      : "Sin anotar";
    return `<div class="nutri-comida${abierta ? " abierta" : ""}"><div class="nutri-comida-cab" ${cab}><div class="nutri-comida-tit">${ICONO_COMIDA[c]}<div><b>${c}</b>${l.length ? FLECHA : ""}
      <div class="nutri-comida-sub">${sub}</div></div></div>
      <div class="nutri-comida-der">${l.length ? `<span><b>${n0(k)}</b><small>kcal</small></span>` : ""}<button type="button" class="nutri-mas" data-acc="anadir" data-v="${c}" aria-label="Añadir a ${c}">+</button></div></div>
      ${abierta ? `<div class="nutri-items">${l.map((e) => `<button type="button" class="nutri-item" data-acc="editar" data-v="${e.id}" aria-label="Cambiar ${esc(e.nombre)}">
        <span class="nutri-emo" aria-hidden="true">${emojiDe(e.nombre)}</span><span class="nutri-item-txt">${esc(e.nombre)}<small>${cantidadDe(e)}</small></span>
        <span class="nutri-item-kcal">${n0(e.kcal)}<small>kcal</small></span></button>`).join("")}
        ${est.guardando === c ? `<form class="nutri-guardar" data-form="guardar-comida"><input name="nombre" value="Mi ${esc(c.toLowerCase())}" aria-label="Nombre de la comida" autocomplete="off" maxlength="40">
          <button class="boton-principal" type="submit">Guardar</button><button type="button" class="nutri-quitar" data-acc="guardar-cancelar" aria-label="Cancelar">✕</button></form>`
        : `<button type="button" class="nutri-guardar-btn" data-acc="guardar-comida" data-v="${c}">☆ Guardar como comida habitual</button>`}</div>` : ""}</div>`;
  }).join("");
  const ayer = D.dia(D.sumarDias(est.fecha, -1)).length;
  return `${nav}${est.fecha >= D.hoy() ? htmlPlanDia(est.fecha) : ""}${resumen}<section class="tarjeta-entreno nutri-comidas">${comidas}
    ${ayer && !entradas.length ? `<button type="button" class="boton-secundario" data-acc="copiar">Copiar las comidas de ayer</button>` : ""}</section>`;
}
const FLECHA = `<svg class="nutri-flecha" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
// "3 huevos · 180 g" (o solo "180 g" si lo anotaste en gramos)
function cantidadDe(e) {
  const uds = unidadesDe({ ...(e.base || {}), nombre: e.nombre });
  const g = `${n0(e.cant ?? 0)} ${uds[uds.length - 1].s}`;
  if (e.ud) return `${esc(textoCantidad(e.udN, { s: e.ud, pl: e.udPl || e.ud }))} · ${g}`;
  // Anotado antes en gramos: si cuadra con su unidad (180 g = 3 huevos), lo digo así
  const u = uds[0], n = (e.cant || 0) / u.g;
  if (!u.gramos && n >= 0.5 && Math.abs(n * 2 - Math.round(n * 2)) < 0.02) return `${esc(textoCantidad(Math.round(n * 2) / 2, u))} · ${g}`;
  return g;
}
// ----- Plan del día: qué comer alrededor del entreno (entreno/hoy.js) -----
function htmlPlanDia(f) {
  const pl = hoyE.planDelDia(f);
  if (!pl.obj) return "";
  const tipo = hoyE.TIPO_DIA[pl.tipo];
  const esHoy = f === D.hoy();
  const fechaT = esHoy ? "hoy" : new Date(f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric" });
  const prin = pl.principal;
  const cab = prin
    ? `<div class="plan-cab"><span class="hoy-ico">${hoyE.iconoDeporte(prin.deporte)}</span><div><b>${esc(prin.nombre)}</b>
        <div class="nota">${prin.hecho ? "Hecho" : prin.hora || "Sin hora"} · ${Math.round((prin.duracion || 0) / 60)} min${pl.entreno.todo.length > 1 ? ` · +${pl.entreno.todo.length - 1} más` : ""}</div></div>
        <span class="plan-chip" style="--c:${tipo.color}">${tipo.nombre}</span></div>`
    : `<div class="plan-cab"><div><b>Sin entreno planeado</b><div class="nota">Si planeas uno en Entreno → Planes, lo tengo en cuenta.</div></div><span class="plan-chip" style="--c:${tipo.color}">${tipo.nombre}</span></div>`;
  const resumenObj = `<p class="plan-obj"><b>${n0(pl.obj.kcal)} kcal</b> · ${n0(pl.obj.carbos)} g de carbos${pl.obj.extra ? ` <small>(+${n0(pl.obj.extra)} por el entreno)</small>` : ""}</p>`;
  const chip = (x) => `<span class="${x.tuyo ? "tuyo" : ""}">${x.emoji || emojiDe(x.nombre)} ${esc(x.nombre)}${x.g ? ` ${n0(x.g)} g` : ""}</span>`;
  const linea = pl.pasos.length ? `<div class="plan-linea">${pl.pasos.map((x) => `<div class="plan-paso ${x.clase}">
      <div class="plan-h">${esc(x.hora)}</div><b>${esc(x.titulo)}</b><p>${esc(x.texto)}</p>
      ${x.ejemplos.length ? `<div class="plan-ej">${x.ejemplos.map(chip).join("")}</div>` : ""}</div>`).join("")}</div>
      ${pl.pasos.some((x) => x.ejemplos.some((e) => e.tuyo)) ? `<p class="nota">Los ejemplos en verde salen de lo que sueles comer.</p>` : ""}`
    : `<ul class="plan-consejos">${pl.consejos.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
  return `<section class="tarjeta-entreno plan-dia"><h2>Plan de ${fechaT}</h2>${cab}${resumenObj}${linea}</section>`;
}
// ----- Iconos de cada comida (dibujos de línea con un tono suave) -----
const icono = (color, trazos) => `<span class="nutri-ico" style="--c:${color}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazos}</svg></span>`;
const ICONO_COMIDA = {
  Desayuno: icono("#f5b942", '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  Comida: icono("#2fd27a", '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>'),
  Merienda: icono("#ff7a90", '<path d="M12 7c-3-2-7-1-7 4 0 5 3 9 5 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-9 0-5-4-6-7-4z"/><path d="M12 7c0-2 1-4 3-4"/>'),
  Cena: icono("#8f9bff", '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
};
// Un emoji pequeño según el alimento (por palabras del nombre)
const EMOJIS = [
  [/arroz|cuscus|quinoa|paella/, "🍚"], [/pasta|macarron|espagueti|plumas|tallarin|fideo/, "🍝"], [/avena|cereal/, "🥣"], [/pan |pan$|tostada|molde|bocadillo|bocata/, "🍞"],
  [/pollo|pavo|muslo/, "🍗"], [/ternera|cerdo|lomo|hamburguesa|carne/, "🥩"], [/jamon|chorizo|salchicha/, "🥓"],
  [/gamba/, "🍤"], [/salmon|merluza|atun|bacalao|dorada|lubina|sardina|calamar|pescado/, "🐟"],
  [/huevo|tortilla|clara/, "🥚"], [/queso|requeson|cottage/, "🧀"], [/leche|yogur|skyr|bebida de|kefir/, "🥛"],
  [/lenteja|garbanzo|alubia|hummus|judia seca/, "🫘"], [/almendra|nuez|nueces|cacahuete|pistacho|crema de cacahuete/, "🥜"],
  [/platano/, "🍌"], [/manzana/, "🍎"], [/naranja|mandarina|zumo/, "🍊"], [/pera/, "🍐"], [/fresa/, "🍓"], [/arandano/, "🫐"], [/uva/, "🍇"],
  [/sandia/, "🍉"], [/melon/, "🍈"], [/kiwi/, "🥝"], [/pina/, "🍍"], [/melocoton/, "🍑"], [/aguacate/, "🥑"], [/datil/, "🌴"],
  [/tomate|gazpacho/, "🍅"], [/ensalada|lechuga|espinaca/, "🥗"], [/brocoli/, "🥦"], [/zanahoria/, "🥕"], [/pepino|calabacin/, "🥒"],
  [/pimiento/, "🫑"], [/cebolla/, "🧅"], [/champi/, "🍄"], [/patata|boniato/, "🥔"], [/verdura|menestra|judias verdes/, "🥬"],
  [/aceite|oliva/, "🫒"], [/mantequilla/, "🧈"], [/miel|mermelada|azucar/, "🍯"], [/chocolate|cacao|nutella/, "🍫"], [/helado/, "🍦"],
  [/croissant|magdalena|galleta|dulce/, "🥐"], [/pizza/, "🍕"], [/sushi|maki/, "🍣"], [/cafe/, "☕"], [/cerveza/, "🍺"], [/vino/, "🍷"],
  [/refresco|cola/, "🥤"], [/proteina|whey|barrita/, "💪"], [/patatas fritas|bolsa/, "🍟"],
];
function emojiDe(nombre) {
  const n = quitarTildes(nombre) + " ";
  for (const [re, e] of EMOJIS) if (re.test(n)) return e;
  return "🍽️";
}

// ----- Franja de la semana: un anillo por día (lunes a domingo) -----
function lunesDe(f) {
  const d = new Date(f + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return D.aTexto(d);
}
// Resumen de un día: lo comido, su objetivo (con el entreno de ese día) y cuánto del objetivo llevas
function resumenDia(f, p = D.perfil()) {
  const t = D.totales(D.dia(f));
  const obj = D.objetivoDia(p, kcalEntreno(f).total);
  return { t, obj, anotado: t.kcal >= 1, pct: obj ? t.kcal / obj.kcal : 0 };
}
const diaCorto = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "narrow" }).toUpperCase();
function anilloMini(pct, color) {
  const r = 11, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, pct));
  return `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true"><circle cx="15" cy="15" r="${r}" fill="none" stroke="var(--elevado)" stroke-width="4"/>
    ${v > 0 ? `<circle cx="15" cy="15" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - v)).toFixed(1)}" transform="rotate(-90 15 15)"/>` : ""}</svg>`;
}
function franjaSemana() {
  const lun = lunesDe(est.fecha), p = D.perfil(), hoy = D.hoy();
  const dias = Array.from({ length: 7 }, (_, i) => D.sumarDias(lun, i));
  const rango = `${new Date(dias[0] + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${new Date(dias[6] + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
  const titulo = est.fecha === hoy ? "Hoy" : new Date(est.fecha + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return `<div class="nutri-fecha"><button type="button" data-acc="semana" data-v="-7" aria-label="Semana anterior">‹</button><b>${titulo}</b>
      <button type="button" data-acc="semana" data-v="7" aria-label="Semana siguiente" ${lunesDe(hoy) === lun ? "disabled" : ""}>›</button></div>
    <div class="nutri-franja" role="group" aria-label="Días de la semana ${rango}">${dias.map((f) => {
      const r = resumenDia(f, p);
      const color = r.pct > 1.05 ? "var(--nutri-carb)" : "var(--acento)";
      return `<button type="button" class="nutri-dia${f === est.fecha ? " activo" : ""}${f > hoy ? " futuro" : ""}" data-acc="ir-dia" data-v="${f}" aria-label="${f}" aria-pressed="${f === est.fecha}">
        <span>${diaCorto(f)}</span>${anilloMini(r.pct, color)}<span>${Number(f.slice(8))}</span></button>`;
    }).join("")}</div>`;
}

// ----- SEMANA: barras de calorías de cada día y medias -----
function htmlSemana() {
  const lun = lunesDe(est.fecha), p = D.perfil(), hoy = D.hoy();
  const dias = Array.from({ length: 7 }, (_, i) => D.sumarDias(lun, i));
  const res = dias.map((f) => ({ f, ...resumenDia(f, p) }));
  const con = res.filter((r) => r.anotado);
  const media = (k) => (con.length ? con.reduce((x, r) => x + r.t[k], 0) / con.length : 0);
  const base = D.objetivoBase(p);
  const tope = Math.max(base?.kcal || 0, ...res.map((r) => Math.max(r.t.kcal, r.obj?.kcal || 0))) * 1.08 || 1;
  const rango = `${new Date(dias[0] + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${new Date(dias[6] + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
  const kP = media("p") * 4, kC = media("c") * 4, kG = media("g") * 9, kt = kP + kC + kG || 1;
  const pk = p.peso ? media("p") / p.peso : null;
  return `<div class="nutri-fecha"><button type="button" data-acc="semana" data-v="-7" aria-label="Semana anterior">‹</button><b>${lunesDe(hoy) === lun ? "Esta semana" : rango}</b>
      <button type="button" data-acc="semana" data-v="7" aria-label="Semana siguiente" ${lunesDe(hoy) === lun ? "disabled" : ""}>›</button></div>
    <section class="tarjeta-entreno"><h2>Calorías por día · ${rango}</h2>
      <div class="nutri-barras" role="img" aria-label="Calorías de cada día de la semana">
        ${base ? `<div class="nutri-meta" style="bottom:${(base.kcal / tope * 100).toFixed(1)}%"><span>${n0(base.kcal)}</span></div>` : ""}
        ${res.map((r) => {
          const col = !r.anotado ? "var(--elevado)" : r.obj && r.t.kcal > r.obj.kcal * 1.05 ? "var(--nutri-carb)" : "var(--acento)";
          return `<button type="button" class="nutri-barra-dia" data-acc="ir-dia-hoy" data-v="${r.f}" aria-label="${r.f}: ${n0(r.t.kcal)} kcal"><i style="height:${r.anotado ? Math.max(4, r.t.kcal / tope * 100) : 3}%;background:${col}"></i></button>`;
        }).join("")}</div>
      <div class="nutri-barras-eje">${res.map((r) => `<span class="${r.f === hoy ? "hoy" : ""}">${diaCorto(r.f)}</span>`).join("")}</div></section>
    <div class="cifras nutri-cifras"><div><span>Calorías media</span><b>${con.length ? n0(media("kcal")) : "—"}</b></div>
      <div><span style="color:var(--nutri-prot)">Proteína</span><b>${con.length ? n0(media("p")) + " g" : "—"}</b>${pk ? `<small>${n1(pk)} g/kg</small>` : ""}</div>
      <div><span>Días anotados</span><b>${con.length}/7</b></div></div>
    ${con.length ? `<section class="tarjeta-entreno"><h2>Reparto de las calorías (media)</h2>
      <div class="nutri-reparto"><i style="width:${kP / kt * 100}%;background:var(--nutri-prot)"></i><i style="width:${kC / kt * 100}%;background:var(--nutri-carb)"></i><i style="width:${kG / kt * 100}%;background:var(--nutri-grasa)"></i></div>
      <div class="nutri-reparto-leyenda"><span style="color:var(--nutri-prot)">Proteína ${Math.round(kP / kt * 100)} %</span><span style="color:var(--nutri-carb)">Carbos ${Math.round(kC / kt * 100)} %</span><span style="color:var(--nutri-grasa)">Grasa ${Math.round(kG / kt * 100)} %</span></div>
      <p class="nota">La línea de puntos es tu objetivo de un día sin entreno. Toca una barra para abrir ese día.</p></section>`
    : `<section class="tarjeta-entreno"><p class="nota">Esta semana aún no hay comidas anotadas.</p></section>`}`;
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
        <p class="nota">Opcional: si lo sueles contar por unidades (una barrita, un yogur…), dime cómo se llama y cuánto pesa una.</p>
        <div class="nutri-campos">
          <label>Unidad<input name="unidad" placeholder="barrita" autocomplete="off"></label>
          <label>Peso de 1 (g)<input name="racion" type="number" inputmode="decimal" step="any" min="0"></label>
        </div>
        <button class="boton-principal" type="submit">Guardar alimento</button>
        <button type="button" class="boton-secundario" data-acc="cancelar-crear">Cancelar</button></form></div>`;
    return;
  }
  if (est.elegido) {
    const a = est.elegido, u = est.uds[est.ud], t = D.porciones(a, gramosElegidos());
    const editar = !!est.editando;
    const rapidas = u.gramos ? [50, 100, 150, 200].map((v) => [v, String(v)]) : [0.5, 1, 2, 3, 4].map((v) => [v, numBonito(v)]);
    caja.innerHTML = `<header class="cabecera"><h1>${editar ? "Cambiar cantidad" : esc(c)}</h1></header><div class="entreno-cuerpo">
      <section class="tarjeta-entreno nutri-form"><h2><span class="nutri-emo" aria-hidden="true">${emojiDe(a.nombre)}</span>${esc(a.nombre)}${a.origen === "off" ? ' <em class="etq etq-off">Open Food Facts</em>' : ""}</h2>
        ${a.origen === "off" ? '<p class="nota">Datos aportados por usuarios: si no cuadran con la etiqueta, usa «Crear alimento nuevo» con los de tu envase.</p>' : ""}
        ${editar ? `<div class="nutri-etq">Está en</div><div class="nutri-uds nutri-mover" role="group" aria-label="Comida">${COMIDAS.map((x) => `<button type="button" data-acc="mover" data-v="${x}" class="${x === c ? "activo" : ""}" aria-pressed="${x === c}">${x}</button>`).join("")}</div>` : ""}
        <div class="nutri-etq">Cantidad</div>
        <div class="nutri-cant"><button type="button" data-acc="menos" aria-label="Menos">−</button>
          <input data-campo="n" type="text" inputmode="decimal" value="${esc(u.gramos ? Math.round(est.n) : String(est.n).replace(".", ","))}" aria-label="Cantidad" autocomplete="off">
          <button type="button" data-acc="mas" aria-label="Más">+</button></div>
        <div class="nutri-uds" role="group" aria-label="Unidad">${est.uds.map((x, i) => `<button type="button" data-acc="ud" data-v="${i}" class="${i === est.ud ? "activo" : ""}" aria-pressed="${i === est.ud}">${esc(x.s)}${x.gramos ? "" : ` <small>${n1(x.g)} ${est.uds[est.uds.length - 1].s}</small>`}</button>`).join("")}</div>
        <p class="nutri-equiv" id="nutri-equiv">${equivalencia()}</p>
        <div class="chips chips-mini nutri-rapidas">${rapidas.map(([v, tx]) => `<button type="button" data-acc="rapida" data-v="${v}">${tx}${u.gramos ? " " + u.s : ""}</button>`).join("")}</div>
        <div class="cifras nutri-cifras cuatro" id="nutri-prev">${previa(t)}</div>
        <button class="boton-principal" type="button" data-acc="confirmar">${editar ? "Guardar cambios" : `Añadir a ${esc(c)}`}</button>
        ${editar ? `<button type="button" class="boton-secundario nutri-borrar" data-acc="quitar-editando">Quitar de ${esc(est.editandoDe)}</button>
          <button type="button" class="boton-secundario" data-acc="cerrar">Cancelar</button>`
        : `<button type="button" class="boton-secundario" data-acc="volver-lista">Volver</button>`}</section></div>`;
    return;
  }
  const icoCamara = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8"/></svg>`;
  caja.innerHTML = `<header class="cabecera"><h1>${esc(c)}</h1></header><div class="entreno-cuerpo">
    <div class="nutri-buscar-fila"><input class="nutri-buscar" data-campo="busca" type="search" placeholder="Buscar alimento…" value="${esc(est.busca)}" autocomplete="off" enterkeyhint="search">
      <button type="button" class="nutri-camara" data-acc="${est.escaner ? "escaner-cerrar" : "escaner"}" aria-label="Escanear código de barras">${icoCamara}</button></div>
    ${est.escaner ? `<section class="tarjeta-entreno nutri-escaner"><h2>Escanear código de barras</h2>
        <div class="nutri-visor"><video id="nutri-video" playsinline muted></video><div class="nutri-marco"></div></div>
        <p class="nota" id="nutri-esc-msg">${esc(est.escMsg)}</p>
        <div class="nutri-buscar-fila"><input class="nutri-buscar" data-campo="codigo" type="text" inputmode="numeric" placeholder="O escribe el código" value="${esc(est.codigoManual)}" autocomplete="off">
          <button type="button" class="boton-principal nutri-ir" data-acc="codigo-buscar">Buscar</button></div></section>` : ""}
    <div id="nutri-resultados">${htmlResultados()}</div>
    <button type="button" class="boton-secundario" data-acc="crear">+ Crear alimento nuevo</button>
    <button type="button" class="boton-secundario" data-acc="cerrar">Cerrar</button></div>`;
  const inp = caja.querySelector('.nutri-buscar[data-campo="busca"]');
  if (inp && !est.escaner && document.activeElement !== inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  if (est.escaner && !est.sinCamara) arrancarCamara();
}
// La lista bajo el buscador. Al escribir solo se repinta esto (no la
// casilla), así el teclado del iPhone no se corta en cada letra.
function htmlResultados() {
  const c = est.anadiendo, q = quitarTildes(est.busca.trim());
  if (!est.rec) prepararBuscador();
  est.vistos = new Map(); // lo que hay en pantalla, para encontrarlo al tocarlo
  const ver = (a) => { const k = "r" + est.vistos.size; est.vistos.set(k, a); return k; };
  const fila = (a) => `<button type="button" class="nutri-res" data-acc="elegir" data-v="${ver(a)}">
        <span>${esc(a.nombre)}${a.origen === "propio" ? ' <em class="etq">tuyo</em>' : ""}${a.origen === "off" ? ' <em class="etq etq-off">Open Food Facts</em>' : ""}<small>por 100 g · P ${n1(a.p)} · C ${n1(a.c)} · G ${n1(a.g)}</small></span><b>${n0(a.kcal)}</b></button>`;
  // Reciente: enseña lo que pusiste la última vez y un "+" para añadirlo igual de un toque
  const filaRec = ({ a, e }) => { const k = ver(a); return `<div class="nutri-rec">
      <button type="button" class="nutri-res" data-acc="elegir" data-v="${k}"><span class="nutri-emo" aria-hidden="true">${emojiDe(a.nombre)}</span>
        <span class="nutri-rec-txt">${esc(a.nombre)}<small>${cantidadDe(e)}</small></span><b>${n0(e.kcal)}<small>kcal</small></b></button>
      <button type="button" class="nutri-mas" data-acc="rec-anadir" data-v="${k}" aria-label="Añadir ${esc(cantidadDe(e))} de ${esc(a.nombre)}">+</button></div>`; };
  const filaMenu = (m) => `<div class="nutri-rec"><button type="button" class="nutri-res" data-acc="menu-anadir" data-v="${m.id}"><span class="nutri-emo" aria-hidden="true">⭐</span>
      <span class="nutri-rec-txt">${esc(m.nombre)}<small>${m.items.map((e) => esc(e.nombre.replace(/ \(.*\)$/, ""))).join(", ")}</small></span><b>${n0(m.items.reduce((x, e) => x + e.kcal, 0))}<small>kcal</small></b></button>
      <button type="button" class="nutri-quitar" data-acc="menu-borrar" data-v="${m.id}" aria-label="Borrar ${esc(m.nombre)}">✕</button></div>`;
  if (q) {
    const l = buscarLocal(q), ms = D.guardadas().filter((m) => quitarTildes(m.nombre).includes(q));
    return `${ms.length ? `<section class="tarjeta-entreno nutri-lista"><h2>Tus comidas guardadas</h2>${ms.map(filaMenu).join("")}</section>` : ""}<section class="tarjeta-entreno nutri-lista"><h2>Resultados</h2>${l.map(fila).join("") || '<p class="nota">No lo encuentro en tu lista.</p>'}</section>
    ${q.length >= 3 ? `<button type="button" class="boton-secundario" data-acc="off-buscar">Buscar «${esc(est.busca.trim())}» en productos de supermercado</button>` : ""}
    ${est.offMsg ? `<p class="nota">${esc(est.offMsg)}</p>` : ""}
    ${est.offRes?.length ? `<section class="tarjeta-entreno nutri-lista"><h2>Productos (Open Food Facts)</h2>${est.offRes.map(fila).join("")}</section>` : ""}`;
  }
  const guardadas = D.guardadas();
  const menus = guardadas.length ? `<section class="tarjeta-entreno nutri-lista"><h2>Tus comidas guardadas</h2>${guardadas.map(filaMenu).join("")}</section>` : "";
  const { enEsta, otras } = est.rec, propios = D.propios().filter((a) => !enEsta.concat(otras).some((r) => r.a.nombre === a.nombre));
  const ult = D.dia(est.fecha).some((e) => e.comida === c) ? null : ultimaComida(c);
  const dia = ult && (ult.f === D.sumarDias(est.fecha, -1) ? "de ayer" : "del " + new Date(ult.f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric" }));
  const repetir = ult ? `<button type="button" class="tarjeta-entreno nutri-repetir" data-acc="repetir" data-v="${ult.f}">
      <span class="nutri-repetir-ico" aria-hidden="true">↻</span><span><b>Repetir ${esc(c.toLowerCase())} ${dia}</b>
      <small>${ult.l.map((e) => esc(e.nombre.replace(/ \(.*\)$/, ""))).join(", ")}</small></span><b>${n0(ult.l.reduce((x, e) => x + e.kcal, 0))}<small>kcal</small></b></button>` : "";
  if (!enEsta.length && !otras.length && !propios.length) return `${repetir}${menus}<p class="nota">Aún no has anotado nada. Busca un alimento arriba o escanea un código.</p>`;
  return `${repetir}${menus}
    ${enEsta.length ? `<section class="tarjeta-entreno nutri-lista"><h2>Tu ${esc(c.toLowerCase())} reciente</h2>${enEsta.slice(0, 10).map(filaRec).join("")}</section>` : ""}
    ${otras.length ? `<section class="tarjeta-entreno nutri-lista"><h2>${enEsta.length ? "Otros recientes" : "Recientes"}</h2>${otras.slice(0, 8).map(filaRec).join("")}</section>` : ""}
    ${propios.length ? `<section class="tarjeta-entreno nutri-lista"><h2>Tus alimentos</h2>${propios.map(fila).join("")}</section>` : ""}`;
}
// Repinta solo la lista (sin tocar la casilla de búsqueda)
function pintarResultados() {
  const r = caja.querySelector("#nutri-resultados");
  if (r) r.innerHTML = htmlResultados(); else pintarAnadir();
}
// Añade un alimento tal cual lo pusiste la última vez
function entradaDe(a, e) {
  return { comida: est.anadiendo, nombre: a.nombre, cant: e.cant, ud: e.ud || null, udPl: e.udPl || null, udN: e.udN || null, udG: e.udG || null,
    ...D.porciones(a, e.cant), base: { id: a.id, nombre: a.nombre, kcal: a.kcal, p: a.p, c: a.c, g: a.g, az: a.az, fi: a.fi, racion: a.racion, unidad: a.unidad, origen: a.origen, codigo: a.codigo } };
}
// Vuelve a Hoy con la comida desplegada
function volverAHoy() {
  est.abiertas.add(est.anadiendo);
  detenerCamara(); est.anadiendo = null; est.editando = null; est.elegido = null; est.escaner = false; est.offRes = null; pintar(); scrollTo(0, 0);
}
// ----- Cantidad del alimento elegido -----
const gramosElegidos = () => (Number(est.n) || 0) * (est.uds[est.ud]?.g || 1);
// "3 huevos = 180 g" o, si estás en gramos, "≈ 3 huevos"
function equivalencia() {
  const u = est.uds[est.ud], g = gramosElegidos(), base = est.uds[est.uds.length - 1].s;
  if (!(g > 0)) return "";
  if (!u.gramos) return `${textoCantidad(est.n, u)} = <b>${n0(g)} ${base}</b>`;
  const p = est.uds[0];
  if (p.gramos) return "";
  const n = Math.round((g / p.g) * 4) / 4;
  return n >= 0.25 ? `≈ ${textoCantidad(n, p)} <small>(1 ${esc(p.s)} = ${n0(p.g)} ${base})</small>` : "";
}
// Prepara la pantalla de cantidad: unidades del alimento y lo que pusiste la última vez
function prepararCantidad(a, previo) {
  est.elegido = a;
  est.uds = unidadesDe(a);
  const ig = est.uds.length - 1;
  if (previo?.ud) {
    const i = est.uds.findIndex((u) => u.s === previo.ud);
    if (i >= 0) { est.ud = i; est.n = previo.udN; return; }
  }
  if (previo?.cant > 0) {
    // Si lo anotaste en gramos y cuadra con una unidad (180 g = 3 huevos), lo enseño en unidades
    const u0 = est.uds[0], n = previo.cant / u0.g;
    if (!u0.gramos && Math.abs(n * 2 - Math.round(n * 2)) < 0.02 && n >= 0.5) { est.ud = 0; est.n = Math.round(n * 2) / 2; }
    else { est.ud = ig; est.n = Math.round(previo.cant); }
    return;
  }
  est.ud = 0;
  est.n = est.uds[0].gramos ? (a.racion || 100) : est.uds[0].def || 1;
}
// La última vez que comiste ese alimento (para proponer la misma cantidad)
// (primero la de esta misma comida: el desayuno de siempre)
function ultimaVez(nombre) {
  const r = est.rec && [...est.rec.enEsta, ...est.rec.otras].find((x) => x.a.nombre === nombre);
  if (r) return r.e;
  const d = D.diario();
  for (const f of Object.keys(d).sort().reverse()) for (const e of [...d[f]].reverse()) if (e.nombre === nombre) return e;
  return null;
}
function refrescarCantidad() {
  const prev = caja.querySelector("#nutri-prev"), eq = caja.querySelector("#nutri-equiv");
  if (prev) prev.innerHTML = previa(D.porciones(est.elegido, gramosElegidos()));
  if (eq) eq.innerHTML = equivalencia();
}
// Lo que se guarda en el diario de la cantidad elegida
function datosCantidad() {
  const u = est.uds[est.ud], g = Math.round(gramosElegidos() * 10) / 10;
  return { cant: g, ud: u.gramos ? null : u.s, udPl: u.gramos ? null : u.pl, udN: u.gramos ? null : Number(est.n), udG: u.gramos ? null : u.g };
}
const previa = (t) => `<div><span>kcal</span><b>${n0(t.kcal)}</b></div><div><span>Prot.</span><b>${n1(t.p)} <small>g</small></b></div><div><span>Carbos</span><b>${n1(t.c)} <small>g</small></b></div><div><span>Grasa</span><b>${n1(t.g)} <small>g</small></b></div>`;

// ----- PROGRESO -----
function htmlRevision() {
  const p = D.perfil();
  const id = D.idRevision();
  const hecha = D.revisiones().find((r) => r.id === id);
  const fecha = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  if (hecha) {
    return `<section class="tarjeta-entreno nutri-rev"><div class="nutri-rev-cab"><h2>Revisión del ${fecha(hecha.id)}</h2><span class="etq">${hecha.aplicada ? "Aplicada" : "Mantenida"}</span></div>
      <p class="nota">${esc(hecha.resumen)}</p></section>`;
  }
  const r = D.calcularRevision(p);
  const cab = `<div class="nutri-rev-cab"><h2>Revisión de la semana ${fecha(r.desde)}–${fecha(r.hasta)}</h2><span class="etq">Nueva</span></div>`;
  if (!r.suficiente) {
    return `<section class="tarjeta-entreno nutri-rev">${cab}
      <p class="nota">Todavía no hay datos para revisar tu objetivo. Para la primera revisión necesito:</p>
      <ul class="nutri-faltan">${r.faltan.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      <p class="nota">Mientras tanto, tu objetivo sigue en el cálculo inicial. Volveré a mirarlo cada lunes.</p></section>`;
  }
  const cambioTxt = r.cambioKcal === 0 ? `Mantengo tu objetivo.` : `${r.cambioKcal > 0 ? "Subo" : "Bajo"} tu objetivo ${Math.abs(r.cambioKcal)} kcal al día.`;
  return `<section class="tarjeta-entreno nutri-rev">${cab}
    <dl class="nutri-datos nutri-rev-datos">
      <div><dt>Días anotados</dt><dd>${r.diasAnotados} de 7</dd></div>
      <div><dt>Calorías medias</dt><dd>${n0(r.kcalMedia)} kcal</dd></div>
      <div><dt>Peso (media 7 días)</dt><dd>${n1(r.pesoAntes)} → ${n1(r.pesoAhora)} kg</dd></div>
      <div><dt>Ritmo</dt><dd>${r.dKg > 0 ? "+" : ""}${n1(r.dKg)} kg/sem (${n1(r.pct)} %)</dd></div>
      <div><dt>Gasto real estimado</dt><dd>${n0(r.gasto)} kcal/día</dd></div>
    </dl>
    <div class="nutri-rev-veredicto"><b>${esc(r.veredicto)}</b> ${cambioTxt}</div>
    <button type="button" class="boton-principal" data-acc="rev-aplicar">${r.cambioKcal === 0 ? "Entendido" : "Aplicar"}</button>
    ${r.cambioKcal === 0 ? "" : `<button type="button" class="boton-secundario" data-acc="rev-mantener">Mantener el actual</button>`}
    <p class="nota">El gasto real sale de lo que comes y de cuánto cambia tu peso (1 kg ≈ 7.700 kcal). Es una estimación: mejora cuantas más semanas anotes.</p></section>`;
}
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
  if (!dias.length) return `${htmlRevision()}<section class="tarjeta-entreno"><h2>Tu peso</h2><p class="nota">Pésate por la mañana en ayunas y anótalo aquí. Con unas semanas de datos calculo tu gasto real y ajusto tu objetivo.</p></section>${form}${htmlAtajo()}`;
  return `${htmlRevision()}<section class="tarjeta-entreno"><h2>Peso · media de 7 días</h2>
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
    case "semana": { const n = D.sumarDias(est.fecha, Number(v)); est.fecha = n > D.hoy() ? D.hoy() : n; pintar(); break; }
    case "ir-dia": est.fecha = v; pintar(); break;
    case "ir-dia-hoy": est.fecha = v; est.sub = "hoy"; pintar(); scrollTo(0, 0); break;
    case "anadir": est.rec = null; est.editando = null; est.anadiendo = v; est.busca = ""; est.elegido = null; est.creando = false; est.escaner = false; est.offRes = null; est.offMsg = ""; prepararBuscador(); pintar(); scrollTo(0, 0); break;
    case "cerrar": detenerCamara(); est.anadiendo = null; est.editando = null; est.elegido = null; est.escaner = false; est.offRes = null; est.offMsg = ""; pintar(); break;
    case "escaner": est.sinCamara = false; est.escaner = true; est.escMsg = "Abriendo la cámara…"; pintar(); break;
    case "escaner-cerrar": detenerCamara(); est.escaner = false; pintar(); break;
    case "codigo-buscar": detenerCamara(); buscarCodigo(est.codigoManual); break;
    case "off-buscar": buscarEnOff(); break;
    case "quitar": D.quitar(est.fecha, v); pintar(); break;
    case "plegar": est.abiertas.has(v) ? est.abiertas.delete(v) : est.abiertas.add(v); pintar(); break;
    case "editar": {
      const e = D.dia(est.fecha).find((x) => x.id === v);
      if (!e) break;
      // El alimento con sus valores por 100 g (de tu lista, o de lo que se guardó al anotarlo)
      let a = todosAlimentos().find((x) => x.nombre === e.nombre) || (e.base ? { ...e.base, nombre: e.nombre } : null);
      if (!a && e.cant > 0) { const k = 100 / e.cant; a = { nombre: e.nombre, kcal: e.kcal * k, p: (e.p || 0) * k, c: (e.c || 0) * k, g: (e.g || 0) * k, az: (e.az || 0) * k, fi: (e.fi || 0) * k }; }
      if (!a) break;
      est.editando = e.id; est.editandoDe = e.comida; est.anadiendo = e.comida;
      prepararCantidad(a, e); pintar(); scrollTo(0, 0); break;
    }
    case "mover": est.anadiendo = v; pintar(); break;
    case "ud": {
      const g = gramosElegidos(), u = est.uds[Number(v)];
      est.ud = Number(v);
      est.n = u.gramos ? Math.round(g) || 100 : (g > 0 ? Math.max(0.5, Math.round((g / u.g) * 2) / 2) : u.def || 1);
      pintar(); break;
    }
    case "rapida": est.n = Number(v); pintar(); break;
    case "menos": case "mas": {
      const u = est.uds[est.ud], sube = b.dataset.acc === "mas", n = Number(est.n) || 0;
      if (u.gramos) est.n = Math.max(5, Math.round(n / 10) * 10 + (sube ? 10 : -10));
      else est.n = sube ? (n < 1 ? n + 0.5 : Math.floor(n) + 1) : n <= 1 ? 0.5 : Math.ceil(n) - 1;
      pintar(); break;
    }
    case "quitar-editando": D.quitar(est.fecha, est.editando); est.editando = null; est.anadiendo = null; est.elegido = null; pintar(); break;
    case "copiar": D.copiarDia(D.sumarDias(est.fecha, -1), est.fecha); pintar(); break;
    case "elegir": {
      const a = est.vistos?.get(v);
      if (a) { prepararCantidad(a, ultimaVez(a.nombre)); pintar(); scrollTo(0, 0); }
      break;
    }
    case "rec-anadir": {
      const a = est.vistos?.get(v), e = a && ultimaVez(a.nombre);
      if (!e) break;
      D.anadir(est.fecha, entradaDe(a, e)); est.abiertas.add(est.anadiendo);
      // Se queda en el buscador por si quieres añadir más; el + se marca hecho
      b.textContent = "✓"; b.disabled = true; b.classList.add("hecho");
      caja.querySelector(".nutri-repetir")?.remove(); // ya empezaste esta comida: repetirla entera duplicaría cosas
      break;
    }
    case "repetir": D.copiarDia(v, est.fecha, est.anadiendo); volverAHoy(); break;
    case "menu-anadir": D.anadirComida(est.fecha, v, est.anadiendo); volverAHoy(); break;
    case "menu-borrar": {
      const m = D.guardadas().find((x) => x.id === v);
      // Pide un segundo toque para no borrarla por error
      if (m && b.dataset.seguro) { D.borrarComida(v); pintarResultados(); }
      else { b.dataset.seguro = "1"; b.textContent = "Borrar"; b.classList.add("seguro"); }
      break;
    }
    case "guardar-comida": est.guardando = v; pintar(); caja.querySelector('.nutri-guardar input')?.select(); break;
    case "guardar-cancelar": est.guardando = null; pintar(); break;
    case "volver-lista": est.elegido = null; prepararBuscador(); pintar(); break;
    case "crear": est.creando = true; pintar(); break;
    case "cancelar-crear": est.creando = false; pintar(); break;
    case "confirmar": {
      const a = est.elegido, cant = datosCantidad();
      if (!(cant.cant > 0)) return;
      if (est.editando) D.actualizar(est.fecha, est.editando, { comida: est.anadiendo, ...cant, ...D.porciones(a, cant.cant) });
      else D.anadir(est.fecha, { comida: est.anadiendo, nombre: a.nombre, ...cant, ...D.porciones(a, cant.cant), base: { id: a.id, nombre: a.nombre, kcal: a.kcal, p: a.p, c: a.c, g: a.g, az: a.az, fi: a.fi, racion: a.racion, unidad: a.unidad, origen: a.origen, codigo: a.codigo } });
      volverAHoy(); break;
    }
    case "rev-aplicar": case "rev-mantener": {
      const p = D.perfil(), r = D.calcularRevision(p);
      if (!r.suficiente) break;
      const aplicar = b.dataset.acc === "rev-aplicar" && r.cambioKcal !== 0;
      if (aplicar) D.guardarPerfil({ deficit: r.nuevoDeficit });
      D.guardarRevision({ id: r.id, aplicada: aplicar, deficitAntes: p.deficit, deficitDespues: aplicar ? r.nuevoDeficit : p.deficit, gasto: r.gasto, dKg: r.dKg,
        resumen: `${r.veredicto} Peso ${n1(r.pesoAntes)} → ${n1(r.pesoAhora)} kg, gasto real ≈ ${n0(r.gasto)} kcal/día. ${aplicar ? `Objetivo ${r.cambioKcal > 0 ? "+" : "−"}${Math.abs(r.cambioKcal)} kcal.` : "Objetivo sin cambios."}` });
      pintar(); break;
    }
    case "atajo-preparar": atajoPreparar(); break;
    case "atajo-copiar": navigator.clipboard?.writeText(est.atajoUrl).then(() => { b.textContent = "¡Copiado!"; }, () => { b.textContent = "No se pudo copiar: mantén pulsado el enlace"; }); break;
    case "borrar-peso": D.borrarPeso(v); pintar(); break;
  }
}
function alEscribir(e) {
  const c = e.target.dataset.campo;
  if (c === "busca") {
    est.busca = e.target.value; est.offMsg = ""; est.offRes = null; est.offPide = null; // lo de supermercado era de otra búsqueda
    if (est.escaner) { detenerCamara(); est.escaner = false; pintarAnadir(); return; }
    // Espera a que dejes de teclear un instante y repinta solo la lista
    clearTimeout(est.reloj); est.reloj = setTimeout(pintarResultados, 90);
  }
  else if (c === "codigo") est.codigoManual = e.target.value;
  else if (c === "n") {
    // Acepta "1,5", "1.5" o "½"
    const t = e.target.value.trim().replace(",", ".").replace("½", ".5").replace("¼", ".25").replace("¾", ".75");
    est.n = Number(t) || 0;
    refrescarCantidad();
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
  } else if (f.dataset.form === "guardar-comida") {
    const l = D.dia(est.fecha).filter((x) => x.comida === est.guardando);
    if (l.length) D.guardarComida(d.nombre.trim() || `Mi ${est.guardando.toLowerCase()}`, l);
    est.guardando = null; pintar();
  } else if (f.dataset.form === "crear") {
    const a = D.guardarPropio({ nombre: d.nombre.trim(), kcal: num(d.kcal) || 0, p: num(d.p) || 0, c: num(d.c) || 0, g: num(d.g) || 0, az: num(d.az) || 0, fi: num(d.fi) || 0,
      racion: num(d.racion) > 0 ? num(d.racion) : null, unidad: d.unidad?.trim() || (num(d.racion) > 0 ? "ración" : null) });
    est.creando = false; prepararCantidad(a); pintar();
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
    if (p) { est.escaner = false; prepararCantidad(p, ultimaVez(p.nombre)); pintar(); scrollTo(0, 0); return; }
    detenerCamara();
    mensajeEscaner(`No encuentro el código ${codigo} en Open Food Facts. Puedes crearlo tú con «Crear alimento nuevo» (queda guardado).`);
  } catch (e) {
    mensajeEscaner(navigator.onLine ? `No pude consultar Open Food Facts (${e.message}).` : "Sin conexión: no puedo buscar productos nuevos. Los que ya usaste siguen en Recientes.");
  }
}
// Búsqueda de productos por nombre
async function buscarEnOff() {
  const texto = est.busca.trim(), pide = {}; est.offPide = pide;
  est.offMsg = "Buscando…"; est.offRes = null; pintarResultados();
  let res = null, msg = "";
  try {
    res = await off.buscar(texto);
    msg = res.length ? "" : "No encuentro productos con ese nombre.";
  } catch (e) { msg = navigator.onLine ? `No pude consultar Open Food Facts (${e.message}).` : "Sin conexión."; }
  if (est.offPide !== pide) return; // mientras tanto cambiaste la búsqueda: esta respuesta ya no vale
  est.offRes = res; est.offMsg = msg; pintarResultados();
}
