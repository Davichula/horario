// =====================================================================
// sincronizar.js — tus cosas iguales en el móvil y en el ordenador
// ---------------------------------------------------------------------
// Cómo funciona, en pocas palabras:
//   - Tus cosas siguen guardándose en localStorage, como siempre.
//   - Además, cada vez que cambian, se sube una copia a Supabase (una base
//     de datos en internet). Cada "clave" de localStorage es una fila.
//   - Al abrir la app (o volver a ella) se descarga lo que haya en Supabase.
//     Si otro dispositivo cambió algo después que este, gana lo más nuevo.
//   - Para saber quién eres, entras con tu email: Supabase te manda un
//     código de 6 cifras y lo escribes aquí. Solo tú puedes ver tus filas.
//
// Si SUPABASE_URL está vacío, este archivo no hace nada y la app funciona
// igual que antes (solo en este dispositivo).
// =====================================================================

// Estos dos datos están en Supabase → Project Settings → API.
// La clave "anon/publishable" está pensada para ir dentro de la web: no es secreta.
const SUPABASE_URL = "";
const SUPABASE_KEY = "";

(() => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  // Qué cosas se sincronizan (claves de localStorage)
  const CLAVES = [
    "mi-horario:personales",
    "mi-horario:tareas",
    "mi-horario:habitos",
    "mi-horario:notas",
    "mi-horario:ajustes-plan",
  ];
  const CLAVE_SELLOS = "mi-horario:sync-sellos"; // cuándo cambió cada cosa en ESTE dispositivo
  const CLAVE_ULTIMA = "mi-horario:sync-ultima"; // última sincronización que salió bien
  const CLAVE_USUARIO = "mi-horario:sync-usuario"; // con qué cuenta se sincronizó este dispositivo
  // La librería oficial de Supabase (versión 2.45.4), copiada en la carpeta vendor/
  const LIBRERIA = "vendor/supabase.js";

  // ----- 1. Apuntar cuándo cambia algo -----
  // Envolvemos localStorage.setItem: hace lo de siempre y, si la clave es
  // de las que sincronizamos, apunta la hora y programa una subida.
  const setItemOriginal = Storage.prototype.setItem;
  let escribiendoDesdeNube = false;

  const leerJSON = (clave, porDefecto) => {
    try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
  };
  const guardarSinAvisar = (clave, texto) => setItemOriginal.call(localStorage, clave, texto);

  Storage.prototype.setItem = function (clave, valor) {
    setItemOriginal.call(this, clave, valor);
    if (this === localStorage && !escribiendoDesdeNube && CLAVES.includes(clave)) {
      const sellos = leerJSON(CLAVE_SELLOS, {});
      sellos[clave] = Date.now();
      guardarSinAvisar(CLAVE_SELLOS, JSON.stringify(sellos));
      programarSubida();
    }
  };

  // ----- 2. Conectar con Supabase -----
  let cliente = null;
  async function supabase() {
    if (!cliente) {
      if (!window.supabase) {
        await new Promise((ok, mal) => {
          const s = document.createElement("script");
          s.src = LIBRERIA; s.onload = ok; s.onerror = mal;
          document.head.append(s);
        });
      }
      const { createClient } = window.supabase;
      cliente = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "mi-horario:sesion" },
      });
    }
    return cliente;
  }

  // Cuando un dispositivo que ya tenía cosas se conecta por primera vez,
  // juntamos las suyas con las de la nube en vez de pisarlas.
  function unir(local, nube) {
    if (Array.isArray(local) && Array.isArray(nube)) {
      const porId = new Map();
      for (const x of nube) porId.set(x?.id ?? JSON.stringify(x), x);
      for (const x of local) { const k = x?.id ?? JSON.stringify(x); if (!porId.has(k)) porId.set(k, x); }
      return [...porId.values()];
    }
    if (local && nube && typeof local === "object" && typeof nube === "object") return { ...local, ...nube };
    return nube;
  }

  // ----- 3. Sincronizar: bajar lo nuevo y subir lo nuestro -----
  let sincronizando = false;
  let repetir = false;

  async function sincronizar() {
    if (!navigator.onLine) return;
    if (sincronizando) { repetir = true; return; }
    sincronizando = true;
    try {
      const sb = await supabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;

      const { data: filas, error } = await sb.from("datos").select("clave, valor, cambiado");
      if (error) throw error;
      const nube = Object.fromEntries(filas.map((f) => [f.clave, f]));
      const sellos = leerJSON(CLAVE_SELLOS, {});
      // ¿Primera vez que este dispositivo se sincroniza con esta cuenta?
      // Entonces juntamos lo de aquí con lo de la nube en vez de pisar nada.
      const primeraVez = localStorage.getItem(CLAVE_USUARIO) !== session.user.id;
      const subir = [];
      let haCambiadoAlgo = false;

      for (const clave of CLAVES) {
        const fila = nube[clave];
        const textoLocal = localStorage.getItem(clave);
        const sello = sellos[clave] || 0;

        if (fila && textoLocal !== null && primeraVez) {
          const valor = unir(JSON.parse(textoLocal), fila.valor);
          sellos[clave] = Date.now();
          subir.push({ user_id: session.user.id, clave, valor, cambiado: sellos[clave] });
          const texto = JSON.stringify(valor);
          if (texto !== textoLocal) {
            escribiendoDesdeNube = true;
            localStorage.setItem(clave, texto);
            escribiendoDesdeNube = false;
            haCambiadoAlgo = true;
          }
        } else if (fila && fila.cambiado > sello) {
          // La nube tiene algo más nuevo
          sellos[clave] = fila.cambiado;
          const texto = JSON.stringify(fila.valor);
          if (texto !== textoLocal) {
            escribiendoDesdeNube = true;
            localStorage.setItem(clave, texto);
            escribiendoDesdeNube = false;
            haCambiadoAlgo = true;
          }
        } else if (textoLocal !== null && (!fila || sello > fila.cambiado)) {
          // Lo de aquí es más nuevo: lo subimos
          sellos[clave] = sello || Date.now();
          subir.push({ user_id: session.user.id, clave, valor: JSON.parse(textoLocal), cambiado: sellos[clave] });
        }
      }

      if (subir.length) {
        const { error: e } = await sb.from("datos").upsert(subir, { onConflict: "user_id,clave" });
        if (e) throw e;
      }
      guardarSinAvisar(CLAVE_SELLOS, JSON.stringify(sellos));
      guardarSinAvisar(CLAVE_ULTIMA, String(Date.now()));
      guardarSinAvisar(CLAVE_USUARIO, session.user.id);
      pintar();

      // Si ha llegado algo de otro dispositivo, recargamos para verlo
      if (haCambiadoAlgo) {
        if (document.querySelector("dialog[open]")) recargarAlCerrar();
        else location.reload();
      }
    } catch (error) {
      console.error("Sincronizar:", error);
      pintar("No he podido sincronizar. Lo reintento luego.");
    } finally {
      sincronizando = false;
      if (repetir) { repetir = false; setTimeout(sincronizar, 500); }
    }
  }

  function recargarAlCerrar() {
    const esperar = () => document.querySelector("dialog[open]") ? setTimeout(esperar, 1000) : location.reload();
    esperar();
  }

  let temporizador = null;
  function programarSubida() {
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizar, 1500);
  }

  // ----- 4. El apartado "Sincronizar" del panel -----
  const apartado = document.createElement("details");
  apartado.open = true;
  apartado.dataset.apartado = "sincronizar";
  apartado.innerHTML = `<summary><h2>Sincronizar</h2></summary><div class="sync"></div>`;
  const cuerpo = apartado.querySelector(".sync");
  const copia = document.querySelector('details[data-apartado="copia"]');
  copia ? copia.before(apartado) : document.getElementById("panel")?.append(apartado);

  let emailPendiente = null;

  async function pintar(error = "") {
    let session = null;
    try { session = (await (await supabase()).auth.getSession()).data.session; } catch {}
    const ultima = Number(localStorage.getItem(CLAVE_ULTIMA)) || 0;
    const aviso = error ? `<p class="form-error">${error}</p>` : "";

    if (session) {
      const hora = ultima ? new Date(ultima).toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "todavía no";
      cuerpo.innerHTML = `
        <p class="nota">✅ Conectado como <b>${session.user.email}</b>.<br>Última vez: ${hora}.</p>
        ${aviso}
        <div class="fila-botones">
          <button class="boton-secundario" data-accion="ahora">🔄 Ahora</button>
          <button class="boton-secundario" data-accion="salir">Salir</button>
        </div>`;
    } else if (emailPendiente) {
      cuerpo.innerHTML = `
        <p class="nota">Te he mandado un código a <b>${emailPendiente}</b>. Escríbelo aquí:</p>
        <form class="sync-form" data-accion="codigo">
          <input name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" required>
          <button class="boton-principal">Entrar</button>
        </form>
        ${aviso}
        <button class="enlace" data-accion="otro">Usar otro email</button>`;
    } else {
      cuerpo.innerHTML = `
        <p class="nota">Entra con tu email para tener tus cosas igual en todos tus dispositivos.</p>
        <form class="sync-form" data-accion="email">
          <input name="email" type="email" autocomplete="email" placeholder="tu@email.com" required>
          <button class="boton-principal">Enviar código</button>
        </form>
        ${aviso}`;
    }
  }

  cuerpo.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.target;
    const boton = form.querySelector("button");
    boton.disabled = true;
    try {
      const sb = await supabase();
      if (form.dataset.accion === "email") {
        const email = form.email.value.trim();
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw error;
        emailPendiente = email;
        pintar();
      } else {
        const { error } = await sb.auth.verifyOtp({ email: emailPendiente, token: form.codigo.value.trim(), type: "email" });
        if (error) throw error;
        emailPendiente = null;
        await pintar();
        sincronizar();
      }
    } catch (error) {
      console.error(error);
      boton.disabled = false;
      pintar(navigator.onLine ? "Algo ha fallado. Revisa el email o el código." : "Sin conexión.");
    }
  });

  cuerpo.addEventListener("click", async (evento) => {
    const accion = evento.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "ahora") sincronizar();
    if (accion === "otro") { emailPendiente = null; pintar(); }
    if (accion === "salir") {
      await (await supabase()).auth.signOut();
      pintar();
    }
  });

  // ----- 5. Cuándo sincronizamos -----
  pintar();
  setTimeout(sincronizar, 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
  window.addEventListener("online", sincronizar);
  setInterval(() => { if (document.visibilityState === "visible") sincronizar(); }, 5 * 60000);
})();
