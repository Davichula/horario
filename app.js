// =====================================================================
// app.js — el "cerebro" de la página
// ---------------------------------------------------------------------
// Pasos que sigue, en orden:
//   1. Descarga el archivo calendario.ics (el de la escuela).
//   2. Lo "traduce" (parsea) a una lista de eventos que JavaScript entiende.
//   3. Se queda solo con TUS clases, usando config.js.
//   4. Junta tus clases con tus cosas personales (personal.js).
//   5. Dibuja la vista de semana o de día.
//   6. Al tocar algo, abre una ficha con todos sus detalles.
//
// Si sabes algo de Python, JavaScript se parece bastante:
//   - "const x = 5"  es como  "x = 5"  (y no se puede cambiar luego)
//   - "let x = 5"    es como  "x = 5"  (y sí se puede cambiar)
//   - "function f(a) { ... }"  es como  "def f(a): ..."
//   - "(a) => a * 2"  es como  "lambda a: a * 2"
//   - las llaves { } hacen lo que en Python hace la sangría.
//   - `texto ${variable}`  es como  f"texto {variable}"
// =====================================================================

// ---------- Estado de la app (lo que está mirando el usuario) ----------
const estado = {
  eventos: [],              // tus clases ya filtradas
  festivos: [],             // días festivos
  personales: cargarPersonales(), // tus cosas (de personal.js)
  moodle: [],               // entregas de Moodle (de moodle.js)
  filtros: cargarFiltros(), // qué se muestra y qué no
  vista: vistaInicial(),     // día, semana, mes o año
  fecha: new Date(),        // el día que estamos mirando
};

const TIPOS = {
  "Clase Magistral": { etiqueta: "Teoría", clase: "teoria", icono: "📘" },
  "Resolución de problemas y casos": { etiqueta: "Problemas", clase: "problemas", icono: "✏️" },
  "Prácticas de laboratorio": { etiqueta: "Prácticas", clase: "practicas", icono: "🔬" },
  "Pruebas de evaluación": { etiqueta: "Examen", clase: "examen", icono: "📝" },
};

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const REPETICIONES = { no: "No se repite", diario: "Todos los días", laborables: "De lunes a viernes", semanal: "Cada semana" };

// La vista con la que se abre: la última que usaste o, si es la primera vez,
// el día en el móvil y la semana en el ordenador
function vistaInicial() {
  try {
    const guardada = localStorage.getItem("mi-horario:vista");
    if (["dia", "semana", "mes", "anio"].includes(guardada)) return guardada;
  } catch {}
  return window.innerWidth < 700 ? "dia" : "semana";
}

// Los filtros ("mostrar clases", "mostrar entreno"...) también se recuerdan
function cargarFiltros() {
  try {
    return JSON.parse(localStorage.getItem("mi-horario:filtros")) || { ocultos: [] };
  } catch {
    return { ocultos: [] };
  }
}
function guardarFiltros() {
  try { localStorage.setItem("mi-horario:filtros", JSON.stringify(estado.filtros)); } catch {}
}
const visible = (clave) => !estado.filtros.ocultos.includes(clave);

// =====================================================================
// PASO 1 y 2: leer y traducir el archivo .ics
// =====================================================================

// Un .ics es texto plano. Cada clase va entre BEGIN:VEVENT y END:VEVENT,
// con líneas tipo "SUMMARY:30318 - Comunicaciones digitales Grupo: 13 - ...".
// Las líneas largas se cortan y la continuación empieza con un espacio,
// así que primero las volvemos a unir.
function leerIcs(texto) {
  const unido = texto.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const bloques = unido.split("BEGIN:VEVENT").slice(1);

  return bloques.map((bloque) => {
    const campo = (nombre) => {
      const linea = bloque.split("\n").find((l) => l.startsWith(nombre));
      return linea ? linea.slice(linea.indexOf(":") + 1).trim() : "";
    };
    return {
      resumen: campo("SUMMARY"),
      inicio: leerFecha(campo("DTSTART")),
      fin: leerFecha(campo("DTEND")),
      ubicacion: leerUbicacion(campo("LOCATION")),
    };
  });
}

// "20270504T130000Z" -> objeto Date. La Z final significa hora UTC;
// el navegador la pasa solo a tu hora local (España).
function leerFecha(t) {
  const m = t.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, a, mes, d, h, min, s] = m.map(Number);
  return t.endsWith("Z")
    ? new Date(Date.UTC(a, mes - 1, d, h, min, s))
    : new Date(a, mes - 1, d, h, min, s);
}

// "A04 - Aula A.4 (CRE.1200.00.070)" -> { corto: "A04", nombre: "Aula A.4", codigo: "CRE.1200.00.070" }
// "L2.04 - A L2.04 (CRE.1200.02.200)" -> { corto: "L2.04", nombre: "Laboratorio L2.04", ... }
function leerUbicacion(texto) {
  const m = texto.match(/^(\S+) - (.+?) \((.+)\)$/);
  if (!m) return { corto: texto || "Sin aula", nombre: texto || "Sin aula asignada", codigo: "", planta: null };
  const [, corto, nombre, codigo] = m;
  const esLab = corto.startsWith("L");
  // El código "CRE.1200.02.200" lleva la planta en el tercer número (02 -> 2ª planta)
  const planta = Number(codigo.split(".")[2]);
  return {
    corto,
    nombre: esLab ? `Laboratorio ${corto}` : nombre,
    codigo,
    planta: Number.isNaN(planta) ? null : planta,
  };
}

// =====================================================================
// PASO 3: quedarnos solo con tus clases
// =====================================================================

// Del texto "30318 - Comunicaciones digitales Grupo: 13 - Prácticas de laboratorio"
// sacamos: código 30318, grupo 13, tipo "Prácticas de laboratorio".
function filtrarMisClases(eventos) {
  const mias = [];
  const festivos = [];

  for (const ev of eventos) {
    if (ev.resumen.startsWith("Día festivo")) {
      festivos.push(ev);
      continue;
    }
    const m = ev.resumen.match(/^(\d+) - (.+?) Grupo: (\S+) - (.+)$/);
    if (!m) continue;
    const [, codigo, , grupo, tipoTexto] = m;

    const asignatura = MIS_ASIGNATURAS[codigo];
    if (!asignatura) continue; // no es una asignatura tuya

    const esComun = GRUPOS_COMUNES.includes(grupo);
    const esMiGrupo = grupo === asignatura.grupoPracticas;
    if (!esComun && !esMiGrupo) continue;

    const tipo = TIPOS[tipoTexto] || { etiqueta: tipoTexto, clase: "", icono: "📌" };
    // Guardamos cada clase con los mismos campos que una cosa personal
    // (color, corto, etiqueta...) para poder dibujar las dos igual.
    mias.push({
      ...ev,
      origen: "clase",
      codigo, grupo, asignatura, tipo,
      color: asignatura.color,
      corto: asignatura.corto,
      titulo: asignatura.nombre,
      etiqueta: tipo.etiqueta,
      icono: tipo.icono,
      clase: tipo.clase,
      lugarCorto: ev.ubicacion.corto,
      lugar: ev.ubicacion.nombre,
    });
  }
  mias.sort((a, b) => a.inicio - b.inicio);
  mias.forEach((c, i) => (c.id = `c:${i}`)); // un nombre para encontrar cada clase al tocarla
  return { mias, festivos };
}

// =====================================================================
// Pequeñas ayudas con fechas
// =====================================================================
const mismoDia = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function lunesDe(fecha) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diasDesdeLunes = (d.getDay() + 6) % 7; // lunes=0 ... domingo=6
  d.setDate(d.getDate() - diasDesdeLunes);
  return d;
}

function sumarDias(fecha, n) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + n);
  return d;
}

const hora = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const fechaCorta = (d) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const fechaLarga = (d) =>
  `${DIAS[d.getDay()]} ${d.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;

function duracion(c) {
  const min = Math.round((c.fin - c.inicio) / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

// "dentro de 3 días", "mañana", "hoy"
function cuandoEs(fecha) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(fecha); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((dia - hoy) / 86400000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  return dias > 0 ? `dentro de ${dias} días` : `hace ${-dias} días`;
}

// Para no romper la página si escribes "<" o "&" en un título
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// =====================================================================
// PASO 4: juntar clases y cosas personales
// =====================================================================

// Todo lo que hay un día (clases + lo tuyo), respetando los filtros
function elementosDelDia(dia) {
  const clases = visible("clases") ? estado.eventos.filter((e) => mismoDia(e.inicio, dia)) : [];
  const mias = personalesDelDia(estado.personales, dia).filter((p) => visible(p.categoria));
  const moodle = visible("moodle") ? estado.moodle.filter((m) => mismoDia(m.inicio, dia)) : [];
  return [...clases, ...moodle, ...mias].sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
}

const festivoDelDia = (dia) => estado.festivos.some((f) => mismoDia(f.inicio, dia));

// Busca un elemento por su id ("c:12" para clases, "p:abc:2026-11-23" para lo tuyo)
function buscarElemento(id) {
  if (id.startsWith("c:")) return estado.eventos.find((e) => e.id === id);
  if (id.startsWith("m:")) return estado.moodle.find((m) => m.id === id);
  const [, idItem, dia] = id.split(":");
  const [a, m, d] = dia.split("-").map(Number);
  return personalesDelDia(estado.personales, new Date(a, m - 1, d)).find((p) => p.item.id === idItem);
}

// Si dos cosas se solapan en la semana, las ponemos una al lado de la otra.
// A cada elemento le damos una "columna" y cuántas columnas hay en su grupo.
function repartirColumnas(elementos) {
  const grupos = [];
  let grupo = [], finGrupo = 0;
  for (const el of elementos) {
    if (grupo.length && el.inicio >= finGrupo) { grupos.push(grupo); grupo = []; }
    grupo.push(el);
    finGrupo = Math.max(finGrupo, el.fin);
  }
  if (grupo.length) grupos.push(grupo);

  const resultado = new Map();
  for (const g of grupos) {
    const finesColumna = []; // cuándo queda libre cada columna
    for (const el of g) {
      let col = finesColumna.findIndex((fin) => fin <= el.inicio);
      if (col === -1) col = finesColumna.length;
      finesColumna[col] = el.fin;
      resultado.set(el, { col });
    }
    for (const el of g) resultado.get(el).total = finesColumna.length;
  }
  return resultado;
}

// =====================================================================
// PASO 5: dibujar
// =====================================================================

const VISTAS = ["dia", "semana", "mes", "anio"];

// Dibuja la vista que toque. Si "desplazar" es true (cuando cambias de
// vista o de fecha), además mueve la pantalla a la hora que interesa.
function dibujar({ desplazar = false } = {}) {
  for (const v of VISTAS) {
    document.getElementById(`btn-${v}`).classList.toggle("activo", estado.vista === v);
  }
  if (estado.vista === "semana") dibujarSemana();
  else if (estado.vista === "mes") dibujarMes();
  else if (estado.vista === "anio") dibujarAnio();
  else dibujarDia();

  // Al cambiar de vista o de fecha, volvemos arriba del todo
  if (desplazar) window.scrollTo({ top: 0 });
}

// ----- Vista de un día: tarjetas una debajo de otra -----
function dibujarDia() {
  const dia = estado.fecha;
  const ahora = new Date();
  document.getElementById("titulo-periodo").textContent = fechaLarga(dia);

  const elementos = elementosDelDia(dia);
  const cont = document.getElementById("calendario");
  cont.className = "vista-dia";

  let html = "";
  if (festivoDelDia(dia)) html += `<div class="aviso-festivo">🎉 Día festivo</div>`;

  if (elementos.length === 0) {
    html += `<div class="vacio"><span>☕</span>No tienes nada este día.</div>`;
  } else {
    const nClases = elementos.filter((e) => e.origen === "clase").length;
    const nMoodle = elementos.filter((e) => e.origen === "moodle").length;
    const nMias = elementos.length - nClases - nMoodle;
    const partes = [];
    if (nClases) partes.push(`${nClases} ${nClases === 1 ? "clase" : "clases"}`);
    if (nMoodle) partes.push(`${nMoodle} ${nMoodle === 1 ? "entrega" : "entregas"}`);
    if (nMias) partes.push(`${nMias} ${nMias === 1 ? "cosa tuya" : "cosas tuyas"}`);
    html += `<p class="resumen-dia">${partes.slice(0, -1).join(", ")}${partes.length > 1 ? " y " : ""}${partes.at(-1)} · ${hora(elementos[0].inicio)}–${hora(
      new Date(Math.max(...elementos.map((e) => e.fin)))
    )}</p>`;
  }

  // Tareas de ese día y, si es hoy, tus hábitos (tareas.js)
  html += htmlTareasDelDia(dia);

  // Marcamos lo que está en curso y lo siguiente (solo si miramos hoy)
  const enCurso = elementos.filter((c) => c.inicio <= ahora && ahora < c.fin);
  const siguiente = elementos.find((c) => c.inicio > ahora);

  for (const c of elementos) {
    const pasada = c.fin <= ahora;
    let marca = "";
    if (enCurso.includes(c)) marca = `<span class="marca ahora">Ahora</span>`;
    else if (c === siguiente && mismoDia(dia, ahora)) marca = `<span class="marca">Siguiente</span>`;

    const detalle = [c.lugar && `${c.origen === "moodle" ? "📚" : "📍"} ${escapar(c.lugar)}`, !c.limite && duracion(c)].filter(Boolean).join(` <span class="punto">·</span> `);
    html += `
      <button class="tarjeta ${c.clase} ${pasada ? "pasada" : ""}" data-id="${c.id}" style="--color:${c.color}">
        <div class="tarjeta-hora">${c.limite ? `${hora(c.limite)}<small>límite</small>` : `${hora(c.inicio)}<small>${hora(c.fin)}</small>`}</div>
        <div class="tarjeta-info">
          <div class="fila-etiquetas"><span class="etiqueta">${c.icono} ${c.etiqueta}</span>${marca}</div>
          <h3>${escapar(c.titulo)}</h3>
          <p>${detalle}</p>
        </div>
        <span class="flecha">›</span>
      </button>`;
  }
  html += `<button class="anadir-dia" data-anadir="${aTextoDia(dia)}">＋ Añadir algo a este día</button>`;
  cont.innerHTML = html;
  dibujarLeyenda(elementos);
}

// ----- Vista de semana: una cuadrícula con las 24 horas y los 7 días -----
const ALTO_HORA = () => (window.innerWidth < 520 ? 44 : 52); // píxeles que ocupa cada hora

function dibujarSemana() {
  const lunes = lunesDe(estado.fecha);
  const dias = [0, 1, 2, 3, 4, 5, 6].map((n) => sumarDias(lunes, n));

  document.getElementById("titulo-periodo").textContent =
    `${fechaCorta(dias[0])} – ${fechaCorta(dias[6])}`;

  // El día entero: de 0:00 a 24:00. La posición se calcula en % del día.
  const pos = (fecha) => ((fecha.getHours() * 60 + fecha.getMinutes()) / 1440) * 100;
  const ahora = new Date();
  const todos = dias.flatMap(elementosDelDia);

  // Columna con las horas
  let html = `<div class="col-horas"><div class="cab-dia"></div><div class="cuerpo">`;
  for (let h = 1; h < 24; h++) {
    html += `<div class="marca-hora" style="top:${(h / 24) * 100}%">${h}:00</div>`;
  }
  html += `</div></div>`;

  // Una columna por día
  for (const dia of dias) {
    const esHoy = mismoDia(dia, ahora);
    const festivo = festivoDelDia(dia);
    const finde = dia.getDay() === 0 || dia.getDay() === 6;
    html += `<div class="col-dia ${esHoy ? "hoy" : ""} ${festivo ? "festivo" : ""} ${finde ? "finde" : ""}">
      <button class="cab-dia" data-fecha="${dia.toISOString()}" aria-label="Ver ${fechaLarga(dia)}">
        <span class="pastilla"><span>${DIAS[dia.getDay()].slice(0, 3)}</span><strong>${dia.getDate()}</strong></span>
      </button>
      <div class="cuerpo" data-dia="${aTextoDia(dia)}">`;
    for (let h = 1; h < 24; h++) {
      html += `<div class="linea-hora" style="top:${(h / 24) * 100}%"></div>`;
    }
    if (festivo) html += `<div class="festivo-texto">Festivo</div>`;

    const elementos = elementosDelDia(dia);
    const columnas = repartirColumnas(elementos);
    for (const c of elementos) {
      const { col, total } = columnas.get(c);
      // Si algo acaba a medianoche (24:00), getHours() da 0: lo tratamos como el final del día
      const fin = mismoDia(c.fin, c.inicio) ? pos(c.fin) : 100;
      const alto = fin - pos(c.inicio);
      html += `
        <button class="bloque ${c.clase} ${c.fin <= ahora ? "pasada" : ""} ${c.fin - c.inicio <= 45 * 60000 ? "breve" : ""}" data-id="${c.id}"
             style="--color:${c.color};top:${pos(c.inicio)}%;height:${alto}%;left:calc(${(col / total) * 100}% + 1px);width:calc(${100 / total}% - 2px)"
             aria-label="${escapar(c.titulo)}, ${c.etiqueta}, ${hora(c.inicio)}">
          <strong>${c.origen !== "clase" ? c.icono + " " : ""}${escapar(c.corto)}</strong>
          <span>${c.origen === "clase" ? c.etiqueta : c.origen === "moodle" ? escapar(c.nombre) : hora(c.inicio)}</span>
          ${c.lugarCorto ? `<span class="aula">${escapar(c.lugarCorto)}</span>` : ""}
        </button>`;
    }

    // La línea roja de "ahora mismo"
    if (esHoy) html += `<div class="linea-ahora" style="top:${pos(ahora)}%"></div>`;
    html += `</div></div>`;
  }

  const cont = document.getElementById("calendario");
  cont.className = "vista-semana";
  cont.style.setProperty("--alto-dia", `${ALTO_HORA() * 24}px`);
  cont.innerHTML = html;
  dibujarLeyenda(todos);
}

// ----- Vista de mes: una cuadrícula de 7 columnas (lunes a domingo) -----
function dibujarMes() {
  const f = estado.fecha;
  const primero = new Date(f.getFullYear(), f.getMonth(), 1);
  const inicio = lunesDe(primero);
  const ahora = new Date();
  document.getElementById("titulo-periodo").textContent =
    primero.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  // 6 filas x 7 días = 42 casillas (siempre caben todos los días del mes)
  const casillas = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  // Si la última fila es entera del mes siguiente, la quitamos
  const visibles = casillas[35].getMonth() !== f.getMonth() ? casillas.slice(0, 35) : casillas;

  let html = DIAS.slice(1).concat(DIAS[0]).map((d) => `<div class="mes-cab">${d.slice(0, 3)}</div>`).join("");
  const enPantalla = [];
  for (const dia of visibles) {
    const elementos = elementosDelDia(dia);
    enPantalla.push(...elementos);
    const fuera = dia.getMonth() !== f.getMonth();
    const clases = [
      "mes-dia",
      fuera && "fuera",
      mismoDia(dia, ahora) && "hoy",
      festivoDelDia(dia) && "festivo",
      (dia.getDay() === 0 || dia.getDay() === 6) && "finde",
      elementos.some((e) => e.clase === "examen") && "con-examen",
    ].filter(Boolean).join(" ");

    const maximo = 3;
    const pildoras = elementos.slice(0, maximo).map((e) => `
      <span class="pildora ${e.clase}" style="--color:${e.color}">
        <i></i>${e.origen !== "clase" ? e.icono + " " : ""}${escapar(e.corto)}
      </span>`).join("");
    const mas = elementos.length > maximo ? `<span class="mas">+${elementos.length - maximo} más</span>` : "";
    // En el móvil no caben los textos: enseñamos un puntito por cosa
    const puntos = elementos.slice(0, 6).map((e) => `<i style="--color:${e.color}"></i>`).join("");

    html += `
      <button class="${clases}" data-ir-dia="${aTextoDia(dia)}" aria-label="${fechaLarga(dia)}: ${elementos.length} cosas">
        <span class="mes-numero">${dia.getDate()}</span>
        <span class="pildoras">${pildoras}${mas}</span>
        <span class="puntos">${puntos}</span>
      </button>`;
  }

  const cont = document.getElementById("calendario");
  cont.className = "vista-mes";
  cont.innerHTML = html;
  dibujarLeyenda(enPantalla);
}

// ----- Vista de año: los 12 meses del curso en pequeño -----
// Como tu calendario va por cursos, el "año" va de septiembre a agosto.
function dibujarAnio() {
  const f = estado.fecha;
  const inicioCurso = f.getMonth() >= 8 ? f.getFullYear() : f.getFullYear() - 1; // 8 = septiembre
  const ahora = new Date();
  document.getElementById("titulo-periodo").textContent =
    `Curso ${inicioCurso}–${String(inicioCurso + 1).slice(2)}`;

  let html = "";
  for (let i = 0; i < 12; i++) {
    const primero = new Date(inicioCurso, 8 + i, 1); // JavaScript pasa solo de "mes 12" a enero del año siguiente
    const anio = primero.getFullYear();
    const m = primero.getMonth();
    const huecos = (primero.getDay() + 6) % 7; // cuántos días vacíos antes del 1 (empezando en lunes)
    const diasMes = new Date(anio, m + 1, 0).getDate();

    let celdas = "";
    for (let i = 0; i < huecos; i++) celdas += `<span></span>`;
    for (let d = 1; d <= diasMes; d++) {
      const dia = new Date(anio, m, d);
      const elementos = elementosDelDia(dia);
      const hayClase = elementos.some((e) => e.origen === "clase");
      const hayMio = elementos.some((e) => e.origen !== "clase");
      const examen = elementos.find((e) => e.clase === "examen");
      const clases = [
        "anio-dia",
        mismoDia(dia, ahora) && "hoy",
        festivoDelDia(dia) && "festivo",
        hayClase && "con-clase",
        hayMio && "con-mio",
        examen && "con-examen",
      ].filter(Boolean).join(" ");
      celdas += `<button class="${clases}" data-ir-dia="${aTextoDia(dia)}"
        ${examen ? `style="--color:${examen.color}" title="Examen de ${examen.corto}"` : ""}>${d}</button>`;
    }

    html += `
      <section class="anio-mes">
        <button class="anio-titulo" data-ir-mes="${anio}-${m}">${primero.toLocaleDateString("es-ES", { month: "long" })}
          ${m === 0 || i === 0 ? `<small>${anio}</small>` : ""}</button>
        <div class="anio-cab">${["L", "M", "X", "J", "V", "S", "D"].map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="anio-cuadricula">${celdas}</div>
      </section>`;
  }

  const cont = document.getElementById("calendario");
  cont.className = "vista-anio";
  cont.innerHTML = html;
  document.getElementById("leyenda").innerHTML = `
    <span class="chip-anio"><i class="m-clase"></i> Días con clase</span>
    <span class="chip-anio"><i class="m-mio"></i> Cosas tuyas y entregas</span>
    <span class="chip-anio"><i class="m-examen"></i> Examen</span>
    <span class="chip-anio"><i class="m-festivo"></i> Festivo</span>`;
}

// ----- Leyenda de colores (abajo) -----
function dibujarLeyenda(elementos) {
  // Solo enseñamos lo que sale en pantalla ahora mismo
  const asignaturas = new Set(elementos.filter((e) => e.origen === "clase").map((c) => c.asignatura));
  const categorias = new Set(elementos.filter((e) => e.origen === "personal").map((p) => p.categoria));
  document.getElementById("leyenda").innerHTML = [
    ...Object.values(MIS_ASIGNATURAS)
      .filter((a) => asignaturas.has(a))
      .map((a) => `<span class="chip" style="--color:${a.color}"><b>${a.corto}</b> ${a.nombre}</span>`),
    ...Object.entries(CATEGORIAS)
      .filter(([clave]) => categorias.has(clave))
      .map(([, c]) => `<span class="chip" style="--color:${c.color}">${c.icono} ${c.nombre}</span>`),
  ].join("");
}

// ----- Panel lateral: filtros y próximos exámenes -----
function dibujarPanel() {
  const opciones = [
    { clave: "clases", nombre: "Clases", icono: "🎓", color: "var(--texto)" },
    { clave: "moodle", nombre: "Entregas de Moodle", icono: "📤", color: "var(--texto)" },
    ...Object.entries(CATEGORIAS).map(([clave, c]) => ({ clave, ...c })),
  ];
  document.getElementById("filtros").innerHTML = opciones
    .map((o) => `
      <label class="filtro" style="--color:${o.color}">
        <input type="checkbox" data-filtro="${o.clave}" ${visible(o.clave) ? "checked" : ""}>
        <span class="casilla"></span>
        <span>${o.icono} ${o.nombre}</span>
      </label>`)
    .join("");

  const ahora = new Date();
  const examenes = estado.eventos.filter((e) => e.clase === "examen" && e.fin > ahora).slice(0, 5);
  document.getElementById("lista-examenes").innerHTML = examenes.length
    ? examenes.map((e) => `
        <li><button data-id="${e.id}" style="--color:${e.color}">
          <b>${e.corto}</b>
          <span>${fechaCorta(e.inicio)} · ${cuandoEs(e.inicio)}</span>
        </button></li>`).join("")
    : `<li class="nota">No hay exámenes próximos.</li>`;

  dibujarTareasYHabitos(); // tareas.js
  const entregas = estado.moodle.filter((m) => m.fin > ahora).slice(0, 6);
  document.getElementById("lista-entregas").innerHTML = entregas.length
    ? entregas.map((m) => `
        <li><button data-id="${m.id}" style="--color:${m.color}">
          <b>${m.icono} ${escapar(m.corto)} · ${escapar(m.nombre)}</b>
          <span>${fechaCorta(m.fin)} · ${cuandoEs(m.fin)}</span>
        </button></li>`).join("")
    : `<li class="nota">No hay entregas próximas en Moodle.</li>`;
}

// =====================================================================
// PASO 6: la ficha de detalle
// =====================================================================
const fila = (icono, titulo, valor, extra = "") => valor
  ? `<div class="fila"><span class="icono">${icono}</span><div><small>${titulo}</small><p>${valor}</p>${extra}</div></div>` : "";

function abrirFicha(id) {
  const c = buscarElemento(id);
  if (!c) return;
  const ficha = document.getElementById("ficha");
  ficha.style.setProperty("--color", c.color);
  ficha.querySelector(".ficha-contenido").innerHTML =
    c.origen === "clase" ? htmlFichaClase(c) : c.origen === "moodle" ? htmlFichaMoodle(c) : htmlFichaPersonal(c);
  ficha.showModal();

  const editar = ficha.querySelector("[data-editar]");
  if (editar) editar.onclick = () => { ficha.close(); abrirFormulario({ item: c.item }); };
  const planificar = ficha.querySelector("[data-planificar]");
  if (planificar) planificar.onclick = () => { ficha.close(); abrirPlanEstudio(c); };
  const duplicar = ficha.querySelector("[data-duplicar]");
  if (duplicar) duplicar.onclick = () => {
    ficha.close();
    abrirFormulario({ plantilla: { ...c.item, id: undefined, fecha: aTextoDia(c.inicio), repetir: "no", hasta: "" } });
  };
}

function htmlFichaClase(c) {
  const ahora = new Date();
  const deLaAsignatura = estado.eventos.filter((e) => e.codigo === c.codigo);

  // Siguiente sesión de la misma asignatura y próximo examen
  const proxima = deLaAsignatura.find((e) => e.inicio > c.inicio);
  const examen = deLaAsignatura.find((e) => e.tipo.clase === "examen" && e.fin > ahora);
  // "Sesión 5 de 21" contando solo las del mismo tipo (teoría con teoría, etc.)
  const mismoTipo = deLaAsignatura.filter((e) => e.tipo === c.tipo);
  const numero = mismoTipo.indexOf(c) + 1;

  const planta = c.ubicacion.planta === null
    ? "" : c.ubicacion.planta === 0 ? "Planta baja" : `Planta ${c.ubicacion.planta}`;

  return `
    <header class="ficha-cabecera">
      <span class="etiqueta-ficha">${c.icono} ${c.etiqueta}</span>
      <h2>${c.asignatura.nombre}</h2>
      <p>${c.asignatura.corto} · Código ${c.codigo}</p>
    </header>
    <div class="ficha-cuerpo">
      ${fila("🕒", "Cuándo", `${fechaLarga(c.inicio)} (${cuandoEs(c.inicio)})`,
             `<p class="sub">${hora(c.inicio)} – ${hora(c.fin)} · ${duracion(c)}</p>`)}
      ${fila("📍", "Dónde", c.ubicacion.nombre,
             `<p class="sub">${[planta, c.ubicacion.codigo].filter(Boolean).join(" · ")}</p>`)}
      ${fila("👥", "Grupo", GRUPOS_COMUNES.includes(c.grupo) ? `${c.grupo} (todo el curso)` : `${c.grupo} (tu grupo de prácticas)`)}
      ${fila("🔢", "Sesión", `${numero} de ${mismoTipo.length} de ${c.tipo.etiqueta.toLowerCase()}`)}
      ${proxima ? fila("➡️", "Siguiente clase de la asignatura",
             `${proxima.tipo.etiqueta} · ${fechaLarga(proxima.inicio)}`,
             `<p class="sub">${hora(proxima.inicio)} · ${proxima.ubicacion.nombre}</p>`) : ""}
      ${examen && examen !== c ? fila("📝", "Próximo examen",
             `${fechaLarga(examen.inicio)} (${cuandoEs(examen.inicio)})`,
             `<p class="sub">${hora(examen.inicio)} – ${hora(examen.fin)} · ${examen.ubicacion.nombre}</p>`) : ""}
    </div>
    ${c.clase === "examen" && c.inicio > ahora ? `
    <footer class="ficha-pie">
      <button class="boton-principal" data-planificar>📚 Planificar estudio${bloquesDelPlan(claveExamen(c)).length ? " (ya tienes plan)" : ""}</button>
    </footer>` : ""}`;
}

function htmlFichaPersonal(p) {
  const it = p.item;
  let repite = "";
  if (it.repetir && it.repetir !== "no") {
    repite = REPETICIONES[it.repetir] + (it.hasta ? `, hasta el ${fechaCorta(aFecha(it.hasta, "00:00"))}` : "");
  }
  return `
    <header class="ficha-cabecera">
      <span class="etiqueta-ficha">${p.icono} ${p.etiqueta}</span>
      <h2>${escapar(it.titulo)}</h2>
      <p>Añadido por ti</p>
    </header>
    <div class="ficha-cuerpo">
      ${fila("🕒", "Cuándo", `${fechaLarga(p.inicio)} (${cuandoEs(p.inicio)})`,
             `<p class="sub">${hora(p.inicio)} – ${hora(p.fin)} · ${duracion(p)}</p>`)}
      ${fila("📍", "Dónde", escapar(it.lugar || ""))}
      ${fila("🔁", "Se repite", repite)}
      ${it.plan ? fila("🎯", "Plan de estudio", "Bloque de repaso creado por el plan de estudio") : ""}
      ${it.notas ? `<div class="fila"><span class="icono">🗒️</span><div><small>Notas</small><p class="notas">${escapar(it.notas)}</p></div></div>` : ""}
    </div>
    <footer class="ficha-pie">
      <button class="boton-secundario" data-duplicar>Duplicar</button>
      <button class="boton-principal" data-editar>Editar</button>
    </footer>`;
}

// =====================================================================
// Formulario para añadir / editar tus cosas
// =====================================================================
const formulario = document.getElementById("formulario");
const form = document.getElementById("form-personal");
let editando = null; // la cosa que estamos editando (o null si es nueva)

// Botones de tipo: "Automático" + uno por categoría de config.js.
// ("otro" no sale como botón: es lo que queda cuando no se reconoce nada)
document.getElementById("form-categorias").innerHTML = [
  `<label class="opcion-categoria" style="--color:var(--acento)">
     <input type="radio" name="categoria" value="auto"><span>🪄 Automático</span>
   </label>`,
  ...Object.entries(CATEGORIAS)
    .filter(([clave]) => clave !== "otro")
    .map(([clave, c]) => `
      <label class="opcion-categoria" style="--color:${c.color}">
        <input type="radio" name="categoria" value="${clave}">
        <span>${c.icono} ${c.nombre}</span>
      </label>`),
].join("");

// Enseña en grande el icono y el tipo que se van a usar, y se actualiza
// mientras escribes el título
function actualizarTipo() {
  const elegida = form.querySelector("input[name=categoria]:checked")?.value || "auto";
  const { categoria, icono } = categoriaDe({ titulo: form.elements.titulo.value, categoria: elegida });
  const cat = CATEGORIAS[categoria];
  const vista = document.getElementById("tipo-vista");
  vista.style.setProperty("--color", cat.color);
  vista.innerHTML = `<b>${icono}</b> ${cat.nombre} <small>${elegida === "auto" ? "· automático" : "· elegido por ti"}</small>`;
}
form.elements.titulo.addEventListener("input", actualizarTipo);
document.getElementById("form-categorias").addEventListener("change", actualizarTipo);
document.getElementById("btn-cambiar-tipo").onclick = () => {
  const lista = document.getElementById("form-categorias");
  lista.hidden = !lista.hidden;
};

// Abre el formulario. Puede venir con:
//   { item }       -> editar algo que ya existe
//   { plantilla }  -> rellenar con datos (duplicar)
//   { fecha, hora } -> nuevo, a ese día y hora
function abrirFormulario({ item = null, plantilla = null, fecha = null, hora: horaInicio = null } = {}) {
  editando = item;
  form.reset();
  document.getElementById("form-error").textContent = "";
  document.getElementById("form-titulo").textContent = item ? "Editar" : "Añadir algo";
  document.getElementById("btn-borrar").hidden = !item;

  const datos = item || plantilla;
  if (datos) {
    for (const campo of ["titulo", "fecha", "inicio", "fin", "repetir", "hasta", "lugar", "notas"]) {
      form.elements[campo].value = datos[campo] || "";
    }
    form.elements.repetir.value = datos.repetir || "no";
    const radio = form.querySelector(`input[name=categoria][value="${datos.categoria}"]`);
    (radio || form.querySelector("input[name=categoria][value=auto]")).checked = true;
  } else {
    // Valores por defecto: el día que estás mirando y la próxima hora en punto
    const base = fecha ? aFecha(fecha, "00:00") : estado.fecha;
    let h = horaInicio ?? (mismoDia(base, new Date()) ? new Date().getHours() + 1 : 9);
    h = Math.min(h, 22);
    const p = (n) => String(n).padStart(2, "0");
    form.elements.fecha.value = aTextoDia(base);
    form.elements.inicio.value = `${p(Math.floor(h))}:${p(Math.round((h % 1) * 60))}`;
    form.elements.fin.value = `${p(Math.floor(h) + 1)}:${p(Math.round((h % 1) * 60))}`;
    form.querySelector("input[name=categoria][value=auto]").checked = true;
  }
  document.getElementById("form-categorias").hidden = true;
  actualizarTipo();
  actualizarCampoHasta();
  formulario.showModal();
  if (!datos) form.elements.titulo.focus();
}

// "Hasta el día" solo tiene sentido si se repite
function actualizarCampoHasta() {
  document.getElementById("campo-hasta").hidden = form.elements.repetir.value === "no";
}
form.elements.repetir.addEventListener("change", actualizarCampoHasta);

// Si cambias la hora de inicio, la de fin se mueve con ella (manteniendo la duración)
let inicioAnterior = null;
form.elements.inicio.addEventListener("focus", () => (inicioAnterior = form.elements.inicio.value));
form.elements.inicio.addEventListener("change", () => {
  const { inicio, fin, fecha } = form.elements;
  if (!inicioAnterior || !inicio.value || !fin.value) return;
  const dia = fecha.value || aTextoDia(new Date());
  const durMin = (aFecha(dia, fin.value) - aFecha(dia, inicioAnterior)) / 60000;
  if (durMin > 0) {
    const nuevoFin = new Date(aFecha(dia, inicio.value).getTime() + durMin * 60000);
    if (mismoDia(nuevoFin, aFecha(dia, "00:00"))) fin.value = hora(nuevoFin);
  }
  inicioAnterior = inicio.value;
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = form.elements;
  const error = document.getElementById("form-error");
  // Terminar a las 00:00 vale (es medianoche); cualquier otra hora tiene que ser después del inicio
  if (f.fin.value <= f.inicio.value && f.fin.value !== "00:00") {
    error.textContent = "La hora de fin tiene que ser después de la de inicio."; return;
  }
  if (f.repetir.value !== "no" && f.hasta.value && f.hasta.value < f.fecha.value) {
    error.textContent = "El día final de la repetición es anterior al primer día."; return;
  }

  const datos = {
    ...(editando || {}), // conserva datos extra (por ejemplo, a qué plan de estudio pertenece)
    id: editando ? editando.id : nuevoId(),
    titulo: f.titulo.value.trim(),
    categoria: form.querySelector("input[name=categoria]:checked")?.value || "auto",
    fecha: f.fecha.value,
    inicio: f.inicio.value,
    fin: f.fin.value,
    repetir: f.repetir.value,
    hasta: f.repetir.value === "no" ? "" : f.hasta.value,
    lugar: f.lugar.value.trim(),
    notas: f.notas.value.trim(),
  };

  estado.personales = editando
    ? estado.personales.map((p) => (p.id === editando.id ? datos : p))
    : [...estado.personales, datos];
  guardarPersonales(estado.personales);

  // Si estaba oculta esa categoría, la mostramos para que veas lo que acabas de añadir
  estado.filtros.ocultos = estado.filtros.ocultos.filter((k) => k !== categoriaDe(datos).categoria);
  guardarFiltros();

  formulario.close();
  estado.fecha = aFecha(datos.fecha, "00:00");
  dibujarPanel();
  dibujar();
  avisar(editando ? "Cambios guardados" : "Añadido ✓");
});

// Borrar pide confirmación pulsando dos veces (sin ventanas del navegador)
const btnBorrar = document.getElementById("btn-borrar");
btnBorrar.addEventListener("click", () => {
  if (!btnBorrar.classList.contains("confirmar")) {
    btnBorrar.classList.add("confirmar");
    btnBorrar.textContent = editando.repetir && editando.repetir !== "no" ? "¿Borrar todas las repeticiones?" : "¿Seguro?";
    return;
  }
  estado.personales = estado.personales.filter((p) => p.id !== editando.id);
  guardarPersonales(estado.personales);
  formulario.close();
  dibujar();
  avisar("Borrado");
});
formulario.addEventListener("close", () => {
  btnBorrar.classList.remove("confirmar");
  btnBorrar.textContent = "Borrar";
});
document.getElementById("btn-cancelar").onclick = () => formulario.close();

// Pequeño aviso que aparece abajo un par de segundos
function avisar(texto) {
  const aviso = document.createElement("div");
  aviso.className = "aviso";
  aviso.textContent = texto;
  document.body.append(aviso);
  setTimeout(() => aviso.remove(), 2200);
}

// =====================================================================
// Botones y gestos
// =====================================================================
function mover(direccion) {
  const f = estado.fecha;
  if (estado.vista === "dia") estado.fecha = sumarDias(f, direccion);
  else if (estado.vista === "semana") estado.fecha = sumarDias(f, 7 * direccion);
  // Para meses y años usamos el día 1, así no hay líos con los meses de 30 o 31 días
  else if (estado.vista === "mes") estado.fecha = new Date(f.getFullYear(), f.getMonth() + direccion, 1);
  else estado.fecha = new Date(f.getFullYear() + direccion, f.getMonth(), 1);
  dibujar({ desplazar: true });
}

function cambiarVista(vista, fecha = estado.fecha) {
  estado.vista = vista;
  estado.fecha = fecha;
  try { localStorage.setItem("mi-horario:vista", vista); } catch {}
  dibujar({ desplazar: true });
}

document.getElementById("btn-anterior").onclick = () => mover(-1);
document.getElementById("btn-siguiente").onclick = () => mover(1);
document.getElementById("btn-hoy").onclick = () => { estado.fecha = new Date(); dibujar({ desplazar: true }); };
for (const v of VISTAS) document.getElementById(`btn-${v}`).onclick = () => cambiarVista(v);
document.getElementById("btn-anadir").onclick = () => abrirFormulario();

const calendario = document.getElementById("calendario");

calendario.addEventListener("click", (e) => {
  // Tocar una clase o una cosa tuya abre su ficha
  const elemento = e.target.closest("[data-id]");
  if (elemento) return abrirFicha(elemento.dataset.id);

  // Tocar la cabecera de un día abre la vista de ese día
  const cabecera = e.target.closest(".cab-dia[data-fecha]");
  if (cabecera) return cambiarVista("dia", new Date(cabecera.dataset.fecha));

  // En el mes y el año: tocar un día lo abre, tocar el nombre de un mes abre ese mes
  const irDia = e.target.closest("[data-ir-dia]");
  if (irDia) return cambiarVista("dia", aFecha(irDia.dataset.irDia, "00:00"));
  const irMes = e.target.closest("[data-ir-mes]");
  if (irMes) {
    const [a, m] = irMes.dataset.irMes.split("-").map(Number);
    return cambiarVista("mes", new Date(a, m, 1));
  }

  // Botón "Añadir algo a este día"
  const anadir = e.target.closest("[data-anadir]");
  if (anadir) return abrirFormulario({ fecha: anadir.dataset.anadir });

  // Tocar un hueco vacío de la semana abre el formulario a esa hora
  const cuerpo = e.target.closest(".cuerpo[data-dia]");
  if (cuerpo) {
    const caja = cuerpo.getBoundingClientRect();
    const { dia } = cuerpo.dataset;
    const horaExacta = ((e.clientY - caja.top) / caja.height) * 24;
    abrirFormulario({ fecha: dia, hora: Math.floor(horaExacta * 2) / 2 }); // redondeado a la media hora
  }
});

// Las fichas se cierran con la X o tocando fuera de ellas
for (const dialogo of [document.getElementById("ficha"), formulario]) {
  dialogo.querySelector(".cerrar").onclick = () => dialogo.close();
  dialogo.addEventListener("click", (e) => { if (e.target === dialogo) dialogo.close(); });
}

// Las flechas del teclado también cambian de día/semana (en el ordenador)
document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]") || e.target.matches("input, textarea, select")) return;
  if (e.key === "ArrowLeft") mover(-1);
  if (e.key === "ArrowRight") mover(1);
});

// En el móvil también se puede deslizar el dedo a izquierda/derecha
let toqueX = null;
calendario.addEventListener("touchstart", (e) => (toqueX = e.touches[0].clientX), { passive: true });
calendario.addEventListener("touchend", (e) => {
  if (toqueX === null) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  if (Math.abs(dx) > 60) mover(dx < 0 ? 1 : -1);
  toqueX = null;
});

// ----- Panel lateral -----
// En el móvil el panel sale por encima ("panel-abierto"); en el ordenador
// está fijo a la izquierda y se puede plegar ("panel-plegado"), y se recuerda.
const esMovil = () => window.matchMedia("(max-width: 899px)").matches;
const abrirPanel = () => document.body.classList.add("panel-abierto");
const cerrarPanel = () => document.body.classList.remove("panel-abierto");
function plegarPanel(plegado) {
  document.body.classList.toggle("panel-plegado", plegado);
  try { localStorage.setItem("mi-horario:panel-plegado", plegado ? "1" : ""); } catch {}
}
try { plegarPanel(localStorage.getItem("mi-horario:panel-plegado") === "1"); } catch {}

document.getElementById("btn-menu").onclick = () => (esMovil() ? abrirPanel() : plegarPanel(false));
document.getElementById("btn-cerrar-panel").onclick = () => (esMovil() ? cerrarPanel() : plegarPanel(true));

// Cada apartado del panel (Mostrar, Exámenes...) se abre y cierra tocando su título.
// <details> ya lo hace solo; aquí solo recordamos cuáles dejaste cerrados.
document.querySelectorAll(".panel details[data-apartado]").forEach((d) => {
  const clave = `mi-horario:apartado:${d.dataset.apartado}`;
  try { if (localStorage.getItem(clave) === "cerrado") d.open = false; } catch {}
  d.addEventListener("toggle", () => {
    try { localStorage.setItem(clave, d.open ? "" : "cerrado"); } catch {}
  });
});
document.getElementById("velo").onclick = cerrarPanel;
document.getElementById("btn-anadir-panel").onclick = () => { cerrarPanel(); abrirFormulario(); };

document.getElementById("filtros").addEventListener("change", (e) => {
  const clave = e.target.dataset.filtro;
  if (!clave) return;
  const ocultos = new Set(estado.filtros.ocultos);
  e.target.checked ? ocultos.delete(clave) : ocultos.add(clave);
  estado.filtros.ocultos = [...ocultos];
  guardarFiltros();
  dibujar();
});

for (const lista of ["lista-examenes", "lista-entregas"]) {
  document.getElementById(lista).addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]");
    if (b) { cerrarPanel(); abrirFicha(b.dataset.id); }
  });
}

// La copia guarda todo: tus cosas, tareas, hábitos y notas
document.getElementById("btn-exportar").onclick = () => {
  if (!estado.personales.length && !tareas.length && !habitos.length) return avisar("Todavía no has añadido nada");
  exportarPersonales({ version: 2, personales: estado.personales, tareas, habitos, notas });
};
const archivoImportar = document.getElementById("archivo-importar");
document.getElementById("btn-importar").onclick = () => archivoImportar.click();
archivoImportar.addEventListener("change", async () => {
  const archivo = archivoImportar.files[0];
  if (!archivo) return;
  try {
    const copia = await leerCopia(archivo);
    // Juntamos sin duplicar: si un id ya existe, gana el del archivo
    const juntar = (actual, nuevos) => {
      const porId = new Map(actual.map((p) => [p.id, p]));
      nuevos.forEach((p) => porId.set(p.id, p));
      return [...porId.values()];
    };
    estado.personales = juntar(estado.personales, copia.personales);
    guardarPersonales(estado.personales);
    tareas = juntar(tareas, copia.tareas); guardarTareas();
    habitos = juntar(habitos, copia.habitos); guardarHabitos();
    notas = { ...notas, ...copia.notas }; guardarNotas();
    dibujarPanel();
    dibujar();
    avisar(`Importadas ${copia.personales.length + copia.tareas.length + copia.habitos.length} cosas`);
  } catch {
    avisar("Ese archivo no es una copia válida");
  }
  archivoImportar.value = "";
});

// =====================================================================
// Arranque: todo empieza aquí
// =====================================================================
async function iniciar() {
  try {
    const respuesta = await fetch("calendario.ics");
    const texto = await respuesta.text();
    const { mias, festivos } = filtrarMisClases(leerIcs(texto));
    estado.eventos = mias;
    estado.festivos = festivos;
  } catch (error) {
    avisar("No he podido leer calendario.ics");
    console.error(error);
  }
  estado.moodle = await cargarMoodle(); // de moodle.js
  dibujarPanel();
  dibujar({ desplazar: true });
  mostrarResumenSiToca(); // resumen.js: el resumen del día, la primera vez que abres cada día
  // Cada minuto refrescamos para que "Ahora" y la línea roja se muevan solas
  setInterval(() => { if (!document.querySelector("dialog[open]")) dibujar(); }, 60000);
}

iniciar();

// =====================================================================
// Modo claro / oscuro
// ---------------------------------------------------------------------
// Tres opciones: "auto" (lo que diga el móvil), "claro" y "oscuro".
// Lo apuntamos en <html data-tema="..."> y el CSS cambia los colores.
// =====================================================================
const TEMAS = {
  auto: { icono: "🌓", nombre: "Automático" },
  claro: { icono: "☀️", nombre: "Modo claro" },
  oscuro: { icono: "🌙", nombre: "Modo oscuro" },
};

function aplicarTema(tema) {
  if (tema === "auto") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
  const boton = document.getElementById("btn-tema");
  boton.textContent = TEMAS[tema].icono;
  boton.setAttribute("aria-label", `Tema: ${TEMAS[tema].nombre}`);
  boton.title = `${TEMAS[tema].nombre} (toca para cambiar)`;
  document.querySelectorAll("[data-tema-opcion]").forEach((b) =>
    b.classList.toggle("activo", b.dataset.temaOpcion === tema));
  try { localStorage.setItem("mi-horario:tema", tema); } catch {}
}

function temaGuardado() {
  try { return localStorage.getItem("mi-horario:tema") || "auto"; } catch { return "auto"; }
}

// El botón de arriba va pasando por auto -> claro -> oscuro -> auto...
document.getElementById("btn-tema").onclick = () => {
  const orden = Object.keys(TEMAS);
  const siguiente = orden[(orden.indexOf(temaGuardado()) + 1) % orden.length];
  aplicarTema(siguiente);
  avisar(`${TEMAS[siguiente].icono} ${TEMAS[siguiente].nombre}`);
};
// Y en el panel lateral se elige directamente
document.querySelectorAll("[data-tema-opcion]").forEach((b) =>
  (b.onclick = () => aplicarTema(b.dataset.temaOpcion)));

aplicarTema(temaGuardado());
