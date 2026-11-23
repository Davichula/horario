// =====================================================================
// Función "garmin" de Supabase: trae tus actividades del Garmin solas.
// ---------------------------------------------------------------------
// Se ejecuta en los servidores de Supabase, no en la web. La llaman:
//   - pg_cron, cada 10 minutos (ver supabase/garmin.sql), sin usuario:
//     sincroniza a todos los que hayan conectado su Garmin.
//   - la app, con tu sesión iniciada, para:
//       { accion: "conectar", clave }  guardar tu clave personal de Garmin
//       { accion: "sincronizar" }      traer lo nuevo ahora mismo
//       { accion: "estado" }           saber cómo va
//       { accion: "desconectar" }      borrar tu clave
//
// Cada sincronización:
//   1. Cambia tu clave personal por un "token" (un pase que dura 24 h).
//   2. Pide a Garmin tus últimas actividades y, poco a poco, tu historial.
//   3. Descarga el archivo original de las que faltan (como mucho unas
//      pocas cada vez, para no pedirle demasiado a Garmin de golpe).
//   4. Las deja en la tabla garmin_archivos. La app las recoge y las lee.
//
// Tu clave solo se guarda en garmin_conexion, que la web no puede leer.
// Nunca se escribe en los registros (logs).
//
// Para copiarla: Supabase → Edge Functions → Deploy a new function →
// Via Editor, nombre "garmin", y pegar este archivo entero.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const GARMIN = "https://personal.connectapi.garmin.com";
const RUTA_TOKEN = "/personalapitoken-service/personal-api/personal-api-key/token";
const DESCARGAS_POR_VEZ = 12;   // archivos que descarga en cada llamada
const HISTORIAL_POR_VEZ = 50;   // actividades antiguas que mira en cada llamada
const MAX_INTENTOS = 3;

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const responder = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class ErrorGarmin extends Error {
  status: number;
  constructor(status: number, mensaje: string) { super(mensaje); this.status = status; }
}

// ----- Hablar con Garmin -----

// Cambia la clave personal por un token. Garmin lo devuelve como texto o JSON.
async function pedirToken(clave: string): Promise<{ token: string; caduca: Date }> {
  const r = await fetch(GARMIN + RUTA_TOKEN, { method: "POST", headers: { Accept: "*/*", Authorization: `ApiKey ${clave}` } });
  if (!r.ok) {
    throw new ErrorGarmin(r.status, r.status === 401 || r.status === 403
      ? "Garmin no acepta la clave (puede que esté mal copiada, caducada o borrada)"
      : `Garmin respondió ${r.status} al pedir el token`);
  }
  let texto = (await r.text()).trim();
  if (texto.startsWith("{")) {
    const j = JSON.parse(texto);
    texto = j.access_token ?? j.accessToken ?? j.token ?? "";
  }
  if (!texto) throw new ErrorGarmin(500, "Garmin no devolvió ningún token");
  let caduca = new Date(Date.now() + 23 * 3600e3);
  try {
    const carga = JSON.parse(atob(texto.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (carga.exp) caduca = new Date(Number(carga.exp) * 1000);
  } catch { /* si no se puede leer, suponemos 23 h */ }
  return { token: texto, caduca };
}

async function pedir(conexion: Conexion, ruta: string, aceptar = "application/json"): Promise<Response> {
  for (let intento = 0; intento < 2; intento++) {
    const token = await tokenValido(conexion, intento > 0);
    const r = await fetch(GARMIN + ruta, { headers: { Accept: aceptar, Authorization: `Bearer ${token}` } });
    if (r.status === 401 && intento === 0) continue; // token caducado: pedimos otro y repetimos
    if (!r.ok) throw new ErrorGarmin(r.status, `Garmin respondió ${r.status} en ${ruta.split("?")[0]}`);
    return r;
  }
  throw new ErrorGarmin(401, "Garmin no acepta el token");
}

// ----- La conexión de cada usuario -----
type Conexion = {
  user_id: string; clave: string; token: string | null; token_caduca: string | null;
  historial_desde: number; historial_completo: boolean;
};

async function tokenValido(c: Conexion, forzar = false): Promise<string> {
  if (!forzar && c.token && c.token_caduca && new Date(c.token_caduca).getTime() > Date.now() + 10 * 60e3) return c.token;
  const { token, caduca } = await pedirToken(c.clave);
  c.token = token;
  c.token_caduca = caduca.toISOString();
  await supabase.from("garmin_conexion").update({ token, token_caduca: c.token_caduca }).eq("user_id", c.user_id);
  return token;
}

// Apunta actividades que aún no conocíamos (las que ya estaban se quedan como están)
async function apuntar(c: Conexion, lista: any[]) {
  const filas = lista
    .filter((a) => a?.activityId)
    .map((a) => ({
      user_id: c.user_id,
      activity_id: a.activityId,
      inicio: a.startTimeGMT ? new Date(a.startTimeGMT.replace(" ", "T") + "Z").toISOString() : null,
    }));
  if (filas.length) {
    await supabase.from("garmin_actividades").upsert(filas, { onConflict: "user_id,activity_id", ignoreDuplicates: true });
  }
}

const listar = async (c: Conexion, desde: number, cuantas: number) =>
  (await (await pedir(c, `/activitylist-service/activities/search/activities?start=${desde}&limit=${cuantas}`)).json()) ?? [];

// Bytes → texto base64 (por trozos, para archivos grandes)
function aBase64(bytes: Uint8Array): string {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

async function sincronizar(c: Conexion) {
  const resultado = { nuevas: 0, descargadas: 0, error: null as string | null };
  try {
    // 1. Lo más reciente
    const recientes = await listar(c, 0, 20);
    await apuntar(c, recientes);

    // 2. Un trozo de tu historial antiguo, hasta tenerlo entero
    if (!c.historial_completo) {
      const antiguas = await listar(c, c.historial_desde, HISTORIAL_POR_VEZ);
      await apuntar(c, antiguas);
      c.historial_desde += antiguas.length;
      c.historial_completo = antiguas.length < HISTORIAL_POR_VEZ;
    }

    // 3. Descargar las pendientes, las más nuevas primero
    const { data: pendientes } = await supabase.from("garmin_actividades")
      .select("activity_id, intentos").eq("user_id", c.user_id).eq("estado", "pendiente")
      .order("inicio", { ascending: false, nullsFirst: false }).limit(DESCARGAS_POR_VEZ);
    for (const p of pendientes ?? []) {
      try {
        const r = await pedir(c, `/download-service/files/activity/${p.activity_id}`,
          "application/zip, application/x-zip-compressed, application/octet-stream");
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (!bytes.length) throw new ErrorGarmin(204, "archivo vacío");
        await supabase.from("garmin_archivos").upsert(
          { user_id: c.user_id, activity_id: p.activity_id, archivo: aBase64(bytes) },
          { onConflict: "user_id,activity_id", ignoreDuplicates: true });
        await supabase.from("garmin_actividades").update({ estado: "descargada" })
          .eq("user_id", c.user_id).eq("activity_id", p.activity_id);
        resultado.descargadas++;
      } catch (e) {
        // 429 = "demasiadas peticiones": paramos y seguimos en la próxima vuelta
        if (e instanceof ErrorGarmin && e.status === 429) throw e;
        const intentos = (p.intentos ?? 0) + 1;
        await supabase.from("garmin_actividades")
          .update({ intentos, estado: intentos >= MAX_INTENTOS ? "error" : "pendiente" })
          .eq("user_id", c.user_id).eq("activity_id", p.activity_id);
      }
    }
  } catch (e) {
    resultado.error = e instanceof Error ? e.message : String(e);
  }
  await supabase.from("garmin_conexion").update({
    historial_desde: c.historial_desde,
    historial_completo: c.historial_completo,
    ultima_sync: new Date().toISOString(),
    ultimo_error: resultado.error,
  }).eq("user_id", c.user_id);
  return resultado;
}

async function estado(userId: string) {
  const { data: c } = await supabase.from("garmin_conexion")
    .select("ultima_sync, ultimo_error, historial_completo, historial_desde, creada").eq("user_id", userId).maybeSingle();
  if (!c) return { conectada: false };
  const contar = async (estado: string) => (await supabase.from("garmin_actividades")
    .select("activity_id", { count: "exact", head: true }).eq("user_id", userId).eq("estado", estado)).count ?? 0;
  return {
    conectada: true,
    ultimaSync: c.ultima_sync,
    error: c.ultimo_error,
    historialCompleto: c.historial_completo,
    pendientes: await contar("pendiente"),
    descargadas: await contar("descargada"),
    fallidas: await contar("error"),
  };
}

const COLUMNAS = "user_id, clave, token, token_caduca, historial_desde, historial_completo";

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const cuerpo = await peticion.json().catch(() => ({}));

  // ¿Quién llama? Si trae la sesión de un usuario, es la app; si no, es el reloj (pg_cron)
  const jwt = (peticion.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await supabase.auth.getUser(jwt).catch(() => ({ data: { user: null } }));

  if (!user) {
    const { data: conexiones } = await supabase.from("garmin_conexion").select(COLUMNAS);
    const resultados = [];
    for (const c of conexiones ?? []) resultados.push(await sincronizar(c));
    return responder({ ok: true, usuarios: resultados.length });
  }

  const accion = cuerpo.accion ?? "estado";
  if (accion === "conectar") {
    const clave = String(cuerpo.clave ?? "").trim();
    if (clave.length < 10) return responder({ error: "Pega la clave completa" }, 400);
    try {
      const { token, caduca } = await pedirToken(clave); // comprobamos que funciona antes de guardarla
      await supabase.from("garmin_conexion").upsert({
        user_id: user.id, clave, token, token_caduca: caduca.toISOString(), ultimo_error: null,
      }, { onConflict: "user_id" });
    } catch (e) {
      return responder({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }
  if (accion === "desconectar") {
    await supabase.from("garmin_conexion").delete().eq("user_id", user.id);
    return responder(await estado(user.id));
  }
  if (accion === "conectar" || accion === "sincronizar") {
    const { data: c } = await supabase.from("garmin_conexion").select(COLUMNAS).eq("user_id", user.id).maybeSingle();
    if (c) await sincronizar(c);
  }
  return responder(await estado(user.id));
});
