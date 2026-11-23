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

// ---------------------------------------------------------------------
// Carrera: mejores tiempos dentro de una carrera (1 km, 5 km, 10 km...)
// ---------------------------------------------------------------------
export const DISTANCIAS_CARRERA = [1000, 5000, 10000, 21097.5, 42195];
export const NOMBRE_DISTANCIA = { 1000: "1 km", 5000: "5 km", 10000: "10 km", 21097.5: "Media maratón", 42195: "Maratón" };

// El trozo más rápido de cada distancia, mirando la distancia acumulada
// punto a punto (puntos.d, en metros) y el tiempo (puntos.t, en segundos).
export function mejoresCarrera(act) {
  const { t, d } = act.puntos || {};
  const mejores = {};
  if (!t?.length || !d?.length) return mejores;
  // Quitamos puntos sin distancia y los "saltos atrás" del GPS
  const T = [], D = [];
  for (let i = 0; i < t.length; i++) if (d[i] != null && (!D.length || d[i] >= D.at(-1))) { T.push(t[i]); D.push(d[i]); }
  const total = D.at(-1) || 0;
  for (const dist of DISTANCIAS_CARRERA) {
    if (total < dist * 0.995) continue;
    let mejor = Infinity, j = 0;
    for (let i = 1; i < D.length; i++) {
      // j = el último punto que deja al menos "dist" metros hasta i
      while (j + 1 < i && D[i] - D[j + 1] >= dist) j++;
      const tramo = D[i] - D[j];
      if (tramo < dist * 0.995) continue;
      const tiempo = (T[i] - T[j]) * (dist / tramo);
      if (tiempo > 0 && tiempo < mejor) mejor = tiempo;
    }
    // Más rápido que 2:30 /km es un fallo del GPS, no un récord
    if (isFinite(mejor) && dist / mejor < 6.7) mejores[dist] = Math.round(mejor);
  }
  return mejores;
}

// ---------------------------------------------------------------------
// Todo lo que se calcula de cada actividad a partir de su detalle
// (los puntos segundo a segundo, los largos, las series de gimnasio).
// Se guarda en el resumen para no tener que volver a leer el detalle.
// Si añadimos cálculos nuevos, subimos VERSION_CALC y las actividades
// antiguas se recalculan solas una vez.
// ---------------------------------------------------------------------
export const VERSION_CALC = 3;
export const DURACIONES_CURVA = [60, 180, 300, 600, 1200, 1800, 3600, 5400, 7200];

export function derivados(det) {
  const r = { calc: VERSION_CALC };
  const p = det.puntos || {};
  if (det.deporte === "nadar" && det.largosDetalle) {
    r.mejores = mejoresNado(det);
    Object.assign(r, nado(det));
  }
  if (det.deporte === "correr" && p.d) r.mejores = mejoresCarrera(det);
  if (p.fc && p.t) r.fcHist = histogramaPulso(p);
  if (["correr", "bici", "andar"].includes(det.deporte)) Object.assign(r, eficiencia(det));
  if ((det.deporte === "correr" || det.deporte === "bici") && p.t && p.d) r.curva = curvaVelocidad(p, det.deporte === "correr" ? 6.7 : 25);
  if (det.deporte === "bici" && p.pot && p.t) r.curvaPot = curvaPotencia(p);
  if (det.series?.length) r.gym = gimnasio(det.series);
  return r;
}

// Segundos en cada tramo de 5 pulsaciones: {"120": 300, "125": 610...}
// (con esto se sacan las zonas aunque cambies tus pulsaciones máximas)
function histogramaPulso(p) {
  const h = {};
  for (let i = 1; i < p.t.length; i++) {
    const f = p.fc[i], dt = Math.min(30, p.t[i] - p.t[i - 1]);
    if (!f || dt <= 0) continue;
    const k = Math.floor(f / 5) * 5;
    h[k] = (h[k] || 0) + dt;
  }
  return h;
}

// Eficiencia aeróbica (EF): cuánto avanzas por cada latido.
//   carrera: metros por minuto ÷ pulso; bici con potencia: vatios ÷ pulso.
// Desacople: cuánto empeora la eficiencia de la 1ª mitad a la 2ª.
// Por debajo del 5 % = buena base aeróbica.
function eficiencia(det) {
  const p = det.puntos || {};
  if (!p.fc || !p.t || (!p.v && !p.pot)) return {};
  const usaPot = det.deporte === "bici" && p.pot?.some((x) => x > 0);
  const minimo = det.deporte === "bici" ? 2 : det.deporte === "correr" ? 1.4 : 0.5;
  const tramos = [];
  for (let i = 1; i < p.t.length; i++) {
    const dt = Math.min(30, p.t[i] - p.t[i - 1]), f = p.fc[i], v = p.v?.[i];
    if (dt <= 0 || !f || f < 60 || !(v >= minimo)) continue;
    tramos.push({ dt, f, x: usaPot ? p.pot[i] || 0 : v * 60 });
  }
  const segundos = tramos.reduce((s, x) => s + x.dt, 0);
  if (segundos < 15 * 60) return {};
  const ef = (xs) => { const t = xs.reduce((s, x) => s + x.dt, 0); return xs.reduce((s, x) => s + x.x * x.dt, 0) / t / (xs.reduce((s, x) => s + x.f * x.dt, 0) / t); };
  const r = { ef: Math.round(ef(tramos) * 1000) / 1000, efPot: usaPot || undefined };
  if (segundos >= 40 * 60) {
    let acum = 0, corte = 0;
    while (acum < segundos / 2) acum += tramos[corte++].dt;
    const a = ef(tramos.slice(0, corte)), b = ef(tramos.slice(corte));
    r.desacople = Math.round(((a - b) / a) * 1000) / 10;
  }
  return r;
}

// Curva de velocidad: tu mejor velocidad media (m/s) para cada duración
function curvaVelocidad(p, tope) {
  const T = [], D = [];
  for (let i = 0; i < p.t.length; i++) if (p.d[i] != null && (!D.length || p.d[i] >= D.at(-1))) { T.push(p.t[i]); D.push(p.d[i]); }
  const c = {};
  for (const dur of DURACIONES_CURVA) {
    if (!T.length || T.at(-1) - T[0] < dur) break;
    let mejor = 0, j = 0;
    for (let i = 1; i < T.length; i++) {
      while (j + 1 < i && T[i] - T[j + 1] >= dur) j++;
      if (T[i] - T[j] < dur) continue;
      const v = (D[i] - D[j]) / (T[i] - T[j]);
      if (v > mejor && v < tope) mejor = v;
    }
    if (mejor) c[dur] = Math.round(mejor * 1000) / 1000;
  }
  return c;
}
// Curva de potencia: tus mejores vatios medios para cada duración
function curvaPotencia(p) {
  const E = [0];
  for (let i = 1; i < p.t.length; i++) E.push(E[i - 1] + (p.pot[i] || 0) * Math.min(30, p.t[i] - p.t[i - 1]));
  const c = {};
  for (const dur of DURACIONES_CURVA) {
    if (p.t.at(-1) - p.t[0] < dur) break;
    let mejor = 0, j = 0;
    for (let i = 1; i < p.t.length; i++) {
      while (j + 1 < i && p.t[i] - p.t[j + 1] >= dur) j++;
      if (p.t[i] - p.t[j] < dur) continue;
      mejor = Math.max(mejor, (E[i] - E[j]) / (p.t[i] - p.t[j]));
    }
    if (mejor) c[dur] = Math.round(mejor);
  }
  return c;
}

// Natación: metros de cada estilo, tiempo a cada ritmo y series
function nado(det) {
  const piscina = det.piscina || 25;
  const estilos = {}, ritmoHist = {};
  for (const l of det.largosDetalle) {
    if (!l.activo || !(l.dur > 0)) continue;
    const e = l.estilo || "freestyle";
    estilos[e] = (estilos[e] || 0) + piscina;
    const r = Math.floor(((l.dur / piscina) * 100) / 2) * 2; // segundos por 100 m, de 2 en 2
    ritmoHist[r] = (ritmoHist[r] || 0) + l.dur;
  }
  const series = (det.vueltas || []).filter((v) => v.dist > 0);
  return { estilos, ritmoHist, seriesNado: series.length ? { n: series.length, metros: Math.round(series.reduce((s, v) => s + v.dist, 0) / series.length) } : undefined };
}

// Gimnasio: por cada ejercicio, series, repeticiones, peso máximo y volumen
function gimnasio(series) {
  const g = {};
  for (const s of series) {
    if (s.descanso) continue;
    const e = (g[s.ejercicio || "Ejercicio"] ??= { series: 0, reps: 0, kgMax: 0, vol: 0 });
    e.series++; e.reps += s.reps || 0;
    if (s.peso) { e.kgMax = Math.max(e.kgMax, s.peso); e.vol += (s.reps || 0) * s.peso; }
  }
  for (const e of Object.values(g)) e.vol = Math.round(e.vol);
  return g;
}

// Las actividades antiguas se guardaron sin estos cálculos: las
// completamos una vez leyendo su detalle (poco a poco, sin bloquear).
let completando = null;
export const faltanCalculos = () => almacen.listar().filter((a) => a.calc !== VERSION_CALC);
export function completarCalculos(alAvanzar = () => {}) {
  completando ??= (async () => {
    const faltan = faltanCalculos();
    let hechas = 0, lote = {};
    const guardarLote = () => { if (Object.keys(lote).length) almacen.actualizarResumenes(lote); lote = {}; };
    for (const r of faltan) {
      const det = await almacen.detalle(r.id).catch(() => null);
      if (!det) continue; // sin conexión: ya lo intentaremos otro día
      lote[r.id] = derivados(det);
      if (++hechas % 20 === 0) { guardarLote(); alAvanzar(hechas, faltan.length); }
    }
    guardarLote();
    completando = null;
    return hechas;
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
export function records(lista, deporte, distancias) {
  const acts = lista.filter((a) => a.deporte === deporte && a.mejores);
  const haceAnio = Date.now() - 365 * DIA;
  return distancias.map((d) => {
    let mejor = null, mejorAnio = null;
    for (const a of acts) {
      const t = a.mejores[d];
      if (!t) continue;
      if (!mejor || t < mejor.t) mejor = { t, id: a.id, fecha: a.inicio };
      if (new Date(a.inicio) >= haceAnio && (!mejorAnio || t < mejorAnio.t)) mejorAnio = { t, id: a.id, fecha: a.inicio };
    }
    return { distancia: d, mejor, mejorAnio };
  }).filter((r) => r.mejor);
}
export const recordsNado = (lista = almacen.listar()) => records(lista, "nadar", DISTANCIAS_NADO);
export const recordsCarrera = (lista = almacen.listar()) => records(lista, "correr", DISTANCIAS_CARRERA);

// ---------------------------------------------------------------------
// Predicción de tiempos de carrera
// ---------------------------------------------------------------------
// 1) Con tus mejores tiempos recientes (fórmula de Riegel, la que usan
//    Strava y Runalyze): T2 = T1 × (D2 / D1)^1,06. Usamos tus mejores 5 km,
//    10 km y media del último año y nos quedamos con la mejor predicción.
// 2) Con tu VO2max de Garmin (tablas de Jack Daniels): el ritmo que
//    puedes aguantar depende del % de tu VO2max que sostienes según dure.
export const DISTANCIAS_PREDICCION = [5000, 10000, 21097.5, 42195];

export function prediccionRiegel(lista = almacen.listar(), dias = 365) {
  const desde = Date.now() - dias * DIA;
  const base = [];
  for (const a of lista) {
    if (a.deporte !== "correr" || !a.mejores || new Date(a.inicio) < desde) continue;
    for (const d of [5000, 10000, 21097.5]) if (a.mejores[d]) base.push({ d, t: a.mejores[d], fecha: a.inicio, id: a.id });
  }
  if (!base.length) return null;
  return DISTANCIAS_PREDICCION.map((D) => {
    let mejor = null;
    for (const b of base) {
      const t = b.t * (D / b.d) ** 1.06;
      if (!mejor || t < mejor.t) mejor = { t, desde: b };
    }
    return { distancia: D, ...mejor };
  });
}

// Daniels: oxígeno que pide correr a v metros/min y % de VO2max que aguantas t minutos
const coste = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v;
const aguante = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
export function tiempoPorVo2(vo2, distancia) {
  let lo = 1, hi = 600; // minutos
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (coste(distancia / mid) / aguante(mid) > vo2) lo = mid; else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 60);
}

// ---------------------------------------------------------------------
// Objetivo: cómo llegarás el día de la carrera
// ---------------------------------------------------------------------
export const TIPOS_OBJETIVO = {
  "5k": { nombre: "5 km", distancia: 5000, icono: "🏃" },
  "10k": { nombre: "10 km", distancia: 10000, icono: "🏃" },
  media: { nombre: "Media maratón", distancia: 21097.5, icono: "🏃" },
  maraton: { nombre: "Maratón", distancia: 42195, icono: "🏃" },
  sprint: { nombre: "Triatlón sprint", icono: "🏊🚴🏃" },
  olimpico: { nombre: "Triatlón olímpico", icono: "🏊🚴🏃" },
  medio: { nombre: "Medio Ironman (70.3)", icono: "🏊🚴🏃" },
  ironman: { nombre: "Ironman", icono: "🏊🚴🏃" },
  otro: { nombre: "Otra prueba", icono: "🎯" },
};

// La etapa del plan según las semanas que faltan
export function etapa(semanas) {
  if (semanas < 0) return { nombre: "Ya pasó", texto: "La fecha ya ha pasado. Pon tu próximo objetivo en ⚙️ Ajustes." };
  if (semanas <= 2) return { nombre: "Afinado", texto: "Baja el volumen un 30-50 % y mantén algo de intensidad: llegarás fresco." };
  if (semanas <= 8) return { nombre: "Específico", texto: "Entrenos parecidos a la prueba: ritmos de carrera y tiradas largas." };
  if (semanas <= 16) return { nombre: "Construcción", texto: "Sube la carga poco a poco (la forma física, unos 3-5 puntos por semana)." };
  return { nombre: "Base", texto: "Mucho volumen suave y constancia. Es el momento de construir el motor sin lesionarte." };
}

// Si sigues entrenando como las últimas 4 semanas (y afinas las 2 últimas),
// ¿con qué forma física y frescura llegarías?
export function proyectar(dias, fecha) {
  if (!dias.length) return null;
  const hoy = dias.at(-1);
  const n = Math.round((diaDe(fecha) - diaDe(hoy.fecha)) / DIA);
  if (n <= 0) return null;
  const media28 = media(dias.slice(-28).map((d) => d.carga));
  let ctl = hoy.ctl, atl = hoy.atl, ctlSin = hoy.ctl, atlSin = hoy.atl;
  for (let i = 1; i <= n; i++) {
    const carga = n - i < 14 ? media28 * 0.6 : media28;
    ctl += (carga - ctl) / 42; atl += (carga - atl) / 7;
    ctlSin += (media28 - ctlSin) / 42; atlSin += (media28 - atlSin) / 7;
  }
  return { dias: n, cargaSemanal: media28 * 7, ctl, tsb: ctl - atl, ctlSinAfinar: ctlSin, tsbSinAfinar: ctlSin - atlSin };
}

// ---------------------------------------------------------------------
// Zonas de pulso (las de Garmin, por % de tus pulsaciones máximas)
// ---------------------------------------------------------------------
export const ZONAS_FC = [
  { nombre: "Z1", texto: "Muy suave", desde: 0.5 },
  { nombre: "Z2", texto: "Suave", desde: 0.6 },
  { nombre: "Z3", texto: "Moderado", desde: 0.7 },
  { nombre: "Z4", texto: "Fuerte", desde: 0.8 },
  { nombre: "Z5", texto: "Máximo", desde: 0.9 },
];
// Segundos en cada zona a partir del histograma de una o varias actividades
export function segundosEnZonas(hists, fcMax) {
  const z = [0, 0, 0, 0, 0];
  for (const h of hists) for (const [k, seg] of Object.entries(h || {})) {
    const i = ZONAS_FC.findLastIndex((x) => Number(k) + 2.5 >= x.desde * fcMax);
    z[Math.max(0, i)] += seg;
  }
  return z;
}

// Zonas por semana (para el 80/20): [{desde, z:[s1..s5]}]
export function zonasPorSemana(lista, n, fcMax) {
  return totales(lista, "semana", n).map((p) => ({
    desde: p.desde,
    z: segundosEnZonas(lista.filter((a) => { const f = new Date(a.inicio); return f >= p.desde && f < p.hasta; }).map((a) => a.fcHist), fcMax),
  }));
}

// ---------------------------------------------------------------------
// Monotonía y estrés semanal (Carl Foster)
//   monotonía = carga media diaria ÷ su desviación (más de 2 = siempre igual)
//   estrés = carga de la semana × monotonía
// ---------------------------------------------------------------------
function monoDe(cargas) {
  const m = media(cargas);
  const sd = Math.sqrt(media(cargas.map((c) => (c - m) ** 2)));
  const mono = m === 0 ? 0 : Math.min(4, sd ? m / sd : 4);
  return { monotonia: mono, carga: m * 7, estres: m * 7 * mono };
}
export function monotonia(dias, semanas = 12) {
  const hoy = monoDe(dias.slice(-7).map((d) => d.carga));
  const porSemana = [];
  const lunes = lunesDe(new Date());
  for (let k = semanas - 1; k >= 0; k--) {
    const desde = new Date(lunes); desde.setDate(desde.getDate() - 7 * k);
    const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 7);
    const cs = dias.filter((d) => d.fecha >= desde && d.fecha < hasta).map((d) => d.carga);
    while (cs.length < 7 && k > 0) cs.push(0);
    porSemana.push({ desde, ...monoDe(cs.length ? cs : [0]) });
  }
  return { hoy, porSemana };
}

// ---------------------------------------------------------------------
// Constancia: rachas
// ---------------------------------------------------------------------
export function rachas(lista) {
  const dias = new Set(lista.map((a) => claveDia(diaDe(a.inicio))));
  const hoy = diaDe(new Date());
  // Racha de días (si hoy aún no has entrenado, cuenta desde ayer)
  let actual = 0;
  const d = new Date(hoy);
  if (!dias.has(claveDia(d))) d.setDate(d.getDate() - 1);
  while (dias.has(claveDia(d))) { actual++; d.setDate(d.getDate() - 1); }
  let larga = 0, n = 0;
  [...dias].sort().forEach((k, i, xs) => {
    const ant = i && new Date(xs[i - 1] + "T12:00");
    n = ant && (new Date(k + "T12:00") - ant) / DIA < 1.5 ? n + 1 : 1;
    larga = Math.max(larga, n);
  });
  // Semanas seguidas con al menos 3 entrenos
  const sem = totales(lista, "semana", 104);
  let semanas = 0;
  for (let i = sem.length - 1; i >= 0; i--) {
    if (sem[i].sesiones >= 3) semanas++;
    else if (i !== sem.length - 1) break; // la semana actual aún puede completarse
  }
  const haceAnio = new Date(hoy); haceAnio.setFullYear(hoy.getFullYear() - 1);
  return { actual, larga, semanas, diasAnio: [...dias].filter((k) => new Date(k + "T12:00") > haceAnio).length };
}

// ---------------------------------------------------------------------
// Natación: zonas de ritmo con tu CSS (en segundos por 100 m)
// ---------------------------------------------------------------------
export function zonasCss(css) {
  return [
    { nombre: "Suave", texto: "Calentar, técnica, recuperar", desde: css + 15, hasta: Infinity },
    { nombre: "Aeróbico", texto: "Fondo, series largas", desde: css + 8, hasta: css + 15 },
    { nombre: "Tempo", texto: "Ritmo de triatlón largo", desde: css + 3, hasta: css + 8 },
    { nombre: "Umbral", texto: "Series al ritmo CSS", desde: css - 2, hasta: css + 3 },
    { nombre: "Rápido", texto: "Series cortas y sprints", desde: 0, hasta: css - 2 },
  ];
}

// ---------------------------------------------------------------------
// Gimnasio: a qué grupo muscular va cada ejercicio
// ---------------------------------------------------------------------
const GRUPOS = {
  Pecho: ["Press de banca", "Aperturas", "Flexiones"],
  Espalda: ["Remo", "Dominadas", "Encogimientos"],
  Hombros: ["Press de hombro", "Elevaciones laterales"],
  Brazos: ["Curl", "Tríceps"],
  Piernas: ["Sentadilla", "Zancadas", "Curl femoral", "Gemelos", "Elevación de cadera", "Peso muerto", "Estabilidad de cadera", "Kettlebell swing"],
  Core: ["Plancha", "Abdominales", "Elevación de piernas", "Core", "Leñador"],
};
export const grupoDe = (ej) => Object.keys(GRUPOS).find((g) => GRUPOS[g].includes(ej)) || (ej === "Ejercicio" ? "Sin nombre" : "Otros");

// ---------------------------------------------------------------------
// Triatlón: lo que suele pedir cada distancia (horas a la semana en la
// fase de construcción y la sesión más larga que conviene haber hecho)
// ---------------------------------------------------------------------
export const PLAN_TRI = {
  sprint: { nombre: "Triatlón sprint", horas: { nadar: 1.5, bici: 2.5, correr: 2 }, largo: { nadar: 750, bici: 20000, correr: 5000 } },
  olimpico: { nombre: "Triatlón olímpico", horas: { nadar: 2, bici: 3.5, correr: 2.5 }, largo: { nadar: 1500, bici: 40000, correr: 10000 } },
  medio: { nombre: "Medio Ironman (70.3)", horas: { nadar: 2.5, bici: 5, correr: 3 }, largo: { nadar: 1900, bici: 90000, correr: 21100 } },
  ironman: { nombre: "Ironman", horas: { nadar: 3.5, bici: 8, correr: 4.5 }, largo: { nadar: 3800, bici: 180000, correr: 42200 } },
};
export function preparacionTri(lista, tipo) {
  const plan = PLAN_TRI[tipo] || PLAN_TRI.medio;
  const hace4 = Date.now() - 28 * DIA, hace6 = Date.now() - 42 * DIA;
  return { plan, deportes: ["nadar", "bici", "correr"].map((d) => {
    const acts = lista.filter((a) => a.deporte === d);
    const horas = acts.filter((a) => new Date(a.inicio) >= hace4).reduce((s, a) => s + (a.duracion || 0), 0) / 3600 / 4;
    const largo = Math.max(0, ...acts.filter((a) => new Date(a.inicio) >= hace6).map((a) => a.distancia || 0));
    return { d, horas, objetivoHoras: plan.horas[d], largo, objetivoLargo: plan.largo[d] };
  }) };
}
