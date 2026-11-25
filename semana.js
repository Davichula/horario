// =====================================================================
// semana.js — EL RESUMEN DE LA SEMANA (domingo y lunes)
// ---------------------------------------------------------------------
// Una sola tarjeta dentro del resumen del día con tres bloques:
//   Entreno   → sesiones, horas, km y calorías (y si has hecho más o menos que la semana anterior)
//   Comida    → días anotados, calorías y proteína de media frente a tu objetivo
//   Peso      → media de 7 días y cuánto ha cambiado
// El domingo enseña la semana que acaba; el lunes, la que acabó ayer.
// resumen.js lo carga solo esos dos días.
// =====================================================================
import * as D from "./nutricion/datos.js";
import * as almacen from "./entreno/almacen.js";
import * as hoyE from "./entreno/hoy.js";

const n0 = (x) => Math.round(x).toLocaleString("es-ES");
const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
const horas = (s) => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };
// Nombre bonito de cada familia de deporte
const DEPORTE = { correr: "carrera", nadar: "natación", bici: "bici", gimnasio: "gimnasio", andar: "andar", raqueta: "raqueta", nieve: "nieve", escalada: "escalada", agua: "agua", otro: "otros" };

// ¿Toca enseñarlo hoy? Devuelve el lunes de la semana a resumir, o null
export function semanaQueToca(f = D.hoy()) {
  const dia = new Date(f + "T12:00:00").getDay(); // 0 domingo, 1 lunes
  if (dia === 0) return D.sumarDias(f, -6);
  if (dia === 1) return D.sumarDias(f, -7);
  return null;
}

function entreno(lunes) {
  const fin = D.sumarDias(lunes, 7), antes = D.sumarDias(lunes, -7);
  const todas = almacen.listar();
  const dia = (a) => D.aTexto(new Date(a.inicio));
  const esta = todas.filter((a) => dia(a) >= lunes && dia(a) < fin);
  const pasada = todas.filter((a) => dia(a) >= antes && dia(a) < lunes);
  const suma = (l, k) => l.reduce((s, a) => s + (a[k] || 0), 0);
  const porDeporte = {};
  for (const a of esta) porDeporte[a.deporte] = (porDeporte[a.deporte] || 0) + 1;
  return { n: esta.length, seg: suma(esta, "duracion"), km: suma(esta, "distancia") / 1000, kcal: suma(esta, "calorias"),
    segAntes: suma(pasada, "duracion"), porDeporte };
}

function comida(lunes) {
  const p = D.perfil(), dias = [];
  for (let i = 0; i < 7; i++) {
    const f = D.sumarDias(lunes, i), l = D.dia(f);
    if (!l.length) continue;
    const t = D.totales(l), obj = D.objetivoDia(p, hoyE.kcalEntreno(f).total);
    dias.push({ t, obj });
  }
  if (!dias.length) return { n: 0 };
  const media = (fn) => dias.reduce((s, d) => s + fn(d), 0) / dias.length;
  const conObj = dias.every((d) => d.obj);
  return { n: dias.length, kcal: media((d) => d.t.kcal), prot: media((d) => d.t.p),
    kcalObj: conObj ? media((d) => d.obj.kcal) : null, protObj: conObj ? media((d) => d.obj.prot) : null,
    diasProt: conObj ? dias.filter((d) => d.t.p >= d.obj.prot * 0.9).length : null };
}

function peso(lunes) {
  const ps = D.pesos(), fin = D.sumarDias(lunes, 6);
  const ahora = D.mediaPeso(ps, fin), antes = D.mediaPeso(ps, D.sumarDias(fin, -7));
  return { ahora, cambio: ahora && antes ? ahora - antes : null };
}

// Devuelve el HTML de la tarjeta (o "" si no hay nada que contar)
export function htmlSemana(lunes) {
  const e = entreno(lunes), c = comida(lunes), w = peso(lunes);
  if (!e.n && !c.n && !w.ahora) return "";
  const domingo = D.sumarDias(lunes, 6);
  const corto = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const dif = e.segAntes ? Math.round((e.seg / e.segAntes - 1) * 100) : null;
  const deportes = Object.entries(e.porDeporte).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${n} ${DEPORTE[d] || d}`).join(" · ");

  const bloqueEntreno = e.n
    ? `<div class="semana-bloque"><span>🏋️ Entreno</span><b>${e.n} ${e.n === 1 ? "sesión" : "sesiones"} · ${horas(e.seg)}</b>
        <small>${deportes}${e.km >= 1 ? ` · ${n1(e.km)} km` : ""}${e.kcal ? ` · ${n0(e.kcal)} kcal` : ""}</small>
        ${dif != null && Math.abs(dif) >= 5 ? `<small>${dif > 0 ? "+" : ""}${dif} % de tiempo que la semana anterior</small>` : ""}</div>`
    : `<div class="semana-bloque"><span>🏋️ Entreno</span><b>Semana sin entrenos</b></div>`;
  const bloqueComida = c.n
    ? `<div class="semana-bloque"><span>🍽️ Comida</span><b>${n0(c.kcal)} kcal de media${c.kcalObj ? ` <small>/ ${n0(c.kcalObj)}</small>` : ""}</b>
        <small>${c.n} de 7 días anotados · proteína ${n0(c.prot)} g${c.protObj ? ` de ${n0(c.protObj)}` : ""}</small>
        ${c.diasProt != null ? `<small>Llegaste a la proteína ${c.diasProt} de ${c.n} días</small>` : ""}</div>`
    : `<div class="semana-bloque"><span>🍽️ Comida</span><b>No anotaste comidas</b></div>`;
  const bloquePeso = w.ahora
    ? `<div class="semana-bloque"><span>⚖️ Peso</span><b>${n1(w.ahora)} kg <small>media de 7 días</small></b>
        ${w.cambio != null ? `<small>${w.cambio === 0 ? "Igual que" : `${w.cambio > 0 ? "+" : "−"}${n1(Math.abs(w.cambio))} kg respecto a`} la semana anterior</small>` : ""}</div>`
    : "";
  return `<h3>Tu semana · ${corto(lunes)} – ${corto(domingo)}</h3><div class="semana-tarjeta">${bloqueEntreno}${bloqueComida}${bloquePeso}</div>`;
}

// resumen.js llama a esto con el hueco donde pintar
export function pintar(el, f) {
  const lunes = semanaQueToca(f);
  if (!lunes || !el) return;
  el.innerHTML = htmlSemana(lunes);
}
