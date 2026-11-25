// =====================================================================
// resumen.js — EL RESUMEN DEL DÍA
// ---------------------------------------------------------------------
// La primera vez que abres la web cada día aparece una hoja con:
//   - lo que tienes hoy (clases y cosas tuyas),
//   - las tareas para hoy (y las atrasadas),
//   - tus hábitos para marcarlos,
//   - lo próximo importante: exámenes y tareas de los próximos 14 días.
//   - el domingo y el lunes, además, el resumen de la semana (semana.js).
// Se puede volver a abrir con el botón 📋 de arriba, y desactivar.
// =====================================================================

const CLAVE_RESUMEN_VISTO = "mi-horario:resumen-visto";   // el último día que se enseñó
const CLAVE_RESUMEN_APAGADO = "mi-horario:resumen-apagado"; // "1" si no quieres que salga solo

function saludo() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches 🌙";
  if (h < 14) return "Buenos días ☀️";
  if (h < 21) return "Buenas tardes 🌤️";
  return "Buenas noches 🌙";
}

// Todo lo de un día SIN tener en cuenta los filtros del panel
// (el resumen tiene que avisarte aunque hayas ocultado algo)
function todoDelDia(dia) {
  const clases = estado.eventos.filter((e) => mismoDia(e.inicio, dia));
  return [...clases, ...personalesDelDia(estado.personales, dia)].sort((a, b) => a.inicio - b.inicio);
}

function abrirResumen({ refrescar = false } = {}) {
  const ahora = new Date();
  const hoy = todoDelDia(ahora);
  const quedan = hoy.filter((e) => e.fin > ahora);
  const tareasHoy = tareasDelDia(ahora);

  // Frase principal: "Hoy tienes 3 clases. La primera, a las 9:00 en A04."
  const nClases = hoy.filter((e) => e.origen === "clase").length;
  let frase;
  if (!hoy.length) frase = "Hoy no tienes nada en el calendario.";
  else if (!quedan.length) frase = "Ya has terminado todo lo de hoy. ¡A descansar!";
  else {
    const sig = quedan[0];
    const enCurso = sig.inicio <= ahora;
    frase = `${nClases ? `Hoy tienes ${nClases} ${nClases === 1 ? "clase" : "clases"}. ` : ""}` +
      (enCurso ? `Ahora mismo: <b>${escapar(sig.corto)}</b>` : `Lo siguiente: <b>${escapar(sig.corto)}</b> a las ${hora(sig.inicio)}`) +
      (sig.lugarCorto ? ` en ${escapar(sig.lugarCorto)}` : "") + ".";
  }

  // Lo próximo importante: exámenes y tareas con fecha en los próximos 14 días
  const limite = sumarDias(ahora, 14);
  const proximos = [
    ...estado.eventos.filter((e) => esOrdinaria(e) && e.fin > ahora && e.inicio < limite)
      .map((e) => ({ fecha: e.inicio, icono: "📝", texto: `Examen de ${e.asignatura.nombre}`, color: e.color, examen: e })),
    // Entregas de Moodle (moodle.js), si las hay
    ...(estado.moodle || []).filter((m) => m.fin > ahora && m.fin < limite)
      .map((m) => ({ fecha: m.fin, icono: m.icono || "📤", texto: `${m.corto} · ${m.nombre}`, color: m.color })),
    ...tareas.filter((t) => !t.hecha && t.fecha && t.fecha > hoyTexto() && aFecha(t.fecha, "00:00") < limite)
      .map((t) => ({ fecha: aFecha(t.fecha, "00:00"), icono: "✅", texto: t.texto, color: MIS_ASIGNATURAS[t.asignatura]?.color || "var(--suave)" })),
  ].sort((a, b) => a.fecha - b.fecha).slice(0, 6);

  const html = `
    <header class="resumen-cabecera">
      <small>${fechaLarga(ahora)}</small>
      <h2>${saludo()}</h2>
      <p>${frase}</p>
    </header>
    <div class="resumen-cuerpo">
      <div id="resumen-semana"></div>
      ${hoy.length ? `
        <h3>Hoy</h3>
        <ul class="resumen-lista">${hoy.map((e) => `
          <li class="${e.fin <= ahora ? "pasada" : ""}" style="--color:${e.color}">
            <span class="r-hora">${hora(e.inicio)}</span>
            <span class="r-texto">${e.icono} ${escapar(e.titulo)} <small>${e.etiqueta}${e.lugarCorto ? " · " + escapar(e.lugarCorto) : ""}</small></span>
          </li>`).join("")}
        </ul>` : ""}

      ${tareasHoy.length ? `<h3>Para hacer hoy</h3><ul class="lista-tareas">${tareasHoy.map(htmlTarea).join("")}</ul>` : ""}

      ${habitos.length ? `<h3>Hábitos</h3><div class="habitos-chips">${habitos.map((h) => `
        <button class="chip-habito ${hechoEl(h, hoyTexto()) ? "hecho" : ""}" data-habito="${h.id}">${h.icono} ${escapar(h.nombre)}</button>`).join("")}</div>` : ""}

      <h3>Lo próximo importante</h3>
      ${proximos.length ? `<ul class="resumen-lista">${proximos.map((p) => `
        <li style="--color:${p.color}">
          <span class="r-hora">${cuandoEs(p.fecha).replace("dentro de ", "en ")}</span>
          <span class="r-texto">${p.icono} ${escapar(p.texto)} <small>${fechaLarga(p.fecha)}${p.examen ? estadoPlan(p.examen) : ""}</small></span>
        </li>`).join("")}</ul>`
        : `<p class="nota">Nada importante en las próximas dos semanas.</p>`}
    </div>
    <footer class="ficha-pie resumen-pie">
      <label class="interruptor"><input type="checkbox" id="resumen-auto" ${resumenApagado() ? "" : "checked"}> Mostrar al abrir</label>
      <span class="hueco"></span>
      <button class="boton-principal" data-cerrar-hoja>¡Vamos! 💪</button>
    </footer>`;

  if (refrescar && !hoja.open) return;
  abrirHoja("resumen", html);
  hoja.querySelector("[data-cerrar-hoja]").onclick = cerrarHoja;
  // Domingo o lunes: la tarjeta de la semana (entreno, comida y peso)
  if ([0, 1].includes(ahora.getDay())) {
    import("./semana.js").then((m) => m.pintar(hoja.querySelector("#resumen-semana"))).catch(() => {});
  }
  hoja.querySelector("#resumen-auto").onchange = (e) => {
    try { localStorage.setItem(CLAVE_RESUMEN_APAGADO, e.target.checked ? "" : "1"); } catch {}
  };
  try { localStorage.setItem(CLAVE_RESUMEN_VISTO, hoyTexto()); } catch {}
}

// " · 📚 6 h planificadas" (si ya has hecho un plan de estudio para ese examen)
function estadoPlan(examen) {
  if (typeof bloquesDelPlan !== "function") return "";
  const bloques = bloquesDelPlan(claveExamen(examen));
  if (!bloques.length) return " · sin plan de estudio";
  const horas = bloques.reduce((s, b) => s + (aFecha(b.fecha, b.fin) - aFecha(b.fecha, b.inicio)) / 3600000, 0);
  return ` · 📚 ${formatoHoras(horas)} planificadas`;
}

function resumenApagado() {
  try { return localStorage.getItem(CLAVE_RESUMEN_APAGADO) === "1"; } catch { return false; }
}

// Se llama al arrancar: lo enseña si hoy todavía no se ha visto
function mostrarResumenSiToca() {
  let visto = "";
  try { visto = localStorage.getItem(CLAVE_RESUMEN_VISTO); } catch {}
  if (resumenApagado() || visto === hoyTexto() || document.querySelector("dialog[open]")) return;
  abrirResumen();
}

document.getElementById("btn-resumen").onclick = () => abrirResumen();
