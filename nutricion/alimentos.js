// =====================================================================
// nutricion/alimentos.js — alimentos básicos de uso común en España
// ---------------------------------------------------------------------
// Valores medios POR 100 g (o 100 ml) de alimento tal como se compra o come,
// según las tablas habituales de composición (BEDCA / USDA), redondeados.
// Son aproximados: dos tomates o dos marcas de pan no son idénticos. Para un
// producto concreto de supermercado usaremos su etiqueta (código de barras).
//
// Cada fila: [nombre, kcal, proteína, carbohidratos, grasa, azúcar, fibra, ración (g), cómo se llama la ración]
// =====================================================================
const F = [
  // Cereales, pan y pasta
  ["Arroz blanco cocido", 130, 2.7, 28, 0.3, 0, 0.4, 180, "plato"],
  ["Arroz blanco crudo", 355, 7, 79, 0.6, 0.1, 1.3, 70, "ración"],
  ["Arroz integral cocido", 123, 2.7, 25.6, 1, 0.4, 1.8, 180, "plato"],
  ["Pasta cocida", 150, 5.5, 30, 0.9, 1, 1.8, 200, "plato"],
  ["Pasta cruda", 355, 12.5, 72, 1.5, 3, 3, 80, "ración"],
  ["Avena (copos)", 372, 13, 60, 7, 1, 10, 50, "ración"],
  ["Pan blanco (barra)", 265, 9, 54, 1.5, 3, 2.5, 40, "rebanada"],
  ["Pan integral", 245, 9, 44, 3, 4, 7, 30, "rebanada"],
  ["Pan de molde", 270, 8.5, 49, 4, 4, 3, 30, "rebanada"],
  ["Tostada con aceite y tomate", 190, 4, 28, 7, 2, 2, 80, "tostada"],
  ["Cereales de desayuno (copos de maíz)", 375, 7, 84, 1, 8, 3, 30, "ración"],
  ["Galletas María", 430, 7, 74, 11, 20, 3, 6, "galleta"],
  ["Tortita de arroz", 385, 8, 81, 3, 0.5, 3, 9, "tortita"],
  ["Cuscús cocido", 112, 3.8, 23, 0.2, 0.1, 1.4, 180, "plato"],
  ["Quinoa cocida", 120, 4.4, 21, 1.9, 0.9, 2.8, 180, "plato"],
  ["Patata cocida", 87, 1.9, 20, 0.1, 0.9, 1.8, 200, "ración"],
  ["Patata frita (de bolsa)", 540, 6, 50, 35, 0.5, 4, 30, "ración"],
  ["Boniato asado", 90, 2, 21, 0.1, 6.5, 3.3, 150, "ración"],
  // Carne
  ["Pechuga de pollo (plancha)", 165, 31, 0, 3.6, 0, 0, 150, "filete"],
  ["Muslo de pollo (sin piel)", 175, 25, 0, 8, 0, 0, 120, "muslo"],
  ["Pavo (pechuga)", 135, 30, 0, 1, 0, 0, 120, "filete"],
  ["Ternera magra (filete)", 150, 26, 0, 5, 0, 0, 150, "filete"],
  ["Carne picada de ternera", 215, 19, 0, 15, 0, 0, 150, "ración"],
  ["Cerdo (lomo)", 175, 26, 0, 8, 0, 0, 150, "filete"],
  ["Jamón serrano", 215, 31, 0, 10, 0, 0, 30, "lonchas"],
  ["Jamón cocido (york)", 110, 18, 1, 3.5, 0.5, 0, 30, "lonchas"],
  ["Pechuga de pavo (fiambre)", 95, 17, 2, 1.5, 1, 0, 30, "lonchas"],
  ["Chorizo", 440, 24, 2, 38, 1, 0, 30, "ración"],
  ["Salchichas", 300, 12, 3, 27, 1, 0, 100, "ración"],
  ["Hamburguesa de ternera", 250, 18, 0, 20, 0, 0, 120, "unidad"],
  // Pescado
  ["Salmón (plancha)", 208, 22, 0, 13, 0, 0, 150, "lomo"],
  ["Merluza", 90, 18, 0, 2, 0, 0, 150, "filete"],
  ["Atún al natural (lata)", 110, 25, 0, 1, 0, 0, 52, "lata"],
  ["Atún en aceite (escurrido)", 200, 27, 0, 10, 0, 0, 52, "lata"],
  ["Bacalao", 85, 18, 0, 0.7, 0, 0, 150, "filete"],
  ["Gambas", 95, 20, 0.5, 1.2, 0, 0, 100, "ración"],
  ["Sardinas en lata", 210, 24, 0, 12, 0, 0, 70, "lata"],
  ["Calamar", 90, 16, 3, 1.4, 0, 0, 150, "ración"],
  ["Dorada / lubina", 120, 20, 0, 4.5, 0, 0, 150, "pieza"],
  // Huevos y lácteos
  ["Huevo entero", 143, 12.5, 0.7, 10, 0.4, 0, 60, "huevo"],
  ["Clara de huevo", 52, 11, 0.7, 0.2, 0.7, 0, 33, "clara"],
  ["Leche semidesnatada", 46, 3.4, 4.8, 1.6, 4.8, 0, 250, "vaso"],
  ["Leche entera", 64, 3.2, 4.7, 3.6, 4.7, 0, 250, "vaso"],
  ["Bebida de soja", 35, 3.3, 2.5, 1.8, 2.3, 0.5, 250, "vaso"],
  ["Bebida de avena", 45, 1, 8, 1.5, 4, 0.8, 250, "vaso"],
  ["Yogur natural", 60, 4, 5, 3, 5, 0, 125, "yogur"],
  ["Yogur griego natural", 120, 5, 4, 10, 4, 0, 125, "yogur"],
  ["Yogur proteico (tipo skyr)", 63, 11, 4, 0.2, 3.5, 0, 150, "tarrina"],
  ["Queso fresco batido 0%", 46, 8, 4, 0.2, 4, 0, 125, "tarrina"],
  ["Requesón / cottage", 98, 11, 3.4, 4.3, 3, 0, 100, "ración"],
  ["Queso curado", 400, 25, 0.5, 33, 0.5, 0, 30, "cuña"],
  ["Queso mozzarella", 280, 22, 2.2, 21, 1, 0, 50, "ración"],
  ["Queso fresco (Burgos)", 175, 11, 3, 13, 3, 0, 60, "ración"],
  ["Whey / proteína en polvo", 390, 78, 7, 6, 4, 0, 30, "cacito"],
  // Legumbres y frutos secos
  ["Lentejas cocidas", 115, 9, 20, 0.4, 1.8, 7.9, 200, "plato"],
  ["Garbanzos cocidos", 140, 8.5, 21, 3, 2.5, 6, 200, "plato"],
  ["Alubias cocidas", 120, 8, 21, 0.6, 1, 6.5, 200, "plato"],
  ["Hummus", 230, 7, 14, 16, 0.5, 5, 40, "ración"],
  ["Tofu", 120, 13, 2, 7, 0.5, 1, 100, "ración"],
  ["Almendras", 600, 21, 7, 53, 4, 12, 25, "puñado"],
  ["Nueces", 650, 15, 7, 65, 2.6, 7, 25, "puñado"],
  ["Cacahuetes", 590, 26, 10, 50, 4, 8, 25, "puñado"],
  ["Crema de cacahuete", 600, 25, 12, 50, 7, 7, 15, "cucharada"],
  ["Pistachos", 590, 21, 17, 49, 8, 10, 25, "puñado"],
  // Frutas
  ["Plátano", 90, 1.1, 21, 0.3, 17, 2.2, 120, "unidad"],
  ["Manzana", 52, 0.3, 12, 0.2, 10, 2.4, 180, "unidad"],
  ["Naranja", 45, 0.9, 10, 0.2, 8.5, 2.2, 200, "unidad"],
  ["Mandarina", 45, 0.8, 10, 0.2, 9, 1.8, 80, "unidad"],
  ["Pera", 55, 0.4, 12, 0.1, 9.5, 3, 170, "unidad"],
  ["Fresas", 33, 0.7, 7, 0.3, 5, 2, 150, "ración"],
  ["Arándanos", 55, 0.7, 12, 0.3, 9, 2.4, 100, "ración"],
  ["Uvas", 70, 0.7, 17, 0.2, 16, 0.9, 120, "ración"],
  ["Sandía", 30, 0.6, 7.5, 0.2, 6, 0.4, 250, "ración"],
  ["Melón", 34, 0.8, 8, 0.2, 8, 0.9, 250, "ración"],
  ["Kiwi", 55, 1.1, 12, 0.5, 9, 3, 75, "unidad"],
  ["Piña", 50, 0.5, 13, 0.1, 10, 1.4, 150, "ración"],
  ["Melocotón", 42, 0.9, 9.5, 0.3, 8.5, 1.5, 150, "unidad"],
  ["Aguacate", 160, 2, 8.5, 15, 0.7, 6.7, 100, "medio"],
  ["Dátiles", 280, 2.5, 70, 0.4, 63, 7, 25, "2 dátiles"],
  // Verduras
  ["Tomate", 18, 0.9, 3.5, 0.2, 2.6, 1.2, 150, "unidad"],
  ["Lechuga", 15, 1.3, 2, 0.2, 1, 1.5, 80, "ración"],
  ["Ensalada mixta (sin aliño)", 20, 1.3, 3, 0.2, 2, 1.5, 150, "plato"],
  ["Brócoli", 34, 2.8, 4, 0.4, 1.7, 2.6, 150, "ración"],
  ["Espinacas", 23, 2.9, 1.6, 0.4, 0.4, 2.2, 150, "ración"],
  ["Zanahoria", 38, 0.9, 8, 0.2, 5, 2.8, 100, "unidad"],
  ["Pepino", 14, 0.7, 2.2, 0.1, 1.7, 0.5, 150, "ración"],
  ["Pimiento", 25, 1, 5, 0.3, 3.5, 1.7, 120, "unidad"],
  ["Cebolla", 38, 1.2, 8, 0.2, 5, 1.5, 100, "unidad"],
  ["Calabacín", 17, 1.2, 2.5, 0.3, 2, 1, 200, "unidad"],
  ["Champiñones", 25, 3, 1, 0.4, 0.5, 1.5, 100, "ración"],
  ["Judías verdes", 30, 2, 4, 0.3, 2, 3, 150, "ración"],
  ["Menestra / verduras salteadas", 70, 3, 8, 3, 3, 3, 200, "plato"],
  ["Gazpacho", 45, 0.8, 4.5, 2.7, 3.5, 0.8, 250, "vaso"],
  // Grasas, salsas y dulces
  ["Aceite de oliva virgen extra", 900, 0, 0, 100, 0, 0, 10, "cucharada"],
  ["Mantequilla", 740, 0.7, 0.6, 82, 0.6, 0, 10, "porción"],
  ["Mayonesa", 680, 1, 1, 75, 1, 0, 15, "cucharada"],
  ["Tomate frito", 85, 1.5, 11, 4, 9, 1, 60, "ración"],
  ["Miel", 305, 0.3, 82, 0, 80, 0, 15, "cucharada"],
  ["Azúcar", 400, 0, 100, 0, 100, 0, 5, "cucharadita"],
  ["Mermelada", 250, 0.4, 62, 0.1, 55, 1, 15, "cucharada"],
  ["Chocolate negro 70%", 580, 8, 35, 42, 25, 11, 20, "2 onzas"],
  ["Chocolate con leche", 540, 7, 57, 31, 54, 2, 20, "2 onzas"],
  ["Crema de cacao (tipo Nutella)", 540, 6, 58, 31, 56, 3, 15, "cucharada"],
  ["Helado", 210, 3.5, 24, 11, 21, 0.5, 80, "bola"],
  ["Croissant", 410, 8, 45, 22, 10, 2, 60, "unidad"],
  ["Magdalena", 420, 6, 50, 22, 28, 1, 40, "unidad"],
  // Bebidas y comidas hechas
  ["Cerveza", 42, 0.4, 3.3, 0, 0, 0, 330, "caña grande"],
  ["Vino tinto", 85, 0.1, 2.6, 0, 0.6, 0, 150, "copa"],
  ["Refresco de cola", 42, 0, 10.6, 0, 10.6, 0, 330, "lata"],
  ["Zumo de naranja", 45, 0.7, 10, 0.2, 8.5, 0.2, 200, "vaso"],
  ["Café con leche", 28, 1.7, 2.4, 1.1, 2.4, 0, 200, "taza"],
  ["Tortilla de patatas", 190, 6.5, 14, 12, 1.2, 1.2, 150, "ración"],
  ["Tortilla francesa (2 huevos)", 185, 12, 0.6, 15, 0.4, 0, 120, "unidad"],
  ["Lentejas estofadas", 120, 7, 16, 3, 1, 5, 300, "plato"],
  ["Paella", 150, 7, 21, 4, 1, 1, 300, "plato"],
  ["Croquetas", 220, 6, 20, 13, 1.5, 1, 25, "croqueta"],
  ["Pizza (margarita)", 250, 11, 31, 9, 3, 2, 125, "porción"],
  ["Bocadillo de jamón serrano", 240, 12, 33, 7, 2, 2, 150, "bocadillo"],
  ["Burger de restaurante (completa)", 260, 13, 22, 13, 4, 1.5, 250, "unidad"],
  ["Sushi (maki)", 140, 4, 28, 1, 4, 0.6, 30, "pieza"],
  ["Barrita de proteínas", 370, 30, 35, 12, 5, 4, 55, "barrita"],
  // Añadidos después (van al final para no cambiar el número de los de arriba)
  ["Café solo", 2, 0.1, 0, 0, 0, 0, 50, "café"],
  ["Café con leche y azúcar", 45, 1.7, 7, 1.1, 7, 0, 200, "taza"],
  ["Leche con cacao (tipo Cola Cao)", 70, 3.5, 10, 1.8, 9, 0.6, 250, "taza"],
  ["Cacao soluble en polvo", 375, 6, 79, 3, 70, 6, 15, "cucharada"],
  ["Tostada de pan (sin nada)", 265, 9, 54, 1.5, 3, 2.5, 40, "tostada"],
];

// ---------------------------------------------------------------------
// Otras formas de medir cada alimento (además de gramos):
//   [nombre, plural, gramos que pesa 1, cuántas se ponen por defecto]
// La primera de la lista es la que sale elegida al añadirlo.
// Si un alimento no está aquí, usa su ración de arriba (y gramos).
// ---------------------------------------------------------------------
const U = {
  "Arroz blanco crudo": [["ración", "raciones", 70], ["taza", "tazas", 185]],
  "Pasta cruda": [["ración", "raciones", 80]],
  "Avena (copos)": [["ración", "raciones", 50], ["cucharada", "cucharadas", 10], ["taza", "tazas", 80]],
  "Pan blanco (barra)": [["rebanada", "rebanadas", 40], ["barra entera", "barras enteras", 250], ["bocadillo (media barra)", "bocadillos", 125]],
  "Pan integral": [["rebanada", "rebanadas", 30]],
  "Pan de molde": [["rebanada", "rebanadas", 30]],
  "Tostada de pan (sin nada)": [["tostada", "tostadas", 40]],
  "Cereales de desayuno (copos de maíz)": [["ración", "raciones", 30], ["taza", "tazas", 30]],
  "Galletas María": [["galleta", "galletas", 6, 4]],
  "Tortita de arroz": [["tortita", "tortitas", 9, 2]],
  "Patata cocida": [["patata mediana", "patatas medianas", 170], ["ración", "raciones", 200]],
  "Boniato asado": [["boniato mediano", "boniatos medianos", 150]],
  "Muslo de pollo (sin piel)": [["muslo", "muslos", 120]],
  "Jamón serrano": [["loncha", "lonchas", 15, 2]],
  "Jamón cocido (york)": [["loncha", "lonchas", 15, 2]],
  "Pechuga de pavo (fiambre)": [["loncha", "lonchas", 10, 3]],
  "Salchichas": [["salchicha", "salchichas", 50, 2]],
  "Hamburguesa de ternera": [["hamburguesa", "hamburguesas", 120]],
  "Atún al natural (lata)": [["lata pequeña", "latas pequeñas", 52]],
  "Atún en aceite (escurrido)": [["lata pequeña", "latas pequeñas", 52]],
  "Sardinas en lata": [["lata", "latas", 70]],
  "Huevo entero": [["huevo", "huevos", 60, 2]],
  "Clara de huevo": [["clara", "claras", 33, 3], ["vaso (claras de brick)", "vasos", 250]],
  "Leche semidesnatada": [["vaso", "vasos", 250], ["taza", "tazas", 200], ["chorrito", "chorritos", 30]],
  "Leche entera": [["vaso", "vasos", 250], ["taza", "tazas", 200], ["chorrito", "chorritos", 30]],
  "Bebida de soja": [["vaso", "vasos", 250], ["taza", "tazas", 200]],
  "Bebida de avena": [["vaso", "vasos", 250], ["taza", "tazas", 200]],
  "Yogur natural": [["yogur", "yogures", 125]],
  "Yogur griego natural": [["yogur", "yogures", 125]],
  "Yogur proteico (tipo skyr)": [["tarrina", "tarrinas", 150]],
  "Queso fresco batido 0%": [["tarrina", "tarrinas", 125], ["cucharada", "cucharadas", 20]],
  "Queso curado": [["loncha", "lonchas", 15, 2], ["cuña", "cuñas", 30]],
  "Queso fresco (Burgos)": [["ración", "raciones", 60], ["tarrina", "tarrinas", 250]],
  "Whey / proteína en polvo": [["cacito", "cacitos", 30]],
  "Almendras": [["puñado", "puñados", 25], ["almendra", "almendras", 1.2, 10]],
  "Nueces": [["puñado", "puñados", 25], ["nuez", "nueces", 5, 3]],
  "Cacahuetes": [["puñado", "puñados", 25]],
  "Crema de cacahuete": [["cucharada", "cucharadas", 15], ["cucharadita", "cucharaditas", 5]],
  "Plátano": [["plátano", "plátanos", 120]],
  "Manzana": [["manzana", "manzanas", 180]],
  "Naranja": [["naranja", "naranjas", 200]],
  "Mandarina": [["mandarina", "mandarinas", 80, 2]],
  "Pera": [["pera", "peras", 170]],
  "Kiwi": [["kiwi", "kiwis", 75, 2]],
  "Melocotón": [["melocotón", "melocotones", 150]],
  "Fresas": [["ración", "raciones", 150], ["fresa", "fresas", 12, 8]],
  "Aguacate": [["aguacate", "aguacates", 200, 0.5]],
  "Dátiles": [["dátil", "dátiles", 8, 3]],
  "Tomate": [["tomate", "tomates", 150]],
  "Zanahoria": [["zanahoria", "zanahorias", 100]],
  "Pimiento": [["pimiento", "pimientos", 120]],
  "Cebolla": [["cebolla", "cebollas", 100]],
  "Calabacín": [["calabacín", "calabacines", 200]],
  "Gazpacho": [["vaso", "vasos", 250], ["brick", "bricks", 1000]],
  "Aceite de oliva virgen extra": [["cucharada", "cucharadas", 10], ["cucharadita", "cucharaditas", 4], ["chorrito", "chorritos", 5]],
  "Mantequilla": [["porción", "porciones", 10], ["cucharadita", "cucharaditas", 5]],
  "Mayonesa": [["cucharada", "cucharadas", 15]],
  "Tomate frito": [["ración", "raciones", 60], ["cucharada", "cucharadas", 15]],
  "Miel": [["cucharada", "cucharadas", 15], ["cucharadita", "cucharaditas", 7]],
  "Azúcar": [["cucharadita", "cucharaditas", 5], ["sobre", "sobres", 8], ["terrón", "terrones", 4]],
  "Mermelada": [["cucharada", "cucharadas", 15]],
  "Chocolate negro 70%": [["onza", "onzas", 10, 2]],
  "Chocolate con leche": [["onza", "onzas", 10, 2]],
  "Crema de cacao (tipo Nutella)": [["cucharada", "cucharadas", 15]],
  "Helado": [["bola", "bolas", 80]],
  "Croissant": [["croissant", "croissants", 60]],
  "Magdalena": [["magdalena", "magdalenas", 40]],
  "Cerveza": [["caña", "cañas", 200], ["tercio / lata", "tercios", 330], ["pinta", "pintas", 500]],
  "Vino tinto": [["copa", "copas", 150]],
  "Refresco de cola": [["lata", "latas", 330], ["vaso", "vasos", 250]],
  "Zumo de naranja": [["vaso", "vasos", 200]],
  "Café con leche": [["taza", "tazas", 200], ["vaso", "vasos", 250], ["cortado", "cortados", 100]],
  "Café con leche y azúcar": [["taza", "tazas", 200], ["vaso", "vasos", 250]],
  "Café solo": [["café", "cafés", 50]],
  "Leche con cacao (tipo Cola Cao)": [["taza", "tazas", 250]],
  "Cacao soluble en polvo": [["cucharada", "cucharadas", 15], ["cucharadita", "cucharaditas", 6]],
  "Tortilla de patatas": [["pincho", "pinchos", 100], ["ración", "raciones", 150]],
  "Tortilla francesa (2 huevos)": [["tortilla", "tortillas", 120]],
  "Croquetas": [["croqueta", "croquetas", 25, 4]],
  "Pizza (margarita)": [["porción", "porciones", 125], ["pizza entera", "pizzas enteras", 450]],
  "Bocadillo de jamón serrano": [["bocadillo", "bocadillos", 150]],
  "Burger de restaurante (completa)": [["hamburguesa", "hamburguesas", 250]],
  "Sushi (maki)": [["pieza", "piezas", 30, 6]],
  "Barrita de proteínas": [["barrita", "barritas", 55]],
};

// Bebidas: se miden en ml en vez de en gramos
const LIQUIDO = /^(leche|bebida de|zumo|caf[eé]|cerveza|vino|refresco|gazpacho)/i;

export const ALIMENTOS = F.map(([nombre, kcal, p, c, g, az, fi, racion, unidad], i) => ({
  id: "b" + i, nombre, kcal, p, c, g, az, fi, racion, unidad, origen: "base",
  ml: LIQUIDO.test(nombre),
  unidades: (U[nombre] || []).map(([s, pl, gr, def]) => ({ s, pl, g: gr, def: def || 1 })),
}));
const PORNOMBRE = new Map(ALIMENTOS.map((a) => [a.nombre, a]));

// Plural sencillo en español (para raciones de alimentos tuyos o de supermercado)
export function plural(s) {
  return s.split(" ").map((w, i) => (i > 0 && !/^[a-záéíóúñ]+$/i.test(w)) || /^(de|con|y|sin)$/.test(w) ? w
    : /[aeiouáéó]$/i.test(w) ? w + "s" : /ón$/.test(w) ? w.slice(0, -2) + "ones" : /[a-z]$/i.test(w) ? w + "es" : w).join(" ");
}
// Todas las formas de medir un alimento: sus unidades, su ración y siempre gramos (o ml)
export function unidadesDe(a) {
  const ref = PORNOMBRE.get(a.nombre);
  let l = ref?.unidades?.length ? ref.unidades : a.unidades?.length ? a.unidades : [];
  if (!l.length && a.racion) {
    const s = a.unidad && !/^\d/.test(a.unidad) ? a.unidad : "ración";
    l = [{ s, pl: plural(s), g: a.racion, def: 1 }];
  }
  const base = (ref?.ml ?? LIQUIDO.test(a.nombre)) ? "ml" : "g";
  return [...l, { s: base, pl: base, g: 1, gramos: true }];
}
// "0.5" → "½", "1.5" → "1½", "2" → "2"
export function numBonito(n) {
  const e = Math.floor(n + 1e-9), r = Math.round((n - e) * 100) / 100;
  const fr = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[r];
  if (fr) return (e ? e : "") + fr;
  return (Math.round(n * 10) / 10).toLocaleString("es-ES");
}
// "3 huevos", "1 taza", "½ aguacate", "180 g"
export function textoCantidad(n, u) {
  if (u.gramos) return `${Math.round(n).toLocaleString("es-ES")} ${u.s}`;
  return `${numBonito(n)} ${n > 0 && n <= 1 ? u.s : u.pl}`;
}
