// =====================================================================
// estadisticas.js — ESTADÍSTICAS Y CALCULADORA DE NOTAS
// ---------------------------------------------------------------------
// Dos pestañas en la misma ventana:
//   📊 Semana: cuántas horas has tenido de clase (por asignatura) y
//      cuántas has dedicado a tus cosas (estudio, deporte...), más la
//      evolución de las últimas 8 semanas. Las gráficas son HTML y CSS
//      normales: cada barra es un <div> con el ancho/alto en %.
//   🎯 Notas: apuntas las partes de la evaluación de cada asignatura
//      (peso y nota) y te calcula la media y lo que te falta para aprobar.
//
// Las notas se guardan así:
//   { "30318": { objetivo: 5, partes: [ { id, nombre: "Parcial 1", peso: 30, nota: 6.5 }, ... ] } }
// =====================================================================

const CLAVE_NOTAS = "mi-horario:notas";
let notas = leerGuardado(CLAVE_NOTAS, {});
const guardarNotas = () => guardarEn(CLAVE_NOTAS, notas);

let semanaStats = null; // el lunes de la semana que estás mirando

// Suma horas de una semana: por asignatura (clases) y por categoría (lo tuyo)
function horasDeSemana(lunes) {
  const porAsignatura = new Map();
  const porCategoria = new Map();
  for (let i = 0; i < 7; i++) {
    for (const e of todoDelDia(sumarDias(lunes, i))) {
      const h = (e.fin - e.inicio) / 3600000;
      if (e.origen === "clase") porAsignatura.set(e.codigo, (porAsignatura.get(e.codigo) || 0) + h);
      else porCategoria.set(e.categoria, (porCategoria.get(e.categoria) || 0) + h);
    }
  }
  const clases = [...porAsignatura.values()].reduce((s, h) => s + h, 0);
  return { porAsignatura, porCategoria, clases };
}

// 6.2 -> "6,20" (con coma, como se escribe en España)
const decimal = (n, d = 2) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
const numeroHoras = (h) => (Math.round(h * 10) / 10).toLocaleString("es-ES") + " h";

// Barras horizontales: [{ nombre, valor, color }]
function barrasHorizontales(filas) {
  if (!filas.length) return `<p class="nota">Nada esta semana.</p>`;
  const max = Math.max(...filas.map((f) => f.valor));
  return `<div class="barras">${filas.map((f) => `
    <div class="barra-fila" title="${escapar(f.titulo || f.nombre)}: ${numeroHoras(f.valor)}">
      <span class="barra-nombre">${f.nombre}</span>
      <span class="barra-pista"><i style="width:${(f.valor / max) * 100}%;--color:${f.color}"></i></span>
      <span class="barra-valor">${numeroHoras(f.valor)}</span>
    </div>`).join("")}</div>`;
}

// Columnas de las últimas semanas para una categoría (estudio o deporte)
function columnasSemanas(semanas, clave, color, titulo) {
  const valores = semanas.map((s) => s.datos.porCategoria.get(clave) || 0);
  const max = Math.max(1, ...valores);
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  return `
    <div class="mini-grafica">
      <h4>${titulo} <small>media ${numeroHoras(media)}/semana</small></h4>
      <div class="columnas">${semanas.map((s, i) => `
        <div class="columna ${i === semanas.length - 1 ? "actual" : ""}" title="Semana del ${fechaCorta(s.lunes)}: ${numeroHoras(valores[i])}">
          <span class="columna-valor">${valores[i] ? (Math.round(valores[i] * 10) / 10).toLocaleString("es-ES") : ""}</span>
          <i style="height:${(valores[i] / max) * 100}%;--color:${color}"></i>
          <small>${s.lunes.getDate()}/${s.lunes.getMonth() + 1}</small>
        </div>`).join("")}
      </div>
    </div>`;
}

function htmlSemana() {
  const lunes = semanaStats;
  const domingo = sumarDias(lunes, 6);
  const datos = horasDeSemana(lunes);
  const estudio = datos.porCategoria.get("estudio") || 0;
  const deporte = datos.porCategoria.get("entreno") || 0;

  // Tareas hechas y hábitos cumplidos esa semana
  const dentro = (t) => t >= aTextoDia(lunes) && t <= aTextoDia(domingo);
  const tareasHechas = tareas.filter((t) => t.hecha && t.hechaEl && dentro(t.hechaEl)).length;
  const hoy = hoyTexto();
  const diasContados = [0, 1, 2, 3, 4, 5, 6].map((n) => aTextoDia(sumarDias(lunes, n))).filter((d) => d <= hoy).length;
  const posibles = habitos.length * diasContados;
  const cumplidos = habitos.reduce((s, h) => s + h.hechos.filter(dentro).length, 0);

  const filasClases = [...datos.porAsignatura.entries()]
    .map(([codigo, valor]) => ({ nombre: MIS_ASIGNATURAS[codigo].corto, titulo: MIS_ASIGNATURAS[codigo].nombre, valor, color: MIS_ASIGNATURAS[codigo].color }))
    .sort((a, b) => b.valor - a.valor);
  const filasTuyas = [...datos.porCategoria.entries()]
    .map(([clave, valor]) => ({ nombre: `${CATEGORIAS[clave].icono} ${CATEGORIAS[clave].nombre}`, valor, color: CATEGORIAS[clave].color }))
    .sort((a, b) => b.valor - a.valor);

  const semanas = [7, 6, 5, 4, 3, 2, 1, 0].map((n) => {
    const l = sumarDias(lunes, -7 * n);
    return { lunes: l, datos: horasDeSemana(l) };
  });

  return `
    <nav class="navegacion nav-stats">
      <button data-semana="-1" aria-label="Semana anterior">‹</button>
      <div class="titulo-fecha"><span>${fechaCorta(lunes)} – ${fechaCorta(domingo)}</span>
        ${mismoDia(lunes, lunesDe(new Date())) ? "" : `<button data-semana="0">Esta semana</button>`}</div>
      <button data-semana="1" aria-label="Semana siguiente">›</button>
    </nav>
    <div class="tiles">
      <div class="tile"><small>🎓 Clases</small><b>${numeroHoras(datos.clases)}</b></div>
      <div class="tile"><small>📚 Estudio</small><b>${numeroHoras(estudio)}</b></div>
      <div class="tile"><small>🏋️ Deporte</small><b>${numeroHoras(deporte)}</b></div>
      <div class="tile"><small>✅ Tareas hechas</small><b>${tareasHechas}</b></div>
      ${habitos.length ? `<div class="tile"><small>🌱 Hábitos</small><b>${posibles ? Math.round((cumplidos / posibles) * 100) : 0}%</b></div>` : ""}
    </div>
    <h3>Clases por asignatura</h3>
    ${barrasHorizontales(filasClases)}
    <h3>Tu tiempo</h3>
    ${barrasHorizontales(filasTuyas)}
    <h3>Últimas 8 semanas</h3>
    <div class="dos-graficas">
      ${columnasSemanas(semanas, "estudio", CATEGORIAS.estudio.color, "📚 Estudio")}
      ${columnasSemanas(semanas, "entreno", CATEGORIAS.entreno.color, "🏋️ Deporte")}
    </div>
    <p class="nota">Cuenta lo que tienes en el calendario: tus bloques de estudio y entreno, y las clases de tus grupos.</p>`;
}

// =====================================================================
// Calculadora de notas
// ---------------------------------------------------------------------
// Media ponderada: cada parte cuenta según su peso.
//   nota actual   = suma(nota × peso) / suma(pesos evaluados)
//   lo que llevas = suma(nota × peso) / 100   (puntos ya "en el bolsillo")
//   necesitas     = (objetivo × 100 − suma(nota × peso)) / pesos sin nota
// =====================================================================
function calcularAsignatura(datos) {
  const partes = datos.partes || [];
  const conNota = partes.filter((p) => p.nota !== null && p.nota !== "" && !Number.isNaN(Number(p.nota)));
  const pesoEvaluado = conNota.reduce((s, p) => s + Number(p.peso), 0);
  const puntos = conNota.reduce((s, p) => s + Number(p.nota) * Number(p.peso), 0);
  const pesoTotal = partes.reduce((s, p) => s + Number(p.peso || 0), 0);
  const pesoPendiente = Math.max(0, 100 - pesoEvaluado);
  const objetivo = Number(datos.objetivo ?? 5);
  return {
    media: pesoEvaluado ? puntos / pesoEvaluado : null,
    llevas: puntos / 100,
    pesoEvaluado, pesoPendiente, pesoTotal, objetivo,
    necesitas: pesoPendiente ? (objetivo * 100 - puntos) / pesoPendiente : null,
    final: pesoPendiente === 0 && pesoEvaluado ? puntos / 100 : null,
  };
}

function htmlNotas() {
  const tarjetas = Object.entries(MIS_ASIGNATURAS).map(([codigo, a]) => {
    const datos = notas[codigo] || { objetivo: 5, partes: [] };
    const r = calcularAsignatura(datos);
    let veredicto = "";
    if (r.final !== null) veredicto = r.final >= r.objetivo ? `<span class="ok">✓ Nota final ${decimal(r.final)}</span>` : `<span class="mal">Nota final ${decimal(r.final)}</span>`;
    else if (r.necesitas !== null && r.pesoEvaluado) {
      veredicto = r.necesitas <= 0 ? `<span class="ok">✓ Ya tienes el ${r.objetivo} asegurado</span>`
        : r.necesitas > 10 ? `<span class="mal">No llega al ${r.objetivo} ni con un 10 en lo que queda</span>`
        : `Necesitas un <b>${decimal(r.necesitas)}</b> de media en el ${Math.round(r.pesoPendiente)}% que queda`;
    }
    return `
      <details class="nota-asig" style="--color:${a.color}" data-codigo="${codigo}">
        <summary>
          <b>${a.corto}</b><span>${a.nombre}</span>
          <em>${r.media !== null ? decimal(r.media) : "—"}</em>
        </summary>
        <div class="nota-cuerpo">
          <div class="progreso" title="Llevas ${decimal(r.llevas)} puntos de 10 (${Math.round(r.pesoEvaluado)}% evaluado)">
            <i style="width:${Math.min(100, r.llevas * 10)}%"></i><span style="left:${r.objetivo * 10}%"></span>
          </div>
          <p class="veredicto">${veredicto || "Añade las partes de la evaluación (exámenes, prácticas…) con su peso."}</p>
          <table class="tabla-notas">
            <thead><tr><th>Parte</th><th>Peso %</th><th>Nota</th><th></th></tr></thead>
            <tbody>${(datos.partes || []).map((p) => `
              <tr data-parte="${p.id}">
                <td><input data-campo="nombre" value="${escapar(p.nombre)}" maxlength="30" aria-label="Nombre"></td>
                <td><input data-campo="peso" type="number" min="0" max="100" step="1" value="${p.peso}" aria-label="Peso"></td>
                <td><input data-campo="nota" type="number" min="0" max="10" step="0.01" value="${p.nota ?? ""}" placeholder="—" aria-label="Nota"></td>
                <td><button class="quitar" data-quitar-parte="${p.id}" aria-label="Quitar">✕</button></td>
              </tr>`).join("")}
            </tbody>
          </table>
          ${r.pesoTotal && Math.round(r.pesoTotal) !== 100 ? `<p class="aviso-plan">Los pesos suman ${Math.round(r.pesoTotal)}%, no 100%.</p>` : ""}
          <div class="nota-pie">
            <button class="boton-secundario" data-anadir-parte="${codigo}">＋ Añadir parte</button>
            <label>Quiero sacar al menos <input data-objetivo="${codigo}" type="number" min="5" max="10" step="0.5" value="${r.objetivo}"></label>
          </div>
        </div>
      </details>`;
  }).join("");

  // Media del curso con las asignaturas que tienen nota
  const medias = Object.keys(MIS_ASIGNATURAS).map((c) => calcularAsignatura(notas[c] || { partes: [] }))
    .filter((r) => r.media !== null);
  const mediaCurso = medias.length ? medias.reduce((s, r) => s + (r.final ?? r.media), 0) / medias.length : null;

  return `
    <div class="tiles">
      <div class="tile"><small>Media del curso</small><b>${mediaCurso !== null ? decimal(mediaCurso) : "—"}</b></div>
      <div class="tile"><small>Asignaturas con notas</small><b>${medias.length}/${Object.keys(MIS_ASIGNATURAS).length}</b></div>
    </div>
    <p class="nota">Toca una asignatura para apuntar sus partes. La media de cada una es sobre lo que ya está evaluado.</p>
    <div class="lista-notas">${tarjetas}</div>`;
}

// =====================================================================
// La ventana con las dos pestañas
// =====================================================================
let pestanaStats = "semana";
function abrirEstadisticas(pestana = pestanaStats) {
  pestanaStats = pestana;
  if (!semanaStats) semanaStats = lunesDe(new Date());
  // Recordamos qué asignaturas estaban abiertas para que no se cierren al redibujar
  const abiertas = [...hoja.querySelectorAll(".nota-asig[open]")].map((d) => d.dataset.codigo);
  abrirHoja("estadisticas", `
    <header class="form-cabecera"><h2>${pestana === "semana" ? "📊 Estadísticas" : "🎯 Mis notas"}</h2></header>
    <div class="selector-vista pestanas">
      <button data-pestana="semana" class="${pestana === "semana" ? "activo" : ""}">📊 Semana</button>
      <button data-pestana="notas" class="${pestana === "notas" ? "activo" : ""}">🎯 Notas</button>
    </div>
    <div class="form-cuerpo cuerpo-stats">${pestana === "semana" ? htmlSemana() : htmlNotas()}</div>`);
  abiertas.forEach((c) => hoja.querySelector(`.nota-asig[data-codigo="${c}"]`)?.setAttribute("open", ""));

  const cont = hoja.querySelector(".hoja-contenido");
  cont.onclick = (e) => {
    const p = e.target.closest("[data-pestana]");
    if (p) return abrirEstadisticas(p.dataset.pestana);
    const s = e.target.closest("[data-semana]");
    if (s) {
      const n = Number(s.dataset.semana);
      semanaStats = n === 0 ? lunesDe(new Date()) : sumarDias(semanaStats, 7 * n);
      return abrirEstadisticas("semana");
    }
    const anadir = e.target.closest("[data-anadir-parte]");
    if (anadir) {
      const c = anadir.dataset.anadirParte;
      notas[c] = notas[c] || { objetivo: 5, partes: [] };
      const usado = notas[c].partes.reduce((s, p) => s + Number(p.peso || 0), 0);
      notas[c].partes.push({ id: nuevoId(), nombre: `Parte ${notas[c].partes.length + 1}`, peso: Math.max(0, 100 - usado), nota: null });
      guardarNotas();
      abrirEstadisticas("notas");
      hoja.querySelector(`.nota-asig[data-codigo="${c}"]`)?.setAttribute("open", "");
      return;
    }
    const quitar = e.target.closest("[data-quitar-parte]");
    if (quitar) {
      const c = quitar.closest(".nota-asig").dataset.codigo;
      notas[c].partes = notas[c].partes.filter((p) => p.id !== quitar.dataset.quitarParte);
      guardarNotas();
      abrirEstadisticas("notas");
    }
  };
  // Al cambiar un número, guardamos y recalculamos (al salir del campo, para no perder el foco mientras escribes)
  cont.onchange = (e) => {
    const input = e.target;
    const objetivo = input.dataset.objetivo;
    if (objetivo) {
      notas[objetivo] = notas[objetivo] || { objetivo: 5, partes: [] };
      notas[objetivo].objetivo = Math.min(10, Math.max(5, Number(input.value) || 5));
    } else if (input.dataset.campo) {
      const c = input.closest(".nota-asig").dataset.codigo;
      const parte = notas[c].partes.find((p) => p.id === input.closest("[data-parte]").dataset.parte);
      const v = input.value;
      if (input.dataset.campo === "nombre") parte.nombre = v.trim() || parte.nombre;
      if (input.dataset.campo === "peso") parte.peso = Math.min(100, Math.max(0, Number(v) || 0));
      if (input.dataset.campo === "nota") parte.nota = v === "" ? null : Math.min(10, Math.max(0, Number(v)));
    } else return;
    guardarNotas();
    abrirEstadisticas("notas");
  };
}

document.getElementById("btn-estadisticas").onclick = () => { cerrarPanel(); abrirEstadisticas("semana"); };
document.getElementById("btn-notas").onclick = () => { cerrarPanel(); abrirEstadisticas("notas"); };
