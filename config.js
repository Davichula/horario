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

// =====================================================================
// INFORMES DE PRÁCTICAS QUE SE ENTREGAN EN LA SIGUIENTE SESIÓN
// ---------------------------------------------------------------------
// En estas asignaturas, el informe de cada práctica se entrega al empezar
// la siguiente sesión de prácticas de tu grupo, aunque Moodle no lo
// ponga como fecha límite. La web crea esas entregas sola.
// Para añadir otra asignatura, pon su código en la lista.
// =====================================================================
const INFORMES_EN_SIGUIENTE_SESION = ["30319"]; // SEM

// =====================================================================
// CATEGORÍAS DE TUS COSAS PERSONALES (se eligen solas)
// ---------------------------------------------------------------------
// Cuando escribes el título ("Dentista", "Comida con Ana", "Gimnasio"...)
// la web busca estas palabras y elige sola la categoría y el icono.
//
// Cómo añadir una palabra: búscala en "palabras" de la categoría que
// quieras y añade  "palabra": "emoji",
//   - Escríbela en minúsculas y sin tildes ("medico", no "Médico").
//   - Vale con el principio de la palabra: "estudi" encaja con
//     "estudiar", "estudio", "estudiando"...
//   - Si pones "" como emoji, se usa el icono de la categoría.
//
// La clave de la izquierda (estudio, entreno...) es interna: no la
// cambies, o lo que ya tenías guardado con ella saldrá como "Personal".
// =====================================================================
const CATEGORIAS = {
  estudio: {
    nombre: "Estudio", icono: "📚", color: "#5b6ee1",
    palabras: {
      estudi: "📚", repas: "📚", apuntes: "📝", biblioteca: "📚", deberes: "✏️", tarea: "✏️",
      ejercicios: "✏️", problemas: "✏️", examen: "📝", parcial: "📝", entrega: "📤", informe: "📄",
      memoria: "📄", tfg: "🎓", proyecto: "🧩", tutoria: "🧑‍🏫", leer: "📖", lectura: "📖",
      clase: "🎓", ingles: "🇬🇧", idioma: "🗣️", programar: "💻", codigo: "💻", python: "🐍",
    },
  },
  entreno: {
    nombre: "Deporte", icono: "🏋️", color: "#0f9d8a",
    palabras: {
      gimnasio: "🏋️", gym: "🏋️", entreno: "🏋️", entrena: "🏋️", pesas: "🏋️", correr: "🏃",
      running: "🏃", carrera: "🏃", futbol: "⚽", partido: "⚽", baloncesto: "🏀", basket: "🏀",
      padel: "🎾", tenis: "🎾", natacion: "🏊", piscina: "🏊", nadar: "🏊", bici: "🚴",
      ciclismo: "🚴", yoga: "🧘", pilates: "🧘", estiramientos: "🤸", escalada: "🧗", rocodromo: "🧗",
      boxeo: "🥊", senderismo: "🥾", monte: "⛰️", esqui: "⛷️", surf: "🏄", voley: "🏐", deporte: "🏅",
    },
  },
  comida: {
    nombre: "Comida", icono: "🍽️", color: "#e8833a",
    palabras: {
      comida: "🍽️", comer: "🍽️", almuerzo: "🍽️", cena: "🍽️", cenar: "🍽️", desayun: "🥐",
      merienda: "🥪", cafe: "☕", brunch: "🥞", cocinar: "👨‍🍳", restaurante: "🍽️", pizza: "🍕",
      tapas: "🍻", canas: "🍻", cervez: "🍺", hamburguesa: "🍔", sushi: "🍣", barbacoa: "🍖",
    },
  },
  salud: {
    nombre: "Salud", icono: "🩺", color: "#e05a7a",
    palabras: {
      dentista: "🦷", dental: "🦷", ortodonc: "🦷", medic: "🩺", doctor: "🩺", consulta: "🩺",
      "centro de salud": "🏥", hospital: "🏥", urgencias: "🚑", fisio: "💆", masaje: "💆",
      farmacia: "💊", pastilla: "💊", analisis: "🩸", sangre: "🩸", vacuna: "💉", psicolog: "🧠",
      terapia: "🧠", oculista: "👓", optica: "👓", oftalmolog: "👁️", dermatolog: "🧴", revision: "🩺",
      podolog: "🦶", nutricion: "🥗", dieta: "🥗",
    },
  },
  visita: {
    nombre: "Social", icono: "🤝", color: "#b05bd6",
    palabras: {
      amigo: "🧑‍🤝‍🧑", amiga: "🧑‍🤝‍🧑", quedada: "🧑‍🤝‍🧑", quedar: "🧑‍🤝‍🧑", visita: "🤝",
      cumple: "🎂", fiesta: "🎉", boda: "💒", familia: "👨‍👩‍👧", abuel: "👵", padres: "👨‍👩‍👦",
      madre: "👩", padre: "👨", novia: "❤️", novio: "❤️", cita: "❤️", llamada: "📞", llamar: "📞",
      videollamada: "💻", cumpleanos: "🎂", despedida: "🥂", "cena con": "🍽️",
    },
  },
  trabajo: {
    nombre: "Trabajo", icono: "💼", color: "#3d7ea6",
    palabras: {
      trabajo: "💼", curro: "💼", reunion: "👥", entrevista: "👔", empresa: "🏢", oficina: "🏢",
      turno: "🕒", "clases particulares": "🧑‍🏫", voluntariado: "🤲", beca: "🎓", cv: "📄",
      curriculum: "📄", "practicas en": "🏢",
    },
  },
  recados: {
    nombre: "Recados", icono: "🛒", color: "#8a6d3b",
    palabras: {
      compra: "🛒", super: "🛒", mercadona: "🛒", banco: "🏦", correos: "📮", paquete: "📦",
      peluquer: "💇", barber: "💈", recoger: "📦", devolver: "↩️", itv: "🚗", taller: "🔧",
      tramite: "📄", papeles: "📄", ayuntamiento: "🏛️", dni: "🪪", pasaporte: "🛂", pagar: "💳",
      factura: "🧾", alquiler: "🏠", lavanderia: "🧺", tintoreria: "👔", regalo: "🎁",
    },
  },
  ocio: {
    nombre: "Ocio", icono: "🎬", color: "#d1495b",
    palabras: {
      cine: "🎬", pelicula: "🎬", serie: "📺", concierto: "🎵", festival: "🎪", teatro: "🎭",
      museo: "🏛️", exposicion: "🖼️", videojuego: "🎮", jugar: "🎮", play: "🎮", guitarra: "🎸",
      piano: "🎹", musica: "🎵", ensayo: "🎶", baile: "💃", bailar: "💃", dibujar: "🎨",
      pintar: "🎨", foto: "📷", partida: "🎲", "juegos de mesa": "🎲", "futbol en la tele": "📺",
      discoteca: "🪩", salir: "🌃", playa: "🏖️",
    },
  },
  viaje: {
    nombre: "Viaje", icono: "🧳", color: "#2a9d8f",
    palabras: {
      viaje: "🧳", vuelo: "✈️", avion: "✈️", aeropuerto: "✈️", tren: "🚆",
      autobus: "🚌", coche: "🚗", conducir: "🚗", autoescuela: "🚗", maleta: "🧳",
      hotel: "🏨", excursion: "🗺️", escapada: "🗺️", vacaciones: "🏝️",
    },
  },
  hogar: {
    nombre: "Casa", icono: "🏠", color: "#6c8a3a",
    palabras: {
      limpiar: "🧹", limpieza: "🧹", ordenar: "🧹", lavadora: "🧺", colada: "🧺", planchar: "👕",
      cocina: "🍳", basura: "🗑️", plantas: "🪴", regar: "🪴", mudanza: "📦", casa: "🏠",
      perro: "🐕", gato: "🐈", veterinario: "🐾", mascota: "🐾",
    },
  },
  descanso: {
    nombre: "Descanso", icono: "😴", color: "#7a6bb0",
    palabras: { siesta: "😴", dormir: "😴", descans: "🛋️", relax: "🛋️", meditar: "🧘", meditacion: "🧘" },
  },
  // Si no encaja con nada, sale como "Personal" y con este icono
  otro: { nombre: "Personal", icono: "✨", color: "#7a8599", palabras: {} },
};
