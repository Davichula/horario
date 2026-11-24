// =====================================================================
// entreno/hoy.js — tu PLAN DEL DÍA y el SEMÁFORO de recuperación
// ---------------------------------------------------------------------
// Aquí solo se CALCULA (sin dibujar casi nada). Lo usan tres sitios:
//   - Nutrición → Hoy: qué comer antes y después del entreno de hoy.
//   - Entreno → Hoy: el semáforo (verde / ámbar / rojo) y el porqué.
//   - Horario: una línea resumen encima del calendario (hoy-linea.js).
//
// PLAN DEL DÍA
//   Mira el entreno que tienes planeado hoy en Planes, estima cuántas
//   calorías vas a gastar (con lo que sueles gastar tú en ese deporte) y
//   lo suma a tu objetivo de Nutrición ANTES de entrenar. Cuando Garmin
//   manda la actividad real, se usa lo que gastaste de verdad.
//
// SEMÁFORO
//   Junta varias señales y a cada una le pone un color:
//     cansancio acumulado (frescura), subida de carga, días seguidos,
//     la comida de ayer, sueño / VFC / Body Battery (si el reloj los
//     tiene) y tus respuestas de la mañana (sensaciones).
//   Cada señal suma puntos: verde 0, ámbar 1 (o 2 si es importante),
//   rojo 3. Con 3 o más puntos → rojo; con 2 → ámbar; si no → verde.
// =====================================================================

import * as almacen from "./almacen.js";
import * as an from "./analisis.js";
import * as salud from "./salud.js";
import { listar as listarPlanes, resumenPlan } from "./entrenos.js";
import * as D from "../nutricion/datos.js";

// ---------------------------------------------------------------------
// Tus respuestas de la mañana: { "2026-11-24": { sueno: 2, piernas: 1, ... } }
// (0, 1 o 2 = la opción elegida, de izquierda a derecha)
// ---------------------------------------------------------------------
const CLAVE_SENS = "mi-horario:entreno-sensaciones";
const leerSens = () => { try { return JSON.parse(localStorage.getItem(CLAVE_SENS)) || {}; } catch { return {}; } };
export const sensaciones = (f) => leerSens()[f] || {};
export function guardarSensacion(f, id, valor) {
  const todo = leerSens();
  const dia = { ...todo[f] };
  if (dia[id] === valor) delete dia[id]; else dia[id] = valor; // tocar otra vez la misma la quita
  if (Object.keys(dia).length) todo[f] = dia; else delete todo[f];
  // Solo guardamos los últimos 120 días
  const limite = D.sumarDias(D.hoy(), -120);
  for (const k of Object.keys(todo)) if (k < limite) delete todo[k];
  localStorage.setItem(CLAVE_SENS, JSON.stringify(todo));
}

// Las preguntas de la mañana. Cada opción: [texto, color] (null = no cuenta)
//   color: "verde" | "ambar" | "ambar2" (ámbar importante) | "rojo"
export const PREGUNTAS = [
  { id: "sueno", corto: "sueño", texto: "Sueño", opciones: [["Mal", "ambar"], ["Normal", "verde"], ["Bien", "verde"]], motivo: "has dormido mal" },
  { id: "piernas", corto: "piernas", texto: "Piernas / cuerpo", opciones: [["Cargado", "ambar"], ["Normal", "verde"], ["Fresco", "verde"]], motivo: "notas el cuerpo cargado" },
  { id: "lesion", corto: "lesión", texto: "Molestia de la lesión", opciones: [["Nada", "verde"], ["Algo", "ambar2"], ["Duele", "rojo"]], motivo: "tienes molestias de la lesión" },
  { id: "estres", corto: "estrés", texto: "Estrés", opciones: [["Alto", "ambar"], ["Normal", "verde"], ["Bajo", "verde"]], motivo: "vas con estrés alto" },
  { id: "animo", corto: "ánimo", texto: "Ánimo / ganas de entrenar", opciones: [["Pocas", "ambar"], ["Normales", "verde"], ["Muchas", "verde"]], motivo: "tienes pocas ganas" },
  { id: "salud", corto: "salud", texto: "¿Cómo te encuentras?", opciones: [["Bien", "verde"], ["Regular", "ambar2"], ["Enfermo", "rojo"]], motivo: "no te encuentras bien" },
];

// ---------------------------------------------------------------------
// Calorías de entreno de un día: las reales (Garmin) + lo previsto de los
// planes que aún no has hecho (solo hoy y días futuros)
// ---------------------------------------------------------------------
const KCAL_HORA = { correr: 700, bici: 550, nadar: 500 }; // si aún no hay historial
const FACTOR = { suave: 0.85, medio: 1, duro: 1.12 };
let cacheKcalHora = null;
function kcalPorHora(deporte) {
  if (!cacheKcalHora || cacheKcalHora.t < Date.now() - 60e3) {
    const v = {};
    const desde = Date.now() - 365 * 864e5;
    for (const a of almacen.listar()) {
      if (!a.calorias || !a.duracion || a.duracion < 900 || new Date(a.inicio).getTime() < desde) continue;
      (v[a.deporte] ||= []).push(a.calorias / (a.duracion / 3600));
    }
    const mediana = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    cacheKcalHora = { t: Date.now(), m: Object.fromEntries(Object.entries(v).filter(([, xs]) => xs.length >= 3).map(([k, xs]) => [k, mediana(xs)])) };
  }
  return cacheKcalHora.m[deporte] || KCAL_HORA[deporte] || 500;
}

const actividadesDe = (f) => almacen.listar().filter((a) => D.aTexto(new Date(a.inicio)) === f);
const intensidadPorCarga = (tss) => (tss < 40 ? "suave" : tss < 80 ? "medio" : "duro");

// Lo que entrenas un día: lo hecho y lo planeado que falta
export function entrenoDelDia(f) {
  const hechas = actividadesDe(f);
  const u = hechas.length ? an.umbrales() : null;
  const hecho = hechas.map((a) => {
    const tss = an.cargaDe(a, u).tss;
    return { nombre: a.nombre, deporte: a.deporte, calorias: a.calorias || 0, duracion: a.duracion, intensidad: intensidadPorCarga(tss), hecho: true, inicio: new Date(a.inicio) };
  });
  const planes = listarPlanes().filter((w) => w.fecha === f && w.pasos?.length);
  const pendientes = [];
  if (f >= D.hoy()) {
    const deportesHechos = new Set(hechas.map((a) => a.deporte));
    for (const w of planes) {
      if (deportesHechos.has(w.deporte)) continue; // ya lo hiciste (Garmin lo ha traído)
      const r = resumenPlan(w);
      const calorias = Math.round((kcalPorHora(w.deporte) * r.tiempo) / 3600 * FACTOR[r.intensidad]);
      pendientes.push({ id: w.id, nombre: w.nombre, deporte: w.deporte, calorias, duracion: r.tiempo, intensidad: r.intensidad, hora: w.hora || null, hecho: false });
    }
  }
  const todo = [...hecho, ...pendientes];
  const orden = ["descanso", "suave", "medio", "duro"];
  const tipo = todo.reduce((m, x) => (orden.indexOf(x.intensidad) > orden.indexOf(m) ? x.intensidad : m), "descanso");
  return { hecho, pendientes, todo, tipo, kcal: todo.reduce((s, x) => s + x.calorias, 0) };
}
// Para Nutrición: { total, lista:[{nombre, calorias, previsto}] }
export function kcalEntreno(f) {
  const e = entrenoDelDia(f);
  return { total: e.kcal, lista: e.todo.map((x) => ({ nombre: x.nombre, calorias: x.calorias, previsto: !x.hecho })) };
}

// ---------------------------------------------------------------------
// PLAN DEL DÍA: objetivo y qué comer alrededor del entreno
// ---------------------------------------------------------------------
export const TIPO_DIA = {
  descanso: { nombre: "Descanso", color: "var(--suave)" },
  suave: { nombre: "Día suave", color: "var(--acento)" },
  medio: { nombre: "Día medio", color: "var(--c-potencia, #f5b942)" },
  duro: { nombre: "Día duro", color: "var(--c-pulso, #ff5a5f)" },
};
const hhmm = (min) => { min = Math.max(0, Math.round(min / 5) * 5); return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; };
const aMin = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };

// Ejemplos genéricos (mientras no haya suficientes cosas tuyas en el diario)
const GENERICOS = {
  antes: [["🍞", "2 tostadas con miel"], ["🍌", "Plátano"], ["🥣", "Avena con un poco de leche"]],
  antesCorto: [["🍌", "Plátano"], ["🍯", "1 tostada con miel"]],
  durante: [["🍌", "Plátano"], ["🥤", "Bebida isotónica"], ["🍬", "Gel o dátiles"]],
  despues: [["🍚", "Arroz con pollo"], ["🥛", "Skyr + avena + fruta"], ["🥪", "Bocadillo de pavo y un zumo"]],
};

// Alimentos que comes a menudo (los de tu diario, con sus valores por 100 g)
function tusAlimentos() {
  const cuenta = new Map();
  const d = D.diario();
  const desde = D.sumarDias(D.hoy(), -60);
  for (const f of Object.keys(d)) {
    if (f < desde) continue;
    for (const e of d[f]) {
      if (!e.base || !e.base.kcal) continue;
      const x = cuenta.get(e.nombre) || { nombre: e.nombre, base: e.base, veces: 0, g: e.cant };
      x.veces++; cuenta.set(e.nombre, x);
    }
  }
  return [...cuenta.values()].filter((x) => x.veces >= 2).sort((a, b) => b.veces - a.veces);
}
const red10 = (g) => Math.max(10, Math.round(g / 10) * 10);
// Ejemplos tuyos para antes (carbos fáciles: mucho carbohidrato, poca grasa y poca fibra)
function tuyosAntes(carbos) {
  return tusAlimentos().filter(({ base: b }) => (b.c || 0) >= 15 && (b.c * 4) / b.kcal >= 0.6 && (b.g || 0) <= 5 && (b.fi || 0) <= 6)
    .map((x) => ({ nombre: x.nombre, g: red10(Math.min(250, (carbos * 0.6 * 100) / x.base.c)), tuyo: true })).slice(0, 2);
}
// ... y para después (algo con mucha proteína)
function tuyosDespues(prot) {
  return tusAlimentos().filter(({ base: b }) => (b.p || 0) >= 8 && (b.p * 4) / b.kcal >= 0.3)
    .map((x) => ({ nombre: x.nombre, g: red10(Math.min(300, (prot * 0.8 * 100) / x.base.p)), tuyo: true })).slice(0, 2);
}
function mezclar(tuyos, genericos) {
  const r = [...tuyos];
  for (const [emoji, nombre] of genericos) { if (r.length >= 3) break; r.push({ emoji, nombre }); }
  return r;
}

export function planDelDia(f = D.hoy()) {
  const p = D.perfil();
  const e = entrenoDelDia(f);
  const obj = D.objetivoDia(p, e.kcal);
  const base = D.objetivoDia(p, 0);
  const peso = p.peso || 70;
  const res = { fecha: f, entreno: e, tipo: e.tipo, obj, base, pasos: [], consejos: [] };
  if (e.tipo === "descanso") {
    res.consejos = [
      "Hoy no hacen falta tantos carbos: tu objetivo ya lo tiene en cuenta.",
      `Reparte la proteína en 4 tomas de unos ${Math.round((obj?.prot || 140) / 4)} g.`,
      "Buen día para verdura, fruta y fibra.",
    ];
    return res;
  }
  // El entreno principal del día (el más duro que falta, o el más duro hecho)
  const orden = { suave: 1, medio: 2, duro: 3 };
  const prin = [...(e.pendientes.length ? e.pendientes : e.hecho)].sort((a, b) => orden[b.intensidad] - orden[a.intensidad])[0];
  res.principal = prin;
  const durMin = (prin.duracion || 3600) / 60;
  const carbosDespues = Math.round(peso * { suave: 0.5, medio: 0.8, duro: 1 }[prin.intensidad]);
  const protDespues = Math.round(peso * 0.4);

  if (!prin.hecho) {
    const inicio = prin.hora ? aMin(prin.hora) : null;
    const pronto = inicio != null && inicio < 9 * 60; // entrenas nada más levantarte
    const carbosAntes = Math.round(peso * (pronto || prin.intensidad === "suave" ? 0.4 : 0.8));
    res.pasos.push({
      clase: "antes", hora: inicio != null ? (pronto ? "Al levantarte" : `${hhmm(inicio - 90)} · 1,5 h antes`) : "1,5 h antes",
      titulo: "Carbos fáciles, poca grasa", texto: `~${carbosAntes} g de carbohidratos`,
      ejemplos: mezclar(tuyosAntes(carbosAntes), pronto ? GENERICOS.antesCorto : GENERICOS.antes),
    });
    let titulo = "Solo agua", texto = "Con menos de 1 h no hace falta comer.";
    if (durMin >= 90) { titulo = "Agua y carbos"; texto = `${prin.intensidad === "suave" ? 30 : 60} g de carbos por hora, desde la primera media hora.`; }
    else if (durMin >= 60) { titulo = prin.intensidad === "duro" ? "Agua y algo de carbos" : "Agua"; texto = prin.intensidad === "duro" ? "Unos 30 g de carbos a mitad (bebida o un gel)." : "Bebe a sorbos; no hace falta comer."; }
    if (prin.deporte === "nadar") texto += " Deja una botella en el borde y bebe en las pausas.";
    res.pasos.push({ clase: "durante", hora: `${inicio != null ? hhmm(inicio) + " · " : ""}${prin.nombre}`, titulo, texto, ejemplos: durMin >= 90 ? mezclar([], GENERICOS.durante) : [] });
    res.pasos.push({
      clase: "despues", hora: inicio != null ? `${hhmm(inicio + durMin + 15)} · en la hora siguiente` : "En la hora siguiente",
      titulo: "Proteína + carbos para recuperar", texto: `~${protDespues} g de proteína y ~${carbosDespues} g de carbos`,
      ejemplos: mezclar(tuyosDespues(protDespues), GENERICOS.despues),
    });
  } else {
    const fin = new Date(prin.inicio.getTime() + (prin.duracion || 0) * 1000);
    res.pasos.push({ clase: "durante", hora: `Hecho · ${prin.nombre}`, titulo: `${Math.round(prin.calorias)} kcal según Garmin`, texto: "Tu objetivo de hoy ya cuenta lo que gastaste de verdad.", ejemplos: [] });
    const horasDesde = (Date.now() - fin) / 36e5;
    if (f === D.hoy() && horasDesde < 3) res.pasos.push({
      clase: "despues", hora: `${hhmm(fin.getHours() * 60 + fin.getMinutes() + 15)} · en la hora siguiente`,
      titulo: "Proteína + carbos para recuperar", texto: `~${protDespues} g de proteína y ~${carbosDespues} g de carbos`,
      ejemplos: mezclar(tuyosDespues(protDespues), GENERICOS.despues),
    });
  }
  return res;
}

// ---------------------------------------------------------------------
// SEMÁFORO
// ---------------------------------------------------------------------
const PUNTOS = { verde: 0, ambar: 1, ambar2: 2, rojo: 3, gris: 0 };
const colorBase = (c) => (c === "ambar2" ? "ambar" : c);
export const COLORES = { verde: "var(--acento)", ambar: "var(--sem-ambar, #f5b942)", rojo: "var(--sem-rojo, #ff5a5f)", gris: "var(--suave)" };
const n0 = (x) => Math.round(x).toLocaleString("es-ES");

export function semaforo(f = D.hoy()) {
  const factores = [];
  const add = (x) => factores.push(x);

  // 1. Cansancio acumulado y subida de carga (de tus actividades)
  const dias = an.diario();
  const hoyD = dias.at(-1);
  if (dias.length >= 14 && hoyD) {
    const tsb = hoyD.tsb;
    const z = an.zonaForma(tsb);
    add({ id: "tsb", nombre: "Cansancio acumulado", color: tsb < -30 ? "rojo" : tsb < -20 ? "ambar" : "verde", valor: z.nombre, sub: `frescura ${tsb > 0 ? "+" : ""}${n0(tsb)}`,
      motivo: tsb < -30 ? "vas muy cargado de los últimos días" : "llevas bastante cansancio acumulado" });
    const r = an.riesgo(dias);
    if (r && r.acwr != null && r.nivel !== "neutro")
      add({ id: "subida", nombre: "Subida de carga", color: r.nivel === "alto" ? "rojo" : r.nivel === "medio" ? "ambar" : "verde",
        valor: r.nivel === "alto" ? "Muy rápida" : r.nivel === "medio" ? "Rápida" : r.nivel === "bajo" ? "Bajando" : "Segura",
        sub: `×${r.acwr.toLocaleString("es-ES", { maximumFractionDigits: 1 })} vs tu normal`, motivo: "has subido la carga muy deprisa" });
    // Días seguidos entrenando (hasta ayer)
    let seguidos = 0;
    for (let i = dias.length - 2; i >= 0 && dias[i].carga >= 20; i--) seguidos++;
    if (seguidos >= 4) add({ id: "seguidos", nombre: "Días seguidos", color: seguidos >= 6 ? "ambar2" : "ambar", valor: `${seguidos} días`, sub: "sin descanso", motivo: `llevas ${seguidos} días seguidos entrenando` });
  } else add({ id: "tsb", nombre: "Cansancio acumulado", color: "gris", valor: "Pocos datos", sub: "faltan 2 semanas de entrenos" });

  // 2. La comida de ayer frente a su objetivo
  const ayer = D.sumarDias(f, -1);
  const comido = D.totales(D.dia(ayer));
  const objAyer = D.objetivoDia(D.perfil(), entrenoDelDia(ayer).kcal);
  if (!objAyer) add({ id: "comida", nombre: "Comida de ayer", color: "gris", valor: "Sin objetivo", sub: "rellénalo en Nutrición" });
  else if (comido.kcal < 800) add({ id: "comida", nombre: "Comida de ayer", color: "gris", valor: comido.kcal ? "A medias" : "Sin anotar", sub: "anótala en Nutrición" });
  else {
    const pct = comido.kcal / objAyer.kcal, pctC = objAyer.carbos ? comido.c / objAyer.carbos : 1;
    const entrenoAyer = objAyer.extra > 0;
    const color = pct < 0.6 ? "ambar2" : pct < 0.8 || (entrenoAyer && pctC < 0.7) ? "ambar" : "verde";
    add({ id: "comida", nombre: "Comida de ayer", color, valor: `${n0(pct * 100)} % del objetivo`,
      sub: pct < 0.8 ? `${n0(objAyer.kcal - comido.kcal)} kcal de menos` : entrenoAyer && pctC < 0.7 ? "carbos algo cortos" : pct > 1.15 ? "algo por encima" : "bien",
      motivo: pct < 0.8 ? `ayer comiste ${n0(objAyer.kcal - comido.kcal)} kcal menos de lo previsto` : "ayer te quedaste corto de carbos" });
  }

  // 3. Lo que sabe el reloj (solo si duermes con él)
  const s = salud.enCache().find((d) => d.fecha === f) || {};
  const sens = sensaciones(f);
  let hayReloj = false;
  if (s.sueno?.total) {
    hayReloj = true;
    const h = s.sueno.total / 3600;
    add({ id: "sueno", nombre: "Sueño (reloj)", color: h < 5 ? "rojo" : h < 6.5 ? "ambar" : "verde", valor: `${h.toLocaleString("es-ES", { maximumFractionDigits: 1 })} h`, sub: s.sueno.puntuacion ? `nota ${s.sueno.puntuacion}` : "", motivo: "has dormido poco" });
  }
  if (s.vfc?.noche) {
    const previos = salud.enCache().filter((d) => d.fecha < f && d.fecha >= D.sumarDias(f, -28) && d.vfc?.noche).map((d) => d.vfc.noche);
    if (previos.length >= 7) {
      hayReloj = true;
      const normal = previos.reduce((a, b) => a + b, 0) / previos.length, r = s.vfc.noche / normal;
      add({ id: "vfc", nombre: "VFC nocturna", color: r < 0.75 ? "rojo" : r < 0.88 ? "ambar" : "verde", valor: `${n0(s.vfc.noche)} ms`, sub: `tu normal ${n0(normal)}`, motivo: "tu VFC está por debajo de lo normal" });
    }
  }
  if (s.bbMax != null && salud.fiable(s) && s.sueno?.total) {
    hayReloj = true;
    add({ id: "bb", nombre: "Body Battery", color: s.bbMax < 25 ? "rojo" : s.bbMax < 45 ? "ambar" : "verde", valor: `${n0(s.bbMax)}`, sub: "al despertar", motivo: "tu Body Battery está baja" });
  }
  if (!hayReloj) add({ id: "reloj", nombre: "VFC y Body Battery", color: "gris", valor: "Sin datos", sub: "reloj no puesto de noche" });

  // 4. Tus respuestas de la mañana
  //    (las que van bien se juntan en una sola fila, para no llenar la lista)
  const bien = [];
  for (const q of PREGUNTAS) {
    if (sens[q.id] == null) continue;
    if (q.id === "sueno" && s.sueno?.total) continue; // manda el reloj
    const [texto, color] = q.opciones[sens[q.id]];
    if (color === "verde") bien.push(q.corto);
    else add({ id: q.id, nombre: `${q.texto} (tú)`, color, valor: texto, sub: "", motivo: q.motivo });
  }
  if (bien.length) add({ id: "sens", nombre: "Tus sensaciones", color: "verde", valor: "Bien", sub: bien.join(", ") });

  // Resultado
  const puntos = factores.reduce((s2, x) => s2 + PUNTOS[x.color], 0);
  const color = factores.some((x) => x.color === "rojo") || puntos >= 3 ? "rojo" : puntos >= 2 ? "ambar" : "verde";
  const malos = factores.filter((x) => x.color !== "verde" && x.color !== "gris").sort((a, b) => PUNTOS[b.color] - PUNTOS[a.color]);
  const motivos = malos.slice(0, 2).map((x) => x.motivo);
  const plan = entrenoDelDia(f).pendientes.sort((a, b) => ({ suave: 1, medio: 2, duro: 3 }[b.intensidad] - { suave: 1, medio: 2, duro: 3 }[a.intensidad]))[0] || null;
  const frase = (l) => (l.length ? l.join(" y ") : "");
  const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  let titulo, texto, consejo;
  if (color === "verde") {
    titulo = "Verde · puedes apretar";
    texto = malos.length ? `Vas bien, aunque ${malos[0].motivo}.` : "Todo en orden: llegas bien recuperado.";
    consejo = plan ? (plan.intensidad === "suave" ? `Haz tu ${plan.nombre.toLowerCase()} tranquilo; si te encuentras bien puedes alargarlo un poco.` : `Buen día para ${plan.nombre}.`) : "Si te apetece, buen día para un entreno de calidad.";
  } else if (color === "ambar") {
    titulo = "Ámbar · entreno suave";
    texto = `${mayus(frase(motivos))}.`;
    consejo = plan && plan.intensidad !== "suave" ? `Mejor cambia ${plan.nombre} por algo suave: 30–40 min fácil (zona 1–2) o técnica.` : "Hoy mejor algo suave o descanso activo (paseo, movilidad).";
  } else {
    titulo = "Rojo · descansa";
    texto = `${mayus(frase(motivos))}.`;
    consejo = "Hoy mejor descansar, o solo movilidad y estiramientos suaves.";
    if (sens.lesion === 2) consejo += " Si la molestia sigue unos días, consulta con un fisio.";
    if (sens.salud === 2) consejo += " Si tienes fiebre o te notas el pecho, nada de entrenar.";
  }
  const contestadas = PREGUNTAS.filter((q) => sens[q.id] != null).length;
  return { fecha: f, color, titulo, texto, consejo, factores, plan, contestadas, colorCss: COLORES[color], colorBase };
}

// =====================================================================
// Entreno → Hoy (la pantalla del semáforo)
// =====================================================================
import { DEPORTES } from "./fit.js";
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const durTexto = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
export const iconoDeporte = (d) => (DEPORTES[d] || DEPORTES.otro)?.svg || "";

export function pintarHoy(cont) {
  const f = D.hoy();
  const dibujar = () => {
    const s = semaforo(f);
    const sens = sensaciones(f);
    const e = entrenoDelDia(f);
    const todas = s.contestadas === PREGUNTAS.length;
    const preguntas = `<section class="tarjeta-entreno hoy-preguntas">
      ${todas ? `<details><summary><h2>Tus sensaciones de hoy <span class="hoy-ok">✓</span></h2><span class="ver-mas">Cambiar</span></summary>` : `<h2>¿Cómo te levantas hoy?</h2>`}
      ${PREGUNTAS.map((q) => `<div class="hoy-q">${q.texto}</div><div class="hoy-opc" role="group" aria-label="${q.texto}">
        ${q.opciones.map(([t], i) => `<button type="button" data-sens="${q.id}" data-v="${i}" class="${sens[q.id] === i ? "activo" : ""}" aria-pressed="${sens[q.id] === i}">${t}</button>`).join("")}</div>`).join("")}
      <p class="nota">Unos toques cada mañana. Sustituyen al reloj mientras no duermas con él.</p>
      ${todas ? "</details>" : ""}</section>`;
    const porque = `<section class="tarjeta-entreno"><h2>Por qué</h2>
      ${s.factores.map((x) => `<div class="hoy-factor"><span class="hoy-punto" style="--c:${COLORES[colorBase(x.color)]}"></span><span class="hoy-fn">${esc(x.nombre)}</span>
        <span class="hoy-fv">${esc(x.valor)}${x.sub ? `<br>${esc(x.sub)}` : ""}</span></div>`).join("")}</section>`;
    const entreno = e.todo.length ? `<section class="tarjeta-entreno"><h2>Entreno de hoy</h2>
      ${e.todo.map((x) => `<div class="hoy-plan"><span class="hoy-ico">${iconoDeporte(x.deporte)}</span><div><b>${esc(x.nombre)}</b>
        <div class="nota">${x.hecho ? "Hecho" : x.hora || "Sin hora"} · ${durTexto(x.duracion || 0)} · ${TIPO_DIA[x.intensidad].nombre.replace("Día ", "")} · ${n0(x.calorias)} kcal${x.hecho ? "" : " previstas"}</div></div></div>`).join("")}
      <a class="ver-mas" href="#nutricion">Qué comer hoy ›</a></section>` : "";
    cont.innerHTML = `
      <section class="tarjeta-entreno"><h2>Semáforo de recuperación</h2>
        <div class="hoy-sem"><div class="hoy-luz" style="--c:${s.colorCss}" role="img" aria-label="${esc(s.titulo)}"></div>
        <div><h3>${esc(s.titulo)}</h3><p>${esc(s.texto)}</p></div></div>
        <div class="hoy-consejo">${s.plan ? `<span class="hoy-ico">${iconoDeporte(s.plan.deporte)}</span>` : ""}<p>${esc(s.consejo)}</p></div>
        ${!s.contestadas ? `<p class="nota">Responde las preguntas de abajo para afinarlo.</p>` : ""}
      </section>
      ${todas ? porque + entreno + preguntas : preguntas + porque + entreno}`;
  };
  cont.onclick = (ev) => {
    const b = ev.target.closest("[data-sens]");
    if (!b) return;
    guardarSensacion(f, b.dataset.sens, Number(b.dataset.v));
    const abierto = cont.querySelector(".hoy-preguntas details")?.open;
    dibujar();
    if (abierto) { const d = cont.querySelector(".hoy-preguntas details"); if (d) d.open = true; }
  };
  dibujar();
  // Cuando lleguen los datos de salud de Garmin, redibujamos
  salud.cargar().then(() => { if (cont.isConnected) dibujar(); });
}
