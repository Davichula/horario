// =====================================================================
// tareas.js — TAREAS SIN HORA Y HÁBITOS
// ---------------------------------------------------------------------
// Dos listas que se guardan en el navegador (localStorage), igual que
// tus cosas personales:
//
//   Tarea (algo que hacer, sin hora):
//     { id, texto: "Informe de CD", fecha: "2026-11-28" o "",
//       asignatura: "30318" o "", hecha: false, hechaEl: "2026-11-27" }
//
//   Hábito (algo que quieres hacer cada día):
//     { id, nombre: "Leer 20 min", icono: "📖",
//       hechos: ["2026-11-20", "2026-11-21", ...] }   <- días en que lo hiciste
//
// Se ven en el panel de la izquierda y, el día de hoy, también arriba
// en la vista de día.
// =====================================================================

const CLAVE_TAREAS = "mi-horario:tareas";
const CLAVE_HABITOS = "mi-horario:habitos";

// Lee y guarda cualquier cosa en localStorage (como json.load / json.dump en Python)
function leerGuardado(clave, porDefecto) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
}
function guardarEn(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { avisar("No he podido guardar"); }
}

let tareas = leerGuardado(CLAVE_TAREAS, []);
let habitos = leerGuardado(CLAVE_HABITOS, []);
const guardarTareas = () => guardarEn(CLAVE_TAREAS, tareas);
const guardarHabitos = () => guardarEn(CLAVE_HABITOS, habitos);

const hoyTexto = () => aTextoDia(new Date());

// =====================================================================
// Entender lo que escribes: "CD informe mañana" -> asignatura CD, fecha mañana
// ---------------------------------------------------------------------
// Si escribes las siglas de una asignatura (CD, MTG, PAI...) se le pone
// su color. Si escribes "hoy", "mañana" o un día de la semana ("viernes"),
// se le pone esa fecha. Las palabras de fecha se quitan del texto.
// =====================================================================
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function interpretarTarea(textoOriginal) {
  let texto = textoOriginal.trim();
  let fecha = "";
  const hoy = new Date();
  const palabras = texto.split(/\s+/);
  const resto = [];
  for (const p of palabras) {
    const n = normalizar(p).replace(/[^a-z]/g, "");
    if (!fecha && n === "hoy") { fecha = aTextoDia(hoy); continue; }
    if (!fecha && n === "manana") { fecha = aTextoDia(sumarDias(hoy, 1)); continue; }
    if (!fecha && n === "pasado") { fecha = aTextoDia(sumarDias(hoy, 2)); continue; }
    const diaSemana = DIAS_SEMANA.indexOf(n);
    if (!fecha && diaSemana !== -1) {
      // el próximo día con ese nombre (si hoy es lunes y pones "lunes", el de la semana que viene)
      const faltan = ((diaSemana - hoy.getDay() + 7) % 7) || 7;
      fecha = aTextoDia(sumarDias(hoy, faltan));
      continue;
    }
    resto.push(p);
  }
  // Quitamos un "el" o "para el" que se quede colgando al final ("entregar para el viernes")
  while (resto.length && ["el", "para", "antes", "del", "de"].includes(normalizar(resto[resto.length - 1]))) resto.pop();
  texto = resto.join(" ") || textoOriginal.trim();

  // Siglas de asignatura (por ejemplo "CD" o "mtg")
  let asignatura = "";
  for (const [codigo, a] of Object.entries(MIS_ASIGNATURAS)) {
    if (new RegExp(`(^|[^a-z])${a.corto.toLowerCase()}([^a-z]|$)`).test(normalizar(texto))) { asignatura = codigo; break; }
  }
  return { texto, fecha, asignatura };
}

// ----- Cosas que se calculan de una tarea -----
// "hoy", "mañana", "vie 28" o "atrasada"
function etiquetaFecha(fecha) {
  if (!fecha) return "";
  const hoy = hoyTexto();
  const d = aFecha(fecha, "00:00");
  if (fecha === hoy) return "hoy";
  if (fecha === aTextoDia(sumarDias(new Date(), 1))) return "mañana";
  const corto = `${DIAS[d.getDay()].slice(0, 3).toLowerCase()} ${d.getDate()}`;
  return fecha < hoy ? `${corto} · atrasada` : corto;
}

// Orden: primero las atrasadas y las de fecha más cercana; al final las que no tienen fecha
function ordenarTareas(lista) {
  return [...lista].sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999") || a.id.localeCompare(b.id));
}

// Tareas que tocan un día: las de ese día y, si es hoy, también las atrasadas
function tareasDelDia(dia) {
  const t = aTextoDia(dia);
  const esHoy = t === hoyTexto();
  return ordenarTareas(tareas.filter((x) => !x.hecha && x.fecha && (x.fecha === t || (esHoy && x.fecha < t))));
}

function htmlTarea(t) {
  const a = MIS_ASIGNATURAS[t.asignatura];
  const etiqueta = etiquetaFecha(t.fecha);
  const atrasada = !t.hecha && t.fecha && t.fecha < hoyTexto();
  return `
    <li class="tarea ${t.hecha ? "hecha" : ""}" style="--color:${a ? a.color : "var(--suave)"}">
      <button class="check" data-tarea-check="${t.id}" aria-label="${t.hecha ? "Marcar como pendiente" : "Marcar como hecha"}"></button>
      <button class="tarea-texto" data-tarea-editar="${t.id}">
        <span>${escapar(t.texto)}</span>
        <small>
          ${a ? `<b>${a.corto}</b>` : ""}
          ${etiqueta ? `<em class="${atrasada ? "atrasada" : ""}">${etiqueta}</em>` : ""}
        </small>
      </button>
    </li>`;
}

// =====================================================================
// Hábitos
// =====================================================================
const hechoEl = (h, dia) => h.hechos.includes(dia);

// Racha: cuántos días seguidos lo has hecho, contando hacia atrás desde hoy
// (si hoy todavía no lo has hecho, la racha de ayer sigue viva)
function racha(h) {
  let dia = new Date();
  if (!hechoEl(h, aTextoDia(dia))) dia = sumarDias(dia, -1);
  let n = 0;
  while (hechoEl(h, aTextoDia(dia))) { n++; dia = sumarDias(dia, -1); }
  return n;
}

function marcarHabito(id, dia = hoyTexto()) {
  const h = habitos.find((x) => x.id === id);
  if (!h) return;
  h.hechos = hechoEl(h, dia) ? h.hechos.filter((d) => d !== dia) : [...h.hechos, dia];
  guardarHabitos();
  refrescarTodo();
  if (hechoEl(h, dia) && racha(h) > 1) avisar(`🔥 ${racha(h)} días seguidos`);
}

// Una fila de hábito: icono, nombre, racha, los últimos 7 días y el botón de hoy
function htmlHabito(h, { conSemana = true } = {}) {
  const hoy = new Date();
  const semana = [6, 5, 4, 3, 2, 1, 0].map((n) => sumarDias(hoy, -n));
  const r = racha(h);
  const hecho = hechoEl(h, hoyTexto());
  return `
    <li class="habito ${hecho ? "hecho" : ""}">
      <button class="habito-hoy" data-habito="${h.id}" aria-label="${escapar(h.nombre)}: ${hecho ? "hecho hoy" : "marcar hoy"}">${h.icono}</button>
      <div class="habito-info">
        <button class="habito-nombre" data-habito-editar="${h.id}">${escapar(h.nombre)}</button>
        ${conSemana ? `<div class="habito-semana" aria-hidden="true">${semana.map((d) =>
          `<i class="${hechoEl(h, aTextoDia(d)) ? "si" : ""}" title="${fechaLarga(d)}">${"DLMXJVS"[d.getDay()]}</i>`).join("")}</div>` : ""}
      </div>
      ${r ? `<span class="racha" title="Días seguidos">🔥${r}</span>` : ""}
    </li>`;
}

// =====================================================================
// Dibujar en el panel lateral
// =====================================================================
function dibujarTareasYHabitos() {
  const pendientes = ordenarTareas(tareas.filter((t) => !t.hecha));
  const hechas = tareas.filter((t) => t.hecha).sort((a, b) => (b.hechaEl || "").localeCompare(a.hechaEl || ""));

  document.getElementById("lista-tareas").innerHTML = pendientes.length
    ? pendientes.map(htmlTarea).join("")
    : `<li class="nota">Nada pendiente. ¡Bien! 🎉</li>`;

  const zonaHechas = document.getElementById("tareas-hechas");
  zonaHechas.hidden = !hechas.length;
  zonaHechas.querySelector("summary").textContent = `Hechas (${hechas.length})`;
  zonaHechas.querySelector("ul").innerHTML = hechas.slice(0, 30).map(htmlTarea).join("");

  document.getElementById("contador-tareas").textContent = pendientes.length || "";

  document.getElementById("lista-habitos").innerHTML = habitos.length
    ? habitos.map((h) => htmlHabito(h)).join("")
    : `<li class="nota">Añade algo que quieras hacer cada día: leer, beber agua, estirar…</li>`;
}

// Vuelve a dibujar todo lo que enseña tareas o hábitos
function refrescarTodo() {
  dibujarTareasYHabitos();
  dibujar();
  if (document.getElementById("hoja").open && hojaActual === "resumen") abrirResumen({ refrescar: true });
}

// Bloque para la vista de día: tareas de ese día y (si es hoy) hábitos
function htmlTareasDelDia(dia) {
  const lista = tareasDelDia(dia);
  const esHoy = aTextoDia(dia) === hoyTexto();
  if (!lista.length && !(esHoy && habitos.length)) return "";
  let html = `<section class="caja-dia">`;
  if (lista.length) {
    html += `<h3>✅ Para hacer</h3><ul class="lista-tareas">${lista.map(htmlTarea).join("")}</ul>`;
  }
  if (esHoy && habitos.length) {
    const hechos = habitos.filter((h) => hechoEl(h, hoyTexto())).length;
    html += `<h3>🌱 Hábitos de hoy <small>${hechos}/${habitos.length}</small></h3>
      <div class="habitos-chips">${habitos.map((h) => `
        <button class="chip-habito ${hechoEl(h, hoyTexto()) ? "hecho" : ""}" data-habito="${h.id}">${h.icono} ${escapar(h.nombre)}</button>`).join("")}
      </div>`;
  }
  return html + `</section>`;
}

// =====================================================================
// Añadir, marcar, editar
// =====================================================================
document.getElementById("form-tarea").addEventListener("submit", (e) => {
  e.preventDefault();
  const campo = e.target.elements.texto;
  if (!campo.value.trim()) return;
  const { texto, fecha, asignatura } = interpretarTarea(campo.value);
  tareas.push({ id: nuevoId(), texto, fecha, asignatura, hecha: false, hechaEl: "" });
  guardarTareas();
  campo.value = "";
  refrescarTodo();
  avisar(fecha ? `Tarea para ${etiquetaFecha(fecha)} ✓` : "Tarea añadida ✓");
});

document.getElementById("form-habito").addEventListener("submit", (e) => {
  e.preventDefault();
  const campo = e.target.elements.nombre;
  const nombre = campo.value.trim();
  if (!nombre) return;
  // El icono se elige solo con el mismo diccionario que tus cosas personales
  const { icono, categoria } = detectarCategoria(nombre);
  habitos.push({ id: nuevoId(), nombre, icono: categoria === "otro" ? "🌱" : icono, hechos: [] });
  guardarHabitos();
  campo.value = "";
  refrescarTodo();
});

function marcarTarea(id) {
  const t = tareas.find((x) => x.id === id);
  if (!t) return;
  t.hecha = !t.hecha;
  t.hechaEl = t.hecha ? hoyTexto() : "";
  guardarTareas();
  refrescarTodo();
  if (t.hecha) avisar("¡Hecha! ✓");
}

// Un solo "escuchador" para todos los clics de tareas y hábitos, estén donde estén
document.addEventListener("click", (e) => {
  const check = e.target.closest("[data-tarea-check]");
  if (check) return marcarTarea(check.dataset.tareaCheck);
  const editar = e.target.closest("[data-tarea-editar]");
  if (editar) { cerrarPanel(); return editarTarea(editar.dataset.tareaEditar); }
  const habito = e.target.closest("[data-habito]");
  if (habito) return marcarHabito(habito.dataset.habito);
  const editarHab = e.target.closest("[data-habito-editar]");
  if (editarHab) { cerrarPanel(); return editarHabito(editarHab.dataset.habitoEditar); }
});

document.getElementById("btn-borrar-hechas").onclick = () => {
  tareas = tareas.filter((t) => !t.hecha);
  guardarTareas();
  refrescarTodo();
  avisar("Tareas hechas borradas");
};

// Editar una tarea: se abre en la "hoja" (una ventana como la ficha)
function editarTarea(id) {
  const t = tareas.find((x) => x.id === id);
  if (!t) return;
  const opciones = [`<option value="">Ninguna</option>`, ...Object.entries(MIS_ASIGNATURAS).map(([c, a]) =>
    `<option value="${c}" ${t.asignatura === c ? "selected" : ""}>${a.corto} · ${a.nombre}</option>`)].join("");
  abrirHoja("tarea", `
    <form class="form-hoja" id="form-editar-tarea">
      <header class="form-cabecera"><h2>Editar tarea</h2></header>
      <div class="form-cuerpo">
        <label class="campo"><span>¿Qué hay que hacer?</span><input name="texto" required maxlength="120" value="${escapar(t.texto)}"></label>
        <div class="campo-fila">
          <label class="campo"><span>Para cuándo <small>(opcional)</small></span><input name="fecha" type="date" value="${t.fecha}"></label>
          <label class="campo"><span>Asignatura</span><select name="asignatura">${opciones}</select></label>
        </div>
      </div>
      <footer class="form-pie">
        <button type="button" class="boton-peligro" data-borrar>Borrar</button>
        <span class="hueco"></span>
        <button type="submit" class="boton-principal">Guardar</button>
      </footer>
    </form>`);
  const f = document.getElementById("form-editar-tarea");
  f.onsubmit = (e) => {
    e.preventDefault();
    Object.assign(t, { texto: f.elements.texto.value.trim(), fecha: f.elements.fecha.value, asignatura: f.elements.asignatura.value });
    guardarTareas(); cerrarHoja(); refrescarTodo(); avisar("Cambios guardados");
  };
  confirmarDosVeces(f.querySelector("[data-borrar]"), () => {
    tareas = tareas.filter((x) => x.id !== id);
    guardarTareas(); cerrarHoja(); refrescarTodo(); avisar("Borrada");
  });
}

// Editar un hábito: nombre, icono y un calendario de las últimas 5 semanas
function editarHabito(id) {
  const h = habitos.find((x) => x.id === id);
  if (!h) return;
  const lunesInicio = sumarDias(lunesDe(new Date()), -28);
  let celdas = "";
  for (let i = 0; i < 35; i++) {
    const d = sumarDias(lunesInicio, i);
    const t = aTextoDia(d);
    const futuro = t > hoyTexto();
    celdas += `<button type="button" class="${hechoEl(h, t) ? "si" : ""} ${t === hoyTexto() ? "hoy" : ""}"
      ${futuro ? "disabled" : `data-dia-habito="${t}"`} title="${fechaLarga(d)}">${d.getDate()}</button>`;
  }
  const total30 = h.hechos.filter((d) => d > aTextoDia(sumarDias(new Date(), -30))).length;
  abrirHoja("habito", `
    <form class="form-hoja" id="form-editar-habito">
      <header class="form-cabecera"><h2>${h.icono} ${escapar(h.nombre)}</h2></header>
      <div class="form-cuerpo">
        <p class="nota">🔥 Racha: <b>${racha(h)}</b> días · Últimos 30 días: <b>${total30}</b>. Toca un día para marcarlo o desmarcarlo.</p>
        <div class="calendario-habito">
          ${["L", "M", "X", "J", "V", "S", "D"].map((d) => `<span>${d}</span>`).join("")}
          ${celdas}
        </div>
        <div class="campo-fila">
          <label class="campo" style="flex:0 0 70px"><span>Icono</span><input name="icono" maxlength="4" value="${h.icono}"></label>
          <label class="campo"><span>Nombre</span><input name="nombre" required maxlength="40" value="${escapar(h.nombre)}"></label>
        </div>
      </div>
      <footer class="form-pie">
        <button type="button" class="boton-peligro" data-borrar>Borrar</button>
        <span class="hueco"></span>
        <button type="submit" class="boton-principal">Guardar</button>
      </footer>
    </form>`);
  const f = document.getElementById("form-editar-habito");
  f.querySelector(".calendario-habito").onclick = (e) => {
    const b = e.target.closest("[data-dia-habito]");
    if (!b) return;
    const dia = b.dataset.diaHabito;
    h.hechos = hechoEl(h, dia) ? h.hechos.filter((d) => d !== dia) : [...h.hechos, dia];
    b.classList.toggle("si");
    guardarHabitos(); dibujarTareasYHabitos(); dibujar();
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    h.nombre = f.elements.nombre.value.trim();
    h.icono = f.elements.icono.value.trim() || "🌱";
    guardarHabitos(); cerrarHoja(); refrescarTodo(); avisar("Cambios guardados");
  };
  confirmarDosVeces(f.querySelector("[data-borrar]"), () => {
    habitos = habitos.filter((x) => x.id !== id);
    guardarHabitos(); cerrarHoja(); refrescarTodo(); avisar("Hábito borrado");
  });
}

// =====================================================================
// La "hoja": una ventana genérica que usan tareas, resumen, plan de
// estudio y estadísticas. Se rellena con el HTML que le pasemos.
// =====================================================================
const hoja = document.getElementById("hoja");
let hojaActual = null;
function abrirHoja(nombre, html) {
  hojaActual = nombre;
  hoja.dataset.tipo = nombre;
  const contenido = hoja.querySelector(".hoja-contenido");
  contenido.onclick = null; // quitamos lo que dejara puesto la hoja anterior
  contenido.innerHTML = html;
  contenido.scrollTop = 0;
  if (!hoja.open) hoja.showModal();
}
const cerrarHoja = () => hoja.close();
hoja.querySelector(".cerrar").onclick = cerrarHoja;
hoja.addEventListener("click", (e) => { if (e.target === hoja) cerrarHoja(); });
hoja.addEventListener("close", () => (hojaActual = null));

// Un botón de borrar que pide pulsarlo dos veces (para no borrar sin querer)
function confirmarDosVeces(boton, accion) {
  boton.onclick = () => {
    if (boton.classList.contains("confirmar")) return accion();
    boton.classList.add("confirmar");
    boton.textContent = "¿Seguro?";
  };
}
