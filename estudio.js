// =====================================================================
// estudio.js — EL PLAN DE ESTUDIO
// ---------------------------------------------------------------------
// Le dices cuántas horas quieres repasar para un examen y la web busca
// huecos libres en los días anteriores (sin clases ni cosas tuyas) y te
// propone bloques de repaso repartidos. Si te gustan, los añade a tu
// calendario como cosas personales normales: puedes moverlas, editarlas
// o borrarlas como cualquier otra.
//
// Cada bloque guarda  plan: "30318:2027-01-12"  (asignatura + día del
// examen) para saber a qué examen pertenece.
// =====================================================================

// Una clave que no cambia aunque recargues: código de la asignatura + día del examen
const claveExamen = (examen) => `${examen.codigo}:${aTextoDia(examen.inicio)}`;
const bloquesDelPlan = (clave) => estado.personales.filter((p) => p.plan === clave);

// 1.5 -> "1 h 30 min", 2 -> "2 h"
function formatoHoras(h) {
  const min = Math.round(h * 60);
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh && mm ? `${hh} h ${mm} min` : hh ? `${hh} h` : `${mm} min`;
}

// Lo que has elegido la última vez, para no tener que repetirlo
const CLAVE_AJUSTES_PLAN = "mi-horario:ajustes-plan";
const AJUSTES_PLAN = { horas: 8, bloque: 1.5, diasAntes: 10, desde: "09:00", hasta: "21:00", porDia: 2, finde: true };
const ajustesPlan = () => ({ ...AJUSTES_PLAN, ...leerGuardado(CLAVE_AJUSTES_PLAN, {}) });

// =====================================================================
// El algoritmo que busca huecos
// ---------------------------------------------------------------------
// Para cada día entre "X días antes" y la víspera del examen:
//   1. Junta todo lo que ya tienes ese día (clases + tus cosas).
//   2. Mira la franja que has elegido (p. ej. 9:00–21:00) y busca los
//      trozos libres, dejando 15 min de margen antes y después de cada cosa.
//   3. En cada trozo libre caben tantos bloques como quepan (con 30 min
//      de descanso entre uno y otro).
// Después reparte: un bloque por día empezando por los días más
// cercanos al examen, luego otra vuelta... hasta llegar a las horas
// que pediste o al máximo de bloques por día.
// =====================================================================
const MARGEN = 15 * 60000;   // 15 minutos en milisegundos
const DESCANSO = 30 * 60000;

function huecosDelDia(dia, a) {
  const inicioFranja = aFecha(aTextoDia(dia), a.desde);
  const finFranja = aFecha(aTextoDia(dia), a.hasta);
  let desde = inicioFranja;
  // Hoy solo cuenta a partir de la próxima media hora
  const ahora = new Date();
  if (mismoDia(dia, ahora)) {
    const proxima = new Date(Math.ceil(ahora.getTime() / (30 * 60000)) * 30 * 60000);
    if (proxima > desde) desde = proxima;
  }
  const ocupado = todoDelDia(dia)
    .map((e) => [e.inicio.getTime() - MARGEN, e.fin.getTime() + MARGEN])
    .sort((x, y) => x[0] - y[0]);

  const largo = a.bloque * 3600000;
  const bloques = [];
  let cursor = desde.getTime();
  const colocarHasta = (limite) => {
    while (cursor + largo <= limite) {
      bloques.push([new Date(cursor), new Date(cursor + largo)]);
      cursor += largo + DESCANSO;
    }
  };
  for (const [ini, fin] of ocupado) {
    if (ini > cursor) colocarHasta(Math.min(ini, finFranja.getTime()));
    cursor = Math.max(cursor, fin);
    // Redondeamos a la media hora siguiente para que queden horas "bonitas"
    cursor = Math.ceil(cursor / (30 * 60000)) * 30 * 60000;
  }
  colocarHasta(finFranja.getTime());
  return bloques;
}

function proponerPlan(examen, a) {
  const necesarios = Math.ceil(a.horas / a.bloque);
  const diaExamen = new Date(examen.inicio); diaExamen.setHours(0, 0, 0, 0);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  // Días candidatos, del más cercano al examen al más lejano
  const dias = [];
  for (let n = 1; n <= a.diasAntes; n++) {
    const d = sumarDias(diaExamen, -n);
    if (d < hoy) break;
    if (!a.finde && (d.getDay() === 0 || d.getDay() === 6)) continue;
    if (festivoDelDia(d) && !a.finde) continue;
    dias.push({ dia: d, huecos: huecosDelDia(d, a), elegidos: [] });
  }

  // Vueltas: en cada vuelta, como mucho un bloque más por día
  let puestos = 0;
  for (let vuelta = 0; vuelta < a.porDia && puestos < necesarios; vuelta++) {
    for (const d of dias) {
      if (puestos >= necesarios) break;
      const hueco = d.huecos[d.elegidos.length];
      if (hueco) { d.elegidos.push(hueco); puestos++; }
    }
  }
  return dias.filter((d) => d.elegidos.length).sort((x, y) => x.dia - y.dia);
}

// =====================================================================
// La ventana del plan
// =====================================================================
function abrirPlanEstudio(examen, propuesta = null) {
  const a = ajustesPlan();
  const clave = claveExamen(examen);
  const existentes = bloquesDelPlan(clave);
  const horasHechas = existentes.reduce((s, b) => s + (aFecha(b.fecha, b.fin) - aFecha(b.fecha, b.inicio)) / 3600000, 0);

  const opcion = (valor, actual, texto) => `<option value="${valor}" ${String(valor) === String(actual) ? "selected" : ""}>${texto}</option>`;

  let vistaPrevia = "";
  if (propuesta) {
    const total = propuesta.reduce((s, d) => s + d.elegidos.length, 0);
    const horas = total * a.bloque;
    vistaPrevia = `
      <div class="plan-previa">
        <h3>Propuesta: ${total} ${total === 1 ? "bloque" : "bloques"} · ${formatoHoras(horas)}</h3>
        ${horas < a.horas ? `<p class="aviso-plan">⚠️ Solo caben ${formatoHoras(horas)} de las ${formatoHoras(a.horas)} que pediste. Prueba a empezar antes, ampliar la franja o permitir más bloques por día.</p>` : ""}
        <ul class="resumen-lista">${propuesta.map((d) => `
          <li style="--color:${examen.color}">
            <span class="r-hora">${DIAS[d.dia.getDay()].slice(0, 3)} ${d.dia.getDate()}</span>
            <span class="r-texto">${d.elegidos.map(([i, f]) => `${hora(i)}–${hora(f)}`).join(" · ")}</span>
          </li>`).join("")}
        </ul>
      </div>`;
  }

  abrirHoja("plan", `
    <header class="ficha-cabecera" style="--color:${examen.color}">
      <span class="etiqueta-ficha">📚 Plan de estudio</span>
      <h2>${examen.asignatura.nombre}</h2>
      <p>Examen: ${fechaLarga(examen.inicio)}, ${hora(examen.inicio)} (${cuandoEs(examen.inicio)})</p>
    </header>
    <form class="form-hoja" id="form-plan">
      <div class="form-cuerpo">
        ${existentes.length ? `<p class="plan-actual">Ya tienes <b>${existentes.length} bloques</b> (${formatoHoras(horasHechas)}) para este examen.
          <button type="button" class="enlace" data-quitar-plan>Quitar el plan</button></p>` : ""}
        <div class="campo-fila">
          <label class="campo"><span>Horas de repaso</span><input name="horas" type="number" min="1" max="80" step="0.5" value="${a.horas}"></label>
          <label class="campo"><span>Cada bloque</span><select name="bloque">
            ${opcion(1, a.bloque, "1 h")}${opcion(1.5, a.bloque, "1 h 30 min")}${opcion(2, a.bloque, "2 h")}${opcion(2.5, a.bloque, "2 h 30 min")}${opcion(3, a.bloque, "3 h")}
          </select></label>
        </div>
        <div class="campo-fila">
          <label class="campo"><span>Empezar</span><select name="diasAntes">
            ${[3, 5, 7, 10, 14, 21, 30].map((n) => opcion(n, a.diasAntes, `${n} días antes`)).join("")}
          </select></label>
          <label class="campo"><span>Máximo al día</span><select name="porDia">
            ${[1, 2, 3, 4].map((n) => opcion(n, a.porDia, `${n} ${n === 1 ? "bloque" : "bloques"}`)).join("")}
          </select></label>
        </div>
        <div class="campo-fila">
          <label class="campo"><span>Desde las</span><input name="desde" type="time" step="1800" value="${a.desde}"></label>
          <label class="campo"><span>Hasta las</span><input name="hasta" type="time" step="1800" value="${a.hasta}"></label>
        </div>
        <label class="interruptor"><input type="checkbox" name="finde" ${a.finde ? "checked" : ""}> Estudiar también fines de semana y festivos</label>
        ${vistaPrevia}
      </div>
      <footer class="form-pie">
        <span class="hueco"></span>
        <button type="submit" class="boton-secundario">${propuesta ? "Recalcular" : "Buscar huecos"}</button>
        ${propuesta && propuesta.length ? `<button type="button" class="boton-principal" data-guardar-plan>${existentes.length ? "Sustituir plan" : "Añadir al calendario"}</button>` : ""}
      </footer>
    </form>`);

  const f = document.getElementById("form-plan");
  const leerAjustes = () => {
    const e = f.elements;
    const nuevos = {
      horas: Math.max(0.5, Number(e.horas.value) || AJUSTES_PLAN.horas),
      bloque: Number(e.bloque.value), diasAntes: Number(e.diasAntes.value), porDia: Number(e.porDia.value),
      desde: e.desde.value || AJUSTES_PLAN.desde, hasta: e.hasta.value || AJUSTES_PLAN.hasta, finde: e.finde.checked,
    };
    guardarEn(CLAVE_AJUSTES_PLAN, nuevos);
    return nuevos;
  };

  f.onsubmit = (e) => {
    e.preventDefault();
    const ajustes = leerAjustes();
    if (ajustes.hasta <= ajustes.desde) return avisar("La franja horaria está al revés");
    // Si ya había un plan, buscamos huecos como si no estuviera (porque lo vamos a sustituir)
    const guardados = estado.personales;
    estado.personales = guardados.filter((p) => p.plan !== clave);
    const nueva = proponerPlan(examen, ajustes);
    estado.personales = guardados;
    if (!nueva.length) avisar("No he encontrado huecos libres");
    abrirPlanEstudio(examen, nueva);
  };

  const guardar = f.querySelector("[data-guardar-plan]");
  if (guardar) guardar.onclick = () => {
    const nombre = examen.asignatura.corto;
    const nuevos = propuesta.flatMap((d) => d.elegidos.map(([i, fin]) => ({
      id: nuevoId(),
      titulo: `Repasar ${nombre}`,
      categoria: "estudio",
      fecha: aTextoDia(i),
      inicio: hora(i),
      fin: hora(fin),
      repetir: "no", hasta: "", lugar: "",
      notas: `Plan de estudio para el examen de ${examen.asignatura.nombre} (${fechaLarga(examen.inicio)}).`,
      plan: clave,
    })));
    estado.personales = [...estado.personales.filter((p) => p.plan !== clave), ...nuevos];
    guardarPersonales(estado.personales);
    // Que se vea el estudio aunque estuviera oculto en los filtros
    estado.filtros.ocultos = estado.filtros.ocultos.filter((k) => k !== "estudio");
    guardarFiltros();
    cerrarHoja();
    dibujarPanel();
    dibujar();
    avisar(`📚 ${nuevos.length} bloques añadidos`);
  };

  const quitar = f.querySelector("[data-quitar-plan]");
  if (quitar) confirmarDosVeces(quitar, () => {
    estado.personales = estado.personales.filter((p) => p.plan !== clave);
    guardarPersonales(estado.personales);
    dibujarPanel();
    dibujar();
    abrirPlanEstudio(examen);
    avisar("Plan quitado");
  });
}

// Lista de próximos exámenes para elegir cuál planificar (desde el panel)
function abrirListaPlanes() {
  const ahora = new Date();
  // Solo la convocatoria ordinaria: las recuperaciones no se planifican
  const examenes = estado.eventos.filter((e) => esOrdinaria(e) && e.inicio > ahora);
  abrirHoja("planes", `
    <header class="form-cabecera"><h2>📚 Plan de estudio</h2></header>
    <div class="form-cuerpo">
      <p class="nota">Elige un examen y te busco huecos libres antes para repasar.</p>
      ${examenes.length ? `<ul class="lista-examenes">${examenes.map((e) => `
        <li><button data-planificar="${e.id}" style="--color:${e.color}">
          <b>${e.corto} <small>${fechaCorta(e.inicio)} · ${cuandoEs(e.inicio)}</small></b>
          <span>${estadoPlan(e).replace(" · ", "") || ""}</span>
        </button></li>`).join("")}</ul>`
        : `<p class="nota">No hay exámenes próximos en tu calendario.</p>`}
    </div>`);
  hoja.querySelector(".hoja-contenido").onclick = (ev) => {
    const b = ev.target.closest("[data-planificar]");
    if (b) abrirPlanEstudio(estado.eventos.find((x) => x.id === b.dataset.planificar));
  };
}

document.getElementById("btn-plan").onclick = () => { cerrarPanel(); abrirListaPlanes(); };
