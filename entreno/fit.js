// =====================================================================
// entreno/fit.js — leer los archivos .FIT de tu Garmin
// ---------------------------------------------------------------------
// Un archivo .FIT es el "diario" que guarda el reloj durante una
// actividad: cada segundo apunta dónde estás, tu pulso, tu velocidad...
// y al final un resumen (distancia, tiempo, calorías).
//
// Para entenderlo usamos el lector OFICIAL de Garmin (el "FIT SDK").
// Su licencia no deja copiarlo dentro de tu repositorio, así que la web
// lo descarga de internet (cdn.jsdelivr.net) la primera vez que subes un
// archivo. Por eso subir actividades necesita conexión.
//
// Este archivo convierte lo que da Garmin en un objeto más cómodo, con
// nombres en español, que es lo que guarda y dibuja el resto de entreno/.
// =====================================================================

const FIT_SDK = "https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.222.0/src/index.js";
let sdk = null;
const cargarSdk = () => (sdk ??= import(FIT_SDK).catch((e) => { sdk = null; throw e; }));

// Como mucho guardamos este número de puntos por actividad (uno cada pocos
// segundos). Es de sobra para las gráficas y el mapa, y ocupa poco.
const MAX_PUNTOS = 2000;

// ----- Deportes -----
// Garmin dice "running", "swimming"... Lo pasamos a nuestras 4 familias.
const DEPORTES = {
  correr: { nombre: "Correr", icono: "🏃" },
  nadar: { nombre: "Nadar", icono: "🏊" },
  bici: { nombre: "Bici", icono: "🚴" },
  gimnasio: { nombre: "Gimnasio", icono: "🏋️" },
  otro: { nombre: "Otros", icono: "⌚" },
};
export { DEPORTES };

function familia(sport, subSport) {
  if (sport === "running") return "correr";
  if (sport === "swimming") return "nadar";
  if (sport === "cycling" || sport === "eBiking") return "bici";
  if (sport === "training" || sport === "fitnessEquipment" || subSport === "strengthTraining") return "gimnasio";
  return "otro";
}

// Nombre bonito para el título de la actividad
const NOMBRES = {
  running: { _: "Carrera", treadmill: "Carrera en cinta", trail: "Carrera por montaña", track: "Carrera en pista", indoorRunning: "Carrera en interior" },
  swimming: { _: "Natación", lapSwimming: "Natación en piscina", openWater: "Natación en aguas abiertas" },
  cycling: { _: "Bici", road: "Bici de carretera", mountain: "Bici de montaña", indoorCycling: "Bici en rodillo", gravelCycling: "Bici gravel", virtualActivity: "Bici virtual" },
  training: { _: "Entrenamiento", strengthTraining: "Fuerza", cardioTraining: "Cardio", yoga: "Yoga", pilates: "Pilates", hiit: "HIIT" },
  walking: { _: "Caminata" },
  hiking: { _: "Senderismo" },
  fitnessEquipment: { _: "Gimnasio", elliptical: "Elíptica", stairClimbing: "Escaleras", indoorRowing: "Remo" },
};
function nombreDe(sport, subSport) {
  const n = NOMBRES[sport];
  if (n) return n[subSport] || n._;
  return sport ? sport.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : "Actividad";
}

export const ESTILOS = {
  freestyle: "Libre", backstroke: "Espalda", breaststroke: "Braza", butterfly: "Mariposa",
  drill: "Técnica", mixed: "Mixto", im: "Estilos", imByRound: "Estilos", rimo: "Estilos",
};

const EJERCICIOS = {
  benchPress: "Press de banca", squat: "Sentadilla", deadlift: "Peso muerto", pullUp: "Dominadas",
  pushUp: "Flexiones", shoulderPress: "Press de hombro", row: "Remo", curl: "Curl", lunge: "Zancadas",
  plank: "Plancha", crunch: "Abdominales", tricepsExtension: "Tríceps", legCurl: "Curl femoral",
  legRaise: "Elevación de piernas", calfRaise: "Gemelos", lateralRaise: "Elevaciones laterales",
  hipRaise: "Elevación de cadera", flye: "Aperturas", shrug: "Encogimientos", chop: "Leñador",
  core: "Core", cardio: "Cardio", carry: "Paseo del granjero", hipStability: "Estabilidad de cadera",
  olympicLift: "Halterofilia", plyo: "Pliometría", sitUp: "Abdominales", totalBody: "Cuerpo completo",
  warmUp: "Calentamiento", run: "Carrera", bike: "Bici", hipSwing: "Kettlebell swing", sled: "Trineo",
  battleRope: "Cuerdas", elliptical: "Elíptica", floorClimb: "Escalada", indoorBike: "Bici estática",
  indoorRow: "Remo", ladder: "Escalera", sandbag: "Saco", sledge: "Martillo", suspension: "TRX", tire: "Rueda",
  bandedExercises: "Gomas", unknown: "Ejercicio",
};
const nombreEjercicio = (c) => EJERCICIOS[c] || (c ? c.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^./, (x) => x.toUpperCase()) : "Ejercicio");

// "fenix7xProSolar" → "Fenix 7X Pro Solar"
function nombreReloj(codigo) {
  if (!codigo || typeof codigo !== "string") return null;
  return codigo.replace(/(\d+)([a-z]+)?/, (_, n, l = "") => ` ${n}${l.toUpperCase()} `)
    .replace(/([A-Z][a-z])/g, " $1").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
}

// ----- Archivos .zip -----
// Garmin Connect, al "Exportar original", da un .zip con el .FIT dentro.
// Lo abrimos aquí mismo con lo que trae el navegador (DecompressionStream).
async function archivosDeZip(buffer) {
  const v = new DataView(buffer);
  // El "índice" del zip está al final: lo buscamos hacia atrás
  let fin = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("El .zip está dañado");
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const salida = [];
  for (let n = 0; n < total; n++) {
    const metodo = v.getUint16(p + 10, true);
    const tamComprimido = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComentario = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(new Uint8Array(buffer, p + 46, largoNombre));
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (!/\.(fit|zip)$/i.test(nombre)) continue;
    const inicioDatos = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = new Uint8Array(buffer, inicioDatos, tamComprimido);
    let contenido;
    if (metodo === 0) contenido = datos.slice().buffer;
    else if (metodo === 8) contenido = await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
    else continue;
    if (/\.zip$/i.test(nombre)) salida.push(...(await archivosDeZip(contenido)));
    else salida.push({ nombre, buffer: contenido });
  }
  return salida;
}

// Recibe los archivos que eliges en el móvil (.fit o .zip) y devuelve
// una lista de { nombre, actividad } o { nombre, error }
export async function leerArchivos(archivos, alAvanzar = () => {}) {
  const { Decoder, Stream } = await cargarSdk();
  const pendientes = [];
  for (const archivo of archivos) {
    const buffer = await archivo.arrayBuffer();
    if (/\.zip$/i.test(archivo.name)) {
      try { pendientes.push(...(await archivosDeZip(buffer))); }
      catch (e) { pendientes.push({ nombre: archivo.name, error: e.message }); }
    } else pendientes.push({ nombre: archivo.name, buffer });
  }
  const resultado = [];
  for (const [i, p] of pendientes.entries()) {
    alAvanzar(i + 1, pendientes.length);
    if (p.error) { resultado.push(p); continue; }
    try {
      const stream = Stream.fromArrayBuffer(p.buffer);
      if (!Decoder.isFIT(stream)) throw new Error("No es un archivo .FIT");
      const { messages, errors } = new Decoder(stream).read();
      if (!messages.sessionMesgs?.length) throw new Error(errors[0]?.message || "No tiene ninguna actividad");
      resultado.push({ nombre: p.nombre, actividad: convertir(messages) });
    } catch (e) {
      resultado.push({ nombre: p.nombre, error: e.message || String(e) });
    }
    // Dejamos respirar al navegador entre archivo y archivo
    await new Promise((r) => setTimeout(r, 0));
  }
  return resultado;
}

// ----- De "idioma Garmin" a nuestro objeto -----
const redondear = (x, d = 0) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const grados = (semicirculos) => (semicirculos == null ? null : semicirculos * (180 / 2 ** 31));
const media = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function convertir(m) {
  const s = m.sessionMesgs[0];
  const f = m.fileIdMesgs?.[0] || {};
  const deporte = familia(s.sport, s.subSport);
  const inicio = new Date(s.startTime || f.timeCreated || m.recordMesgs?.[0]?.timestamp);
  const esCorrer = deporte === "correr";
  // En carrera Garmin guarda la cadencia de UNA pierna: la doblamos (pasos/min)
  const cadencia = (c, frac = 0) => (c == null ? null : esCorrer ? (c + (frac || 0)) * 2 : c);
  const dispositivo = m.deviceInfoMesgs?.find((d) => d.deviceIndex === "creator" || d.deviceIndex === 0);

  const act = {
    id: `${f.serialNumber || "fit"}-${(f.timeCreated ? new Date(f.timeCreated) : inicio).getTime()}`,
    deporte,
    sport: s.sport || null,
    subSport: s.subSport || null,
    nombre: nombreDe(s.sport, s.subSport),
    inicio: inicio.toISOString(),
    duracion: redondear(s.totalTimerTime),        // tiempo con el reloj en marcha (s)
    transcurrido: redondear(s.totalElapsedTime),  // incluyendo pausas (s)
    distancia: redondear(s.totalDistance),        // metros
    desnivel: redondear(s.totalAscent),
    desnivelBajada: redondear(s.totalDescent),
    calorias: s.totalCalories ?? null,
    fcMedia: s.avgHeartRate ?? null,
    fcMax: s.maxHeartRate ?? null,
    velMedia: redondear(s.enhancedAvgSpeed ?? s.avgSpeed, 3), // m/s
    velMax: redondear(s.enhancedMaxSpeed ?? s.maxSpeed, 3),
    cadencia: esCorrer ? cadencia(s.avgRunningCadence ?? s.avgCadence, s.avgFractionalCadence) : (s.avgCadence ?? null),
    potencia: s.avgPower ?? null,
    potenciaNormalizada: s.normalizedPower ?? null,
    efectoAerobico: redondear(s.totalTrainingEffect, 1),
    efectoAnaerobico: redondear(s.totalAnaerobicTrainingEffect, 1),
    carga: redondear(s.trainingLoadPeak),
    temperatura: s.avgTemperature ?? null,
    dispositivo: dispositivo?.productName || nombreReloj(f.garminProduct || dispositivo?.garminProduct),
  };

  if (deporte === "nadar") {
    act.piscina = s.poolLength ? redondear(s.poolLength) : null;
    act.brazadas = s.totalCycles ?? null;
    act.largos = s.numActiveLengths ?? null;
    act.ritmo100 = act.velMedia ? redondear(100 / act.velMedia) : null; // s / 100 m
    const activos = (m.lengthMesgs || []).filter((l) => l.lengthType === "active");
    act.largosDetalle = (m.lengthMesgs || []).map((l) => ({
      t: Math.round((new Date(l.startTime) - inicio) / 1000),
      dur: redondear(l.totalTimerTime ?? l.totalElapsedTime, 1),
      brazadas: l.totalStrokes ?? null,
      estilo: l.swimStroke || null,
      activo: l.lengthType === "active",
    }));
    const swolfs = activos.map((l) => (l.totalStrokes != null ? (l.totalTimerTime ?? l.totalElapsedTime) + l.totalStrokes : null));
    act.swolf = redondear(media(swolfs));
  }

  // Vueltas (en natación, cada "vuelta" activa es una serie)
  act.vueltas = (m.lapMesgs || []).map((l) => ({
    t: Math.round((new Date(l.startTime) - inicio) / 1000),
    dur: redondear(l.totalTimerTime ?? l.totalElapsedTime, 1),
    dist: redondear(l.totalDistance, 1),
    fcMedia: l.avgHeartRate ?? null,
    fcMax: l.maxHeartRate ?? null,
    vel: redondear(l.enhancedAvgSpeed ?? l.avgSpeed, 3),
    cadencia: esCorrer ? cadencia(l.avgRunningCadence ?? l.avgCadence, l.avgFractionalCadence) : (l.avgCadence ?? null),
    potencia: l.avgPower ?? null,
    desnivel: l.totalAscent ?? null,
    estilo: l.swimStroke || null,
    largos: l.numActiveLengths ?? null,
  }));

  // Gimnasio: series con repeticiones y peso
  if (m.setMesgs?.length) {
    act.series = m.setMesgs.map((x) => ({
      ejercicio: nombreEjercicio(Array.isArray(x.category) ? x.category[0] : x.category),
      reps: x.repetitions ?? null,
      peso: x.weight ?? null,
      dur: redondear(x.duration),
      descanso: x.setType === "rest",
    }));
  }

  // Puntos segundo a segundo (reducidos)
  const recs = (m.recordMesgs || []).filter((r) => r.timestamp);
  const paso = Math.max(1, Math.ceil(recs.length / MAX_PUNTOS));
  const pts = { t: [], d: [], fc: [], v: [], alt: [], cad: [], pot: [], lat: [], lon: [] };
  for (let i = 0; i < recs.length; i += paso) {
    const r = recs[i];
    pts.t.push(Math.round((new Date(r.timestamp) - inicio) / 1000));
    pts.d.push(redondear(r.distance, 1));
    pts.fc.push(r.heartRate ?? null);
    pts.v.push(redondear(r.enhancedSpeed ?? r.speed, 2));
    pts.alt.push(redondear(r.enhancedAltitude ?? r.altitude, 1));
    pts.cad.push(cadencia(r.cadence, r.fractionalCadence));
    pts.pot.push(r.power ?? null);
    pts.lat.push(redondear(grados(r.positionLat), 6));
    pts.lon.push(redondear(grados(r.positionLong), 6));
  }
  // Quitamos las columnas que vienen vacías (p. ej. sin GPS en piscina)
  for (const k of Object.keys(pts)) if (!pts[k].some((x) => x != null)) delete pts[k];
  act.puntos = pts;
  act.gps = !!(pts.lat && pts.lon);
  if (act.fcMax == null && pts.fc) act.fcMax = Math.max(...pts.fc.filter(Boolean));
  return act;
}
