<?php
/**
 * =====================================================================
 * Archivo: api/workouts.php
 * Descripción: API de entrenamientos importados. Guarda los datos en
 * MySQL y los archivos .gpx originales en api/storage/gpx/.
 *
 * Requiere sesión iniciada. Permisos:
 *   - Alumno: ve, importa y elimina SUS entrenamientos.
 *   - Entrenador: ve (solo lectura) los entrenamientos de SUS alumnos.
 *
 * Rutas (todas responden JSON, salvo la descarga del archivo):
 *   GET    workouts.php              -> alumno: sus resúmenes
 *   GET    workouts.php?user=X       -> entrenador: resúmenes del alumno X
 *   GET    workouts.php?id=X         -> resumen de un entrenamiento
 *   GET    workouts.php?id=X&file=1  -> archivo .gpx original
 *   POST   workouts.php              -> alumno: guarda uno nuevo (multipart/form-data)
 *            campos: gpx (archivo), summary (JSON calculado por gpx.js)
 *   DELETE workouts.php?id=X         -> alumno: elimina uno suyo y su archivo
 *
 * Códigos de error: 400 datos no válidos, 401 sin sesión, 403 sin permiso,
 * 404 no existe, 409 duplicado, 413 archivo muy grande, 500 error interno.
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

/**
 * Busca un entrenamiento que el usuario puede ver: el suyo o, si es
 * entrenador, el de uno de sus alumnos. Si no, responde 404 (no se
 * revela si existe).
 */
function findVisibleWorkout(PDO $pdo, array $user, string $id): array
{
    $stmt = $pdo->prepare('SELECT w.*, u.coach_id FROM workouts w JOIN users u ON u.id = w.user_id WHERE w.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    $userId = (int) $user['id'];
    if (!$row || ((int) $row['user_id'] !== $userId && (int) $row['coach_id'] !== $userId)) {
        fail(404, 'Este entrenamiento no existe o fue eliminado.');
    }
    return $row;
}

/** Convierte una fila de la tabla en el resumen que usa el navegador. */
function rowToSummary(array $row): array
{
    $summary = json_decode($row['summary_json'], true) ?: [];
    $summary['id'] = $row['id'];
    $summary['userId'] = (int) $row['user_id'];
    return $summary;
}

/* ------------------------------------------------------------------
 * 3. Acciones
 * ------------------------------------------------------------------ */

/** GET: lista de entrenamientos de un alumno. */
function listWorkouts(PDO $pdo, array $user): void
{
    $ownerId = (int) $user['id'];
    if ($user['role'] === 'coach') {
        $ownerId = (int) ($_GET['user'] ?? 0);
        $check = $pdo->prepare("SELECT 1 FROM users WHERE id = ? AND coach_id = ? AND role = 'athlete'");
        $check->execute([$ownerId, $user['id']]);
        if (!$check->fetchColumn()) {
            fail(404, 'Ese alumno no existe.');
        }
    }
    $stmt = $pdo->prepare('SELECT id, user_id, summary_json FROM workouts WHERE user_id = ?
                           ORDER BY COALESCE(start_time, imported_at) DESC');
    $stmt->execute([$ownerId]);
    respond(200, array_map('rowToSummary', $stmt->fetchAll()));
}

/** GET ?id=X&file=1: descarga el archivo .gpx original. */
function sendGpxFile(array $row): void
{
    $path = gpxPath($row['id']);
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

/** POST: guarda un entrenamiento nuevo (archivo + resumen) del alumno. */
function createWorkout(PDO $pdo, array $user): void
{
    $c = config();
    $userId = (int) $user['id'];

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

    // 3. Duplicados del mismo alumno: misma hora de inicio y distancia (±10 m)
    if ($summary['startTime'] !== null) {
        $stmt = $pdo->prepare('SELECT id FROM workouts WHERE user_id = ? AND start_time = ? AND ABS(distance_km - ?) < 0.01');
        $stmt->execute([$userId, $summary['startTime'], $summary['distanceKm']]);
        if ($stmt->fetch()) {
            fail(409, 'Este entrenamiento ya estaba importado.', ['duplicate' => true]);
        }
    }

    // 4. Guarda el archivo y la fila (si algo falla, no deja restos)
    $id = bin2hex(random_bytes(8));
    $summary['importedAt'] = nowMs();

    if (!is_dir($c['gpx_dir']) && !mkdir($c['gpx_dir'], 0775, true) && !is_dir($c['gpx_dir'])) {
        throw new RuntimeException('No se pudo crear la carpeta de archivos GPX.');
    }
    if (!move_uploaded_file($upload['tmp_name'], gpxPath($id))) {
        throw new RuntimeException('No se pudo guardar el archivo GPX en el servidor.');
    }

    try {
        $pdo->prepare('INSERT INTO workouts (id, user_id, name, sport, start_time, distance_km, imported_at, file_name, summary_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([
                $id, $userId, $summary['name'], $summary['sport'], $summary['startTime'],
                $summary['distanceKm'], $summary['importedAt'], $summary['fileName'],
                json_encode($summary, JSON_UNESCAPED_UNICODE),
            ]);
    } catch (Throwable $e) {
        @unlink(gpxPath($id));
        throw $e;
    }

    respond(201, ['id' => $id, 'userId' => $userId] + $summary);
}

/* ------------------------------------------------------------------
 * 4. Enrutamiento
 * ------------------------------------------------------------------ */

runApi(function (string $method) {
    $user = requireUser();
    $pdo = db();
    $id = isset($_GET['id']) ? (string) $_GET['id'] : null;

    // Los id son 16 caracteres hexadecimales: cualquier otra cosa se rechaza
    if ($id !== null && !preg_match('/^[a-f0-9]{16}$/', $id)) {
        fail(400, 'Identificador de entrenamiento no válido.');
    }

    if ($method === 'GET') {
        if ($id === null) {
            listWorkouts($pdo, $user);
        }
        $row = findVisibleWorkout($pdo, $user, $id);
        if (isset($_GET['file'])) {
            sendGpxFile($row);
        }
        respond(200, rowToSummary($row));
    }

    if ($method === 'POST') {
        if ($user['role'] !== 'athlete') {
            fail(403, 'Solo los alumnos importan entrenamientos.');
        }
        createWorkout($pdo, $user);
    }

    if ($method === 'DELETE') {
        if ($id === null) {
            fail(400, 'Falta el identificador del entrenamiento.');
        }
        $row = findVisibleWorkout($pdo, $user, $id);
        if ((int) $row['user_id'] !== (int) $user['id']) {
            fail(403, 'Solo el alumno puede eliminar sus entrenamientos.');
        }
        $pdo->prepare('DELETE FROM workouts WHERE id = ?')->execute([$id]);
        @unlink(gpxPath($id));
        respond(200, ['ok' => true]);
    }
});
