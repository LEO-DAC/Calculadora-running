<?php
/**
 * =====================================================================
 * Archivo: api/workouts.php
 * Descripción: API REST de entrenamientos. Guarda los datos en MySQL y
 * los archivos .gpx originales en api/storage/gpx/, para que todos los
 * dispositivos de la red vean los mismos entrenamientos.
 *
 * Rutas (todas responden JSON, salvo la descarga del archivo):
 *   GET    workouts.php              -> lista de resúmenes (más reciente primero)
 *   GET    workouts.php?id=X         -> resumen de un entrenamiento
 *   GET    workouts.php?id=X&file=1  -> archivo .gpx original
 *   POST   workouts.php              -> guarda uno nuevo (multipart/form-data)
 *            campos: gpx (archivo), summary (JSON calculado por gpx.js)
 *   DELETE workouts.php?id=X         -> elimina un entrenamiento y su archivo
 *
 * Códigos de error: 400 datos no válidos, 404 no existe,
 * 409 entrenamiento duplicado, 413 archivo muy grande, 500 error interno.
 *
 * Nota: por ahora no hay usuarios ni contraseñas (uso en red local).
 * Antes de publicar en internet hay que agregar autenticación.
 * =====================================================================
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

/* ------------------------------------------------------------------
 * 1. Definición de los datos del resumen
 * ------------------------------------------------------------------ */

/** Campos de texto del resumen y su longitud máxima. */
const TEXT_FIELDS = [
    'fileName' => 255, 'name' => 255, 'rawType' => 64,
    'sport' => 16, 'creator' => 255, 'description' => 5000,
];

/** Campos numéricos del resumen (pueden ser null). */
const NUMBER_FIELDS = [
    'distanceKm', 'startTime', 'elapsedSec', 'movingSec', 'paceSecKm', 'speedKmh',
    'elevGain', 'elevLoss', 'eleMin', 'eleMax', 'hrAvg', 'hrMax', 'cadAvg', 'cadMax',
    'tempAvg', 'tempMin', 'tempMax', 'powerAvg', 'powerMax', 'pointCount',
];

/** Tipos de actividad válidos (mismas claves que gpx.js). */
const SPORTS = ['run', 'ride', 'walk', 'hike', 'swim', 'other'];

/* ------------------------------------------------------------------
 * 2. Funciones de apoyo
 * ------------------------------------------------------------------ */

/**
 * Limpia el resumen enviado por el navegador: solo acepta los campos
 * conocidos y con el tipo correcto. Devuelve null si no es válido.
 */
function sanitizeSummary($raw): ?array
{
    if (!is_array($raw)) {
        return null;
    }
    $summary = [];
    foreach (TEXT_FIELDS as $key => $maxLength) {
        $value = $raw[$key] ?? null;
        $summary[$key] = is_string($value) ? mb_substr(trim($value), 0, $maxLength) : null;
    }
    foreach (NUMBER_FIELDS as $key) {
        $value = $raw[$key] ?? null;
        $summary[$key] = is_int($value) || is_float($value) ? $value : null;
    }

    if ($summary['distanceKm'] === null || $summary['distanceKm'] < 0) {
        return null;
    }
    if (!in_array($summary['sport'], SPORTS, true)) {
        $summary['sport'] = 'other';
    }
    if ($summary['name'] === null || $summary['name'] === '') {
        $summary['name'] = 'Entrenamiento';
    }
    if ($summary['startTime'] !== null) {
        $summary['startTime'] = (int) $summary['startTime'];
    }
    return $summary;
}

/**
 * Comprueba que el archivo sea XML cuyo elemento raíz es <gpx>, leyendo
 * solo el inicio (XMLReader no carga el archivo completo en memoria).
 */
function isGpxFile(string $path): bool
{
    $reader = new XMLReader();
    if (!@$reader->open($path, null, LIBXML_NONET)) {
        return false;
    }
    $isGpx = false;
    while (@$reader->read()) {
        if ($reader->nodeType === XMLReader::ELEMENT) {
            $isGpx = strtolower($reader->localName) === 'gpx';
            break;
        }
    }
    $reader->close();
    return $isGpx;
}

/** Ruta del archivo GPX de un entrenamiento. */
function gpxPath(string $id): string
{
    return config()['gpx_dir'] . '/' . $id . '.gpx';
}

/** Busca un entrenamiento por id (o responde 404). */
function findWorkout(PDO $pdo, string $id): array
{
    $stmt = $pdo->prepare('SELECT id, file_name, summary_json FROM workouts WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        fail(404, 'Este entrenamiento no existe o fue eliminado.');
    }
    return $row;
}

/** Convierte una fila de la tabla en el resumen que usa el navegador. */
function rowToSummary(array $row): array
{
    $summary = json_decode($row['summary_json'], true) ?: [];
    $summary['id'] = $row['id'];
    return $summary;
}

/* ------------------------------------------------------------------
 * 3. Acciones
 * ------------------------------------------------------------------ */

/** GET: lista de entrenamientos. */
function listWorkouts(PDO $pdo): void
{
    $rows = $pdo->query(
        'SELECT id, summary_json FROM workouts ORDER BY COALESCE(start_time, imported_at) DESC'
    )->fetchAll();
    respond(200, array_map('rowToSummary', $rows));
}

/** GET ?id=X: resumen de un entrenamiento. */
function getWorkout(PDO $pdo, string $id): void
{
    respond(200, rowToSummary(findWorkout($pdo, $id)));
}

/** GET ?id=X&file=1: descarga el archivo .gpx original. */
function sendGpxFile(PDO $pdo, string $id): void
{
    $row = findWorkout($pdo, $id);
    $path = gpxPath($id);
    if (!is_file($path)) {
        fail(404, 'No se encontró el archivo GPX de este entrenamiento.');
    }
    // Nombre de descarga seguro (sin comillas ni saltos de línea)
    $downloadName = preg_replace('/[\x00-\x1F"\\\\\/]/u', '_', $row['file_name']) ?: 'entrenamiento.gpx';

    header('Content-Type: application/gpx+xml; charset=utf-8');
    header('Content-Length: ' . filesize($path));
    header("Content-Disposition: attachment; filename=\"entrenamiento.gpx\"; filename*=UTF-8''" . rawurlencode($downloadName));
    header('Cache-Control: private, max-age=3600');
    readfile($path);
    exit;
}

/** POST: guarda un entrenamiento nuevo (archivo + resumen). */
function createWorkout(PDO $pdo): void
{
    $c = config();

    // Si el archivo supera post_max_size, PHP descarta todo el formulario
    if (empty($_FILES) && empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        fail(413, 'El archivo es demasiado grande para el servidor.');
    }

    // 1. Archivo
    $upload = $_FILES['gpx'] ?? null;
    if (!$upload || is_array($upload['error'])) {
        fail(400, 'No se recibió el archivo GPX.');
    }
    if ($upload['error'] === UPLOAD_ERR_INI_SIZE || $upload['error'] === UPLOAD_ERR_FORM_SIZE
        || $upload['size'] > $c['max_upload_mb'] * 1024 * 1024) {
        fail(413, "El archivo supera el máximo de {$c['max_upload_mb']} MB.");
    }
    if ($upload['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($upload['tmp_name'])) {
        fail(400, 'No se pudo recibir el archivo (código ' . $upload['error'] . ').');
    }
    if (!isGpxFile($upload['tmp_name'])) {
        fail(400, 'El archivo no tiene formato GPX.');
    }

    // 2. Resumen calculado en el navegador por gpx.js
    $summary = sanitizeSummary(json_decode($_POST['summary'] ?? '', true));
    if ($summary === null) {
        fail(400, 'Los datos del entrenamiento no son válidos.');
    }
    if ($summary['fileName'] === null || $summary['fileName'] === '') {
        $summary['fileName'] = mb_substr((string) $upload['name'], 0, 255) ?: 'entrenamiento.gpx';
    }

    // 3. Duplicados: misma hora de inicio y misma distancia (±10 m)
    if ($summary['startTime'] !== null) {
        $stmt = $pdo->prepare('SELECT id FROM workouts WHERE start_time = ? AND ABS(distance_km - ?) < 0.01');
        $stmt->execute([$summary['startTime'], $summary['distanceKm']]);
        if ($stmt->fetch()) {
            fail(409, 'Este entrenamiento ya estaba importado.', ['duplicate' => true]);
        }
    }

    // 4. Guarda el archivo y la fila (si algo falla, no deja restos)
    $id = bin2hex(random_bytes(8));
    $summary['importedAt'] = (int) round(microtime(true) * 1000);

    if (!is_dir($c['gpx_dir']) && !mkdir($c['gpx_dir'], 0775, true) && !is_dir($c['gpx_dir'])) {
        throw new RuntimeException('No se pudo crear la carpeta de archivos GPX.');
    }
    if (!move_uploaded_file($upload['tmp_name'], gpxPath($id))) {
        throw new RuntimeException('No se pudo guardar el archivo GPX en el servidor.');
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO workouts (id, name, sport, start_time, distance_km, imported_at, file_name, summary_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $id,
            $summary['name'],
            $summary['sport'],
            $summary['startTime'],
            $summary['distanceKm'],
            $summary['importedAt'],
            $summary['fileName'],
            json_encode($summary, JSON_UNESCAPED_UNICODE),
        ]);
    } catch (Throwable $e) {
        @unlink(gpxPath($id));
        throw $e;
    }

    respond(201, ['id' => $id] + $summary);
}

/** DELETE ?id=X: elimina el entrenamiento y su archivo. */
function deleteWorkout(PDO $pdo, string $id): void
{
    findWorkout($pdo, $id);
    $pdo->prepare('DELETE FROM workouts WHERE id = ?')->execute([$id]);
    if (is_file(gpxPath($id))) {
        @unlink(gpxPath($id));
    }
    respond(200, ['ok' => true]);
}

/* ------------------------------------------------------------------
 * 4. Enrutamiento
 * ------------------------------------------------------------------ */

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $id = isset($_GET['id']) ? (string) $_GET['id'] : null;

    // Los id son 16 caracteres hexadecimales: cualquier otra cosa se rechaza
    if ($id !== null && !preg_match('/^[a-f0-9]{16}$/', $id)) {
        fail(400, 'Identificador de entrenamiento no válido.');
    }

    $pdo = db();

    switch ($method) {
        case 'GET':
            if ($id === null) {
                listWorkouts($pdo);
            } elseif (isset($_GET['file'])) {
                sendGpxFile($pdo, $id);
            } else {
                getWorkout($pdo, $id);
            }
            break;

        case 'POST':
            createWorkout($pdo);
            break;

        case 'DELETE':
            if ($id === null) {
                fail(400, 'Falta el identificador del entrenamiento.');
            }
            deleteWorkout($pdo, $id);
            break;

        default:
            header('Allow: GET, POST, DELETE');
            fail(405, 'Método no permitido.');
    }
} catch (PDOException $e) {
    error_log('[calculadora-running] ' . $e->getMessage());
    fail(500, 'No se pudo conectar con la base de datos. Verifica que MySQL esté encendido en XAMPP.'
        . (config()['debug'] ? ' (' . $e->getMessage() . ')' : ''));
} catch (Throwable $e) {
    error_log('[calculadora-running] ' . $e->getMessage());
    fail(500, 'Error del servidor.' . (config()['debug'] ? ' (' . $e->getMessage() . ')' : ''));
}
