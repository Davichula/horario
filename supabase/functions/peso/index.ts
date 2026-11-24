// =====================================================================
// Función "peso" de Supabase: recibe tu peso desde un Atajo del iPhone.
// ---------------------------------------------------------------------
// Tu báscula (Renpho) guarda los datos en Apple Salud. Una web no puede
// leer Apple Salud, pero un Atajo de iOS sí. Así que:
//   báscula → Apple Salud → Atajo del iPhone → ESTA función → tu app
//
// Dos formas de llamarla:
//   1) La app, con tu sesión iniciada:  { accion: "token" }
//      → te da (o crea) el enlace secreto para el Atajo.
//   2) El Atajo, sin sesión, con el token en la dirección:
//      .../functions/v1/peso?token=XXXX&kg=72,5&grasa=14,2&magra=62,3&imc=23,7&fecha=2026-11-25
//      (todo menos el token es opcional; sin fecha se usa el día de hoy)
//
// La función apunta la medida dentro de tus datos de nutrición (la misma
// caja que sincroniza la app), así que aparece sola en Progreso.
// Esta función se despliega SIN comprobar JWT: la seguridad es el token.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CLAVE_PESOS = "mi-horario:nutricion-pesos"; // la misma clave que usa la app

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const responder = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Los Atajos mandan cosas como "72,5 kg" o "14.2 %": nos quedamos con el número
function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  const m = String(v).replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
const hoyEnMadrid = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }); // 2026-11-25
// Los errores de la base de datos no son "Error" normales: sacamos su mensaje para que se entienda
const mensaje = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e) ? String((e as { message: unknown }).message) : String(e);

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(peticion.url);
  const cuerpo = peticion.method === "GET" ? {} : await peticion.json().catch(() => ({}));
  const dato = (k: string) => cuerpo[k] ?? url.searchParams.get(k);

  try {
    // ---- 1) La app pide el enlace ----
    if (cuerpo.accion === "token") {
      const jwt = (peticion.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: { user } } = await supabase.auth.getUser(jwt).catch(() => ({ data: { user: null } }));
      if (!user) return responder({ error: "Inicia sesión en la app" }, 401);
      let { data: fila } = await supabase.from("peso_atajo").select("token").eq("user_id", user.id).maybeSingle();
      if (cuerpo.renovar || !fila) {
        const bytes = crypto.getRandomValues(new Uint8Array(24));
        const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        await supabase.from("peso_atajo").upsert({ user_id: user.id, token }, { onConflict: "user_id" });
        fila = { token };
      }
      return responder({ token: fila.token });
    }

    // ---- 2) El Atajo manda una medida ----
    const token = String(dato("token") ?? "");
    if (token.length < 20) return responder({ error: "Falta el token" }, 401);
    const { data: dueno } = await supabase.from("peso_atajo").select("user_id").eq("token", token).maybeSingle();
    if (!dueno) return responder({ error: "Token no válido" }, 401);

    const kg = numero(dato("kg"));
    if (!kg || kg < 30 || kg > 250) return responder({ error: "Peso no válido" }, 400);
    let grasa = numero(dato("grasa"));
    if (grasa != null && grasa > 0 && grasa < 1) grasa = grasa * 100; // Salud a veces da 0,14 en vez de 14
    const medida: Record<string, number> = { kg: Math.round(kg * 100) / 100 };
    if (grasa && grasa >= 2 && grasa <= 60) medida.grasa = Math.round(grasa * 10) / 10;
    const magra = numero(dato("magra")); if (magra && magra > 20 && magra < 200) medida.magra = Math.round(magra * 100) / 100;
    const imc = numero(dato("imc")); if (imc && imc > 10 && imc < 60) medida.imc = Math.round(imc * 10) / 10;
    const fechaTexto = String(dato("fecha") ?? "");
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaTexto) ? fechaTexto : hoyEnMadrid();

    // Juntamos con lo que ya hay (no pisamos otros días)
    const { data: actual, error: e1 } = await supabase.from("datos").select("valor").eq("user_id", dueno.user_id).eq("clave", CLAVE_PESOS).maybeSingle();
    if (e1) throw e1;
    const pesos = { ...(actual?.valor ?? {}) };
    pesos[fecha] = { ...(pesos[fecha] ?? {}), ...medida };
    const { error } = await supabase.from("datos").upsert(
      { user_id: dueno.user_id, clave: CLAVE_PESOS, valor: pesos, cambiado: Date.now() },
      { onConflict: "user_id,clave" },
    );
    if (error) throw error;
    return responder({ ok: true, fecha, ...medida });
  } catch (e) {
    return responder({ error: mensaje(e) }, 400);
  }
});
