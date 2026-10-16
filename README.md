# Calculadora de Running

Aplicación para calcular ritmos de carrera, km en backyard, y muchos datos más relacionados con el running.
Web minimalista con estilo iOS para **entrenadores y sus alumnos**: los alumnos importan sus
actividades de Strava (GPX) y siguen su plan; el entrenador crea entrenamientos, los asigna y
sigue el avance de cada alumno.

## Roles y secciones

| Rol | Secciones |
|---|---|
| **Alumno** | Entrenos · Mi plan · Progreso · Test de Cooper · Ritmo · Backyard |
| **Entrenador** | Alumnos · Crear entreno · Biblioteca · Progreso · Test de Cooper |

Cada sección se puede abrir directamente con la URL: `index.html#entrenos`, `#plan`, `#progreso`,
`#cooper`, `#ritmo`, `#backyard`, `#alumnos`, `#crear`, `#biblioteca`.

### Cuentas e inicio de sesión
- La **primera vez** que se abre la app aparece "Crear cuenta de entrenador".
- El entrenador da de alta a sus alumnos en **Alumnos → + Agregar alumno** (nombre, correo,
  contraseña temporal y objetivo). El alumno inicia sesión con ese correo y contraseña.
- Desde el botón de cuenta (arriba a la derecha) se agrega o quita la **foto de perfil**, se cambia la
  contraseña y se cierra sesión. La foto se recorta y reduce a 256 px en el navegador antes de subirla;
  la ven el propio usuario, su entrenador y sus alumnos.
- Si un alumno olvida su contraseña, el entrenador le asigna una nueva desde **Editar (⋯)**.

## Secciones del alumno

### Entrenos (dashboard)
- **Importar entrenamiento:** uno o varios archivos `.gpx` (también arrastrar y soltar en escritorio).
  En Strava: actividad → menú **⋯** → **Exportar GPX**.
- Validaciones con `alert`: solo `.gpx`, formato GPX válido con puntos, sin duplicados.
- Se lee todo lo que trae el archivo (`gpx.js`): ruta, altitud, hora, frecuencia cardiaca,
  cadencia, temperatura, potencia, nombre y tipo de actividad. Se calcula distancia, tiempo en
  movimiento (sin pausas), ritmo, desnivel, parciales por km y series para las gráficas.
- Filtros por año y actividad, resumen (km totales, tiempo, ritmo, desnivel), lista con
  **Ver detalle ›** y **Eliminar** (con confirmación; borra los datos y el archivo GPX) y gráfica de km por mes. Las actividades de días con un entreno del plan
  completado muestran la insignia **✓ nombre del entreno**.

### Detalle (`detalle.html`)
Métricas, mapa de la ruta, gráficas de altitud / ritmo / FC / cadencia sincronizadas con el mapa,
parciales por km, todos los datos del archivo, **Descargar archivo GPX** y **Eliminar** (solo el
alumno dueño; el entrenador puede consultarlo pero no borrarlo).

### Mi plan
- Mensaje del entrenador.
- Semana actual (con flechas para navegar): los entrenos asignados por día, coloreados por tipo,
  o "Descanso".
- Avance semanal: km corridos (importados) frente a km planificados y sesiones completadas.
- Próximos entrenamientos (los atrasados se marcan).
- Al tocar un entreno: estructura, distancia y duración estimadas, indicaciones del entrenador y
  **Marcar como hecho / pendiente**.

### Progreso (también para el entrenador, eligiendo al alumno)
Solo cuenta actividades de carrera.
- **Por mes:** km de cada mes del año contra el año anterior, mejor mes, promedio mensual y tabla
  mensual con variación. El año en curso se compara con el anterior **a la misma fecha**.
- **Por año:** total histórico, mejor año, km por año y km acumulados por año.
- **Comparar:** mes vs mes (km acumulados día a día) o año vs año (año completo, a la misma
  fecha, km por mes y acumulados), con variaciones ▲/▼.

### Test de Cooper (alumno y entrenador)
Registro de la prueba de 12 minutos (máxima distancia posible).
- **Registrar test:** fecha, superficie, distancia (o vueltas de 400 m + metros extra), sexo y edad (para la
  tabla de referencia), FC media y máxima, esfuerzo percibido (1–10), temperatura y sensaciones.
- **Resumen:** último test (vs. anterior), mejor marca, VO2máx estimado y mejora total desde el primer test.
- **Gráficas** de la evolución de la distancia y del VO2máx, **comparación** de dos tests cualesquiera e
  **historial** (al tocar un test: detalle, editar y eliminar).
- **Información:** qué es la prueba, instrucciones paso a paso, precauciones y tabla de referencia por sexo y edad.
- Cálculos: VO2máx ≈ (metros − 504.9) ÷ 44.73; ritmo = 12 min ÷ km. El entrenador elige al alumno y puede
  registrar tests en su nombre.

### Ritmo y Backyard
- **Ritmo:** distancia (5K, 10K, 15K, 21K, maratón u otra) + tiempo → ritmo por km y velocidad.
- **Backyard:** vueltas de 6.7 km + km extra opcionales → km totales.

## Secciones del entrenador

### Alumnos
Indicadores del equipo (alumnos, km del mes, cumplimiento promedio, entrenos pendientes) y una
fila por alumno: objetivo, km del mes, último entreno, **cumplimiento** (entrenos hechos / asignados
en las últimas 4 semanas), km de las últimas 12 semanas y acciones **Progreso**, **Asignar** y
**Editar** (objetivo, mensaje para el alumno, nueva contraseña, eliminar).

### Crear entreno
- **Tipo:** Repeticiones, Fondo, Fartlek, Tempo, Cuestas o Rodaje suave (carga una estructura base
  de la biblioteca).
- **Datos:** nombre, fecha, alumnos a los que se asigna e indicaciones.
- **Estructura por bloques:** calentamiento, bloque continuo, repeticiones (trabajo +
  recuperación) y enfriamiento. Cada paso tiene cantidad (km, m, min o s), ritmo (m:ss /km) y zona
  (Z1–Z5). Los bloques se pueden subir, bajar y eliminar.
- **Vista previa en vivo:** distancia y duración estimadas, número de bloques y gráfico de
  intensidad por zona.
- **Asignar a N alumnos** o **Guardar en biblioteca**.

### Biblioteca
Plantillas filtrables por tipo, con **Usar como base**, **Ver** y eliminar. Cada entrenador
empieza con 6 plantillas de ejemplo (`api/default-templates.json`). Al asignar se guarda una copia:
editar o borrar una plantilla no cambia los entrenos ya asignados.

## Dónde se guardan los datos
En el servidor (la computadora donde corre XAMPP), así que todos los dispositivos de la red ven lo mismo.

| Tabla (MySQL `calculadora_running`) | Contenido |
|---|---|
| `users` | Entrenadores y alumnos (contraseña con `password_hash`, nunca en texto), objetivo, mensaje del entrenador |
| `workouts` | Entrenamientos importados de cada alumno (resumen en JSON) |
| `templates` | Biblioteca de plantillas de cada entrenador |
| `assignments` | Plan de cada alumno: fecha, estructura, indicaciones y estado |
| `cooper_tests` | Resultados del test de Cooper de cada alumno |
| `login_attempts` | Intentos de inicio de sesión fallidos (límite) |
| `app_meta` | Versión de la estructura de la base de datos |

- Los archivos `.gpx` originales se guardan en `api/storage/gpx/<id>.gpx` y las fotos de perfil en
  `api/storage/avatars/<id de usuario>.jpg` (carpeta bloqueada para acceso directo y excluida de GitHub).
- Las tablas se crean y actualizan solas (`api/db.php` + `api/schema.sql`).
- **Respaldo:** copia `api/storage/` (GPX y fotos) y exporta la base `calculadora_running` desde phpMyAdmin.

## API (`api/`)
Todas las respuestas son JSON y requieren sesión (salvo `auth.php`). Las peticiones que modifican
datos deben enviar la cabecera `X-Requested-With` (protección CSRF; la agrega `api.js`).

| Archivo | Quién | Qué hace |
|---|---|---|
| `auth.php` | todos | Sesión actual, configuración inicial, login, logout, cambio de contraseña |
| `athletes.php` | entrenador | Listar, crear, editar y eliminar alumnos |
| `workouts.php` | alumno / entrenador | Importar, listar, ver, descargar y eliminar entrenamientos |
| `templates.php` | entrenador | Biblioteca de plantillas |
| `assignments.php` | entrenador / alumno | Asignar entrenos; el alumno los marca como hechos |
| `cooper.php` | alumno / entrenador | Tests de Cooper: listar, registrar, editar y eliminar |
| `avatar.php` | todos | Ver, subir y quitar la foto de perfil |

Permisos: el alumno solo ve y modifica lo suyo; el entrenador solo ve a **sus** alumnos y no puede
borrar sus actividades. Las estructuras de entrenamiento se validan en el servidor (`structure.php`).

## Estructura del proyecto
| Archivo | Contenido |
|---|---|
| `index.html` / `detalle.html` | Interfaz principal / detalle de una actividad |
| `styles.css` | Estilos (tema iOS, responsivo, modo oscuro) |
| `auth.js` | Pantalla de acceso, cuenta del usuario y arranque de la app |
| `app.js` | Calculadoras Ritmo y Backyard; navegación por rol (`App`) |
| `api.js` / `ui.js` | Peticiones al servidor / utilidades de interfaz (modal, avisos, formatos) |
| `gpx.js` / `storage.js` | Lectura de GPX / entrenamientos en el servidor |
| `structure.js` | Tipos y estructura de los entrenamientos (cálculos y dibujo) |
| `charts.js` | Gráficas y mapa en SVG |
| `dashboard.js`, `plan.js`, `progress.js`, `cooper.js` | Secciones del alumno (Progreso y Cooper también del entrenador) |
| `athletes.js`, `builder.js` | Secciones del entrenador (Alumnos; Crear entreno y Biblioteca) |
| `api/*.php` | Backend en PHP |

Frontend en HTML, CSS y JavaScript puros (sin librerías); backend en PHP con MySQL/MariaDB.
Al cambiar archivos `.js` o `.css`, sube el número `?v=N` en `index.html` y `detalle.html`
para que los navegadores descarguen la versión nueva.

## Uso
1. Copia la carpeta dentro de `htdocs` de XAMPP e inicia **Apache** y **MySQL**.
2. Abre `http://localhost/<ruta-de-la-carpeta>/index.html` y crea la cuenta del entrenador.
3. Da de alta a tus alumnos en **Alumnos**.
4. Desde otros dispositivos de la misma red, usa la IP de la computadora en lugar de `localhost`
   (los espacios del nombre de la carpeta se escriben como `%20`).

Para cambiar la conexión a la base de datos, crea `api/config.local.php` (ver `api/config.php`).

## Servidor en internet (AWS Lightsail)
La app está publicada en **AWS Lightsail** (región `us-east-1`):

| Recurso | Valor |
|---|---|
| Servidor | `calculadora-running`, plan micro (1 GB RAM, 40 GB disco), LAMP de Bitnami (Debian 12, PHP 8, MariaDB) |
| IP fija | `calculadora-ip` → `http://3.94.71.68/` |
| Puertos abiertos | 22 (SSH), 80 (HTTP), 443 (HTTPS) |
| Llave SSH | `calculadora-key` (en la computadora del administrador: `~/.ssh/calculadora-lightsail.pem`) |
| App | `/opt/bitnami/projects/calculadora` (copia del repositorio de GitHub) |
| Base de datos | `calculadora_running`, usuario propio `calculadora`; credenciales en `api/config.local.php` del servidor (no está en GitHub) |

- **Publicar cambios:** sube los cambios a GitHub (`main`) y ejecuta
  `ssh -i ~/.ssh/calculadora-lightsail.pem bitnami@3.94.71.68 "bash /opt/bitnami/projects/calculadora/deploy/update.sh"`.
  El script descarga la versión nueva, ajusta permisos y aplica `deploy/apache-vhost.conf`.
  Las tablas nuevas se crean solas al primer uso.
- **Apache** (`deploy/apache-vhost.conf`) solo publica la app: bloquea `.git`, `deploy/`,
  la configuración, los `.sql`/`.md` y los archivos GPX guardados.
- **Inicio de sesión:** máximo 5 intentos fallidos por correo y 20 por IP cada 15 minutos.
- **Pendiente:** dominio propio + **HTTPS** (con un dominio apuntando a la IP, ejecutar
  `sudo /opt/bitnami/bncert-tool` en el servidor). Mientras no haya HTTPS, las contraseñas viajan
  sin cifrar. La cookie de sesión se marca como segura en cuanto se use HTTPS.
- **Respaldo:** instantáneas del servidor desde la consola de Lightsail (o automáticas diarias).

## Licencia
Distribuido bajo la licencia GNU GPL v3. Consulta el archivo [LICENSE](LICENSE).
