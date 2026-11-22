# Mi horario

Web personal para ver mi horario de la escuela de ingeniería, filtrado a mis asignaturas y grupos.

## Qué hay en cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El esqueleto de la página: qué elementos hay en pantalla. |
| `styles.css` | Cómo se ve: colores, tamaños, versión móvil y modo oscuro. |
| `app.js` | El programa: lee el calendario, filtra mis clases y las dibuja. |
| `config.js` | **Mis datos**: asignaturas, grupo de prácticas, colores y categorías de mis cosas. |
| `personal.js` | Guarda y lee mis cosas personales (estudio, entreno, comida...) en el navegador. |
| `calendario.ics` | El calendario completo que exporta la escuela. |
| `moodle.js` | Lee mis entregas de Moodle, quita las de otros grupos de prácticas y las prepara para dibujarlas. |
| `moodle.ics` | Mi calendario de Moodle. Lo descarga solo el robot de abajo. |
| `.github/workflows/moodle.yml` | El "robot" de GitHub que baja `moodle.ics` dos veces al día. |
| `manifest.json`, `icono*` | Nombre e icono para poder "instalarla" en el móvil (Añadir a pantalla de inicio). |

## Cómo actualizar el calendario

Si la escuela cambia el horario, descarga el nuevo `.ics`, renómbralo a `calendario.ics` y sustituye el antiguo.

## Cómo probarlo en mi ordenador

Abrir una terminal en esta carpeta y ejecutar `python -m http.server`, luego abrir http://localhost:8000 en el navegador.

## Mis cosas personales

Se añaden con el botón **＋** (o tocando un hueco de la semana). El tipo y el icono se eligen solos según el título ("Dentista" → 🦷 Salud); las palabras que reconoce están en `config.js`, en `CATEGORIAS`. Se guardan en el navegador del dispositivo donde las creas. Desde el panel lateral puedo **exportar** una copia (.json) e **importarla** en otro dispositivo.

## Entregas de Moodle (automáticas)

Las entregas, cuestionarios y plazos de Moodle salen en el horario con borde discontinuo, y en el panel lateral en **Próximas entregas**. Las de otros grupos de prácticas (por ejemplo `CD2_ses4` cuando yo soy del 13) se quitan solas usando los grupos de `config.js`.

Para que se actualicen solas, una vez:

1. En Moodle: **Calendario → Exportar calendario**. Elige *Todos los eventos* y *Eventos recientes y próximos* (o el periodo más largo que deje) y pulsa **Obtener URL del calendario**. Copia el enlace.
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Nombre `MOODLE_ICS_URL`, valor el enlace. Guardar.
3. En la pestaña **Actions → Actualizar entregas de Moodle → Run workflow** para probarlo la primera vez.

El enlace es privado (quien lo tenga puede ver tu calendario de Moodle, pero no entrar en tu cuenta), por eso va como secreto y nunca en el código.
