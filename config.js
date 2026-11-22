// =====================================================================
// config.js — TUS DATOS PERSONALES
// ---------------------------------------------------------------------
// Este es el único archivo que deberías tocar a menudo.
// Aquí decimos qué asignaturas son tuyas, en qué grupo de prácticas
// estás y de qué color quieres ver cada una.
//
// Cómo funcionan los grupos en el calendario de la escuela:
//   - Grupo 931  -> Clase magistral (teoría). La tiene todo el mundo.
//   - Grupo 9311 -> Resolución de problemas. La tiene todo el mundo.
//   - Grupo 9310 -> Pruebas de evaluación (exámenes). Todo el mundo.
//   - Grupo 11, 12, 13... -> Grupos de prácticas de laboratorio.
//     "cd3" en tu foto = Comunicaciones digitales, grupo de prácticas 13.
//
// Si pones grupoPracticas: null, verás la teoría, los problemas y los
// exámenes de esa asignatura, pero ninguna práctica.
// =====================================================================

const GRUPOS_COMUNES = ["931", "9311", "9310"];

const MIS_ASIGNATURAS = {
  // ---------- Primer cuatrimestre (grupos sacados de tu foto) ----------
  "30318": { corto: "CD",  nombre: "Comunicaciones digitales",                    grupoPracticas: "13", color: "#e4572e" },
  "31019": { corto: "MTG", nombre: "Medios de transmisión guiada",                grupoPracticas: "13", color: "#f2a541" },
  "30378": { corto: "PAI", nombre: "Procesado de audio e imagen",                 grupoPracticas: "14", color: "#d63384" },
  "30319": { corto: "SEM", nombre: "Sistemas electrónicos con microprocesadores", grupoPracticas: "14", color: "#2e86de" },
  "30377": { corto: "TR",  nombre: "Tecnologías de red",                          grupoPracticas: "15", color: "#27ae60" },

  // ---------- Segundo cuatrimestre (grupos de prácticas aún por confirmar) ----------
  // Laboratorio de comunicaciones (31018) no está porque no la vas a cursar.
  "30375": { corto: "ADR", nombre: "Análisis y dimensionado de redes",            grupoPracticas: null, color: "#8e44ad" },
  "30374": { corto: "RP",  nombre: "Radiación y propagación",                     grupoPracticas: null, color: "#16a085" },
  "30328": { corto: "EC",  nombre: "Electrónica de comunicaciones",               grupoPracticas: null, color: "#607d8b" },
  "30323": { corto: "GP",  nombre: "Gestión de proyectos de telecomunicación",    grupoPracticas: null, color: "#b8860b" },
};
