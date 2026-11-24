// =====================================================================
// Función "intervals" de Supabase: manda tus entrenamientos a Garmin
// a través de Intervals.icu.
// ---------------------------------------------------------------------
// Garmin no deja que una web personal escriba en tu calendario, pero
// Intervals.icu sí puede (es socio oficial de Garmin). Así que:
//   app  →  esta función  →  calendario de Intervals.icu  →  Garmin Connect  →  reloj
//
// La llama la app, con tu sesión iniciada:
//   { accion: "conectar", clave }   guardar tu API key de Intervals (se comprueba antes)
//   { accion: "estado" }            ¿está conectada? ¿a qué atleta?
//   { accion: "desconectar" }       borrar tu clave
//   { accion: "enviar", entreno }   crear o actualizar un entreno en tu calendario
//        entreno = { id, nombre, tipo: "Run" | "Ride" | "Swim", fecha: "2026-11-26", texto }
//   { accion: "quitar", id }        borrarlo de tu calendario
//
// Tu clave solo se guarda en intervals_conexion, que la web no puede leer.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const API = "https://intervals.icu/api/v1/athlete/0"; // 0 = el dueño de la clave
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const responder = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Intervals usa "Basic auth": usuario API_KEY y contraseña tu clave
async function pedir(clave: string, ruta: string, opciones: RequestInit = {}) {
  const r = await fetch(API + ruta, {
    ...opciones,
    headers: { Authorization: "Basic " + btoa("API_KEY:" + clave), "Content-Type": "application/json", ...(opciones.headers ?? {}) },
  });
  const texto = await r.text();
  if (!r.ok) {
    const motivo = r.status === 401 || r.status === 403 ? "Intervals no acepta la clave (¿la copiaste entera?)" : `Intervals respondió ${r.status}: ${texto.slice(0, 200)}`;
    throw new Error(motivo);
  }
  try { return JSON.parse(texto); } catch { return texto; }
}

const externo = (id: string) => `pulso-${id}`; // así reconocemos nuestros entrenos en Intervals

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const cuerpo = await peticion.json().catch(() => ({}));
  const jwt = (peticion.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await supabase.auth.getUser(jwt).catch(() => ({ data: { user: null } }));
  if (!user) return responder({ error: "Inicia sesión en la app para usar Intervals" }, 401);

  const leerConexion = async () =>
    (await supabase.from("intervals_conexion").select("clave, atleta").eq("user_id", user.id).maybeSingle()).data;

  try {
    switch (cuerpo.accion ?? "estado") {
      case "conectar": {
        const clave = String(cuerpo.clave ?? "").trim();
        if (clave.length < 10) return responder({ error: "Pega la clave completa" }, 400);
        const atleta = await pedir(clave, ""); // comprobamos que funciona antes de guardarla
        const nombre = atleta?.name || atleta?.firstname || atleta?.id || "tu cuenta";
        await supabase.from("intervals_conexion").upsert({ user_id: user.id, clave, atleta: String(nombre) }, { onConflict: "user_id" });
        return responder({ conectada: true, atleta: nombre });
      }
      case "desconectar":
        await supabase.from("intervals_conexion").delete().eq("user_id", user.id);
        return responder({ conectada: false });
      case "enviar": {
        const c = await leerConexion();
        if (!c) return responder({ error: "Conecta primero Intervals.icu (Entreno → Ajustes)" }, 400);
        const e = cuerpo.entreno ?? {};
        if (!e.id || !e.fecha || !e.texto) return responder({ error: "Falta el entreno" }, 400);
        const [evento] = await pedir(c.clave, "/events/bulk?upsert=true", {
          method: "POST",
          body: JSON.stringify([{
            category: "WORKOUT",
            start_date_local: `${e.fecha}T00:00:00`,
            type: e.tipo ?? "Run",
            name: String(e.nombre ?? "Entrenamiento").slice(0, 80),
            description: e.texto,
            external_id: externo(e.id),
          }]),
        });
        return responder({ ok: true, evento: evento?.id ?? null });
      }
      case "quitar": {
        const c = await leerConexion();
        if (!c) return responder({ ok: true });
        await pedir(c.clave, "/events/bulk-delete", { method: "PUT", body: JSON.stringify([{ external_id: externo(cuerpo.id) }]) });
        return responder({ ok: true });
      }
      default: {
        const c = await leerConexion();
        return responder(c ? { conectada: true, atleta: c.atleta } : { conectada: false });
      }
    }
  } catch (e) {
    return responder({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
