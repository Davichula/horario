// =====================================================================
// nutricion/datos.js — guardar tus datos y calcular tu objetivo
// ---------------------------------------------------------------------
// Todo se guarda en localStorage (y se sincroniza con Supabase gracias a
// sincronizar.js, igual que Entreno). Cuatro cajitas:
//   perfil    → tus datos (edad, altura, peso...) y tus ajustes del objetivo
//   diario    → lo que comes: { "2026-11-24": [ {comida, nombre, g, kcal, p, c, gr...} ] }
//   propios   → alimentos que creas tú
//   pesos     → tu peso y % de grasa por día: { "2026-11-24": { kg, grasa } }
// =====================================================================
const K = {
  perfil: "mi-horario:nutricion-perfil",
  diario: "mi-horario:nutricion-diario",
  propios: "mi-horario:nutricion-propios",
  pesos: "mi-horario:nutricion-pesos",
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
export function copiarDia(desde, hasta, comida) {
  for (const e of dia(desde).filter((x) => !comida || x.comida === comida)) {
    const { id, ...resto } = e;
    anadir(hasta, resto);
  }
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
