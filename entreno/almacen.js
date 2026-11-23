// =====================================================================
// entreno/almacen.js — dónde se guardan tus actividades
// ---------------------------------------------------------------------
// Cada actividad tiene dos partes:
//
//   1. El RESUMEN (deporte, fecha, distancia, tiempo, pulso medio...).
//      Ocupa muy poco. Se guardan todos juntos en localStorage, en la
//      clave "mi-horario:entreno", y sincronizar.js los copia a Supabase
//      igual que tus tareas. Así la lista aparece en todos tus dispositivos.
//
//   2. El DETALLE (los puntos segundo a segundo, vueltas, largos, series).
//      Ocupa más (unos 100 KB), así que va aparte:
//        - en este dispositivo, en IndexedDB (un "cajón" del navegador para
//          cosas grandes)
//        - en Supabase, en la misma tabla "datos", con la clave
//          "entreno:<id>". Solo se descarga cuando abres esa actividad.
// =====================================================================

import { mejoresNado, mejoresCarrera } from "./analisis.js";
import { familia, nombreDe } from "./fit.js";

const CLAVE = "mi-horario:entreno";
const CLAVE_AJUSTES = "mi-horario:entreno-ajustes";
const CLAVE_PENDIENTES = "mi-horario:entreno-pendientes"; // detalles que aún no se han podido subir

const leer = (clave, porDefecto) => {
  try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
};
const escribir = (clave, valor) => localStorage.setItem(clave, JSON.stringify(valor));

// ----- Resúmenes -----
// Las actividades antiguas se guardaron cuando solo había 5 familias de
// deporte (el tenis o el esquí iban a "otros"): las ponemos al día al leer.
const generico = (sport) => sport.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
function alDia(a) {
  if (!a.sport) return a;
  const deporte = familia(a.sport, a.subSport);
  const nombre = a.nombre === generico(a.sport) || a.nombre === "Tennis" ? nombreDe(a.sport, a.subSport) : a.nombre;
  return deporte === a.deporte && nombre === a.nombre ? a : { ...a, deporte, nombre };
}
export const listar = () => leer(CLAVE, []).map(alDia).sort((a, b) => b.inicio.localeCompare(a.inicio));
export const buscar = (id) => listar().find((a) => a.id === id);

// Lo que va en el resumen: todo menos lo grande
export function resumenDe(act) {
  const { puntos, vueltas, largosDetalle, series, ...resumen } = act;
  resumen.vueltasN = vueltas?.length || 0;
  if (series) resumen.seriesN = series.filter((s) => !s.descanso).length;
  if (act.deporte === "nadar" && largosDetalle) resumen.mejores = mejoresNado(act); // mejores 100, 200, 400 m...
  if (act.deporte === "correr" && puntos?.d) resumen.mejores = mejoresCarrera(act); // mejores 1 km, 5 km, 10 km...
  return resumen;
}

// Añade datos calculados al resumen de una actividad (p. ej. sus mejores tiempos)
// cambios = { id: { campo: valor } }
export function actualizarResumenes(cambios) {
  const lista = leer(CLAVE, []);
  for (const a of lista) if (cambios[a.id]) Object.assign(a, cambios[a.id]);
  escribir(CLAVE, lista);
}

// ----- Ajustes (pulsaciones máximas, etc.) -----
export const ajustes = () => leer(CLAVE_AJUSTES, {});
export const guardarAjustes = (a) => escribir(CLAVE_AJUSTES, { ...ajustes(), ...a });

// ----- IndexedDB: el cajón de este dispositivo -----
let bd = null;
function abrirBd() {
  bd ??= new Promise((ok, mal) => {
    const peticion = indexedDB.open("mi-horario-entreno", 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore("detalle", { keyPath: "id" });
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => { bd = null; mal(peticion.error); };
  });
  return bd;
}
async function cajon(modo, accion) {
  const db = await abrirBd();
  return new Promise((ok, mal) => {
    const tx = db.transaction("detalle", modo);
    const peticion = accion(tx.objectStore("detalle"));
    tx.oncomplete = () => ok(peticion?.result);
    tx.onerror = () => mal(tx.error);
  });
}
const cajonLeer = (id) => cajon("readonly", (s) => s.get(id)).catch(() => null);
const cajonGuardar = (act) => cajon("readwrite", (s) => s.put(act)).catch(() => {});
const cajonBorrar = (id) => cajon("readwrite", (s) => s.delete(id)).catch(() => {});

// ----- Supabase (a través de sincronizar.js) -----
async function sesion() {
  if (!window.nube || !navigator.onLine) return null;
  try {
    const sb = await window.nube.supabase();
    const { data: { session } } = await sb.auth.getSession();
    return session ? { sb, usuario: session.user.id } : null;
  } catch { return null; }
}

async function subirDetalles(acts) {
  const s = await sesion();
  if (!s) return false;
  const filas = acts.map((a) => ({ user_id: s.usuario, clave: `entreno:${a.id}`, valor: a, cambiado: Date.now() }));
  // De 20 en 20 para no mandar paquetes enormes
  for (let i = 0; i < filas.length; i += 20) {
    const { error } = await s.sb.from("datos").upsert(filas.slice(i, i + 20), { onConflict: "user_id,clave" });
    if (error) { console.error("Entreno: subir detalle", error); return false; }
  }
  return true;
}

// Intenta subir lo que se quedó a medias (p. ej. subiste actividades sin conexión)
export async function subirPendientes() {
  const pendientes = leer(CLAVE_PENDIENTES, []);
  if (!pendientes.length) return;
  const acts = (await Promise.all(pendientes.map(cajonLeer))).filter(Boolean);
  if (await subirDetalles(acts)) localStorage.removeItem(CLAVE_PENDIENTES);
}

// ----- Lo que usa el resto de entreno/ -----

// Guarda actividades nuevas. Devuelve cuántas eran nuevas y cuántas repetidas.
export async function guardar(actividades) {
  const lista = leer(CLAVE, []);
  const ids = new Set(lista.map((a) => a.id));
  const nuevas = actividades.filter((a) => !ids.has(a.id));
  for (const a of nuevas) await cajonGuardar(a);
  if (nuevas.length) {
    escribir(CLAVE, [...lista, ...nuevas.map(resumenDe)]);
    const subidas = await subirDetalles(nuevas);
    if (!subidas) escribir(CLAVE_PENDIENTES, [...new Set([...leer(CLAVE_PENDIENTES, []), ...nuevas.map((a) => a.id)])]);
  }
  return { nuevas: nuevas.length, repetidas: actividades.length - nuevas.length };
}

// El detalle completo: primero de este dispositivo y, si no está, de Supabase
export async function detalle(id) {
  const local = await cajonLeer(id);
  if (local) return local;
  const s = await sesion();
  if (!s) return null;
  const { data, error } = await s.sb.from("datos").select("valor").eq("clave", `entreno:${id}`).maybeSingle();
  if (error || !data) return null;
  await cajonGuardar(data.valor);
  return data.valor;
}

export async function borrar(id) {
  escribir(CLAVE, leer(CLAVE, []).filter((a) => a.id !== id));
  escribir(CLAVE_PENDIENTES, leer(CLAVE_PENDIENTES, []).filter((x) => x !== id));
  await cajonBorrar(id);
  const s = await sesion();
  if (s) await s.sb.from("datos").delete().eq("clave", `entreno:${id}`);
}
