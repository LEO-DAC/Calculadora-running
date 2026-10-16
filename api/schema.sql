-- =====================================================================
-- Archivo: api/schema.sql
-- Descripción: Estructura de la base de datos de entrenamientos.
--
-- En local (XAMPP) no hace falta ejecutarlo: api/db.php crea la base de
-- datos y la tabla automáticamente la primera vez. Sirve para crearla a
-- mano en un hosting donde la creación automática no esté permitida.
-- =====================================================================

CREATE TABLE IF NOT EXISTS workouts (
    -- Identificador generado por el servidor (16 caracteres hexadecimales)
    id            CHAR(16)      NOT NULL,
    -- Columnas para listar, ordenar y detectar duplicados
    name          VARCHAR(255)  NOT NULL,
    sport         VARCHAR(16)   NOT NULL,
    start_time    BIGINT        NULL COMMENT 'Inicio de la actividad (ms desde 1970, UTC)',
    distance_km   DOUBLE        NOT NULL,
    imported_at   BIGINT        NOT NULL COMMENT 'Fecha de importación (ms desde 1970, UTC)',
    -- Nombre original del archivo; el archivo está en api/storage/gpx/<id>.gpx
    file_name     VARCHAR(255)  NOT NULL,
    -- Resumen completo calculado por gpx.js (JSON): ritmo, FC, desnivel...
    summary_json  LONGTEXT      NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
