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
// Necesita dos secretos (Edge Functions → Secrets): VAPID_PUBLICA y VAPID_PRIVADA.
// =====================================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // la llave de servicio: solo existe aquí dentro
);

webpush.setVapidDetails(
  "https://davichula.github.io/horario/",
  Deno.env.get("VAPID_PUBLICA")!,
  Deno.env.get("VAPID_PRIVADA")!,
);

const MARGEN = 15 * 60000; // un aviso con más de 15 min de retraso ya no se manda

Deno.serve(async () => {
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
