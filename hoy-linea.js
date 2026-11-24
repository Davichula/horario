// =====================================================================
// hoy-linea.js — una línea arriba del Horario con el semáforo de hoy
// ---------------------------------------------------------------------
// "● Ámbar · entreno suave — 2 480 kcal · 330 g carbos · Natación 18:00"
// Al tocarla te lleva a Entreno → Hoy. Los cálculos están en
// entreno/hoy.js (se usan también en Entreno y Nutrición).
// =====================================================================
const linea = document.getElementById("linea-hoy");
let hoyE = null;

async function pintar() {
  if (!linea) return;
  try {
    hoyE ??= await import("./entreno/hoy.js");
    const tieneEntrenos = (localStorage.getItem("mi-horario:entreno") || "[]") !== "[]";
    const pl = hoyE.planDelDia();
    if (!tieneEntrenos && !pl.obj) { linea.hidden = true; return; }
    const s = hoyE.semaforo();
    const partes = [];
    if (pl.obj) partes.push(`${Math.round(pl.obj.kcal).toLocaleString("es-ES")} kcal`, `${Math.round(pl.obj.carbos)} g carbos`);
    const p = pl.principal;
    if (p) partes.push(`${p.nombre}${p.hecho ? " ✓" : p.hora ? " " + p.hora : ""}`);
    else partes.push("descanso");
    linea.innerHTML = `<span class="linea-hoy-punto" style="--c:${s.colorCss}"></span>
      <span class="linea-hoy-texto"><b></b><small></small></span><span class="linea-hoy-flecha" aria-hidden="true">›</span>`;
    linea.querySelector("b").textContent = s.titulo;
    linea.querySelector("small").textContent = partes.join(" · ");
    linea.setAttribute("aria-label", `${s.titulo}. ${partes.join(", ")}. Abrir Entreno, Hoy`);
    linea.hidden = false;
  } catch (e) {
    console.warn("[hoy-linea]", e);
    linea.hidden = true;
  }
}

pintar();
// Se actualiza al volver a la app, al cambiar de pestaña o si cambian tus datos
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pintar(); });
window.addEventListener("hashchange", () => { if (!location.hash || location.hash === "#") pintar(); });
window.addEventListener("storage", (e) => { if (e.key?.startsWith("mi-horario:entreno") || e.key?.startsWith("mi-horario:nutricion")) pintar(); });
