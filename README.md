# Calculadora de Running

Aplicación para calcular ritmos de carrera, km en backyard, y muchos datos más relacionados con el running.
Web minimalista con estilo iOS. Incluye tres secciones, accesibles desde el selector superior:

| Sección | Para qué sirve |
|---|---|
| **Ritmo** | Calcula el ritmo por km a partir de una distancia y un tiempo |
| **Backyard** | Calcula los km totales de un backyard ultra (vueltas de 6.7 km) |
| **Entrenos** | Dashboard de actividades importadas desde archivos GPX (Strava) |

Cada sección se puede abrir directamente con la URL: `index.html#ritmo`, `index.html#backyard` o `index.html#entrenos`.

## 1. Ritmo
Calcula el ritmo de carrera por kilómetro.

- **Distancia:** 5K, 10K, 15K, 21K (media maratón, 21.0975 km), Maratón (42.195 km) u **Otro** (distancia personalizada).
- **Tiempo:** horas, minutos y segundos.
- **Resultado:** ritmo (min/km), velocidad (km/h), distancia y tiempo total.

## 2. Backyard
Calcula los kilómetros totales de un backyard ultra (vueltas de **6.7 km**).

- **Vueltas completas:** número entero.
- **Vuelta incompleta (opcional):** interruptor que habilita un campo de km extra.
- **Resultado:** `km totales = vueltas × 6.7 + km extra`.

## 3. Entrenos (dashboard de entrenamientos)

### Carga de archivos
- Botón **Importar entrenamiento**: abre el selector de archivos y acepta uno o **varios** archivos `.gpx` a la vez.
- En escritorio también se pueden **arrastrar y soltar** los archivos sobre la tarjeta de importación.
- Para obtener el archivo en Strava: abre la actividad → menú **⋯** → **Exportar GPX**.
- Validaciones (con aviso `alert`):
  - solo se aceptan archivos con extensión `.gpx`;
  - el archivo debe ser XML válido con formato GPX y tener puntos de recorrido;
  - no se importa dos veces la misma actividad (misma hora de inicio y distancia).

### Qué datos se leen del GPX
Se procesa todo lo que trae el archivo (`gpx.js`):

- **Ruta:** latitud y longitud de cada punto (`<trkpt>`, o `<rtept>` en rutas).
- **Altitud** (`<ele>`), **hora** (`<time>`).
- **Extensiones de Garmin/Strava** (`<gpxtpx:TrackPointExtension>`): frecuencia cardiaca (`hr`), cadencia (`cad`), temperatura (`atemp`) y potencia (`power`).
- **Metadatos:** nombre, tipo de actividad (`<type>`), descripción y app que generó el archivo (`creator`).

Con esos datos se calcula:

- distancia (fórmula de Haversine entre puntos GPS);
- tiempo total, **tiempo en movimiento** (excluye pausas: tramos a menos de 0.5 m/s) y tiempo detenido;
- ritmo y velocidad medios, desnivel positivo/negativo (altitud suavizada), altitud mínima/máxima;
- FC, cadencia, temperatura y potencia (media y máxima);
- parciales por kilómetro y series remuestreadas para las gráficas.

El tipo de actividad (Carrera, Ciclismo, Caminata, Senderismo, Natación) se toma de `<type>` o, si no existe, del nombre de la actividad. La cadencia de carrera se multiplica por 2 para mostrarla en pasos por minuto, como hace Strava.

### Dashboard
- **Filtros** por año y por tipo de actividad: afectan al resumen, la lista y la gráfica.
- **Resumen:** km totales del filtro (número principal), número de entrenamientos, tiempo en movimiento, ritmo medio (solo actividades medidas en ritmo; en ciclismo, velocidad media) y desnivel positivo. Debajo, el total histórico.
- **Lista de entrenamientos:** nombre, tipo, fecha, ritmo y km, con el botón **Ver detalle ›**.
- **Gráfica de km por mes** del año seleccionado; al pasar el cursor o tocar una barra muestra los km y el número de entrenamientos.

### Detalle del entrenamiento (`detalle.html`)
Se abre en otra ventana o pestaña desde **Ver detalle ›** (`detalle.html?id=...`):

- tarjetas con las métricas principales y el **mejor km**;
- **mapa de la ruta** (SVG con proyección Mercator) con inicio, fin y enlace a OpenStreetMap;
- gráficas de **altitud, ritmo (o velocidad), frecuencia cardiaca y cadencia**, que comparten el eje de distancia; al recorrerlas, la posición se marca en el mapa;
- tabla de **parciales por km** con barras comparativas (el km más rápido en negrita);
- lista con **todos los datos** del archivo;
- botón **Eliminar entrenamiento** (con confirmación); el dashboard se actualiza solo.

### Dónde se guardan los entrenamientos
Los entrenamientos se guardan **en el navegador**, con **IndexedDB** (`storage.js`), en una base de datos local llamada `calculadora-running` con dos tablas:

| Tabla | Contenido | La usa |
|---|---|---|
| `workouts` | Resumen ligero (nombre, fecha, km, ritmo, FC…) | Dashboard |
| `tracks` | Todos los puntos GPS del recorrido | Detalle |

Consecuencias:

- No se suben a ningún servidor: **cada navegador y cada dispositivo tiene sus propios entrenamientos**.
- Se conservan al recargar la página o cerrar el navegador, pero se pierden si se borran los datos del sitio.
- El archivo `.gpx` original no se guarda; se guarda el resultado ya procesado.
- Para que funcione, la app debe abrirse con un servidor (`http://...`, p. ej. XAMPP), no como archivo local.

## Características
- HTML, CSS y JavaScript puros (sin dependencias ni librerías externas).
- Gráficas y mapa dibujados en SVG.
- Diseño responsivo: iPhone, Android, iPad y navegadores de escritorio.
- Modo claro y oscuro automático.
- Validación: solo valores numéricos; avisos con `alert` si faltan datos.

## Estructura
| Archivo | Contenido |
|---|---|
| `index.html` | Interfaz: selector de secciones, calculadoras y dashboard |
| `detalle.html` | Página de detalle de un entrenamiento |
| `styles.css` | Estilos (tema iOS, responsivo, modo oscuro, gráficas) |
| `app.js` | Calculadoras Ritmo y Backyard; cambio de sección |
| `gpx.js` | Lectura y análisis de archivos GPX |
| `storage.js` | Guardado de entrenamientos en el navegador (IndexedDB) |
| `charts.js` | Gráficas de barras, de línea y mapa de la ruta (SVG) |
| `dashboard.js` | Lógica del dashboard: importación, filtros, resumen, lista y gráfica |
| `detalle.js` | Lógica de la página de detalle |

## Uso
1. Copia la carpeta dentro de `htdocs` de XAMPP e inicia **Apache**.
2. Abre `http://localhost/<ruta-de-la-carpeta>/index.html`.
3. Desde otro dispositivo de la misma red Wi-Fi, usa la IP de la computadora en lugar de `localhost`
   (los espacios del nombre de la carpeta se escriben como `%20`).

## Licencia
Distribuido bajo la licencia GNU GPL v3. Consulta el archivo [LICENSE](LICENSE).
