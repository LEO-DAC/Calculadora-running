<?php
/**
 * =====================================================================
 * Archivo: api/config.php
 * Descripción: Configuración del backend (base de datos y archivos).
 *
 * Los valores por defecto funcionan con una instalación estándar de
 * XAMPP (usuario "root" sin contraseña). Para otro servidor (p. ej. al
 * publicar la app en internet) NO edites este archivo: crea
 * "api/config.local.php" con solo los valores que cambian; ese archivo
 * no se sube a GitHub (.gitignore). Ejemplo:
 *
 *     <?php
 *     return [
 *         'db_user' => 'usuario',
 *         'db_pass' => 'contraseña-segura',
 *         'debug'   => false,
 *     ];
 * =====================================================================
 */

$config = [
    // Conexión a MySQL / MariaDB
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'calculadora_running',
    'db_user' => 'root',
    'db_pass' => '',

    // Crea la base de datos y las tablas automáticamente si no existen.
    // (En hostings donde no se permite CREATE DATABASE, ponlo en false y
    // ejecuta api/schema.sql manualmente.)
    'auto_create' => true,

    // Carpeta donde se guardan los archivos .gpx originales
    'gpx_dir' => __DIR__ . '/storage/gpx',

    // Tamaño máximo de un archivo GPX (MB). PHP también lo limita con
    // upload_max_filesize y post_max_size en php.ini (40 MB en XAMPP).
    'max_upload_mb' => 40,

    // true: los errores incluyen el detalle técnico (útil en local).
    // Al publicar en internet, ponlo en false.
    'debug' => true,
];

// Valores locales que sobrescriben los anteriores (opcional)
$localFile = __DIR__ . '/config.local.php';
if (is_file($localFile)) {
    $config = array_merge($config, require $localFile);
}

return $config;
