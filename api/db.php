<?php
/**
 * =====================================================================
 * Archivo: api/db.php
 * Descripción: Conexión a la base de datos (PDO) y utilidades comunes
 * de la API: respuestas JSON y manejo de errores.
 * =====================================================================
 */

declare(strict_types=1);

/**
 * Devuelve la configuración (api/config.php + api/config.local.php).
 */
function config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

/**
 * Devuelve la conexión PDO (una sola por petición). La primera vez que
 * se usa en un servidor nuevo, crea la base de datos y la tabla si
 * 'auto_create' está activo.
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

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // errores como excepciones
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,                  // consultas preparadas reales
    ];
    $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $c['db_host'], $c['db_port']);
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], $options);

    if ($c['auto_create']) {
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$c['db_name']}`
                    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `{$c['db_name']}`");
        $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
    } else {
        $pdo->exec("USE `{$c['db_name']}`");
    }

    return $pdo;
}

/**
 * Envía una respuesta JSON y termina la ejecución.
 */
function respond(int $status, $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Envía un error en JSON ({ "error": "mensaje" }) y termina.
 */
function fail(int $status, string $message, array $extra = []): void
{
    respond($status, ['error' => $message] + $extra);
}
