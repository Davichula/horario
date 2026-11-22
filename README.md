# Mi horario

Web personal para ver mi horario de la escuela de ingeniería, filtrado a mis asignaturas y grupos.

## Qué hay en cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El esqueleto de la página: qué elementos hay en pantalla. |
| `styles.css` | Cómo se ve: colores, tamaños, versión móvil y modo oscuro. |
| `app.js` | El programa: lee el calendario, filtra mis clases y las dibuja. |
| `config.js` | **Mis datos**: asignaturas, grupo de prácticas y color de cada una. |
| `calendario.ics` | El calendario completo que exporta la escuela. |
| `manifest.json`, `icono*` | Nombre e icono para poder "instalarla" en el móvil (Añadir a pantalla de inicio). |

## Cómo actualizar el calendario

Si la escuela cambia el horario, descarga el nuevo `.ics`, renómbralo a `calendario.ics` y sustituye el antiguo.

## Cómo probarlo en mi ordenador

Abrir una terminal en esta carpeta y ejecutar `python -m http.server`, luego abrir http://localhost:8000 en el navegador.
