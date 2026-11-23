// =====================================================================
// moodle.js — LAS ENTREGAS DE MOODLE
// ---------------------------------------------------------------------
// Moodle te deja exportar tu calendario como un archivo .ics (el mismo
// formato que el horario de la escuela). Un "robot" de GitHub (el archivo
// .github/workflows/moodle.yml) lo descarga solo cada día y lo guarda como
// moodle.ics. Este archivo:
//   1. Lee moodle.ics.
//   2. Averigua de qué asignatura es cada cosa (por su código, 30318...).
//   3. Quita lo que sea de OTROS grupos de prácticas (ej. "CD2_ses4").
//   4. Lo deja preparado para que app.js lo dibuje como el resto.
//
// Las entregas en Moodle no duran nada: solo tienen una hora límite
// (ej. 23:59). Para que se vean en la semana, las dibujamos como un
// bloque de 30 minutos que TERMINA a la hora límite.
// =====================================================================

const MOODLE_URL = "https://moodle.unizar.es/add"; // tu Moodle (para el botón "Abrir en Moodle")
const DURACION_ENTREGA = 30 * 60000; // 30 minutos, en milisegundos

// Cómo pone Moodle (en español) el tipo de cada cosa al principio del título
const TIPOS_MOODLE = [
  { patron: /^Vencimiento de (la tarea )?/i, etiqueta: "Entrega", icono: "📤" },
  { patron: /^(Se cierra|Cierre( de)?|Cierra)\s*/i, etiqueta: "Cierra", icono: "⏰" },
  { patron: /^(Se abre|Apertura( de)?|Abre)\s*/i, etiqueta: "Abre", icono: "🔓" },
  { patron: /\s*(debe completarse|vence)$/i, etiqueta: "Entrega", icono: "📤" },
];

// En un .ics, las comas, saltos de línea, etc. van "escapados" con \
const desescapar = (t) => t.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

function leerMoodle(texto) {
  const unido = texto.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  return unido.split("BEGIN:VEVENT").slice(1).map((bloque) => {
    const campo = (nombre) => {
      const linea = bloque.split("\n").find((l) => l.startsWith(nombre + ":") || l.startsWith(nombre + ";"));
      return linea ? desescapar(linea.slice(linea.indexOf(":") + 1)) : "";
    };
    return {
      uid: campo("UID"),
      resumen: campo("SUMMARY"),
      descripcion: campo("DESCRIPTION"),
      categoria: campo("CATEGORIES"), // ej. "110_656_30318_931_2026" -> asignatura 30318
      inicio: leerFecha(campo("DTSTART")), // leerFecha está en app.js
      fin: leerFecha(campo("DTEND")),
    };
  });
}

// ¿Este evento es de otro grupo de prácticas? Busca en el título cosas como
// "CD3_ses4" (CD + último número del grupo), "G13" o "grupo 13".
function esDeOtroGrupo(titulo, asignatura) {
  if (!asignatura || !asignatura.grupoPracticas) return false;
  const mio = asignatura.grupoPracticas; // "13"
  const corto = new RegExp(`\\b${asignatura.corto}\\s?(\\d{1,2})(?=_|\\b)`, "i").exec(titulo);
  if (corto) {
    const n = corto[1];
    // "CD3" -> grupo 13; "CD13" -> grupo 13
    return !(n === mio || n === mio.slice(-1));
  }
  const g = /\b(?:G|grupo\s*)(1\d)\b/i.exec(titulo);
  if (g) return g[1] !== mio;
  return false;
}

// Convierte cada evento de Moodle en un "elemento" igual que una clase o
// una cosa tuya (con color, icono, título...), para dibujarlos igual.
function filtrarMoodle(eventos) {
  const resultado = [];
  for (const ev of eventos) {
    if (!ev.inicio) continue;
    const codigo = (ev.categoria.match(/_(\d{5})_/) || [])[1];
    const asignatura = MIS_ASIGNATURAS[codigo];
    if (esDeOtroGrupo(ev.resumen, asignatura)) continue;

    let nombre = ev.resumen, tipo = { etiqueta: "Moodle", icono: "📌" };
    // "CD3_ses4" -> "Sesión 4 de prácticas" (tu grupo ya está comprobado arriba)
    const sesion = /^[A-Z]+\d{1,2}_ses(\d+)$/i.exec(nombre);
    if (sesion) { nombre = `Sesión ${sesion[1]} de prácticas`; tipo = { etiqueta: "Prácticas", icono: "🔬" }; }
    else for (const t of TIPOS_MOODLE) {
      if (t.patron.test(nombre)) { nombre = nombre.replace(t.patron, "") || nombre; tipo = t; break; }
    }

    const limite = ev.inicio;
    const sinDuracion = !ev.fin || ev.fin - ev.inicio < 60000;
    resultado.push({
      origen: "moodle",
      uid: ev.uid,
      codigo,
      asignatura,
      nombre,
      descripcion: ev.descripcion,
      limite: sinDuracion ? limite : null,
      inicio: sinDuracion ? new Date(limite - DURACION_ENTREGA) : ev.inicio,
      fin: sinDuracion ? limite : ev.fin,
      color: asignatura ? asignatura.color : "#7a8599",
      corto: asignatura ? asignatura.corto : "Moodle",
      titulo: nombre,
      etiqueta: tipo.etiqueta,
      icono: tipo.icono,
      clase: "moodle",
      lugar: asignatura ? asignatura.nombre : "",
    });
  }
  resultado.sort((a, b) => a.fin - b.fin);
  resultado.forEach((m, i) => (m.id = `m:${i}`));
  return resultado;
}

// Descarga moodle.ics. Si todavía no existe, no pasa nada: lista vacía.
async function cargarMoodle() {
  try {
    const r = await fetch("moodle.ics", { cache: "no-cache" });
    if (!r.ok) return [];
    return filtrarMoodle(leerMoodle(await r.text()));
  } catch {
    return [];
  }
}

// =====================================================================
// Informes de prácticas que se entregan en la siguiente sesión
// ---------------------------------------------------------------------
// Para las asignaturas de INFORMES_EN_SIGUIENTE_SESION (config.js):
// el informe de la práctica 1 se entrega al empezar la práctica 2, el de
// la 2 al empezar la 3... Creamos una "entrega" con esa hora límite, con
// el mismo formato que las de Moodle para que salga en todos los sitios.
// Si Moodle ya tiene una entrega de esa asignatura ese mismo día, no la
// duplicamos.
// =====================================================================
function informesDePracticas(clases, deMoodle) {
  const resultado = [];
  for (const codigo of INFORMES_EN_SIGUIENTE_SESION) {
    const asignatura = MIS_ASIGNATURAS[codigo];
    if (!asignatura) continue;
    const sesiones = clases.filter((c) => c.codigo === codigo && c.clase === "practicas");
    // La última práctica no tiene sesión siguiente: su informe se entrega
    // dos lunes después, a la misma hora a la que empezaba la sesión
    for (let i = 0; i < sesiones.length; i++) {
      const ultima = i + 1 === sesiones.length;
      const limite = ultima ? dosLunesDespues(sesiones[i].inicio) : sesiones[i + 1].inicio;
      const yaEnMoodle = deMoodle.some((m) => m.codigo === codigo && m.etiqueta === "Entrega" && mismoDia(m.fin, limite));
      if (yaEnMoodle) continue;
      resultado.push({
        origen: "moodle",
        automatica: true, // la ha calculado la web, no viene de Moodle
        uid: `informe:${codigo}:${i + 1}`,
        id: `m:informe:${codigo}:${i + 1}`,
        codigo,
        asignatura,
        nombre: `Informe de la práctica ${i + 1}`,
        descripcion: ultima
          ? `Es la última práctica: se entrega dos lunes después de la sesión (${fechaLarga(limite)}, ${hora(limite)}).`
          : `Se entrega al empezar la sesión ${i + 2} de prácticas (${fechaLarga(limite)}, ${hora(limite)}).`,
        limite,
        inicio: new Date(limite - DURACION_ENTREGA),
        fin: limite,
        color: asignatura.color,
        corto: asignatura.corto,
        titulo: `Informe de la práctica ${i + 1}`,
        etiqueta: "Entrega",
        icono: "📄",
        clase: "moodle",
        lugar: asignatura.nombre,
      });
    }
  }
  return resultado;
}

// El segundo lunes después de una fecha, a la misma hora
// (miércoles 9 -> lunes 14 es el primero -> lunes 21 es el segundo)
function dosLunesDespues(fecha) {
  const d = new Date(fecha);
  const hastaLunes = ((8 - d.getDay()) % 7) || 7; // días hasta el próximo lunes
  d.setDate(d.getDate() + hastaLunes + 7);
  return d;
}

// La ficha que sale al tocar una entrega
function htmlFichaMoodle(m) {
  const cuando = m.limite || m.inicio;
  const segundos = Math.floor(cuando.getTime() / 1000);
  const enlace = `${MOODLE_URL}/calendar/view.php?view=day&time=${segundos}`;
  const pasada = (m.limite || m.fin) < new Date();
  return `
    <header class="ficha-cabecera">
      <span class="etiqueta-ficha">${m.icono} ${m.etiqueta} · ${m.automatica ? "Informe de prácticas" : "Moodle"}</span>
      <h2>${escapar(m.nombre)}</h2>
      <p>${m.asignatura ? `${m.asignatura.corto} · ${m.asignatura.nombre}` : "Moodle"}</p>
    </header>
    <div class="ficha-cuerpo">
      ${m.limite
        ? fila("⏳", pasada ? "Se cerró" : "Fecha límite", `${fechaLarga(m.limite)} (${cuandoEs(m.limite)})`,
               `<p class="sub">a las ${hora(m.limite)}</p>`)
        : fila("🕒", "Cuándo", `${fechaLarga(m.inicio)} (${cuandoEs(m.inicio)})`,
               `<p class="sub">${hora(m.inicio)} – ${hora(m.fin)}</p>`)}
      ${m.descripcion ? `<div class="fila"><span class="icono">🗒️</span><div><small>${m.automatica ? "Cómo se calcula" : "Lo que dice Moodle"}</small><p class="notas">${escapar(m.descripcion)}</p></div></div>` : ""}
    </div>
    <footer class="ficha-pie">
      <a class="boton-principal" href="${enlace}" target="_blank" rel="noopener">Abrir en Moodle ↗</a>
    </footer>`;
}
