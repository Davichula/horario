// =====================================================================
// avisos.js — NOTIFICACIONES EN EL MÓVIL
// ---------------------------------------------------------------------
// Cómo llegan los avisos aunque tengas la app cerrada:
//
//   1. Esta web calcula qué avisos tocan en las próximas semanas (clases,
//      exámenes, entregas de Moodle, tus cosas y tus tareas) y guarda la
//      lista en "mi-horario:avisos-programados". Como esa clave se
//      sincroniza, la lista acaba en Supabase.
//   2. Al pulsar "Activar avisos", el móvil nos da una "dirección" a la
//      que se le pueden mandar notificaciones (una suscripción). La
//      guardamos en la tabla "suscripciones" de Supabase.
//   3. En Supabase, cada minuto se ejecuta una pequeña función ("avisos",
//      en supabase/functions/avisos/index.ts) que mira qué avisos ya
//      tocan y los manda a esas direcciones.
//
// En el iPhone solo funciona con la app añadida a la pantalla de inicio
// (iOS 16.4 o más nuevo), y hay que abrirla de vez en cuando para que
// la lista de avisos se renueve (cubre las próximas 3 semanas).
// =====================================================================

(() => {
  // La "llave" pública de notificaciones la da la función de Supabase.
  // La privada se queda allí, en una tabla que solo ella puede leer.
  async function llavePublica() {
    const sb = await window.nube.supabase();
    const { data, error } = await sb.functions.invoke("avisos?clave", { method: "GET" });
    if (error || !data?.publica) throw new Error("No he podido hablar con la función de avisos de Supabase.");
    return data.publica;
  }

  const CLAVE_AJUSTES = "mi-horario:avisos";
  const CLAVE_PROGRAMADOS = "mi-horario:avisos-programados";
  const DIAS_VISTA = 21;    // cuántos días por delante programamos
  const MAXIMO = 400;       // tope de avisos guardados

  const AJUSTES_POR_DEFECTO = {
    clases: 10,       // minutos antes de cada clase (0 = sin aviso)
    examenes: true,   // la tarde anterior (20:00) y 1 hora antes
    entregas: true,   // el día anterior a la misma hora y 2 horas antes
    personales: 15,   // minutos antes de tus cosas (0 = sin aviso)
    tareas: true,     // a las 9:00 del día que vencen
  };

  const leer = (clave, porDefecto) => {
    try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
  };
  const ajustes = () => ({ ...AJUSTES_POR_DEFECTO, ...leer(CLAVE_AJUSTES, {}) });
  const hora = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const cuandoTexto = (min) => (min >= 60 ? `en ${min / 60} h` : `en ${min} min`);

  // ----- 1. Calcular la lista de avisos -----
  function calcularAvisos() {
    const a = ajustes();
    const ahora = Date.now();
    const limite = ahora + DIAS_VISTA * 86400000;
    const lista = [];
    const poner = (id, cuando, titulo, cuerpo) => {
      const t = cuando.getTime();
      if (t > ahora && t < limite) lista.push({ id, cuando: t, titulo, cuerpo });
    };

    // Clases y exámenes (vienen del calendario de la universidad)
    for (const c of estado.eventos || []) {
      const lugar = c.lugarCorto ? ` · ${c.lugarCorto}` : "";
      const base = `${c.codigo}:${c.inicio.getTime()}`;
      if (c.clase === "examen") {
        if (!a.examenes) continue;
        const tarde = new Date(c.inicio); tarde.setDate(tarde.getDate() - 1); tarde.setHours(20, 0, 0, 0);
        poner(`ex:${base}:tarde`, tarde, `📝 Mañana: examen de ${c.corto}`, `A las ${hora(c.inicio)}${lugar}. ¡Mucho ánimo!`);
        poner(`ex:${base}:1h`, new Date(c.inicio - 3600000), `📝 Examen de ${c.corto} en 1 h`, `${c.titulo}${lugar}`);
      } else if (a.clases > 0) {
        poner(`cl:${base}:${a.clases}`, new Date(c.inicio - a.clases * 60000),
          `${c.icono} ${c.corto} ${cuandoTexto(a.clases)}`, `${c.etiqueta} a las ${hora(c.inicio)}${lugar}`);
      }
    }

    // Entregas de Moodle
    if (a.entregas) {
      for (const m of estado.moodle || []) {
        // Solo lo que vence (entregas y cuestionarios que se cierran)
        if (!m.limite || !["Entrega", "Cierra"].includes(m.etiqueta)) continue;
        const base = `${m.uid || m.titulo}:${m.limite.getTime()}`;
        poner(`mo:${base}:1d`, new Date(m.limite - 86400000), `${m.icono} Mañana vence: ${m.titulo}`, `${m.corto}, a las ${hora(m.limite)}`);
        poner(`mo:${base}:2h`, new Date(m.limite - 7200000), `${m.icono} En 2 h vence: ${m.titulo}`, `${m.corto}, a las ${hora(m.limite)}`);
      }
    }

    // Tus cosas (incluidas las que se repiten)
    if (a.personales > 0) {
      for (let i = 0; i <= DIAS_VISTA; i++) {
        const dia = new Date(); dia.setHours(0, 0, 0, 0); dia.setDate(dia.getDate() + i);
        for (const p of personalesDelDia(estado.personales || [], dia)) {
          const lugar = p.lugar ? ` · ${p.lugar}` : "";
          poner(`pe:${p.id}:${a.personales}`, new Date(p.inicio - a.personales * 60000),
            `${p.icono} ${p.titulo} ${cuandoTexto(a.personales)}`, `A las ${hora(p.inicio)}${lugar}`);
        }
      }
    }

    // Tareas con fecha que aún no has hecho
    if (a.tareas) {
      for (const t of leer("mi-horario:tareas", [])) {
        if (t.hecha || !t.fecha) continue;
        poner(`ta:${t.id}:${t.fecha}`, aFecha(t.fecha, "09:00"), "✅ Tarea para hoy", t.texto);
      }
    }

    lista.sort((x, y) => x.cuando - y.cuando);
    return lista.slice(0, MAXIMO);
  }

  // Guardamos la lista solo si ha cambiado (así no subimos cosas sin motivo)
  function programar() {
    if (!(estado.eventos || []).length && !(estado.personales || []).length) return;
    const nueva = calcularAvisos();
    const antes = leer(CLAVE_PROGRAMADOS, []);
    const igual = (x, y) => x.length === y.length && x.every((v, i) => v.id === y[i].id && v.cuando === y[i].cuando);
    if (!igual(nueva, antes)) localStorage.setItem(CLAVE_PROGRAMADOS, JSON.stringify(nueva));
  }

  // ----- 2. Activar los avisos en este dispositivo -----
  const soportado = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

  const aBytes = (b64) => {
    const relleno = "=".repeat((4 - (b64.length % 4)) % 4);
    const crudo = atob((b64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
  };

  async function sesion() {
    if (!window.nube) return null;
    try { return (await (await window.nube.supabase()).auth.getSession()).data.session; } catch { return null; }
  }

  async function activar() {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") throw new Error("No has dado permiso para las notificaciones.");
    const s = await sesion();
    if (!s) throw new Error("Primero entra en Sincronizar.");
    const registro = await navigator.serviceWorker.ready;
    const sus = (await registro.pushManager.getSubscription()) ||
      (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(await llavePublica()) }));
    const sb = await window.nube.supabase();
    const { error } = await sb.from("suscripciones").upsert({ endpoint: sus.endpoint, user_id: s.user.id, datos: sus.toJSON() });
    if (error) throw error;
  }

  async function desactivar() {
    const registro = await navigator.serviceWorker.ready;
    const sus = await registro.pushManager.getSubscription();
    if (!sus) return;
    try { await (await window.nube.supabase()).from("suscripciones").delete().eq("endpoint", sus.endpoint); } catch {}
    await sus.unsubscribe();
  }

  async function activoAqui() {
    if (!soportado || Notification.permission !== "granted") return false;
    const registro = await navigator.serviceWorker.getRegistration();
    return !!(registro && (await registro.pushManager.getSubscription()));
  }

  // Un aviso de prueba: lo añadimos a la lista para dentro de 1 minuto,
  // así prueba el camino completo (la nube → tu móvil)
  function probar() {
    const lista = leer(CLAVE_PROGRAMADOS, []);
    const cuando = Date.now() + 60000;
    lista.unshift({ id: `prueba:${cuando}`, cuando, titulo: "🔔 Aviso de prueba", cuerpo: "Si ves esto, los avisos funcionan." });
    localStorage.setItem(CLAVE_PROGRAMADOS, JSON.stringify(lista));
    window.nube?.sincronizar();
  }

  // ----- 3. El apartado "Avisos" del panel -----
  const apartado = document.createElement("details");
  apartado.open = true;
  apartado.dataset.apartado = "avisos";
  apartado.innerHTML = `<summary><h2>Avisos</h2></summary><div class="avisos"></div>`;
  const cuerpo = apartado.querySelector(".avisos");
  const sync = document.querySelector('details[data-apartado="sincronizar"]');
  const copia = document.querySelector('details[data-apartado="copia"]');
  (sync || copia) ? (sync || copia).after(apartado) : document.getElementById("panel")?.append(apartado);

  const opcionesMin = (valor) => [0, 5, 10, 15, 30, 60]
    .map((m) => `<option value="${m}" ${m === valor ? "selected" : ""}>${m ? (m >= 60 ? "1 h antes" : `${m} min antes`) : "Sin aviso"}</option>`).join("");

  async function pintar(error = "") {
    const a = ajustes();
    const aviso = error ? `<p class="form-error">${error}</p>` : "";
    let estadoHtml;
    if (!soportado && esIphone && !instalada) {
      estadoHtml = `<p class="nota">En el iPhone, los avisos solo funcionan abriendo la app desde su icono de la pantalla de inicio.</p>`;
    } else if (!soportado) {
      estadoHtml = `<p class="nota">Este navegador no admite avisos.</p>`;
    } else if (!(await sesion())) {
      estadoHtml = `<p class="nota">Para recibir avisos, primero entra en <b>Sincronizar</b>.</p>`;
    } else if (await activoAqui()) {
      estadoHtml = `
        <p class="nota">🔔 Avisos activados en este dispositivo.</p>
        <div class="fila-botones">
          <button class="boton-secundario" data-accion="probar">Probar</button>
          <button class="boton-secundario" data-accion="desactivar">Desactivar</button>
        </div>`;
    } else {
      estadoHtml = `
        <p class="nota">Recibe un aviso antes de tus clases, exámenes y entregas, aunque tengas la app cerrada.</p>
        <button class="boton-principal" data-accion="activar">🔔 Activar avisos aquí</button>`;
    }
    cuerpo.innerHTML = `
      ${estadoHtml}
      ${aviso}
      <div class="avisos-ajustes">
        <label>Clases <select data-ajuste="clases">${opcionesMin(a.clases)}</select></label>
        <label>Tus cosas <select data-ajuste="personales">${opcionesMin(a.personales)}</select></label>
        <label><input type="checkbox" data-ajuste="examenes" ${a.examenes ? "checked" : ""}> Exámenes (la tarde antes y 1 h antes)</label>
        <label><input type="checkbox" data-ajuste="entregas" ${a.entregas ? "checked" : ""}> Entregas (1 día antes y 2 h antes)</label>
        <label><input type="checkbox" data-ajuste="tareas" ${a.tareas ? "checked" : ""}> Tareas (a las 9:00 del día)</label>
      </div>`;
  }

  cuerpo.addEventListener("click", async (evento) => {
    const boton = evento.target.closest("[data-accion]");
    if (!boton) return;
    boton.disabled = true;
    try {
      if (boton.dataset.accion === "activar") { await activar(); programar(); avisar("🔔 Avisos activados"); }
      if (boton.dataset.accion === "desactivar") { await desactivar(); avisar("Avisos desactivados"); }
      if (boton.dataset.accion === "probar") { probar(); avisar("Te llegará un aviso en 1–2 minutos"); }
      pintar();
    } catch (error) {
      console.error(error);
      pintar(error.message || String(error));
    }
  });

  cuerpo.addEventListener("change", (evento) => {
    const campo = evento.target.closest("[data-ajuste]");
    if (!campo) return;
    const a = { ...leer(CLAVE_AJUSTES, {}) };
    a[campo.dataset.ajuste] = campo.type === "checkbox" ? campo.checked : Number(campo.value);
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(a));
    programar();
  });

  // ----- 4. Cuándo recalculamos la lista -----
  // Esperamos a que app.js haya leído el calendario y Moodle
  const alEmpezar = () => (estado.eventos?.length ? programar() : setTimeout(alEmpezar, 1000));
  setTimeout(alEmpezar, 1500);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") programar(); });
  setInterval(programar, 30 * 60000);
  pintar();
})();
