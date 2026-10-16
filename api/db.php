<?php
/**
 * =====================================================================
 * Archivo: api/db.php
 * Descripción: Base común de la API.
 *   1. Configuración y conexión a MySQL (PDO).
 *   2. Migraciones: crea/actualiza las tablas automáticamente.
 *   3. Sesiones e inicio de sesión: usuario actual y permisos por rol.
 *   4. Utilidades: respuestas JSON, lectura del cuerpo, manejo de errores.
 * =====================================================================
 */

declare(strict_types=1);

/** Versión de la estructura de la base de datos (ver migrate()). */
const SCHEMA_VERSION = 3;

/* ------------------------------------------------------------------
 * 1. Configuración y conexión
 * ------------------------------------------------------------------ */

/** Configuración (api/config.php + api/config.local.php). */
function config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

/**
 * Conexión PDO (una por petición). Crea la base de datos si no existe
 * ('auto_create') y aplica las migraciones pendientes.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $c = config();
    if (!preg_match('/^\w+$/', $c['db_name'])) {
        throw new RuntimeException('Nombre de base de datos no válido en la configuración.');
    }

    $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $c['db_host'], $c['db_port']);
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // errores como excepciones
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,                  // consultas preparadas reales
    ]);

    if ($c['auto_create']) {
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$c['db_name']}`
                    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    }
    $pdo->exec("USE `{$c['db_name']}`");
    migrate($pdo);

    return $pdo;
}

/* ------------------------------------------------------------------
 * 2. Migraciones
 * ------------------------------------------------------------------ */

/**
 * Lleva la base de datos a SCHEMA_VERSION. La versión se guarda en la
 * tabla app_meta, así que cada migración se ejecuta una sola vez.
 *
 *  v1: tabla workouts sin usuarios (versión anterior de la app).
 *  v2: usuarios, plantillas y asignaciones. Los entrenamientos de v1 no
 *      tenían dueño y se eliminan (decisión del proyecto).
 *  v3: tabla login_attempts (límite de intentos de inicio de sesión).
 */
function migrate(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS app_meta (
                    name  VARCHAR(64)  NOT NULL PRIMARY KEY,
                    value VARCHAR(255) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

    $version = (int) ($pdo->query("SELECT value FROM app_meta WHERE name = 'schema_version'")->fetchColumn() ?: 0);
    if ($version >= SCHEMA_VERSION) {
        return;
    }

    if ($version < 2) {
        // Tabla workouts de v1 (sin columna user_id): se borra con sus archivos
        $hasWorkouts = (bool) $pdo->query("SHOW TABLES LIKE 'workouts'")->fetchColumn();
        if ($hasWorkouts && !$pdo->query("SHOW COLUMNS FROM workouts LIKE 'user_id'")->fetchColumn()) {
            foreach ($pdo->query('SELECT id FROM workouts')->fetchAll(PDO::FETCH_COLUMN) as $id) {
                @unlink(config()['gpx_dir'] . '/' . $id . '.gpx');
            }
            $pdo->exec('DROP TABLE workouts');
        }
    }
    // Todas las tablas usan CREATE TABLE IF NOT EXISTS: crea las que falten
    runSqlFile($pdo, __DIR__ . '/schema.sql');

    $pdo->prepare("REPLACE INTO app_meta (name, value) VALUES ('schema_version', ?)")
        ->execute([(string) SCHEMA_VERSION]);
}

/** Ejecuta un archivo .sql con varias sentencias (separadas por ";" a fin de línea). */
function runSqlFile(PDO $pdo, string $path): void
{
    $statements = preg_split('/;\s*(?:\r?\n|$)/', (string) file_get_contents($path));
    foreach ($statements as $sql) {
        // Quita comentarios de línea y omite bloques vacíos
        $sql = trim(preg_replace('/^\s*--.*$/m', '', $sql));
        if ($sql !== '') {
            $pdo->exec($sql);
        }
    }
}

/* ------------------------------------------------------------------
 * 3. Sesión y usuarios
 * ------------------------------------------------------------------ */

/** Inicia la sesión PHP con una cookie segura (30 días). */
function startSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $lifetime = 60 * 60 * 24 * 30;
    ini_set('session.gc_maxlifetime', (string) $lifetime);
    session_name('crsession');
    session_set_cookie_params([
        'lifetime' => $lifetime,
        'path'     => '/',
        'httponly' => true,     // JavaScript no puede leer la cookie
        'samesite' => 'Lax',    // no se envía en peticiones de otros sitios
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    session_start();
}

/**
 * Usuario con sesión iniciada (o null). La sesión se cierra para
 * escritura enseguida para no bloquear peticiones en paralelo.
 */
function currentUser(): ?array
{
    static $user = false;
    if ($user !== false) {
        return $user;
    }
    startSession();
    $id = $_SESSION['uid'] ?? null;
    session_write_close();

    $user = null;
    if (is_int($id)) {
        $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch() ?: null;
    }
    return $user;
}

/** Usuario actual o error 401. */
function requireUser(): array
{
    $user = currentUser();
    if (!$user) {
        fail(401, 'Tu sesión terminó. Inicia sesión de nuevo.');
    }
    return $user;
}

/** Usuario actual con un rol concreto ('coach' o 'athlete') o error 403. */
function requireRole(string $role): array
{
    $user = requireUser();
    if ($user['role'] !== $role) {
        fail(403, $role === 'coach'
            ? 'Esta función es solo para entrenadores.'
            : 'Esta función es solo para alumnos.');
    }
    return $user;
}

/** Datos públicos de un usuario (nunca incluye la contraseña). */
function publicUser(array $u): array
{
    return [
        'id'        => (int) $u['id'],
        'name'      => $u['name'],
        'email'     => $u['email'],
        'role'      => $u['role'],
        'coachId'   => $u['coach_id'] !== null ? (int) $u['coach_id'] : null,
        'goal'      => $u['goal'],
        'coachNote' => $u['coach_note'],
        'color'     => $u['color'],
        'createdAt' => (int) $u['created_at'],
    ];
}

/** Hora actual en milisegundos (como Date.now() en JavaScript). */
function nowMs(): int
{
    return (int) round(microtime(true) * 1000);
}

/* ------------------------------------------------------------------
 * 4. Utilidades de la API
 * ------------------------------------------------------------------ */

/** Envía una respuesta JSON y termina la ejecución. */
function respond(int $status, $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Envía un error en JSON ({ "error": "mensaje" }) y termina. */
function fail(int $status, string $message, array $extra = []): void
{
    respond($status, ['error' => $message] + $extra);
}

/** Lee el cuerpo JSON de la petición (o error 400). */
function readJson(): array
{
    $data = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($data)) {
        fail(400, 'Datos no válidos.');
    }
    return $data;
}

/** Texto recortado a una longitud máxima ('' si no es texto). */
function cleanText($value, int $max): string
{
    return is_string($value) ? mb_substr(trim($value), 0, $max) : '';
}

/**
 * Ejecuta el código de un endpoint con el manejo de errores común.
 *
 * Protección CSRF: toda petición que modifica datos debe incluir la
 * cabecera "X-Requested-With" (la agrega api.js). Un formulario de otro
 * sitio no puede enviarla, y la cookie de sesión es SameSite=Lax.
 */
function runApi(callable $handler): void
{
    try {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method !== 'GET' && empty($_SERVER['HTTP_X_REQUESTED_WITH'])) {
            fail(403, 'Petición no permitida.');
        }
        $handler($method);
        fail(405, 'Método no permitido.');
    } catch (PDOException $e) {
        error_log('[calculadora-running] ' . $e->getMessage());
        fail(500, 'No se pudo conectar con la base de datos. Verifica que MySQL esté encendido en XAMPP.'
            . (config()['debug'] ? ' (' . $e->getMessage() . ')' : ''));
    } catch (Throwable $e) {
        error_log('[calculadora-running] ' . $e->getMessage());
        fail(500, 'Error del servidor.' . (config()['debug'] ? ' (' . $e->getMessage() . ')' : ''));
    }
}
