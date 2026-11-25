// =====================================================================
// nutricion/datos.js — guardar tus datos y calcular tu objetivo
// ---------------------------------------------------------------------
// Todo se guarda en localStorage (y se sincroniza con Supabase gracias a
// sincronizar.js, igual que Entreno). Cuatro cajitas:
//   perfil    → tus datos (edad, altura, peso...) y tus ajustes del objetivo
//   diario    → lo que comes: { "2026-11-24": [ {comida, nombre, g, kcal, p, c, gr...} ] }
//   propios   → alimentos que creas tú
//   pesos     → tu peso y % de grasa por día: { "2026-11-24": { kg, grasa } }
//   guardadas → comidas enteras con nombre: [ { id, nombre, items: [...] } ]
// =====================================================================
const K = {
  perfil: "mi-horario:nutricion-perfil",
  diario: "mi-horario:nutricion-diario",
  propios: "mi-horario:nutricion-propios",
  pesos: "mi-horario:nutricion-pesos",
  revisiones: "mi-horario:nutricion-revisiones",
  guardadas: "mi-horario:nutricion-guardadas",
};
const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const escribir = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const PERFIL_BASE = { sexo: "h", edad: null, altura: null, peso: null, grasa: null, factor: 1.4, deficit: 300, protKg: 2, grasaKg: 0.9, pctEntreno: 75 };
// Tu peso y % de grasa de la ficha son siempre los más recientes que hayas anotado
// (a mano o llegados solos desde la báscula), así el objetivo se ajusta solo.
export function perfil() {
  const p = { ...PERFIL_BASE, ...leer(K.perfil, {}) };
  const ps = leer(K.pesos, {});
  const ultimo = Object.keys(ps).sort().reverse().find((f) => ps[f].kg);
  if (ultimo) p.peso = ps[ultimo].kg;
  const conGrasa = Object.keys(ps).sort().reverse().find((f) => ps[f].grasa);
  if (conGrasa) p.grasa = ps[conGrasa].grasa;
  return p;
}
export const guardarPerfil = (p) => escribir(K.perfil, { ...perfil(), ...p });

export const diario = () => leer(K.diario, {});
export const dia = (f) => diario()[f] || [];
export function anadir(f, entrada) {
  const d = diario();
  (d[f] ||= []).push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...entrada });
  escribir(K.diario, d);
}
export function quitar(f, id) {
  const d = diario();
  d[f] = (d[f] || []).filter((e) => e.id !== id);
  if (!d[f].length) delete d[f];
  escribir(K.diario, d);
}
// Cambia una entrada ya anotada (cantidad, unidad o comida)
export function actualizar(f, id, cambios) {
  const d = diario();
  const e = (d[f] || []).find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, cambios);
  escribir(K.diario, d);
}
export function copiarDia(desde, hasta, comida) {
  for (const e of dia(desde).filter((x) => !comida || x.comida === comida)) {
    const { id, ...resto } = e;
    anadir(hasta, resto);
  }
}

// Comidas guardadas: una lista de alimentos con su cantidad, para añadirlos todos de golpe
export const guardadas = () => leer(K.guardadas, []);
export function guardarComida(nombre, entradas) {
  const items = entradas.map(({ id, comida, ...resto }) => resto);
  escribir(K.guardadas, [...guardadas(), { id: Date.now().toString(36), nombre, items }]);
}
export function borrarComida(id) { escribir(K.guardadas, guardadas().filter((m) => m.id !== id)); }
export function anadirComida(f, id, comida) {
  const m = guardadas().find((x) => x.id === id);
  for (const e of m?.items || []) anadir(f, { ...e, comida });
}

export const propios = () => leer(K.propios, []);
export function guardarPropio(a) {
  const l = propios();
  l.push({ ...a, id: "p" + Date.now().toString(36), origen: "propio" });
  escribir(K.propios, l);
  return l[l.length - 1];
}
export function borrarPropio(id) { escribir(K.propios, propios().filter((a) => a.id !== id)); }

export const pesos = () => leer(K.pesos, {});
export function guardarPeso(f, datos) {
  const p = pesos();
  p[f] = { ...p[f], ...datos };
  escribir(K.pesos, p);
}
export function borrarPeso(f) { const p = pesos(); delete p[f]; escribir(K.pesos, p); }

// ----- Fechas (siempre la hora de TU móvil, no UTC) -----
const dos = (n) => String(n).padStart(2, "0");
export const aTexto = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
export const hoy = () => aTexto(new Date());
export function sumarDias(f, n) { const d = new Date(f + "T12:00:00"); d.setDate(d.getDate() + n); return aTexto(d); }

// ----- Cálculos -----
// Suma los nutrientes de una lista de entradas
export function totales(entradas) {
  const t = { kcal: 0, p: 0, c: 0, g: 0, az: 0, fi: 0 };
  for (const e of entradas) for (const k of Object.keys(t)) t[k] += e[k] || 0;
  return t;
}
// Nutrientes de "g" gramos de un alimento (los valores del alimento son por 100 g)
export function porciones(a, gramos) {
  const f = gramos / 100;
  const r = (x) => Math.round((x || 0) * f * 10) / 10;
  return { kcal: Math.round((a.kcal || 0) * f), p: r(a.p), c: r(a.c), g: r(a.g), az: r(a.az), fi: r(a.fi) };
}

// Metabolismo basal: Katch-McArdle si sabemos el % de grasa, si no Mifflin-St Jeor
export function basal(p) {
  if (!p.peso || !p.altura || !p.edad) return null;
  if (p.grasa) return Math.round(370 + 21.6 * p.peso * (1 - p.grasa / 100));
  return Math.round(10 * p.peso + 6.25 * p.altura - 5 * p.edad + (p.sexo === "m" ? -161 : 5));
}
export function objetivoBase(p) {
  const b = basal(p);
  if (!b) return null;
  const mantenimiento = Math.round(b * p.factor);
  const kcal = mantenimiento - p.deficit;
  const prot = Math.round(p.protKg * p.peso);
  const grasa = Math.round(p.grasaKg * p.peso);
  return { basal: b, mantenimiento, kcal, prot, grasa, carbos: Math.max(0, Math.round((kcal - prot * 4 - grasa * 9) / 4)) };
}
// Objetivo de un día concreto: la base + una parte de lo que gastaste entrenando ese día.
// Lo extra se reparte en carbohidratos (en resistencia es lo que más ayuda al rendimiento).
export function objetivoDia(p, kcalEntreno = 0) {
  const base = objetivoBase(p);
  if (!base) return null;
  const extra = Math.round(kcalEntreno * (p.pctEntreno / 100));
  const kcal = base.kcal + extra;
  return { ...base, extra, kcal, carbos: base.carbos + Math.round(extra / 4) };
}
// Media móvil de 7 días del peso (los días con medida dentro de la ventana)
export function mediaPeso(p, hasta, dias = 7) {
  const v = [];
  for (let i = 0; i < dias; i++) { const m = p[sumarDias(hasta, -i)]; if (m?.kg) v.push(m.kg); }
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// ----- Revisión semanal -----
// Cada revisión que decides (Aplicar / Mantener) se guarda: { id: "2026-11-24", ... }
export const revisiones = () => leer(K.revisiones, []);
export function guardarRevision(r) {
  const l = revisiones().filter((x) => x.id !== r.id);
  l.push(r);
  escribir(K.revisiones, l);
}
// El día de la revisión que toca ahora: hoy si aún no hay ninguna (la primera) y luego cada lunes
export function idRevision(f = hoy()) {
  if (!revisiones().length) return f;
  const d = new Date(f + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // retrocede hasta el lunes
  return aTexto(d);
}
const KCAL_POR_KG = 7700; // lo que "pesa" un kg de grasa corporal (aproximado)
// Mira los últimos 7 días completos (hasta ayer) y propone qué hacer con el déficit
export function calcularRevision(p, f = hoy()) {
  const fin = sumarDias(f, -1), ini = sumarDias(f, -7);
  const diaria = [];
  for (let i = 0; i < 7; i++) {
    const t = totales(dia(sumarDias(ini, i)));
    if (t.kcal >= 800) diaria.push(t.kcal); // un día con menos de 800 kcal anotadas es un día a medias
  }
  const ps = pesos();
  let pesadas = 0;
  for (let i = 0; i < 7; i++) if (ps[sumarDias(ini, i)]?.kg) pesadas++;
  const ahora = mediaPeso(ps, fin), antes = mediaPeso(ps, sumarDias(fin, -7));
  const r = { id: idRevision(f), desde: ini, hasta: fin, diasAnotados: diaria.length, pesadas, deficit: p.deficit };
  const faltan = [];
  if (diaria.length < 4) faltan.push(`anotar la comida al menos 4 días (llevas ${diaria.length} de la última semana)`);
  if (pesadas < 2) faltan.push(`pesarte al menos 2 veces (llevas ${pesadas})`);
  if (ahora == null || antes == null) faltan.push("tener también peso de la semana anterior");
  if (faltan.length) return { ...r, suficiente: false, faltan, pesoAhora: ahora };
  const kcalMedia = diaria.reduce((a, b) => a + b, 0) / diaria.length;
  const dKg = ahora - antes;
  const pct = (dKg / antes) * 100;
  const gasto = Math.round(kcalMedia - (dKg * KCAL_POR_KG) / 7);
  let cambio = 0, veredicto;
  if (pct < -0.7) { cambio = 150; veredicto = "Pierdes peso más rápido de lo recomendable: se te puede ir músculo."; }
  else if (pct > -0.2) { cambio = -100; veredicto = pct > 0.2 ? "Tu peso sube: hay que apretar un poco." : "Tu peso apenas baja: hay que apretar un poco."; }
  else veredicto = "Pierdes grasa a buen ritmo sin bajar demasiado.";
  const nuevoDeficit = Math.max(0, Math.min(800, p.deficit - cambio));
  return { ...r, suficiente: true, kcalMedia: Math.round(kcalMedia), pesoAntes: antes, pesoAhora: ahora, dKg, pct, gasto, veredicto, nuevoDeficit, cambioKcal: cambio };
}
