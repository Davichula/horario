// =====================================================================
// entreno/garmin.js — tus actividades del Garmin, solas
// ---------------------------------------------------------------------
// La parte difícil la hace la función "garmin" de Supabase
// (supabase/functions/garmin): cada 10 minutos pregunta a Garmin por tus
// actividades nuevas y deja su archivo original en la tabla
// garmin_archivos.
//
// Aquí, en la app, solo hay que:
//   - recoger esos archivos, leerlos con fit.js (igual que al subirlos a
//     mano) y guardarlos con almacen.js. Después se borran de la tabla.
//   - hablar con la función para conectar tu clave, ver cómo va o pedir
//     que sincronice ya.
// =====================================================================

import { leerArchivos } from "./fit.js";
import * as almacen from "./almacen.js";

export async function haySesion() { return !!(await sesion()); }

async function sesion() {
  if (!window.nube || !navigator.onLine) return null;
  try {
    const sb = await window.nube.supabase();
    const { data: { session } } = await sb.auth.getSession();
    return session ? sb : null;
  } catch { return null; }
}

// Pregunta a la función. accion: "estado" | "conectar" | "sincronizar" | "desconectar"
export async function funcion(accion, datos = {}) {
  const sb = await sesion();
  if (!sb) throw new Error("Inicia sesión en Sincronizar (panel del Horario) para conectar tu Garmin");
  const { data, error } = await sb.functions.invoke("garmin", { body: { accion, ...datos } });
  if (error) {
    // Si la función contestó con un mensaje de error, lo enseñamos tal cual
    let mensaje = error.message;
    try { mensaje = (await error.context?.json())?.error || mensaje; } catch {}
    if (/Failed to send|not found|404/i.test(mensaje)) mensaje = "La función «garmin» aún no está instalada en Supabase";
    throw new Error(mensaje);
  }
  return data;
}

const base64aBytes = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

let recogiendo = null;
// Recoge lo que haya dejado la función. alAvanzar(n) avisa de cuántas lleva.
export function recoger(alAvanzar = () => {}) {
  recogiendo ??= (async () => {
    let total = 0;
    try {
      const sb = await sesion();
      if (!sb) return 0;
      for (let vuelta = 0; vuelta < 200; vuelta++) {
        const { data: filas, error } = await sb.from("garmin_archivos").select("activity_id, archivo").limit(8);
        if (error || !filas?.length) break; // (si la tabla aún no existe, da error: no pasa nada)
        const archivos = filas.map((f) => new File([base64aBytes(f.archivo)], `garmin-${f.activity_id}.zip`));
        // Primero leer y guardar; solo después borrar, para no perder nada si algo falla
        const leidas = await leerArchivos(archivos);
        const buenas = leidas.filter((r) => r.actividad).map((r) => r.actividad);
        leidas.filter((r) => r.error).forEach((r) => console.warn("Garmin: no se pudo leer", r.nombre, r.error));
        const { nuevas } = await almacen.guardar(buenas);
        const { error: errorBorrar } = await sb.from("garmin_archivos").delete().in("activity_id", filas.map((f) => f.activity_id));
        if (errorBorrar) break;
        total += nuevas;
        if (nuevas) alAvanzar(total);
      }
    } finally {
      recogiendo = null;
    }
    return total;
  })();
  return recogiendo;
}
