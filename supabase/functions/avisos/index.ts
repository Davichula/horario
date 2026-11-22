// =====================================================================
// Función "avisos" de Supabase (se ejecuta en los servidores de Supabase,
// no en la web). Supabase la llama cada minuto (ver supabase/avisos.sql).
//
// Qué hace cada vez:
//   1. Lee de la tabla "datos" la lista de avisos programados de cada usuario
//      (la que calcula avisos.js en la web).
//   2. Se queda con los que ya tocan (de los últimos 15 minutos) y que
//      todavía no se han mandado.
//   3. Los manda a cada móvil u ordenador con avisos activados (tabla
//      "suscripciones") y apunta que ya están enviados ("avisos_enviados").
//
// Para copiarla: Supabase → Edge Functions → Deploy a new function →
// Via Editor, nombre "avisos", y pegar este archivo entero.
// Las "llaves" para mandar notificaciones (VAPID) las crea ella misma la
// primera vez y las guarda en la tabla claves_vapid, que solo ella puede leer.
// La web le pide la parte pública llamando a esta función con ?clave.
// =====================================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // la llave de servicio: solo existe aquí dentro
);

// Lee las llaves de la tabla; si aún no hay, las crea y las guarda
async function llaves(): Promise<{ publica: string; privada: string }> {
  const { data } = await supabase.from("claves_vapid").select("publica, privada").eq("id", 1).maybeSingle();
  if (data) return data;
  const nuevas = webpush.generateVAPIDKeys();
  await supabase.from("claves_vapid").insert({ id: 1, publica: nuevas.publicKey, privada: nuevas.privateKey });
  // Por si dos llamadas las crearon a la vez, nos quedamos con la que quedó guardada
  const { data: guardadas } = await supabase.from("claves_vapid").select("publica, privada").eq("id", 1).single();
  return guardadas!;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const MARGEN = 15 * 60000; // un aviso con más de 15 min de retraso ya no se manda

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const { publica, privada } = await llaves();

  // La web pregunta por la llave pública para poder activar los avisos
  if (new URL(peticion.url).searchParams.has("clave")) {
    return new Response(JSON.stringify({ publica }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  webpush.setVapidDetails("https://davichula.github.io/horario/", publica, privada);
  const ahora = Date.now();
  let enviados = 0;

  const { data: filas, error } = await supabase
    .from("datos").select("user_id, valor").eq("clave", "mi-horario:avisos-programados");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  for (const fila of filas ?? []) {
    const pendientes = (Array.isArray(fila.valor) ? fila.valor : [])
      .filter((a) => a.cuando <= ahora && a.cuando > ahora - MARGEN);
    if (!pendientes.length) continue;

    const { data: suscripciones } = await supabase
      .from("suscripciones").select("endpoint, datos").eq("user_id", fila.user_id);
    if (!suscripciones?.length) continue;

    for (const aviso of pendientes) {
      // Apuntarlo primero: si ya estaba apuntado, es que ya se mandó
      const { error: repetido } = await supabase
        .from("avisos_enviados").insert({ user_id: fila.user_id, aviso_id: aviso.id });
      if (repetido) continue;

      const mensaje = JSON.stringify({ id: aviso.id, titulo: aviso.titulo, cuerpo: aviso.cuerpo });
      for (const s of suscripciones) {
        try {
          await webpush.sendNotification(s.datos, mensaje, { TTL: 3600, urgency: "high" });
          enviados++;
        } catch (e) {
          // 404/410: ese móvil ya no quiere avisos (app borrada, permiso quitado...)
          const codigo = (e as { statusCode?: number }).statusCode;
          if (codigo === 404 || codigo === 410) {
            await supabase.from("suscripciones").delete().eq("endpoint", s.endpoint);
          } else {
            console.error("No se pudo enviar", codigo, e);
          }
        }
      }
    }
  }

  // Limpieza: olvidamos lo enviado hace más de 3 días
  await supabase.from("avisos_enviados").delete()
    .lt("enviado_en", new Date(ahora - 3 * 86400000).toISOString());

  return new Response(JSON.stringify({ enviados }), { headers: { "Content-Type": "application/json" } });
});
