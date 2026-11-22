// =====================================================================
// app.js — el "cerebro" de la página
// ---------------------------------------------------------------------
// Pasos que sigue, en orden:
//   1. Descarga el archivo calendario.ics (el de la escuela).
//   2. Lo "traduce" (parsea) a una lista de eventos que JavaScript entiende.
//   3. Se queda solo con TUS clases, usando config.js.
//   4. Dibuja la vista de semana o de día.
//   5. Al tocar una clase, abre una ficha con todos sus detalles.
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
  eventos: [],           // tus clases ya filtradas
  festivos: [],          // días festivos
  vista: window.innerWidth < 700 ? "dia" : "semana", // en móvil empezamos por el día
  fecha: new Date(),     // el día que estamos mirando
};

const TIPOS = {
  "Clase Magistral": { etiqueta: "Teoría", clase: "teoria", icono: "📘" },
  "Resolución de problemas y casos": { etiqueta: "Problemas", clase: "problemas", icono: "✏️" },
  "Prácticas de laboratorio": { etiqueta: "Prácticas", clase: "practicas", icono: "🔬" },
  "Pruebas de evaluación": { etiqueta: "Examen", clase: "examen", icono: "📝" },
};

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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
  if (!m) return { corto: texto || "Sin aula", nombre: texto || "Sin aula asignada", codigo: "" };
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
    const [, codigo, , grupo, tipo] = m;

    const asignatura = MIS_ASIGNATURAS[codigo];
    if (!asignatura) continue; // no es una asignatura tuya

    const esComun = GRUPOS_COMUNES.includes(grupo);
    const esMiGrupo = grupo === asignatura.grupoPracticas;
    if (esComun || esMiGrupo) {
      mias.push({
        ...ev,
        codigo,
        grupo,
        asignatura,
        tipo: TIPOS[tipo] || { etiqueta: tipo, clase: "", icono: "📌" },
      });
    }
  }
  mias.sort((a, b) => a.inicio - b.inicio);
  mias.forEach((c, i) => (c.id = i)); // un número para encontrar cada clase al tocarla
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

const clasesDelDia = (dia) => estado.eventos.filter((e) => mismoDia(e.inicio, dia));
const festivoDelDia = (dia) => estado.festivos.some((f) => mismoDia(f.inicio, dia));

// =====================================================================
// PASO 4: dibujar
// =====================================================================

function dibujar() {
  document.getElementById("btn-semana").classList.toggle("activo", estado.vista === "semana");
  document.getElementById("btn-dia").classList.toggle("activo", estado.vista === "dia");
  if (estado.vista === "semana") dibujarSemana();
  else dibujarDia();
}

// ----- Vista de un día: tarjetas una debajo de otra -----
function dibujarDia() {
  const dia = estado.fecha;
  const ahora = new Date();
  document.getElementById("titulo-periodo").textContent = fechaLarga(dia);

  const clases = clasesDelDia(dia);
  const cont = document.getElementById("calendario");
  cont.className = "vista-dia";

  let html = "";
  if (festivoDelDia(dia)) html += `<div class="aviso-festivo">🎉 Día festivo</div>`;

  if (clases.length === 0) {
    html += `<div class="vacio"><span>☕</span>No tienes clases este día.</div>`;
  } else {
    const horas = clases.reduce((t, c) => t + (c.fin - c.inicio), 0) / 3600000;
    html += `<p class="resumen-dia">${clases.length} ${clases.length === 1 ? "clase" : "clases"} ·
      ${hora(clases[0].inicio)}–${hora(clases[clases.length - 1].fin)} · ${horas.toLocaleString("es-ES")} h</p>`;
  }

  // Marcamos la clase que está en curso y la siguiente (solo si miramos hoy)
  const enCurso = clases.find((c) => c.inicio <= ahora && ahora < c.fin);
  const siguiente = clases.find((c) => c.inicio > ahora);

  for (const c of clases) {
    const pasada = c.fin <= ahora;
    let marca = "";
    if (c === enCurso) marca = `<span class="marca ahora">Ahora</span>`;
    else if (c === siguiente && mismoDia(dia, ahora)) marca = `<span class="marca">Siguiente</span>`;

    html += `
      <button class="tarjeta ${c.tipo.clase} ${pasada ? "pasada" : ""}" data-id="${c.id}" style="--color:${c.asignatura.color}">
        <div class="tarjeta-hora">${hora(c.inicio)}<small>${hora(c.fin)}</small></div>
        <div class="tarjeta-info">
          <div class="fila-etiquetas"><span class="etiqueta">${c.tipo.icono} ${c.tipo.etiqueta}</span>${marca}</div>
          <h3>${c.asignatura.nombre}</h3>
          <p>📍 ${c.ubicacion.nombre} <span class="punto">·</span> ${duracion(c)}</p>
        </div>
        <span class="flecha">›</span>
      </button>`;
  }
  cont.innerHTML = html;
  dibujarLeyenda(clases);
}

// ----- Vista de semana: una cuadrícula con horas y días -----
function dibujarSemana() {
  const lunes = lunesDe(estado.fecha);
  let dias = [0, 1, 2, 3, 4, 5].map((n) => sumarDias(lunes, n));
  // El sábado solo aparece si esa semana hay algo (por ejemplo un examen)
  if (clasesDelDia(dias[5]).length === 0) dias = dias.slice(0, 5);

  document.getElementById("titulo-periodo").textContent =
    `${fechaCorta(dias[0])} – ${fechaCorta(dias[dias.length - 1])}`;

  // Calculamos qué horas mostrar (por defecto de 8:00 a 20:00)
  const clasesSemana = dias.flatMap(clasesDelDia);
  let horaMin = 8, horaMax = 20;
  for (const c of clasesSemana) {
    horaMin = Math.min(horaMin, c.inicio.getHours());
    horaMax = Math.max(horaMax, Math.ceil(c.fin.getHours() + c.fin.getMinutes() / 60));
  }
  const totalMin = (horaMax - horaMin) * 60;
  const pos = (fecha) => (((fecha.getHours() - horaMin) * 60 + fecha.getMinutes()) / totalMin) * 100;
  const ahora = new Date();

  // Columna con las horas
  let html = `<div class="col-horas"><div class="cab-dia"></div><div class="cuerpo">`;
  for (let h = horaMin; h < horaMax; h++) {
    html += `<div class="marca-hora" style="top:${((h - horaMin) * 60 / totalMin) * 100}%">${h}:00</div>`;
  }
  html += `</div></div>`;

  // Una columna por día
  for (const dia of dias) {
    const esHoy = mismoDia(dia, ahora);
    const festivo = festivoDelDia(dia);
    html += `<div class="col-dia ${esHoy ? "hoy" : ""} ${festivo ? "festivo" : ""}">
      <button class="cab-dia" data-fecha="${dia.toISOString()}" aria-label="Ver ${fechaLarga(dia)}">
        <span>${DIAS[dia.getDay()].slice(0, 3)}</span><strong>${dia.getDate()}</strong>
      </button>
      <div class="cuerpo">`;
    for (let h = horaMin; h < horaMax; h++) {
      html += `<div class="linea-hora" style="top:${((h - horaMin) * 60 / totalMin) * 100}%"></div>`;
    }
    if (festivo) html += `<div class="festivo-texto">Festivo</div>`;

    for (const c of clasesDelDia(dia)) {
      const alto = pos(c.fin) - pos(c.inicio);
      html += `
        <button class="bloque ${c.tipo.clase} ${c.fin <= ahora ? "pasada" : ""}" data-id="${c.id}"
             style="--color:${c.asignatura.color};top:${pos(c.inicio)}%;height:${alto}%"
             aria-label="${c.asignatura.nombre}, ${c.tipo.etiqueta}, ${hora(c.inicio)}">
          <strong>${c.asignatura.corto}</strong>
          <span>${c.tipo.etiqueta}</span>
          <span class="aula">${c.ubicacion.corto}</span>
        </button>`;
    }

    // La línea roja de "ahora mismo"
    if (esHoy && ahora.getHours() >= horaMin && ahora.getHours() < horaMax) {
      html += `<div class="linea-ahora" style="top:${pos(ahora)}%"></div>`;
    }
    html += `</div></div>`;
  }

  const cont = document.getElementById("calendario");
  cont.className = "vista-semana";
  cont.style.setProperty("--num-dias", dias.length);
  cont.innerHTML = html;
  dibujarLeyenda(clasesSemana);

  // Al tocar la cabecera de un día, abrimos ese día
  cont.querySelectorAll(".cab-dia[data-fecha]").forEach((b) =>
    b.addEventListener("click", () => {
      estado.fecha = new Date(b.dataset.fecha);
      estado.vista = "dia";
      dibujar();
    })
  );
}

// ----- Leyenda de colores (abajo) -----
function dibujarLeyenda(clasesVisibles) {
  // Solo enseñamos las asignaturas que salen en pantalla ahora mismo
  const visibles = new Set(clasesVisibles.map((c) => c.asignatura));
  document.getElementById("leyenda").innerHTML = Object.values(MIS_ASIGNATURAS)
    .filter((a) => visibles.has(a))
    .map((a) => `<span class="chip" style="--color:${a.color}"><b>${a.corto}</b> ${a.nombre}</span>`)
    .join("");
}

// =====================================================================
// PASO 5: la ficha de detalle de una clase
// =====================================================================
function abrirFicha(id) {
  const c = estado.eventos[id];
  const ahora = new Date();
  const deLaAsignatura = estado.eventos.filter((e) => e.codigo === c.codigo);

  // Siguiente sesión de la misma asignatura y próximo examen
  const proxima = deLaAsignatura.find((e) => e.inicio > c.inicio);
  const examen = deLaAsignatura.find((e) => e.tipo.clase === "examen" && e.fin > ahora);
  // "Sesión 5 de 21" contando solo las del mismo tipo (teoría con teoría, etc.)
  const mismoTipo = deLaAsignatura.filter((e) => e.tipo === c.tipo);
  const numero = mismoTipo.indexOf(c) + 1;

  const planta = c.ubicacion.planta === null || c.ubicacion.planta === undefined
    ? "" : c.ubicacion.planta === 0 ? "Planta baja" : `Planta ${c.ubicacion.planta}`;

  const fila = (icono, titulo, valor, extra = "") => valor
    ? `<div class="fila"><span class="icono">${icono}</span><div><small>${titulo}</small><p>${valor}</p>${extra}</div></div>` : "";

  const ficha = document.getElementById("ficha");
  ficha.style.setProperty("--color", c.asignatura.color);
  ficha.querySelector(".ficha-contenido").innerHTML = `
    <header class="ficha-cabecera">
      <span class="etiqueta-ficha">${c.tipo.icono} ${c.tipo.etiqueta}</span>
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
    </div>`;
  ficha.showModal();
}

// =====================================================================
// Botones y gestos
// =====================================================================
function mover(direccion) {
  const salto = estado.vista === "semana" ? 7 : 1;
  estado.fecha = sumarDias(estado.fecha, salto * direccion);
  dibujar();
}

document.getElementById("btn-anterior").onclick = () => mover(-1);
document.getElementById("btn-siguiente").onclick = () => mover(1);
document.getElementById("btn-hoy").onclick = () => { estado.fecha = new Date(); dibujar(); };
document.getElementById("btn-semana").onclick = () => { estado.vista = "semana"; dibujar(); };
document.getElementById("btn-dia").onclick = () => { estado.vista = "dia"; dibujar(); };

const calendario = document.getElementById("calendario");

// Tocar una clase (tarjeta o bloque) abre su ficha
calendario.addEventListener("click", (e) => {
  const clase = e.target.closest("[data-id]");
  if (clase) abrirFicha(Number(clase.dataset.id));
});

// La ficha se cierra con la X o tocando fuera de ella
const ficha = document.getElementById("ficha");
ficha.querySelector(".cerrar").onclick = () => ficha.close();
ficha.addEventListener("click", (e) => { if (e.target === ficha) ficha.close(); });

// Las flechas del teclado también cambian de día/semana (en el ordenador)
document.addEventListener("keydown", (e) => {
  if (ficha.open) return;
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
    dibujar();
    // Cada minuto refrescamos para que "Ahora" y la línea roja se muevan solas
    setInterval(() => { if (!ficha.open) dibujar(); }, 60000);
  } catch (error) {
    document.getElementById("calendario").textContent =
      "No he podido leer calendario.ics. ¿Está en la misma carpeta que index.html?";
    console.error(error);
  }
}

iniciar();
