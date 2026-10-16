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

El archivo se procesa **en el navegador**; al servidor se envían el archivo original y el resumen calculado.

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
- botón **Descargar archivo GPX** (el original guardado en el servidor);
- botón **Eliminar entrenamiento** (con confirmación); el dashboard se actualiza solo.

### Dónde se guardan los entrenamientos
Los entrenamientos se guardan **en el servidor** (la computadora donde corre XAMPP), así que
**todos los dispositivos de la red ven los mismos datos**: lo que importas desde el celular aparece
en la computadora y viceversa.

| Qué | Dónde | Contenido |
|---|---|---|
| Datos del entrenamiento | MySQL: base `calculadora_running`, tabla `workouts` | Nombre, tipo, fecha, km y el resumen completo en JSON (ritmo, FC, desnivel…) |
| Archivo original | `api/storage/gpx/<id>.gpx` | El archivo `.gpx` tal como se exportó de Strava |

- La base de datos y la tabla **se crean solas** la primera vez (`api/db.php` usa `api/schema.sql`).
- Los puntos GPS no se duplican en MySQL: la página de detalle descarga el `.gpx` original y lo procesa en el navegador.
- La carpeta `api/storage/` está bloqueada para acceso directo (`.htaccess`); los archivos solo se descargan mediante la API.
- Los archivos `.gpx` y `api/config.local.php` **no se suben a GitHub** (`.gitignore`).
- **Respaldo:** copia la carpeta `api/storage/gpx/` y exporta la base `calculadora_running` desde phpMyAdmin.
- El dashboard se actualiza solo al volver a la app, para mostrar lo importado desde otros dispositivos.

**Migración desde la versión anterior:** antes, los entrenamientos se guardaban solo en el navegador
(IndexedDB). Al abrir el dashboard en un navegador que todavía tiene esos datos, la app ofrece
subirlos al servidor una sola vez (los reconstruye como archivo GPX) y luego los borra del navegador.

### API (`api/workouts.php`)
Backend en **PHP + MySQL** (el que trae XAMPP). Todas las respuestas son JSON:

| Método | URL | Acción |
|---|---|---|
| `GET` | `api/workouts.php` | Lista de entrenamientos (resúmenes) |
| `GET` | `api/workouts.php?id=X` | Resumen de un entrenamiento |
| `GET` | `api/workouts.php?id=X&file=1` | Descarga el `.gpx` original |
| `POST` | `api/workouts.php` | Guarda uno nuevo (`multipart/form-data`: `gpx` = archivo, `summary` = JSON) |
| `DELETE` | `api/workouts.php?id=X` | Elimina el entrenamiento y su archivo |

Validaciones del servidor: el archivo debe ser GPX y pesar como máximo 40 MB; el resumen solo acepta
campos conocidos con el tipo correcto; los duplicados (misma hora de inicio y distancia) se
rechazan con código `409`; todas las consultas son preparadas (sin inyección SQL).

## Características
- Frontend en HTML, CSS y JavaScript puros (sin dependencias ni librerías externas).
- Backend en PHP con base de datos MySQL/MariaDB.
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
| `storage.js` | Comunicación con la API; migración de los datos antiguos del navegador |
| `charts.js` | Gráficas de barras, de línea y mapa de la ruta (SVG) |
| `dashboard.js` | Lógica del dashboard: importación, filtros, resumen, lista y gráfica |
| `detalle.js` | Lógica de la página de detalle |
| `api/workouts.php` | API REST de entrenamientos |
| `api/db.php` | Conexión a MySQL y respuestas JSON |
| `api/config.php` | Configuración (base de datos, carpeta de archivos, límites) |
| `api/schema.sql` | Estructura de la tabla `workouts` |
| `api/storage/` | Archivos `.gpx` subidos (no se suben a GitHub) |

## Uso
1. Copia la carpeta dentro de `htdocs` de XAMPP.
2. En el **XAMPP Control Panel**, inicia **Apache** y **MySQL**.
3. Abre `http://localhost/<ruta-de-la-carpeta>/index.html`. La base de datos se crea sola.
4. Desde otro dispositivo de la misma red Wi-Fi, usa la IP de la computadora en lugar de `localhost`
   (los espacios del nombre de la carpeta se escriben como `%20`).

La configuración por defecto usa el usuario `root` sin contraseña de XAMPP. Para cambiarla, crea
`api/config.local.php` (ver instrucciones en `api/config.php`).

## Próximo paso: publicarlo en internet
La app ya está separada en frontend + API, así que puede subirse a un hosting con PHP y MySQL. Antes:

1. **Agregar inicio de sesión** (usuarios y contraseñas): hoy la API no tiene autenticación porque
   solo se usa en la red local; en internet cualquiera podría ver o borrar los entrenamientos.
2. Crear `api/config.local.php` con las credenciales del hosting y `'debug' => false`.
3. Si el hosting no permite crear bases de datos desde PHP, poner `'auto_create' => false` y
   ejecutar `api/schema.sql` desde su phpMyAdmin.
4. Usar **HTTPS**.
5. Subir también la carpeta `api/storage/gpx/` (o migrar los datos) si se quieren conservar los entrenamientos.

## Licencia
Distribuido bajo la licencia GNU GPL v3. Consulta el archivo [LICENSE](LICENSE).
