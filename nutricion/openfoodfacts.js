// =====================================================================
// nutricion/openfoodfacts.js — productos de supermercado (Open Food Facts)
// ---------------------------------------------------------------------
// Open Food Facts es una base de datos abierta y gratuita de productos
// de todo el mundo, rellenada por voluntarios. Se puede preguntar con un
// código de barras o buscando por nombre, directamente desde el móvil.
// Como la rellena gente, a veces hay errores: por eso cada producto se
// marca con su origen y puedes corregir los valores.
// =====================================================================
const BASE = "https://world.openfoodfacts.org";
const BUSCADOR = "https://search.openfoodfacts.org"; // el buscador nuevo y rápido de Open Food Facts
const CAMPOS = "code,product_name,product_name_es,brands,nutriments,serving_quantity,serving_size,quantity";

const marca = (b) => (Array.isArray(b) ? b[0] : String(b || "").split(",")[0]).trim();
const num = (x) => (x == null || x === "" || isNaN(Number(x)) ? null : Number(x));

// Convierte un producto de Open Food Facts a nuestro formato (valores por 100 g)
export function convertir(p) {
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null && num(n["energy_100g"]) != null) kcal = num(n["energy_100g"]) / 4.184; // kJ → kcal
  const nombre = (p.product_name_es || p.product_name || "").trim();
  if (!nombre || kcal == null) return null; // sin nombre o sin calorías no sirve
  const racion = num(p.serving_quantity);
  return {
    id: "off:" + p.code,
    codigo: String(p.code),
    nombre: marca(p.brands) ? `${nombre} (${marca(p.brands)})` : nombre,
    kcal: Math.round(kcal),
    p: num(n["proteins_100g"]) ?? 0,
    c: num(n["carbohydrates_100g"]) ?? 0,
    g: num(n["fat_100g"]) ?? 0,
    az: num(n["sugars_100g"]) ?? 0,
    fi: num(n["fiber_100g"]) ?? 0,
    racion: racion && racion > 0 ? racion : null,
    unidad: "ración",
    origen: "off",
  };
}

// Pide con límite de tiempo y reintenta una vez (el servidor gratuito a veces tarda o falla)
async function pedir(url, intentos = 2) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 12000);
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: control.signal });
      if (!r.ok) throw new Error(`el servidor respondió ${r.status}`);
      return await r.json();
    } catch (e) {
      ultimo = e.name === "AbortError" ? new Error("tardó demasiado en responder") : e;
    } finally { clearTimeout(reloj); }
    await new Promise((ok) => setTimeout(ok, 700));
  }
  throw ultimo;
}

// Un producto por su código de barras. Devuelve null si no existe.
export async function porCodigo(codigo) {
  const limpio = String(codigo).replace(/\D/g, "");
  if (limpio.length < 6) throw new Error("El código no parece válido");
  const d = await pedir(`${BASE}/api/v2/product/${limpio}.json?fields=${CAMPOS}`);
  if (d.status !== 1 || !d.product) return null;
  return convertir({ ...d.product, code: limpio });
}

// Búsqueda por nombre. Primero el buscador nuevo; si falla, el antiguo.
export async function buscar(texto) {
  const q = encodeURIComponent(texto.trim());
  try {
    const d = await pedir(`${BUSCADOR}/search?q=${q}&page_size=20&langs=es&fields=${CAMPOS}`, 1);
    const l = (d.hits || []).map(convertir).filter(Boolean);
    if (l.length) return l;
  } catch { /* probamos el otro */ }
  const d = await pedir(`${BASE}/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=20&fields=${CAMPOS}`);
  return (d.products || []).map(convertir).filter(Boolean);
}
