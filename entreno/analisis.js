// =====================================================================
// entreno/analisis.js — los cálculos (sin dibujar nada)
// ---------------------------------------------------------------------
// Aquí está "la ciencia" que usan TrainingPeaks, intervals.icu o Strava:
//
//   CARGA (TSS): un número por entreno que mide cuánto te ha costado.
//     100 = una hora a tope sostenible (tu "umbral"). Se calcula:
//       - por pulso (lo normal): cuánto tiempo y a qué % de tu pulso
//         de reserva. Fórmula TRIMP de Banister, escalada para que
//         1 hora en tu umbral sean 100.
//       - en piscina, por ritmo: comparado con tu CSS (el ritmo que
//         aguantarías unos 30 min). sTSS = horas × (ritmo/CSS)³ × 100.
//       - si no hay ni pulso ni ritmo: la carga que da Garmin o, si
//         tampoco, una estimación por duración.
//
//   FORMA (gráfica de rendimiento):
//     - Forma física (CTL): media de tu carga de las últimas ~6 semanas.
//     - Cansancio (ATL): media de la última ~semana.
//     - Frescura (TSB): forma física − cansancio. Negativa = cargado,
//       positiva = fresco.
//
//   RIESGO: si la carga de esta semana es mucho mayor que tu media de
//     las últimas 4 (ACWR) o tu forma física sube muy deprisa (rampa).
// =====================================================================

import * as almacen from "./almacen.js";

const DIA = 864e5;
const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export const diaDe = (fecha) => { const d = new Date(fecha); d.setHours(0, 0, 0, 0); return d; };
export const claveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------------
// Natación: mejores tiempos dentro de una sesión
// ---------------------------------------------------------------------
export const DISTANCIAS_NADO = [100, 200, 400, 800, 1500];

// Mejor tiempo para cada distancia nadando largos seguidos (sin parar).
// largos = act.largosDetalle; piscina en metros.
export function mejoresNado(act) {
  const piscina = act.piscina || 25;
  const largos = act.largosDetalle || [];
  const mejores = {};
  // Trozos de largos seguidos (un descanso corta el trozo)
  const trozos = [];
  let actual = [];
  for (const l of largos) {
    if (l.activo && l.dur > 0) actual.push(l.dur);
    else { if (actual.length) trozos.push(actual); actual = []; }
  }
  if (actual.length) trozos.push(actual);
  for (const d of DISTANCIAS_NADO) {
    const n = Math.round(d / piscina);
    if (n < 1 || n * piscina !== d) continue;
    let mejor = null;
    for (const t of trozos) {
      if (t.length < n) continue;
      let suma = t.slice(0, n).reduce((s, x) => s + x, 0);
      mejor = Math.min(mejor ?? Infinity, suma);
      for (let i = n; i < t.length; i++) { suma += t[i] - t[i - n]; mejor = Math.min(mejor, suma); }
    }
    if (mejor != null) mejores[d] = Math.round(mejor * 10) / 10;
  }
  return mejores;
}

// Las actividades de natación antiguas no traían "mejores": las
// completamos una vez leyendo su detalle (poco a poco, sin bloquear).
let completando = null;
export function completarNado(alTerminar = () => {}) {
  completando ??= (async () => {
    const faltan = almacen.listar().filter((a) => a.deporte === "nadar" && a.mejores === undefined);
    let hechas = 0, lote = {};
    const guardarLote = () => { if (Object.keys(lote).length) almacen.actualizarResumenes(lote); lote = {}; };
    for (const r of faltan) {
      const det = await almacen.detalle(r.id).catch(() => null);
      if (!det) continue; // sin conexión: ya lo intentaremos otro día
      lote[r.id] = { mejores: mejoresNado(det) };
      if (++hechas % 15 === 0) guardarLote();
    }
    guardarLote();
    completando = null;
    if (hechas) alTerminar(hechas);
  })();
  return completando;
}

// ---------------------------------------------------------------------
// Umbrales (lo que se usa como "100 %")
// ---------------------------------------------------------------------
export function umbrales(lista = almacen.listar()) {
  const aj = almacen.ajustes();
  const vistas = lista.map((a) => a.fcMax).filter((x) => x > 100 && x < 230);
  const fcMax = aj.fcMax || (vistas.length ? Math.max(...vistas) : 190);
  const fcReposo = aj.fcReposo || 50;
  const lthr = aj.lthr || Math.round(fcReposo + 0.85 * (fcMax - fcReposo)); // umbral de lactato aproximado
  return { fcMax, fcReposo, lthr, css: aj.css || cssEstimada(lista), cssEstimada: !aj.css, ftp: aj.ftp || null };
}

// CSS (ritmo crítico de natación) a partir de tus mejores 200 y 400 m
// de los últimos 6 meses: CSS = 200 m / (t400 − t200). En segundos por 100 m.
export function cssEstimada(lista = almacen.listar()) {
  const desde = Date.now() - 183 * DIA;
  const nados = lista.filter((a) => a.deporte === "nadar" && new Date(a.inicio) >= desde);
  const mejor = (d) => Math.min(...nados.map((a) => a.mejores?.[d]).filter(Boolean));
  const t200 = mejor(200), t400 = mejor(400);
  if (isFinite(t200) && isFinite(t400) && t400 > t200) return Math.round(((t400 - t200) / 2) * 10) / 10;
  // Si no hay series de 400: el ritmo medio más rápido en sesiones largas, un poco más lento
  const ritmos = nados.filter((a) => a.distancia >= 800 && a.velMedia).map((a) => 100 / a.velMedia).sort((a, b) => a - b);
  return ritmos.length ? Math.round(ritmos[0] * 1.03 * 10) / 10 : null;
}

// ---------------------------------------------------------------------
// Carga de una actividad
// ---------------------------------------------------------------------
function trimp(minutos, fc, u) {
  const r = Math.min(1.1, Math.max(0, (fc - u.fcReposo) / (u.fcMax - u.fcReposo)));
  return minutos * r * 0.64 * Math.exp(1.92 * r);
}

export function cargaDe(a, u) {
  const horas = (a.duracion || 0) / 3600;
  if (!horas) return { tss: 0, metodo: "nada" };
  // Bici con potencia y FTP: el TSS "de verdad"
  if (a.deporte === "bici" && u.ftp && (a.potenciaNormalizada || a.potencia)) {
    const IF = (a.potenciaNormalizada || a.potencia) / u.ftp;
    return { tss: Math.round(horas * IF * IF * 100), metodo: "potencia" };
  }
  // Natación: por ritmo frente a tu CSS (el pulso de muñeca en el agua falla mucho)
  if (a.deporte === "nadar" && u.css && a.velMedia) {
    const IF = Math.min(1.3, (u.css * a.velMedia) / 100); // CSS (s/100 m) ÷ tu ritmo (s/100 m)
    return { tss: Math.round(horas * IF ** 3 * 100), metodo: "ritmo" };
  }
  if (a.fcMedia && a.fcMedia > u.fcReposo) {
    const t = trimp(horas * 60, a.fcMedia, u) / trimp(60, u.lthr, u);
    return { tss: Math.round(t * 100), metodo: "pulso" };
  }
  if (a.carga) return { tss: Math.round(a.carga), metodo: "garmin" };
  return { tss: Math.round(horas * 40), metodo: "estimada" };
}

export const NOMBRE_METODO = {
  potencia: "por potencia", ritmo: "por ritmo de nado", pulso: "por pulso",
  garmin: "según Garmin", estimada: "estimada por duración", nada: "",
};

// ---------------------------------------------------------------------
// Día a día: carga, forma física, cansancio y frescura
// ---------------------------------------------------------------------
export function diario(lista = almacen.listar(), u = umbrales(lista)) {
  if (!lista.length) return [];
  const porDia = new Map();
  for (const a of lista) {
    const k = claveDia(diaDe(a.inicio));
    const c = cargaDe(a, u).tss;
    porDia.set(k, (porDia.get(k) || 0) + c);
  }
  const primero = diaDe(lista.reduce((m, a) => (a.inicio < m ? a.inicio : m), lista[0].inicio));
  const hoy = diaDe(new Date());
  const dias = [];
  let ctl = 0, atl = 0;
  for (let d = new Date(primero); d <= hoy; d.setDate(d.getDate() + 1)) {
    const carga = porDia.get(claveDia(d)) || 0;
    ctl += (carga - ctl) / 42;
    atl += (carga - atl) / 7;
    dias.push({ fecha: new Date(d), carga, ctl, atl, tsb: ctl - atl });
  }
  return dias;
}

// En qué zona está tu frescura (los mismos cortes que usa intervals.icu)
export function zonaForma(tsb) {
  if (tsb > 25) return { nombre: "Perdiendo forma", texto: "Llevas tiempo descansando: buena para una carrera, pero estás perdiendo forma.", clase: "transicion" };
  if (tsb > 5) return { nombre: "Fresco", texto: "Descansado. Buen momento para una prueba o un entreno duro.", clase: "fresco" };
  if (tsb >= -10) return { nombre: "Equilibrado", texto: "Ni cargado ni fresco: mantienes la forma.", clase: "neutro" };
  if (tsb >= -30) return { nombre: "Construyendo", texto: "Cansancio productivo: así es como se mejora.", clase: "optimo" };
  return { nombre: "Sobrecarga", texto: "Mucho cansancio acumulado. Mete descanso pronto.", clase: "riesgo" };
}

// ---------------------------------------------------------------------
// Riesgo por subir la carga demasiado deprisa
// ---------------------------------------------------------------------
export function riesgo(dias) {
  if (dias.length < 14) return null;
  const ult = (n) => dias.slice(-n).map((d) => d.carga);
  const agudo = media(ult(7));          // carga media diaria de los últimos 7 días
  const cronico = media(ult(28));       // y de los últimos 28
  const acwr = cronico > 0 ? agudo / cronico : null;
  const hoy = dias.at(-1), haceSemana = dias.at(-8);
  const rampa = hoy.ctl - haceSemana.ctl; // cuánto ha subido tu forma física en 7 días
  let nivel = "bien", titulo = "Subida de carga segura", texto = "Estás aumentando la carga a un ritmo que el cuerpo asimila bien.";
  if (acwr == null || cronico < 5) {
    nivel = "neutro"; titulo = "Poca carga reciente"; texto = "Llevas pocas semanas entrenando. Sube poco a poco: no más de un 10 % por semana.";
  } else if (acwr > 1.5 || rampa > 8) {
    nivel = "alto"; titulo = "Riesgo alto de lesión";
    texto = "Esta semana llevas bastante más carga de la que tu cuerpo está acostumbrado. Baja el ritmo unos días.";
  } else if (acwr > 1.3 || rampa > 5) {
    nivel = "medio"; titulo = "Cuidado con la subida";
    texto = "Estás subiendo deprisa. Vigila molestias y no añadas más esta semana.";
  } else if (acwr < 0.8) {
    nivel = "bajo"; titulo = "Bajando carga";
    texto = "Entrenas menos de lo habitual. Bien para recuperar; si dura mucho, perderás forma.";
  }
  return { acwr, rampa, agudo: agudo * 7, cronico: cronico * 7, nivel, titulo, texto };
}

// ---------------------------------------------------------------------
// Totales por semana o mes, separados por deporte
// ---------------------------------------------------------------------
export function lunesDe(fecha) {
  const d = diaDe(fecha);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// periodo: "semana" | "mes"; n: cuántos periodos hacia atrás (incluido el actual)
export function totales(lista, periodo, n, u = umbrales(lista)) {
  const inicioDe = periodo === "semana" ? lunesDe : (f) => { const d = diaDe(f); d.setDate(1); return d; };
  const siguiente = (d) => { const x = new Date(d); if (periodo === "semana") x.setDate(x.getDate() + 7); else x.setMonth(x.getMonth() + 1); return x; };
  const periodos = [];
  let d = inicioDe(new Date());
  for (let i = 0; i < n; i++) {
    periodos.unshift({ desde: new Date(d), hasta: siguiente(d), deportes: {}, horas: 0, carga: 0, sesiones: 0, distancia: 0 });
    if (periodo === "semana") d.setDate(d.getDate() - 7); else d.setMonth(d.getMonth() - 1);
  }
  for (const a of lista) {
    const f = new Date(a.inicio);
    const p = periodos.find((x) => f >= x.desde && f < x.hasta);
    if (!p) continue;
    const dep = p.deportes[a.deporte] ??= { horas: 0, carga: 0, sesiones: 0, distancia: 0 };
    const h = (a.duracion || 0) / 3600, c = cargaDe(a, u).tss;
    dep.horas += h; dep.carga += c; dep.sesiones++; dep.distancia += a.distancia || 0;
    p.horas += h; p.carga += c; p.sesiones++; p.distancia += a.distancia || 0;
  }
  return periodos;
}

// ---------------------------------------------------------------------
// Natación: récords y evolución
// ---------------------------------------------------------------------
export function recordsNado(lista = almacen.listar()) {
  const nados = lista.filter((a) => a.deporte === "nadar" && a.mejores);
  const haceAnio = Date.now() - 365 * DIA;
  return DISTANCIAS_NADO.map((d) => {
    let mejor = null, mejorAnio = null;
    for (const a of nados) {
      const t = a.mejores[d];
      if (!t) continue;
      if (!mejor || t < mejor.t) mejor = { t, id: a.id, fecha: a.inicio };
      if (new Date(a.inicio) >= haceAnio && (!mejorAnio || t < mejorAnio.t)) mejorAnio = { t, id: a.id, fecha: a.inicio };
    }
    return { distancia: d, mejor, mejorAnio };
  }).filter((r) => r.mejor);
}
