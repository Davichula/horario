// =====================================================================
// nutricion/buscador.js — la búsqueda "inteligente" de alimentos
// ---------------------------------------------------------------------
// Antes solo encontraba un alimento si escribías exactamente un trozo de
// su nombre. Ahora entiende:
//   · tildes y mayúsculas da igual  ("platano" → Plátano)
//   · plurales                      ("tacos" → Tacos con carne, "nueces" → Nueces)
//   · palabras a medias             ("pech pol" → Pechuga de pollo)
//   · pequeñas erratas              ("yogurt", "macarones", "bocadilo")
//   · sinónimos                     ("banana" → Plátano, "bacon" → Beicon, "birra" → Cerveza)
//   · palabras generales            ("pescado" → Merluza, Salmón… · "carne" → Ternera, Cerdo…)
// y ordena de lo más parecido a lo menos, subiendo lo que ya has comido.
// Todo es local (no usa internet), así que va instantáneo.
// =====================================================================

// Palabras que no aportan nada al buscar
const VACIAS = new Set(["de", "del", "con", "al", "a", "la", "el", "los", "las", "en", "y", "e", "o", "u", "un", "una", "tipo", "para", "por", "mi"]);

// Quita tildes, pasa a minúsculas y deja solo letras, números y espacios
export function normalizar(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9ñ%]+/g, " ").trim();
}

// Singular sencillo: "tacos" → "taco", "nueces" → "nuez", "yogures" → "yogur",
// "melones" → "melon". Se aplica igual a lo que escribes y a los nombres, así
// que aunque alguna palabra quede rara, las dos quedan igual y coinciden.
export function raiz(w) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (/ces$/.test(w)) return w.slice(0, -3) + "z";
  if (/[aeiou]s$/.test(w)) return w.slice(0, -1);
  if (/[rlndj]es$/.test(w)) return w.slice(0, -2);
  if (/[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}
const palabras = (t) => normalizar(t).split(" ").filter((w) => w && !VACIAS.has(w)).map(raiz);

// Grupos de palabras que significan lo mismo (en los dos sentidos)
const GRUPOS = [
  ["platano", "banana", "banano"], ["patata", "papa"], ["zumo", "jugo"], ["alubia", "judia", "frijol", "habichuela", "poroto"],
  ["refresco", "soda", "gaseosa"], ["cola", "coca", "cocacola", "pepsi"], ["zero", "light", "sin azucar"],
  ["pasta", "macarron", "espagueti", "spaghetti", "espaguetti", "tallarin", "plumas", "penne", "tagliatelle", "fusilli", "lazo"],
  ["fideo", "noodle"], ["hamburguesa", "burger", "burguer"], ["beicon", "bacon", "panceta"], ["yogur", "yogurt", "yoghurt", "yogourt"],
  ["sandwich", "sandwic", "sanwich", "sandwitch", "bikini", "sandwiche"], ["bocadillo", "bocata", "baguette", "bocadillito"],
  ["cerveza", "birra", "cana", "tercio"], ["proteina", "whey", "prote", "proteico"], ["crema", "untable"],
  ["nutella", "nocilla", "cacao"], ["colacao", "nesquik", "cacao"], ["molde", "bimbo"], ["cafe", "cortado", "capuchino", "cappuccino", "latte", "expreso", "espresso", "americano"],
  ["te", "infusion", "manzanilla", "poleo", "tila"], ["fresa", "freson"], ["melocoton", "durazno", "nectarina", "paraguayo"],
  ["aguacate", "palta"], ["gamba", "langostino", "camaron", "gambon"], ["calamar", "chipiron", "sepia", "rabas"],
  ["requeson", "cottage"], ["skyr", "proteico"], ["avena", "porridge", "gacha", "copo"], ["kebab", "doner", "durum", "shawarma"],
  ["tortita", "pancake", "hotcake", "tortitas"], ["gofre", "waffle"], ["donut", "dona", "rosquilla"], ["magdalena", "muffin", "cupcake"],
  ["gominola", "chuche", "golosina", "gomita", "chuches"], ["huevo", "huevos"], ["pollo", "chicken"], ["ternera", "vacuno", "res", "buey", "beef"],
  ["cerdo", "puerco", "chancho", "pork"], ["atun", "bonito", "tuna"], ["salmon", "salmonete"], ["boqueron", "anchoa"],
  ["queso", "quesito"], ["mozzarella", "mozarella", "muzzarella"], ["parmesano", "grana"], ["tomate", "jitomate"], ["maiz", "choclo", "elote"],
  ["guisante", "arveja", "chicharo"], ["pimiento", "morron"], ["calabacin", "zucchini"], ["remolacha", "betabel"],
  ["melon", "cantalupo"], ["sandia", "patilla"], ["pina", "anana"], ["mandarina", "clementina"],
  ["isotonica", "aquarius", "powerade", "gatorade"], ["energetica", "monster", "redbull"], ["tortilla", "omelette", "omelet"],
  ["frito", "frita"], ["asado", "asada", "horno"], ["plancha", "planchado"], ["cocido", "cocida", "hervido", "hervida"],
  ["chuleta", "costilla"], ["alita", "ala"], ["nugget", "nuggets"], ["croissant", "cruasan", "cruason"], ["chocolate", "choco"],
  ["integral", "integrales"], ["leche", "milk"], ["vegetal", "veggie", "vegano", "vegana"], ["tarta", "pastel", "torta"],
  ["pizza", "piza", "pizzas"], ["sushi", "maki", "nigiri"], ["gel", "gelito"], ["batido", "smoothie", "shake"],
];
// Palabras generales: lo que escribes → qué nombres también enseña
const AMPLIA = {
  pescado: ["merluza", "bacalao", "salmon", "dorada", "lubina", "trucha", "lenguado", "atun", "sardina", "boqueron", "anchoa", "pescado"],
  marisco: ["gamba", "langostino", "mejillon", "calamar", "pulpo", "surimi"],
  carne: ["ternera", "cerdo", "pollo", "pavo", "cordero", "conejo", "lomo", "entrecot", "solomillo", "hamburguesa", "carne", "secreto", "costilla"],
  embutido: ["jamon", "chorizo", "salchichon", "fuet", "embuchado", "mortadela", "fiambre", "morcilla"],
  fiambre: ["jamon", "pavo", "mortadela", "fiambre", "embuchado"],
  fruta: ["platano", "manzana", "naranja", "mandarina", "pera", "fresa", "arandano", "uva", "sandia", "melon", "kiwi", "pina", "melocoton", "mango", "cereza", "frambuesa", "ciruela", "higo", "granada", "papaya", "macedonia"],
  verdura: ["menestra", "verdura", "brocoli", "espinaca", "zanahoria", "pepino", "pimiento", "cebolla", "calabacin", "judia", "berenjena", "coliflor", "esparrago", "alcachofa", "calabaza", "puerro", "pisto"],
  legumbre: ["lenteja", "garbanzo", "alubia", "hummus", "fabada", "edamame", "guisante"],
  lacteo: ["leche", "yogur", "queso", "kefir", "skyr", "requeson"],
  bolleria: ["croissant", "magdalena", "donut", "napolitana", "palmera", "ensaimada", "bizcocho"],
  bollo: ["croissant", "magdalena", "donut", "napolitana", "palmera", "ensaimada", "bizcocho"],
  postre: ["flan", "natilla", "tarta", "helado", "brownie", "macedonia", "arroz"],
  dulce: ["chocolate", "galleta", "gominola", "bizcocho", "tarta", "donut", "helado", "miel", "mermelada"],
  snack: ["patata", "palomita", "nacho", "pico", "frutos", "barrita", "aceituna"],
  fruto: ["almendra", "nuez", "cacahuete", "pistacho", "anacardo", "avellana", "frutos"],
  seco: ["almendra", "nuez", "cacahuete", "pistacho", "anacardo", "avellana", "frutos", "pasa", "datil"],
  mexicano: ["taco", "burrito", "fajita", "quesadilla", "nacho", "guacamole"],
  chino: ["delicia", "rollito", "chino", "frito"],
  japones: ["sushi", "ramen", "gyoza", "poke", "teriyaki"],
  bebida: ["agua", "refresco", "zumo", "cerveza", "vino", "cafe", "te", "batido", "isotonica", "energetica", "kefir"],
  alcohol: ["cerveza", "vino", "gin"],
  salsa: ["ketchup", "mostaza", "mayonesa", "barbacoa", "soja", "alioli", "tomate", "guacamole"],
  desayuno: ["tostada", "cereal", "avena", "cafe", "croissant", "magdalena", "galleta", "granola", "muesli", "yogur", "leche"],
  cereal: ["cereal", "avena", "granola", "muesli", "copo"],
  pan: ["pan", "tostada", "bocadillo", "biscote", "pico", "sandwich", "molde", "pita"],
  huevo: ["huevo", "tortilla", "clara", "revuelto"],
  fritura: ["frito", "frita", "rebozado", "empanado", "romana", "croqueta"],
  fastfood: ["hamburguesa", "burger", "pizza", "nugget", "kebab", "patata", "taco", "burrito"],
  comida: [],
};
const SINO = new Map();
for (const g of GRUPOS) {
  const rs = g.map((w) => palabras(w).join(" "));
  for (const r of rs) SINO.set(r, new Set([...(SINO.get(r) || []), ...rs]));
}
const AMPL = new Map(Object.entries(AMPLIA).map(([k, l]) => [raiz(k), new Set(l.map(raiz))]));

// Distancia de edición (cuántas letras hay que cambiar), con atajo si se pasa del límite
function distancia(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let pp = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let menor = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // dos letras cambiadas de sitio ("yogrut") cuentan como un solo error
      if (pp && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
      if (cur[j] < menor) menor = cur[j];
    }
    if (menor > max) return max + 1;
    pp = prev; prev = cur;
  }
  return prev[b.length];
}

// Lo que se guarda de cada nombre para buscar rápido
export function preparar(nombre) {
  const t = palabras(nombre);
  return { t, junto: t.join(""), primera: t[0] || "" };
}

// Qué tal encaja una palabra que escribes con las palabras de un nombre (0 = nada, 1 = igual)
function encaje(q, nombre, ultima) {
  const sin = SINO.get(q), amp = AMPL.get(q);
  let mejor = 0, donde = -1;
  nombre.t.forEach((n, i) => {
    let s = 0;
    if (n === q) s = 1;
    else if (sin?.has(n)) s = 0.92;
    else if (n.startsWith(q) && q.length >= (ultima ? 1 : 3)) s = q.length >= 3 ? 0.85 : 0.7; // aún escribiendo
    else if (amp?.has(n)) s = 0.72;
    else if (q.length >= 4 && n.length >= 4 && q.startsWith(n)) s = 0.66;
    else if (q.length >= 4 && q[0] === n[0]) { // erratas (la primera letra casi siempre se acierta)
      const tol = q.length >= 6 ? 2 : 1;
      const d = distancia(q, n, tol);
      if (d <= tol) s = 0.62 - 0.06 * d;
      else if (ultima && q.length >= 5 && n.length > q.length && distancia(q, n.slice(0, q.length), 1) <= 1) s = 0.5; // a medias y con errata
    }
    if (s > mejor) { mejor = s; donde = i; }
  });
  // "cocacola" contra "coca cola", "cuscus" contra "cus cus"
  if (mejor < 0.6 && q.length >= 6 && nombre.junto.includes(q)) { mejor = 0.6; donde = 0; }
  return [mejor, donde];
}

// Nota de 0 a ~2 de lo bien que un nombre encaja con lo que escribes (0 = no sale)
export function nota(texto, nombre) {
  const q = typeof texto === "string" ? palabras(texto) : texto;
  if (!q.length) return 0;
  let suma = 0, primeraBien = false;
  const usadas = new Set();
  for (let i = 0; i < q.length; i++) {
    const [s, donde] = encaje(q[i], nombre, i === q.length - 1);
    if (!s) return 0; // todas las palabras tienen que estar
    suma += s; usadas.add(donde);
    if (i === 0 && donde === 0 && s >= 0.7) primeraBien = true;
  }
  let p = suma / q.length;
  if (primeraBien) p += 0.25;                         // empieza por lo que buscas
  p += 0.2 * (usadas.size / Math.max(nombre.t.length, 1)); // nombres cortos y justos primero
  return p;
}

// Busca en una lista ya preparada [{ a, n: preparar(a.nombre) }]
// extra(a) suma puntos (por ejemplo, si ya lo has comido)
export function buscar(texto, indice, extra = () => 0, max = 30) {
  const q = palabras(texto);
  if (!q.length) return [];
  const r = [];
  for (const x of indice) {
    const s = nota(q, x.n);
    if (s > 0) r.push({ a: x.a, s: s + extra(x.a) });
  }
  return r.sort((a, b) => b.s - a.s || a.a.nombre.length - b.a.nombre.length).slice(0, max).map((y) => y.a);
}

// ¿Este texto encaja con este nombre? (para comidas guardadas, productos…)
export const encaja = (texto, nombre) => nota(texto, preparar(nombre)) > 0;
