// =====================================================================
// entreno/entreno.js — la sección "Entreno"
// ---------------------------------------------------------------------
// Dos pantallas:
//   - La LISTA de actividades (#entreno): resumen de la semana, filtros
//     por deporte y tus actividades agrupadas por mes.
//   - La FICHA de una actividad (#entreno/<id>): mapa, datos, gráficas,
//     zonas de pulso, vueltas, largos de piscina o series de gimnasio.
//
// secciones.js llama a iniciar() la primera vez que abres la pestaña y a
// mostrar() cada vez que cambia la dirección.
// =====================================================================

import { leerArchivos, DEPORTES, ESTILOS } from "./fit.js";
import * as almacen from "./almacen.js";
import * as garmin from "./garmin.js";
import { graficaLinea, graficaBarras, crearGrupo, suavizar, mapa } from "./graficas.js";

let caja = null;
let filtro = "todo";

export function iniciar(elemento) {
  caja = elemento;
  almacen.subirPendientes();
  traerDeGarmin();
  // Al volver a la app (p. ej. después de entrenar), miramos si hay algo nuevo
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") traerDeGarmin(); });
  // Mientras tienes Entreno abierto, cada minuto recogemos lo que haya traído Garmin
  setInterval(() => {
    if (document.visibilityState === "visible" && /^#\/?entreno/.test(location.hash)) traerDeGarmin();
  }, 60e3);
  // Si llegan actividades desde otro dispositivo, redibujamos la lista
  window.addEventListener("storage", (e) => { if (e.key === "mi-horario:entreno" && !location.hash.includes("/")) pintarLista(); });
  return { mostrar };
}

function mostrar(ruta) {
  if (ruta) pintarFicha(decodeURIComponent(ruta));
  else pintarLista();
}

// =====================================================================
// Formatos: cómo escribir tiempos, distancias y ritmos
// =====================================================================
const dos = (n) => String(n).padStart(2, "0");
export function tiempo(seg, corto = false) {
  if (seg == null) return "—";
  seg = Math.round(seg);
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  if (corto) return h ? `${h} h ${dos(m)} min` : `${m} min`;
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}
const km = (m, dec = 2) => (m == null ? "—" : `${(m / 1000).toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec })} km`);
const metros = (m) => (m == null ? "—" : `${Math.round(m).toLocaleString("es-ES")} m`);
const ritmoKm = (v) => (v ? `${tiempo(1000 / v)} /km` : "—"); // v en m/s
const ritmo100 = (v) => (v ? `${tiempo(100 / v)} /100 m` : "—");
const kmh = (v) => (v ? `${(v * 3.6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} km/h` : "—");
const fechaLarga = (d) => d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const horaDe = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Distancia adecuada a cada deporte
const distanciaDe = (a) => (a.distancia ? (a.deporte === "nadar" ? metros(a.distancia) : km(a.distancia)) : null);
// El "ritmo" que interesa en cada deporte
function velocidadDe(a, v = a.velMedia) {
  if (!v) return null;
  if (a.deporte === "correr" || a.sport === "walking" || a.sport === "hiking") return ritmoKm(v);
  if (a.deporte === "nadar") return ritmo100(v);
  return kmh(v);
}

// =====================================================================
// LISTA
// =====================================================================
function lunesDe(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function pintarLista() {
  const todas = almacen.listar();
  const lista = filtro === "todo" ? todas : todas.filter((a) => a.deporte === filtro);
  const presentes = Object.keys(DEPORTES).filter((d) => todas.some((a) => a.deporte === d));

  caja.innerHTML = `
    <header class="cabecera entreno-cabecera">
      <h1>Entreno</h1>
      <button class="boton-icono" data-accion="sincronizar-garmin" aria-label="Traer actividades de Garmin" title="Traer de Garmin">🔄</button>
      <button class="boton-icono" data-accion="ajustes" aria-label="Ajustes de entreno" title="Ajustes">⚙️</button>
      <label class="boton-principal boton-subir">⬆ Subir<input type="file" multiple data-accion="subir" hidden></label>
    </header>
    <div class="entreno-cuerpo">
      ${todas.length ? resumenSemana(todas) : ""}
      ${presentes.length > 1 ? `<div class="chips" role="group" aria-label="Filtrar por deporte">
        ${["todo", ...presentes].map((d) => `<button data-filtro="${d}" class="${filtro === d ? "activo" : ""}" aria-pressed="${filtro === d}">
          ${d === "todo" ? "Todo" : `<span class="punto-deporte" data-deporte="${d}"></span>${DEPORTES[d].nombre}`}</button>`).join("")}
      </div>` : ""}
      ${todas.length ? listaPorMes(lista) : vacio()}
    </div>`;
}

function resumenSemana(todas) {
  const lunes = lunesDe(new Date());
  const semana = todas.filter((a) => new Date(a.inicio) >= lunes);
  const anterior = todas.filter((a) => { const d = new Date(a.inicio); return d < lunes && d >= new Date(lunes.getTime() - 7 * 864e5); });
  const total = (xs) => xs.reduce((s, a) => s + (a.duracion || 0), 0);
  const t = total(semana), t0 = total(anterior);
  const cambio = t0 ? Math.round(((t - t0) / t0) * 100) : null;
  const porDeporte = Object.keys(DEPORTES).map((d) => {
    const xs = semana.filter((a) => a.deporte === d);
    if (!xs.length) return "";
    const dist = xs.reduce((s, a) => s + (a.distancia || 0), 0);
    return `<li><span class="punto-deporte" data-deporte="${d}"></span>${DEPORTES[d].icono} ${DEPORTES[d].nombre}
      <b>${dist ? (d === "nadar" ? metros(dist) : km(dist, 1)) : `${xs.length} ${xs.length === 1 ? "sesión" : "sesiones"}`}</b>
      <span>${tiempo(total(xs), true)}</span></li>`;
  }).join("");
  return `
    <section class="tarjeta-entreno semana">
      <h2>Esta semana</h2>
      <div class="cifras">
        <div><span>Tiempo</span><b>${tiempo(t, true)}</b>${cambio != null ? `<small>${cambio >= 0 ? "▲" : "▼"} ${Math.abs(cambio)} % que la anterior</small>` : ""}</div>
        <div><span>Sesiones</span><b>${semana.length}</b></div>
        <div><span>Calorías</span><b>${semana.reduce((s, a) => s + (a.calorias || 0), 0).toLocaleString("es-ES")}</b></div>
      </div>
      ${porDeporte ? `<ul class="por-deporte">${porDeporte}</ul>` : `<p class="nota">Aún no hay nada esta semana.</p>`}
    </section>`;
}

function listaPorMes(lista) {
  if (!lista.length) return `<p class="nota">No hay actividades de este deporte.</p>`;
  const meses = new Map();
  for (const a of lista) {
    const d = new Date(a.inicio);
    const clave = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    if (!meses.has(clave)) meses.set(clave, []);
    meses.get(clave).push(a);
  }
  return [...meses].map(([mes, xs]) => `
    <section class="mes-entreno">
      <h2>${mes}<span>${xs.length} ${xs.length === 1 ? "actividad" : "actividades"} · ${tiempo(xs.reduce((s, a) => s + (a.duracion || 0), 0), true)}</span></h2>
      <ul class="actividades">${xs.map(tarjeta).join("")}</ul>
    </section>`).join("");
}

function tarjeta(a) {
  const d = new Date(a.inicio);
  const datos = [
    distanciaDe(a),
    tiempo(a.duracion),
    a.deporte !== "gimnasio" ? velocidadDe(a) : (a.seriesN ? `${a.seriesN} series` : null),
    a.fcMedia ? `♥ ${a.fcMedia}` : null,
  ].filter(Boolean);
  return `<li><a href="#entreno/${encodeURIComponent(a.id)}" class="actividad" data-deporte="${a.deporte}">
    <span class="actividad-icono" aria-hidden="true">${DEPORTES[a.deporte]?.icono || "⌚"}</span>
    <span class="actividad-texto">
      <strong>${escapar(a.nombre)}</strong>
      <small>${d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })} · ${horaDe(d)}</small>
    </span>
    <span class="actividad-datos">${datos.map((x) => `<span>${x}</span>`).join("")}</span>
  </a></li>`;
}

function vacio() {
  return `
    <section class="tarjeta-entreno vacio">
      <div class="vacio-icono" aria-hidden="true">🏊 🏃 🚴 🏋️</div>
      <h2>Conecta tu Garmin</h2>
      <p>Así tus actividades llegan solas cada pocos minutos, con todo su detalle, y también tu historial antiguo.</p>
      <p><button class="boton-principal" data-accion="ajustes">Conectar Garmin</button></p>
      <details>
        <summary>¿Prefieres subir un archivo a mano?</summary>
        <ol>
          <li>Entra en <a href="https://connect.garmin.com/modern/activities" target="_blank" rel="noopener">connect.garmin.com</a> (en el iPhone, desde Safari).</li>
          <li>Abre la actividad y toca el engranaje ⚙️ de arriba a la derecha.</li>
          <li>Elige <b>Exportar original</b>. Se descarga un .zip (en el iPhone va a la app Archivos → Descargas).</li>
          <li>Vuelve aquí, toca <b>⬆ Subir</b> y elige ese .zip. Puedes elegir varios a la vez.</li>
        </ol>
      </details>
    </section>`;
}

// =====================================================================
// SUBIR ARCHIVOS
// =====================================================================
async function subir(archivos) {
  if (!archivos.length) return;
  const aviso = avisoFijo("Preparando el lector de Garmin…");
  try {
    const resultado = await leerArchivos(archivos, (i, n) => { aviso.textContent = `Leyendo ${i} de ${n}…`; });
    const buenas = resultado.filter((r) => r.actividad).map((r) => r.actividad);
    const malas = resultado.filter((r) => r.error);
    aviso.textContent = "Guardando…";
    const { nuevas, repetidas } = await almacen.guardar(buenas);
    aviso.remove();
    const partes = [];
    if (nuevas) partes.push(`${nuevas} ${nuevas === 1 ? "actividad nueva" : "actividades nuevas"}`);
    if (repetidas) partes.push(`${repetidas} ya ${repetidas === 1 ? "estaba" : "estaban"}`);
    if (malas.length) partes.push(`${malas.length} sin leer`);
    avisar(partes.join(" · ") || "No había nada que subir");
    if (malas.length) console.warn("Entreno: archivos sin leer", malas);
    if (nuevas === 1 && buenas.length === 1) location.hash = `#entreno/${encodeURIComponent(buenas[0].id)}`;
    else pintarLista();
  } catch (error) {
    console.error(error);
    aviso.remove();
    avisar(navigator.onLine ? "No he podido leer los archivos" : "Para subir actividades hace falta conexión");
  }
}

// Avisos pequeños abajo (reutilizamos el estilo .aviso del horario)
function avisar(texto) {
  const a = avisoFijo(texto);
  setTimeout(() => a.remove(), 3200);
}
function avisoFijo(texto) {
  document.querySelectorAll(".aviso").forEach((x) => x.remove());
  const a = document.createElement("div");
  a.className = "aviso";
  a.setAttribute("role", "status");
  a.textContent = texto;
  document.body.append(a);
  return a;
}

// =====================================================================
// GARMIN: lo que deja la función de Supabase, a la lista
// =====================================================================
async function traerDeGarmin() {
  let aviso = null;
  const total = await garmin.recoger((n) => {
    aviso ??= avisoFijo("");
    aviso.textContent = `Trayendo de Garmin… ${n} ${n === 1 ? "actividad" : "actividades"}`;
  }).catch((e) => { console.error("Garmin", e); return 0; });
  aviso?.remove();
  if (total) {
    avisar(`${total} ${total === 1 ? "actividad nueva" : "actividades nuevas"} de Garmin`);
    if (!location.hash.includes("/")) pintarLista();
  }
  return total;
}

async function sincronizarGarmin(boton) {
  boton?.classList.add("girando");
  const aviso = avisoFijo("Preguntando a Garmin…");
  try {
    const estado = await garmin.funcion("sincronizar");
    aviso.remove();
    if (!estado.conectada) { abrirAjustes(); return; }
    const total = await traerDeGarmin();
    if (!total) avisar(estado.error ? `Garmin: ${estado.error}` : "No hay nada nuevo");
  } catch (e) {
    aviso.remove();
    avisar(e.message);
  } finally {
    boton?.classList.remove("girando");
  }
}

// =====================================================================
// AJUSTES: Garmin y pulsaciones máximas para las zonas
// =====================================================================
function fcMaxima() {
  const a = almacen.ajustes();
  if (a.fcMax) return { valor: a.fcMax, estimada: false };
  const vistas = almacen.listar().map((x) => x.fcMax).filter(Boolean);
  return { valor: vistas.length ? Math.max(...vistas) : 190, estimada: true };
}

function abrirAjustes() {
  const hoja = document.getElementById("hoja");
  const fc = fcMaxima();
  hoja.dataset.tipo = "entreno";
  hoja.querySelector(".hoja-contenido").innerHTML = `
    <header class="form-cabecera"><h2>⚙️ Ajustes de entreno</h2></header>
    <div class="form-cuerpo">
    <section class="garmin-ajustes" aria-live="polite"><p class="nota">Mirando tu conexión con Garmin…</p></section>
    <form class="form-entreno" id="form-ajustes-entreno">
      <label class="campo"><span>Pulsaciones máximas</span>
        <input name="fcMax" type="number" min="120" max="230" inputmode="numeric" value="${almacen.ajustes().fcMax || ""}" placeholder="${fc.valor}">
      </label>
      <p class="nota">Sirven para calcular tus zonas de pulso. ${fc.estimada ? `Ahora uso ${fc.valor}, el máximo que he visto en tus actividades.` : ""} Si la conoces de una prueba o de tu reloj (Garmin la muestra en Zonas de frecuencia cardiaca), escríbela aquí.</p>
      <div class="fila-botones"><button class="boton-principal">Guardar</button></div>
    </form>
    </div>`;
  hoja.showModal();
  pintarGarmin(hoja.querySelector(".garmin-ajustes"));
  hoja.querySelector("#form-ajustes-entreno").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = Number(new FormData(e.target).get("fcMax")) || null;
    almacen.guardarAjustes({ fcMax: v });
    hoja.close();
    mostrar(location.hash.split("/").slice(1).join("/"));
  });
}

const haceCuanto = (iso) => {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

async function pintarGarmin(zona, estado = null, error = "") {
  if (!estado) {
    try { estado = await garmin.funcion("estado"); }
    catch (e) { estado = { conectada: false }; error = e.message; }
  }
  const fallo = error ? `<p class="form-error">${escapar(error)}</p>` : "";
  if (!estado.conectada) {
    zona.innerHTML = `
      <h3>⌚ Garmin</h3>
      <p class="nota">Conecta tu cuenta para que tus actividades lleguen solas. Solo hay que hacerlo una vez (y renovar la clave cuando caduque).</p>
      <ol class="pasos-garmin">
        <li>Abre <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">tu página de clave personal de Garmin</a> y entra con tu cuenta.</li>
        <li>Toca <b>Create Key</b>, acepta las condiciones y elige la caducidad más larga (1 año).</li>
        <li>Copia la clave (solo se enseña una vez) y pégala aquí:</li>
      </ol>
      <form class="form-entreno" data-form="garmin">
        <input name="clave" type="password" autocomplete="off" spellcheck="false" placeholder="Tu clave de Garmin" required>
        <button class="boton-principal">Conectar</button>
      </form>
      ${fallo}
      <p class="nota">La clave se guarda en tu Supabase, en una tabla que la web no puede leer.</p>`;
    return;
  }
  const partes = [];
  if (estado.ultimaSync) partes.push(`Última comprobación: ${haceCuanto(estado.ultimaSync)}.`);
  partes.push(`${estado.descargadas} ${estado.descargadas === 1 ? "actividad traída" : "actividades traídas"}.`);
  if (estado.pendientes) partes.push(`Faltan ${estado.pendientes} por traer (van llegando de 12 en 12 cada 10 minutos).`);
  if (!estado.historialCompleto) partes.push("Todavía estoy repasando tu historial antiguo.");
  if (estado.fallidas) partes.push(`${estado.fallidas} no se han podido descargar (por ejemplo, actividades sin archivo).`);
  zona.innerHTML = `
    <h3>⌚ Garmin <span class="garmin-ok">Conectado</span></h3>
    <p class="nota">${partes.join(" ")}</p>
    ${estado.error ? `<p class="form-error">Último problema: ${escapar(estado.error)}</p>` : ""}
    ${fallo}
    <div class="fila-botones">
      <button class="boton-secundario" data-accion="garmin-ya">🔄 Traer ahora</button>
      <button class="boton-peligro" data-accion="garmin-desconectar">Desconectar</button>
    </div>`;
}

document.addEventListener("submit", async (e) => {
  const form = e.target.closest?.('[data-form="garmin"]');
  if (!form) return;
  e.preventDefault();
  const zona = form.closest(".garmin-ajustes");
  const boton = form.querySelector("button");
  boton.disabled = true;
  boton.textContent = "Conectando…";
  try {
    const estado = await garmin.funcion("conectar", { clave: new FormData(form).get("clave") });
    await pintarGarmin(zona, estado);
    traerDeGarmin();
  } catch (err) {
    await pintarGarmin(zona, { conectada: false }, err.message);
  }
});

// =====================================================================
// FICHA DE UNA ACTIVIDAD
// =====================================================================
async function pintarFicha(id) {
  const resumen = almacen.buscar(id);
  caja.innerHTML = `
    <header class="cabecera entreno-cabecera">
      <a href="#entreno" class="volver" aria-label="Volver a la lista">‹ Entreno</a>
    </header>
    <div class="entreno-cuerpo"><p class="nota">Cargando la actividad…</p></div>`;
  window.scrollTo({ top: 0 });
  const act = resumen && (await almacen.detalle(id).catch(() => null));
  if (location.hash !== `#entreno/${encodeURIComponent(id)}`) return; // ya te fuiste a otra
  const cuerpo = caja.querySelector(".entreno-cuerpo");
  if (!resumen) { cuerpo.innerHTML = `<p class="nota">No encuentro esta actividad. Puede que la hayas borrado.</p>`; return; }
  const a = act || resumen; // sin detalle (p. ej. sin conexión) enseñamos al menos el resumen
  const inicio = new Date(a.inicio);

  cuerpo.innerHTML = `
    <section class="ficha-entreno-cabecera" data-deporte="${a.deporte}">
      <span class="actividad-icono grande" aria-hidden="true">${DEPORTES[a.deporte]?.icono || "⌚"}</span>
      <div>
        <h1>${escapar(a.nombre)}</h1>
        <p>${fechaLarga(inicio)} · ${horaDe(inicio)}${a.dispositivo ? ` · ${escapar(a.dispositivo)}` : ""}</p>
      </div>
    </section>
    ${a.gps ? `<div class="mapa-entreno" data-deporte="${a.deporte}"></div>` : ""}
    <section class="cifras-grandes">${cifras(a)}</section>
    ${act ? "" : `<p class="nota">No he podido cargar el detalle (gráficas y vueltas). Comprueba la conexión.</p>`}
    <div class="graficas-entreno" data-deporte="${a.deporte}"></div>
    ${act ? zonasHtml(act) : ""}
    ${act?.deporte === "nadar" ? natacionHtml(act) : ""}
    ${act?.series?.length ? seriesHtml(act) : ""}
    ${act && act.deporte !== "nadar" && act.vueltas?.length > 1 ? vueltasHtml(act) : ""}
    <footer class="ficha-entreno-pie">
      <button class="boton-peligro" data-accion="borrar">Borrar actividad</button>
    </footer>`;

  if (!act) return;
  const grupo = crearGrupo();
  const mapaCaja = cuerpo.querySelector(".mapa-entreno");
  if (mapaCaja && act.puntos?.lat) mapa(mapaCaja, act.puntos.lat, act.puntos.lon, grupo).catch(() => mapaCaja.remove());
  dibujarGraficas(act, cuerpo.querySelector(".graficas-entreno"), grupo);
  if (act.deporte === "nadar") dibujarLargos(act, cuerpo.querySelector(".largos-grafica"));
}

// Los datos grandes de arriba (cambian según el deporte)
function cifras(a) {
  const c = [];
  const pon = (nombre, valor, extra = "") => valor && valor !== "—" && c.push(`<div><span>${nombre}</span><b>${valor}</b>${extra ? `<small>${extra}</small>` : ""}</div>`);
  pon("Distancia", distanciaDe(a));
  pon("Tiempo", tiempo(a.duracion), a.transcurrido && a.transcurrido - a.duracion > 60 ? `${tiempo(a.transcurrido)} con pausas` : "");
  if (a.deporte === "correr") pon("Ritmo medio", ritmoKm(a.velMedia));
  if (a.deporte === "nadar") pon("Ritmo medio", ritmo100(a.velMedia));
  if (a.deporte === "bici") pon("Velocidad media", kmh(a.velMedia), a.velMax ? `máx. ${kmh(a.velMax)}` : "");
  if (a.deporte === "otro" && a.velMedia) pon("Ritmo medio", velocidadDe(a));
  pon("Pulso medio", a.fcMedia && `${a.fcMedia} ppm`, a.fcMax ? `máx. ${a.fcMax}` : "");
  if (a.deporte === "nadar") {
    pon("SWOLF", a.swolf);
    pon("Largos", a.largos, a.piscina ? `piscina de ${a.piscina} m` : "");
    pon("Brazadas", a.brazadas?.toLocaleString("es-ES"));
  }
  if (a.deporte === "gimnasio" && a.series) {
    const activas = a.series.filter((s) => !s.descanso);
    pon("Series", activas.length);
    pon("Repeticiones", activas.reduce((s, x) => s + (x.reps || 0), 0));
    const vol = activas.reduce((s, x) => s + (x.reps || 0) * (x.peso || 0), 0);
    if (vol) pon("Volumen", `${Math.round(vol).toLocaleString("es-ES")} kg`);
  }
  pon("Desnivel +", a.desnivel != null && a.desnivel > 0 && `${a.desnivel} m`);
  pon("Cadencia", a.cadencia && `${Math.round(a.cadencia)} ${a.deporte === "correr" ? "ppm" : "rpm"}`, a.deporte === "correr" ? "pasos por minuto" : "");
  pon("Potencia", a.potencia && `${a.potencia} W`, a.potenciaNormalizada ? `normalizada ${a.potenciaNormalizada} W` : "");
  pon("Calorías", a.calorias && `${a.calorias.toLocaleString("es-ES")} kcal`);
  pon("Efecto aeróbico", a.efectoAerobico, a.efectoAnaerobico != null ? `anaeróbico ${a.efectoAnaerobico}` : "");
  pon("Carga", a.carga);
  return c.join("");
}

function dibujarGraficas(a, caja, grupo) {
  const p = a.puntos || {};
  if (!p.t?.length) return;
  // Eje horizontal: distancia si la hay (carrera, bici), si no tiempo
  const porDistancia = a.deporte !== "nadar" && p.d?.some((x) => x > 0);
  const xs = porDistancia ? p.d.map((x) => (x ?? 0) / 1000) : p.t.map((x) => x / 60);
  // Que no haya "marcha atrás" en el eje (puede pasar con el GPS)
  for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1]) xs[i] = xs[i - 1];
  const formatoX = porDistancia ? (v) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km` : (v) => tiempo(v * 60);
  const anadir = (g) => g && caja.append(g);

  if (p.v && a.deporte !== "nadar") {
    const v = suavizar(p.v, 6);
    if (a.deporte === "correr" || a.sport === "walking" || a.sport === "hiking") {
      // Ritmo en min/km. Lo muy lento (paradas) lo dejamos fuera para que no aplaste la gráfica
      const r = v.map((x) => (x && x > 1000 / 900 ? 1000 / x / 60 : null));
      anadir(graficaLinea({ xs, ys: r, titulo: "Ritmo", resumen: ritmoKm(a.velMedia), invertir: true, area: false, grupo, formatoX,
        formatoY: (m, eje) => (eje ? tiempo(m * 60) : `${tiempo(m * 60)} /km`) }));
    } else {
      anadir(graficaLinea({ xs, ys: v.map((x) => (x == null ? null : x * 3.6)), titulo: "Velocidad", resumen: kmh(a.velMedia), grupo, formatoX, min: 0,
        formatoY: (k, eje) => (eje ? Math.round(k) : `${k.toFixed(1)} km/h`) }));
    }
  }
  if (p.fc) anadir(graficaLinea({ xs, ys: suavizar(p.fc, 2), titulo: "Pulso", resumen: a.fcMedia ? `media ${a.fcMedia} ppm` : "", grupo, formatoX,
    color: "var(--serie-pulso)", formatoY: (f, eje) => (eje ? Math.round(f) : `${Math.round(f)} ppm`) }));
  if (p.alt && a.gps) anadir(graficaLinea({ xs, ys: suavizar(p.alt, 3), titulo: "Altitud", resumen: a.desnivel ? `+${a.desnivel} m` : "", grupo, formatoX,
    color: "var(--serie-neutra)", formatoY: (m, eje) => (eje ? Math.round(m) : `${Math.round(m)} m`) }));
  if (p.cad && a.deporte !== "nadar") anadir(graficaLinea({ xs, ys: suavizar(p.cad, 3), titulo: "Cadencia", resumen: a.cadencia ? `media ${Math.round(a.cadencia)}` : "", grupo, formatoX, area: false,
    color: "var(--serie-neutra)", formatoY: (c, eje) => (eje ? Math.round(c) : `${Math.round(c)} ${a.deporte === "correr" ? "ppm" : "rpm"}`) }));
  if (p.pot && a.deporte !== "correr") anadir(graficaLinea({ xs, ys: suavizar(p.pot, 5), titulo: "Potencia", resumen: a.potencia ? `media ${a.potencia} W` : "", grupo, formatoX,
    color: "var(--serie-neutra)", formatoY: (w, eje) => (eje ? Math.round(w) : `${Math.round(w)} W`), min: 0 }));
}

// ----- Zonas de pulso -----
const ZONAS = [
  { nombre: "Z1", texto: "Muy suave", desde: 0.5 },
  { nombre: "Z2", texto: "Suave", desde: 0.6 },
  { nombre: "Z3", texto: "Moderado", desde: 0.7 },
  { nombre: "Z4", texto: "Fuerte", desde: 0.8 },
  { nombre: "Z5", texto: "Máximo", desde: 0.9 },
];
function zonasHtml(a) {
  const p = a.puntos || {};
  if (!p.fc || !p.t) return "";
  const fc = fcMaxima();
  const segundos = ZONAS.map(() => 0);
  for (let i = 1; i < p.t.length; i++) {
    const f = p.fc[i];
    const dt = Math.min(30, p.t[i] - p.t[i - 1]); // si hubo pausa larga no la contamos
    if (!f || dt <= 0) continue;
    const z = ZONAS.findLastIndex((zz) => f >= zz.desde * fc.valor);
    if (z >= 0) segundos[z] += dt;
  }
  const total = segundos.reduce((s, x) => s + x, 0);
  if (!total) return "";
  const max = Math.max(...segundos);
  return `
    <section class="tarjeta-entreno zonas">
      <h2>Zonas de pulso</h2>
      <ul>${ZONAS.map((z, i) => `
        <li>
          <span class="zona-nombre"><b>${z.nombre}</b> ${z.texto}<small>${Math.round(z.desde * fc.valor)}–${i < 4 ? Math.round(ZONAS[i + 1].desde * fc.valor) - 1 : fc.valor} ppm</small></span>
          <span class="zona-barra"><span style="width:${(segundos[i] / max) * 100}%;${segundos[i] ? "" : "min-width:0"}" data-zona="${i + 1}"></span></span>
          <span class="zona-tiempo">${tiempo(segundos[i], true)}<small>${Math.round((segundos[i] / total) * 100)} %</small></span>
        </li>`).join("")}
      </ul>
      <p class="nota">Calculadas con pulsaciones máximas de ${fc.valor}${fc.estimada ? " (estimadas)" : ""}. <button class="enlace" data-accion="ajustes">Cambiar</button></p>
    </section>`;
}

// ----- Vueltas (carrera, bici) -----
function vueltasHtml(a) {
  const vueltas = a.vueltas.filter((v) => v.dur > 0);
  const vels = vueltas.map((v) => v.vel).filter(Boolean);
  const vMax = Math.max(...vels), vMin = Math.min(...vels);
  const esCorrer = a.deporte === "correr";
  return `
    <section class="tarjeta-entreno vueltas">
      <h2>Vueltas</h2>
      <table>
        <thead><tr><th>#</th><th>Distancia</th><th>Tiempo</th><th>${esCorrer ? "Ritmo" : "Velocidad"}</th><th>Pulso</th></tr></thead>
        <tbody>${vueltas.map((v, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${km(v.dist)}</td>
            <td>${tiempo(v.dur)}</td>
            <td class="celda-barra"><span class="mini-barra" style="width:${vMax > vMin ? 35 + ((v.vel - vMin) / (vMax - vMin)) * 65 : 100}%"></span><span>${esCorrer ? ritmoKm(v.vel).replace(" /km", "") : kmh(v.vel)}</span></td>
            <td>${v.fcMedia ?? "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>`;
}

// ----- Natación: series y largos -----
function natacionHtml(a) {
  const series = a.vueltas.filter((v) => v.dist > 0);
  const largos = a.largosDetalle || [];
  const estilos = [...new Set(largos.filter((l) => l.activo && l.estilo).map((l) => l.estilo))];
  return `
    ${series.length ? `<section class="tarjeta-entreno series-natacion">
      <h2>Series</h2>
      <table>
        <thead><tr><th>#</th><th>Metros</th><th>Estilo</th><th>Tiempo</th><th>Ritmo /100 m</th></tr></thead>
        <tbody>${series.map((v, i) => `
          <tr><td>${i + 1}</td><td>${metros(v.dist)}</td><td>${ESTILOS[v.estilo] || "—"}</td><td>${tiempo(v.dur)}</td><td>${tiempo(100 * v.dur / v.dist)}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>` : ""}
    ${largos.some((l) => l.activo) ? `<section class="tarjeta-entreno">
      <h2>Largo a largo</h2>
      ${estilos.length > 1 ? `<p class="leyenda-estilos">${estilos.map((e, i) => `<span><i style="background:var(--estilo-${i + 1})"></i>${ESTILOS[e] || e}</span>`).join("")}</p>` : ""}
      <div class="largos-grafica"></div>
      <p class="nota">Cada barra es un largo: más alta = más lenta. Los huecos son descansos. SWOLF = segundos + brazadas por largo (cuanto más bajo, más eficiente).</p>
    </section>` : ""}`;
}

function dibujarLargos(a, caja) {
  if (!caja) return;
  const largos = a.largosDetalle || [];
  const estilos = [...new Set(largos.filter((l) => l.activo && l.estilo).map((l) => l.estilo))];
  let n = 0;
  const barras = largos.map((l) => {
    if (!l.activo) return { hueco: true };
    n++;
    const swolf = l.brazadas != null ? Math.round(l.dur + l.brazadas) : null;
    return {
      valor: l.dur,
      color: estilos.length > 1 ? `var(--estilo-${estilos.indexOf(l.estilo) + 1})` : "var(--serie)",
      etiqueta: `Largo ${n} · ${tiempo(l.dur)} · ${ESTILOS[l.estilo] || ""}${l.brazadas != null ? ` · ${l.brazadas} brazadas · SWOLF ${swolf}` : ""}`,
    };
  });
  const g = graficaBarras({ barras, titulo: "Tiempo por largo", resumen: a.swolf ? `SWOLF medio ${a.swolf}` : "", formatoY: (s, eje) => (eje ? `${Math.round(s)} s` : tiempo(s)) });
  if (g) caja.append(g);
}

// ----- Gimnasio: series agrupadas por ejercicio -----
function seriesHtml(a) {
  const grupos = new Map();
  for (const s of a.series.filter((x) => !x.descanso)) {
    if (!grupos.has(s.ejercicio)) grupos.set(s.ejercicio, []);
    grupos.get(s.ejercicio).push(s);
  }
  return `
    <section class="tarjeta-entreno ejercicios">
      <h2>Ejercicios</h2>
      <ul>${[...grupos].map(([nombre, xs]) => `
        <li>
          <strong>${escapar(nombre)}</strong>
          <span class="series-chips">${xs.map((s) => `<span>${s.reps ?? "?"}${s.peso ? ` × ${s.peso.toLocaleString("es-ES")} kg` : ""}</span>`).join("")}</span>
        </li>`).join("")}
      </ul>
    </section>`;
}

// =====================================================================
// Botones (un solo "escuchador" para toda la sección)
// =====================================================================
document.addEventListener("click", async (e) => {
  if (!caja?.contains(e.target) && !e.target.closest("#hoja")) return;
  const filtroBtn = e.target.closest("[data-filtro]");
  if (filtroBtn) { filtro = filtroBtn.dataset.filtro; pintarLista(); return; }
  const accion = e.target.closest("[data-accion]")?.dataset.accion;
  if (accion === "ajustes") abrirAjustes();
  if (accion === "sincronizar-garmin") sincronizarGarmin(e.target.closest("button"));
  if (accion === "garmin-ya" || accion === "garmin-desconectar") {
    const zona = e.target.closest(".garmin-ajustes");
    const boton = e.target.closest("button");
    if (accion === "garmin-desconectar" && !boton.classList.contains("confirmar")) {
      boton.classList.add("confirmar");
      boton.textContent = "Toca otra vez";
      return;
    }
    zona.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      const estado = await garmin.funcion(accion === "garmin-ya" ? "sincronizar" : "desconectar");
      await pintarGarmin(zona, estado);
      if (accion === "garmin-ya") traerDeGarmin();
    } catch (err) {
      await pintarGarmin(zona, null, err.message);
    }
  }
  if (accion === "borrar") {
    const boton = e.target.closest("button");
    // Primer toque: pide confirmación. Segundo toque: borra.
    if (!boton.classList.contains("confirmar")) {
      boton.classList.add("confirmar");
      boton.textContent = "Toca otra vez para borrar";
      setTimeout(() => { boton.classList.remove("confirmar"); boton.textContent = "Borrar actividad"; }, 4000);
      return;
    }
    const id = decodeURIComponent(location.hash.split("/").slice(1).join("/"));
    await almacen.borrar(id);
    avisar("Actividad borrada");
    location.hash = "#entreno";
  }
});
document.addEventListener("change", (e) => {
  if (e.target.matches?.('[data-accion="subir"]') && caja?.contains(e.target)) {
    subir([...e.target.files]);
    e.target.value = "";
  }
});
