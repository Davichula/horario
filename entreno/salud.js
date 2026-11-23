// =====================================================================
// entreno/salud.js — tus datos de salud de cada día (de Garmin)
// ---------------------------------------------------------------------
// La función "garmin" de Supabase los guarda en la tabla garmin_salud,
// un registro por día: pulso en reposo, sueño, VFC (variabilidad del
// pulso), Body Battery, estrés, pasos y VO2max. Aquí los leemos y los
// guardamos también en este dispositivo para verlos sin conexión.
// =====================================================================

const CLAVE = "mi-horario:entreno-salud";
const leerCache = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; } };

export const enCache = () => leerCache();

let cargando = null;
export function cargar() {
  cargando ??= (async () => {
    try {
      if (!window.nube || !navigator.onLine) return leerCache();
      const sb = await window.nube.supabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return leerCache();
      const filas = [];
      // De 1000 en 1000 (el máximo que devuelve Supabase de una vez)
      for (let desde = 0; desde < 5000; desde += 1000) {
        const { data, error } = await sb.from("garmin_salud").select("fecha, datos").order("fecha").range(desde, desde + 999);
        if (error) return leerCache(); // (si la tabla aún no existe, seguimos con lo que haya)
        filas.push(...data);
        if (data.length < 1000) break;
      }
      const dias = filas.map((f) => ({ fecha: f.fecha, ...f.datos }));
      try { localStorage.setItem(CLAVE, JSON.stringify(dias)); } catch {}
      return dias;
    } catch { return leerCache(); } finally { setTimeout(() => (cargando = null), 60e3); }
  })();
  return cargando;
}

// ¿Lleva el reloj puesto lo bastante para fiarse de los datos de todo el día?
// (si solo te lo pones para entrenar, el "pulso en reposo" sale altísimo)
export const fiable = (d) => d.llevado == null || d.llevado >= 0.5;

// Las métricas que sabemos enseñar
export const METRICAS = [
  { id: "fcReposo", nombre: "Pulso en reposo", unidad: "ppm", color: "var(--serie-pulso)", valor: (d) => (fiable(d) ? d.fcReposo : null), mejorBajo: true,
    texto: "Si sube 5 o más sobre lo normal varios días, suele ser cansancio, mal sueño o que te estás poniendo malo." },
  { id: "vfc", nombre: "VFC nocturna", unidad: "ms", color: "var(--c-vfc)", valor: (d) => d.vfc?.noche ?? null,
    texto: "Variabilidad del pulso mientras duermes. Más alta = mejor recuperado. Lo que importa es compararla con tu normal." },
  { id: "sueno", nombre: "Sueño", unidad: "h", color: "var(--c-sueno)", valor: (d) => (d.sueno?.total ? d.sueno.total / 3600 : null), decimales: 1,
    texto: "Horas dormidas. Para entrenar fuerte se recomiendan 7 a 9 h." },
  { id: "puntSueno", nombre: "Puntuación de sueño", unidad: "", color: "var(--c-sueno)", valor: (d) => d.sueno?.puntuacion ?? null,
    texto: "La nota de 0 a 100 que da Garmin a cada noche." },
  { id: "bbMax", nombre: "Body Battery máxima", unidad: "", color: "var(--c-energia)", valor: (d) => (fiable(d) ? d.bbMax : null),
    texto: "La energía con la que empiezas el día (0 a 100). Se carga durmiendo y se gasta con el estrés y el ejercicio." },
  { id: "estres", nombre: "Estrés medio", unidad: "", color: "var(--c-estres)", valor: (d) => (fiable(d) ? d.estres : null), mejorBajo: true,
    texto: "De 0 a 100, medido con la VFC durante el día. Por debajo de 25 es descanso." },
  { id: "pasos", nombre: "Pasos", unidad: "", color: "var(--c-pasos)", valor: (d) => d.pasos ?? null,
    texto: "Pasos del día contados por el reloj (solo cuenta cuando lo llevas puesto)." },
  { id: "vo2", nombre: "VO2max carrera", unidad: "", color: "var(--c-ritmo)", valor: (d) => d.vo2 ?? null, decimales: 1, escalonada: true,
    texto: "Tu capacidad aeróbica máxima según Garmin. Se actualiza al correr con pulso y GPS." },
  { id: "vo2Bici", nombre: "VO2max bici", unidad: "", color: "var(--c-potencia)", valor: (d) => d.vo2Bici ?? null, decimales: 1, escalonada: true,
    texto: "La misma medida en bici. Solo aparece si tienes medidor de potencia." },
];

// Una serie diaria (con huecos) entre dos fechas
export function serieDiaria(dias, metrica, desde, hasta) {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const xs = [], ys = [];
  for (let t = new Date(desde); t <= hasta; t.setDate(t.getDate() + 1)) {
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    xs.push(t.getTime());
    const d = porFecha.get(k);
    ys.push(d ? metrica.valor(d) : null);
  }
  // VO2max solo cambia de vez en cuando: rellenamos hacia delante
  if (metrica.escalonada) { let ultimo = null; for (let i = 0; i < ys.length; i++) { if (ys[i] != null) ultimo = ys[i]; else ys[i] = ultimo; } }
  return { xs, ys };
}

// Media móvil de n días (ignora huecos)
export function mediaMovil(ys, n = 7) {
  return ys.map((_, i) => {
    const v = ys.slice(Math.max(0, i - n + 1), i + 1).filter((x) => x != null);
    return v.length >= Math.min(3, n) ? v.reduce((s, x) => s + x, 0) / v.length : null;
  });
}
