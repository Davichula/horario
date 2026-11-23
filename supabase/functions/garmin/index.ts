// =====================================================================
// Función "garmin" de Supabase: trae tus actividades del Garmin solas.
// ---------------------------------------------------------------------
// Se ejecuta en los servidores de Supabase, no en la web. La llaman:
//   - pg_cron, cada minuto (ver supabase/garmin.sql), sin usuario:
//     sincroniza a todos los que hayan conectado su Garmin. Si no queda
//     nada pendiente, solo pregunta a Garmin cada pocos minutos.
//   - la app, con tu sesión iniciada, para:
//       { accion: "conectar", clave }  guardar tu clave personal de Garmin
//       { accion: "sincronizar" }      traer lo nuevo ahora mismo
//       { accion: "estado" }           saber cómo va
//       { accion: "desconectar" }      borrar tu clave
//
// Cada sincronización:
//   1. Cambia tu clave personal por un "token" (un pase que dura 24 h).
//   2. Pide a Garmin tus últimas actividades y, poco a poco, tu historial.
//   3. Descarga el archivo original de las que faltan, varias a la vez,
//      durante unos 40 segundos como mucho por vuelta.
//   4. Las deja en la tabla garmin_archivos. La app las recoge y las lee.
//   5. Trae tus datos de SALUD de cada día (pulso en reposo, sueño, VFC,
//      Body Battery, estrés, pasos, VO2max) a la tabla garmin_salud: lo
//      de los últimos días cada media hora y, poco a poco, el último año.
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
const TIEMPO_POR_VUELTA = 40e3;  // ms de trabajo como mucho en cada llamada
const A_LA_VEZ = 4;              // descargas en paralelo
// Garmin corta (error 429) si pides ~100 archivos de golpe: como mucho 25 por vuelta (25 por minuto)
const MAX_DESCARGAS_POR_VUELTA = 25;
const HISTORIAL_POR_PAGINA = 100; // actividades antiguas por cada consulta de la lista
const CADA_CUANTO_SI_NADA = 3 * 60e3; // sin nada pendiente, preguntar a Garmin cada 3 min
const PAUSA_SI_429 = 15 * 60e3;  // si Garmin dice "demasiadas peticiones", esperar 15 min
const MAX_INTENTOS = 3;
const SALUD_CADA = 30 * 60e3;    // refrescar la salud de los últimos días cada 30 min
const SALUD_DIAS_ATRAS = 365;    // cuánto historial de salud traer
const SALUD_TROZO = 28;          // días por consulta al traer historial

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
  ultima_sync?: string | null; pausa_hasta?: string | null;
  salud_desde?: string | null; salud_ultima?: string | null;
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

// Descarga una actividad y la deja en garmin_archivos
async function descargar(c: Conexion, p: { activity_id: number; intentos: number }) {
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
    return true;
  } catch (e) {
    // 429 = "demasiadas peticiones": lo sube arriba para parar la vuelta
    if (e instanceof ErrorGarmin && e.status === 429) throw e;
    const intentos = (p.intentos ?? 0) + 1;
    await supabase.from("garmin_actividades")
      .update({ intentos, estado: intentos >= MAX_INTENTOS ? "error" : "pendiente" })
      .eq("user_id", c.user_id).eq("activity_id", p.activity_id);
    return false;
  }
}

const contarPendientes = async (userId: string) => (await supabase.from("garmin_actividades")
  .select("activity_id", { count: "exact", head: true }).eq("user_id", userId).eq("estado", "pendiente")).count ?? 0;

// ----- Salud diaria -----
const fechaISO = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return fechaISO(d); };
const numero = (x: unknown) => (typeof x === "number" && isFinite(x) && x >= 0 ? x : null);

async function json(c: Conexion, ruta: string): Promise<any> {
  try {
    const r = await pedir(c, ruta);
    if (r.status === 204) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  } catch (e) {
    if (e instanceof ErrorGarmin && e.status === 429) throw e;
    return null; // una parte que falla no estropea las demás
  }
}

// Pide a Garmin todo lo de salud entre dos fechas y lo guarda, un registro por día
async function traerSalud(c: Conexion, desde: string, hasta: string) {
  const dias: Record<string, any> = {};
  const dia = (f: string | undefined) => (f ? (dias[f.slice(0, 10)] ??= {}) : {});

  const resumen = await json(c, `/usersummary-service/v2/dailysummaries?startDate=${desde}&endDate=${hasta}`);
  for (const r of resumen?.data ?? (Array.isArray(resumen) ? resumen : [])) {
    const d = dia(r.calendarDate);
    d.pasos = numero(r.movement?.steps?.value);
    d.fcReposo = numero(r.heartRate?.restingValue);
    d.fcMin = numero(r.heartRate?.minValue);
    d.estres = numero(r.stress?.avgLevel);
    // Proporción del día con datos de estrés: dice si llevabas el reloj puesto
    d.llevado = r.stress?.uncategorizedProportion != null ? Math.round((1 - r.stress.uncategorizedProportion) * 100) / 100 : null;
    d.bbMax = numero(r.bodyBattery?.maxValue);
    d.bbMin = numero(r.bodyBattery?.minValue);
    d.bbCarga = numero(r.bodyBattery?.chargedValue);
    d.bbGasto = numero(r.bodyBattery?.drainedValue);
    d.minIntensos = (numero(r.intensityMinutes?.moderate) ?? 0) + 2 * (numero(r.intensityMinutes?.vigorous) ?? 0) || null;
    d.kcal = numero(r.calories?.burnedTotal);
  }

  const sueno = await json(c, `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${desde}&endDate=${hasta}`);
  for (const s of Array.isArray(sueno) ? sueno : sueno?.dailySleepDTOs ?? []) {
    const x = s?.dailySleepDTO ?? s;
    if (!x?.calendarDate || !x.sleepTimeSeconds) continue;
    dia(x.calendarDate).sueno = {
      total: numero(x.sleepTimeSeconds), profundo: numero(x.deepSleepSeconds), ligero: numero(x.lightSleepSeconds),
      rem: numero(x.remSleepSeconds), despierto: numero(x.awakeSleepSeconds),
      puntuacion: numero(x.sleepScores?.overall?.value ?? x.sleepScore),
    };
  }

  const vfc = await json(c, `/hrv-service/hrv/daily/${desde}/${hasta}`);
  for (const h of Array.isArray(vfc) ? vfc : vfc?.hrvSummaries ?? []) {
    const x = h?.hrvSummary ?? h;
    if (!x?.calendarDate) continue;
    dia(x.calendarDate).vfc = {
      noche: numero(x.lastNightAvg), semana: numero(x.weeklyAvg), estado: x.status ?? null,
      bajo: numero(x.baseline?.balancedLow), alto: numero(x.baseline?.balancedUpper),
    };
  }

  const vo2 = await json(c, `/metrics-service/metrics/maxmet/daily/${desde}/${hasta}`);
  for (const v of Array.isArray(vo2) ? vo2 : []) {
    if (v?.generic?.calendarDate) dia(v.generic.calendarDate).vo2 = numero(v.generic.vo2MaxPreciseValue ?? v.generic.vo2MaxValue);
    if (v?.cycling?.calendarDate) dia(v.cycling.calendarDate).vo2Bici = numero(v.cycling.vo2MaxPreciseValue ?? v.cycling.vo2MaxValue);
  }

  const filas = Object.entries(dias)
    .map(([fecha, datos]) => ({ user_id: c.user_id, fecha, datos: Object.fromEntries(Object.entries(datos).filter(([, v]) => v != null)), actualizado: new Date().toISOString() }))
    .filter((f) => Object.keys(f.datos).length);
  if (filas.length) await supabase.from("garmin_salud").upsert(filas, { onConflict: "user_id,fecha" });
  return filas.length;
}

async function sincronizarSalud(c: Conexion, queda: () => number) {
  const hoy = fechaISO(new Date());
  // Lo reciente, cada media hora
  if (!c.salud_ultima || Date.now() - new Date(c.salud_ultima).getTime() > SALUD_CADA) {
    await traerSalud(c, sumarDias(hoy, -3), hoy);
    c.salud_ultima = new Date().toISOString();
    c.salud_desde ??= sumarDias(hoy, -3);
  }
  // Un trozo del historial por vuelta, hasta tener un año
  const limite = sumarDias(hoy, -SALUD_DIAS_ATRAS);
  if (c.salud_desde && c.salud_desde > limite && queda() > 10e3) {
    const hasta = sumarDias(c.salud_desde, -1);
    const desde = sumarDias(c.salud_desde, -SALUD_TROZO);
    await traerSalud(c, desde, hasta);
    c.salud_desde = desde;
  }
}

// porReloj = la llama pg_cron (puede saltarse la vuelta si no hay nada que hacer)
async function sincronizar(c: Conexion, porReloj = false) {
  // Si la pide la app, respondemos antes (no te dejamos esperando 40 s); el reloj sigue después
  const tiempo = porReloj ? TIEMPO_POR_VUELTA : 15e3;
  const resultado = { descargadas: 0, saltada: false, error: null as string | null };
  const inicio = Date.now();
  const queda = () => tiempo - (Date.now() - inicio);

  if (c.pausa_hasta && new Date(c.pausa_hasta).getTime() > Date.now()) return { ...resultado, saltada: true };
  const saludAlDia = c.salud_desde && c.salud_desde <= fechaISO(new Date(Date.now() - SALUD_DIAS_ATRAS * 864e5));
  if (porReloj && c.historial_completo && c.ultima_sync && saludAlDia &&
      Date.now() - new Date(c.ultima_sync).getTime() < CADA_CUANTO_SI_NADA &&
      (await contarPendientes(c.user_id)) === 0) {
    return { ...resultado, saltada: true };
  }

  let pausa: string | null = null;
  try {
    // 1. Lo más reciente
    await apuntar(c, await listar(c, 0, 20));

    // 2. Tu historial antiguo, a páginas grandes, hasta tenerlo entero
    while (!c.historial_completo && queda() > tiempo / 2) {
      const antiguas = await listar(c, c.historial_desde, HISTORIAL_POR_PAGINA);
      await apuntar(c, antiguas);
      c.historial_desde += antiguas.length;
      c.historial_completo = antiguas.length < HISTORIAL_POR_PAGINA;
    }

    // 3. Descargar las pendientes, las más nuevas primero, varias a la vez
    while (queda() > 8e3 && resultado.descargadas < MAX_DESCARGAS_POR_VUELTA) {
      const { data: pendientes } = await supabase.from("garmin_actividades")
        .select("activity_id, intentos").eq("user_id", c.user_id).eq("estado", "pendiente")
        .order("inicio", { ascending: false, nullsFirst: false }).limit(A_LA_VEZ * 2);
      if (!pendientes?.length) break;
      for (let i = 0; i < pendientes.length && queda() > 8e3 && resultado.descargadas < MAX_DESCARGAS_POR_VUELTA; i += A_LA_VEZ) {
        const hechas = await Promise.all(pendientes.slice(i, i + A_LA_VEZ).map((p) => descargar(c, p)));
        resultado.descargadas += hechas.filter(Boolean).length;
      }
    }

    // 4. Salud (después de las actividades, si queda tiempo)
    if (queda() > 6e3) await sincronizarSalud(c, queda);
  } catch (e) {
    resultado.error = e instanceof Error ? e.message : String(e);
    if (e instanceof ErrorGarmin && e.status === 429) {
      pausa = new Date(Date.now() + PAUSA_SI_429).toISOString();
      resultado.error = "Garmin pide ir más despacio: sigo dentro de 15 minutos";
    }
  }
  await supabase.from("garmin_conexion").update({
    historial_desde: c.historial_desde,
    historial_completo: c.historial_completo,
    ultima_sync: new Date().toISOString(),
    ultimo_error: resultado.error,
    pausa_hasta: pausa,
    salud_desde: c.salud_desde ?? null,
    salud_ultima: c.salud_ultima ?? null,
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

const COLUMNAS = "user_id, clave, token, token_caduca, historial_desde, historial_completo, ultima_sync, pausa_hasta, salud_desde, salud_ultima";

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const cuerpo = await peticion.json().catch(() => ({}));

  // ¿Quién llama? Si trae la sesión de un usuario, es la app; si no, es el reloj (pg_cron)
  const jwt = (peticion.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await supabase.auth.getUser(jwt).catch(() => ({ data: { user: null } }));

  if (!user) {
    const { data: conexiones } = await supabase.from("garmin_conexion").select(COLUMNAS);
    const resultados = [];
    for (const c of conexiones ?? []) resultados.push(await sincronizar(c, true));
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
    if (c) await sincronizar({ ...c, pausa_hasta: accion === "conectar" ? null : c.pausa_hasta });
  }
  return responder(await estado(user.id));
});
