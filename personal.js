// =====================================================================
// personal.js — TUS COSAS PERSONALES (estudio, entreno, comida...)
// ---------------------------------------------------------------------
// Dónde se guardan: en "localStorage", un pequeño almacén que tiene cada
// navegador. Es como un diccionario de Python que no se borra al cerrar
// la página: localStorage.setItem("clave", texto) guarda y
// localStorage.getItem("clave") lo recupera.
//
// Ojo: vive solo en ESTE navegador de ESTE dispositivo. Si lo usas en el
// móvil, lo que añadas está en el móvil. Por eso hay botones para
// exportar e importar una copia (un archivo .json).
//
// Cada cosa personal se guarda así (JSON, como un dict de Python):
//   {
//     id: "k3j2h1",           identificador único
//     titulo: "Gimnasio",
//     categoria: "auto",      "auto" (se elige sola por el título) o una clave de CATEGORIAS
//     fecha: "2026-11-23",    el primer (o único) día
//     inicio: "18:00", fin: "19:30",
//     lugar: "", notas: "",
//     repetir: "no" | "diario" | "semanal" | "laborables",
//     hasta: "2027-01-31"     (opcional) último día que se repite
//   }
// =====================================================================

const CLAVE_ALMACEN = "mi-horario:personales";

function cargarPersonales() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ALMACEN)) || [];
  } catch {
    return []; // si algo falla (modo privado, datos raros), empezamos vacíos
  }
}

function guardarPersonales(lista) {
  try {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(lista));
    return true;
  } catch {
    alert("No he podido guardar en este navegador (¿modo incógnito?).");
    return false;
  }
}

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// "2026-11-23" + "18:00" -> objeto Date en tu hora local
function aFecha(dia, horaTexto) {
  const [a, m, d] = dia.split("-").map(Number);
  const [h, min] = horaTexto.split(":").map(Number);
  return new Date(a, m - 1, d, h, min);
}

// Date -> "2026-11-23" (en hora local, no UTC)
function aTextoDia(fecha) {
  const p = (n) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

const sumarUnDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

// ¿Toca esta cosa personal el día "dia"? Aquí se resuelven las repeticiones.
function ocurreEl(item, dia) {
  const textoDia = aTextoDia(dia);
  if (textoDia < item.fecha) return false;           // antes de empezar
  if (item.hasta && textoDia > item.hasta) return false; // después de acabar
  const diaSemana = dia.getDay();
  switch (item.repetir) {
    case "diario": return true;
    case "laborables": return diaSemana >= 1 && diaSemana <= 5;
    case "semanal": return aFecha(item.fecha, "00:00").getDay() === diaSemana;
    default: return textoDia === item.fecha;          // no se repite
  }
}

// Devuelve las cosas personales de un día, ya convertidas al mismo
// "formato de bloque" que usan las clases, para dibujarlas igual.
function personalesDelDia(lista, dia) {
  const textoDia = aTextoDia(dia);
  return lista
    .filter((item) => ocurreEl(item, dia))
    .map((item) => {
      const { categoria, icono } = categoriaDe(item);
      const cat = CATEGORIAS[categoria];
      return {
        origen: "personal",
        id: `p:${item.id}:${textoDia}`,
        item,
        categoria,
        inicio: aFecha(textoDia, item.inicio),
        // Si termina a las 00:00 (o antes de empezar), es que acaba al día siguiente
        fin: item.fin <= item.inicio ? aFecha(aTextoDia(sumarUnDia(dia)), item.fin) : aFecha(textoDia, item.fin),
        color: cat.color,
        corto: item.titulo,
        titulo: item.titulo,
        etiqueta: cat.nombre,
        icono,
        clase: "personal",
        lugarCorto: item.lugar || "",
        lugar: item.lugar || "",
      };
    });
}

// ----- Copia de seguridad -----
function exportarPersonales(lista) {
  const blob = new Blob([JSON.stringify(lista, null, 2)], { type: "application/json" });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `mi-horario-copia-${aTextoDia(new Date())}.json`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

// Lee un archivo .json y devuelve la lista (o lanza un error si no vale)
async function leerCopia(archivo) {
  const datos = JSON.parse(await archivo.text());
  if (!Array.isArray(datos)) throw new Error("El archivo no tiene el formato esperado");
  return datos.filter((d) => d && d.id && d.titulo && d.fecha && d.inicio && d.fin);
}

// =====================================================================
// Detectar la categoría y el icono a partir del título
// ---------------------------------------------------------------------
// 1. Pasamos el título a minúsculas y sin tildes ("Médico" -> "medico").
// 2. Buscamos todas las palabras de CATEGORIAS (config.js) que aparecen.
// 3. Nos quedamos con la que sale antes en el título (y, si empatan,
//    con la más larga, que es más concreta: "cena con" gana a "cena").
// =====================================================================
const normalizar = (texto) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function detectarCategoria(titulo) {
  const t = " " + normalizar(titulo || "");
  let mejor = null;
  for (const [clave, cat] of Object.entries(CATEGORIAS)) {
    for (const [palabra, emoji] of Object.entries(cat.palabras || {})) {
      // La palabra tiene que empezar al principio de una palabra del título
      const posicion = t.search(new RegExp(`[^a-z0-9]${palabra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      if (posicion === -1) continue;
      if (!mejor || posicion < mejor.posicion || (posicion === mejor.posicion && palabra.length > mejor.palabra.length)) {
        mejor = { categoria: clave, icono: emoji || cat.icono, posicion, palabra };
      }
    }
  }
  return mejor || { categoria: "otro", icono: CATEGORIAS.otro.icono };
}

// Qué categoría e icono le tocan a una cosa guardada:
//   - categoria "auto" (lo normal): se detecta del título
//   - una categoría elegida a mano: se respeta, y el icono se intenta
//     sacar del título si la palabra es de esa misma categoría
function categoriaDe(item) {
  const detectada = detectarCategoria(item.titulo);
  // "otro" también cuenta como automático: así lo que guardaste antes de esta versión se reclasifica solo
  if (!item.categoria || ["auto", "otro"].includes(item.categoria) || !(item.categoria in CATEGORIAS)) return detectada;
  const icono = detectada.categoria === item.categoria ? detectada.icono : CATEGORIAS[item.categoria].icono;
  return { categoria: item.categoria, icono };
}
