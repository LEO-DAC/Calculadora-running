-- =====================================================================
-- Archivo: api/schema.sql
-- Descripción: Estructura de la base de datos.
--
-- En local (XAMPP) no hace falta ejecutarlo: api/db.php crea las tablas
-- automáticamente. Sirve para crearlas a mano en un hosting.
-- (Cada sentencia termina en ";" al final de la línea: db.php las separa así.)
-- =====================================================================

-- Usuarios: entrenadores y alumnos. Cada alumno pertenece a un entrenador.
CREATE TABLE IF NOT EXISTS users (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name           VARCHAR(120)  NOT NULL,
    email          VARCHAR(190)  NOT NULL,
    password_hash  VARCHAR(255)  NOT NULL COMMENT 'password_hash() de PHP (bcrypt)',
    role           ENUM('coach','athlete') NOT NULL,
    coach_id       INT UNSIGNED  NULL COMMENT 'Entrenador del alumno',
    goal           VARCHAR(255)  NOT NULL DEFAULT '' COMMENT 'Objetivo del alumno',
    coach_note     VARCHAR(1000) NOT NULL DEFAULT '' COMMENT 'Mensaje del entrenador al alumno',
    color          CHAR(7)       NOT NULL DEFAULT '#0a66c2' COMMENT 'Color del avatar',
    created_at     BIGINT        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_coach (coach_id),
    CONSTRAINT fk_users_coach FOREIGN KEY (coach_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Entrenamientos importados (el .gpx original está en api/storage/gpx/<id>.gpx)
CREATE TABLE IF NOT EXISTS workouts (
    id            CHAR(16)      NOT NULL,
    user_id       INT UNSIGNED  NOT NULL COMMENT 'Alumno dueño del entrenamiento',
    name          VARCHAR(255)  NOT NULL,
    sport         VARCHAR(16)   NOT NULL,
    start_time    BIGINT        NULL COMMENT 'Inicio (ms desde 1970, UTC)',
    distance_km   DOUBLE        NOT NULL,
    imported_at   BIGINT        NOT NULL COMMENT 'Fecha de importación (ms desde 1970, UTC)',
    file_name     VARCHAR(255)  NOT NULL,
    summary_json  LONGTEXT      NOT NULL COMMENT 'Resumen calculado por gpx.js',
    PRIMARY KEY (id),
    KEY idx_workouts_user_start (user_id, start_time),
    CONSTRAINT fk_workouts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Biblioteca de plantillas de entrenamiento de cada entrenador
CREATE TABLE IF NOT EXISTS templates (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    coach_id     INT UNSIGNED  NOT NULL,
    tipo         VARCHAR(16)   NOT NULL COMMENT 'rep, fondo, fartlek, tempo, cuestas, suave',
    name         VARCHAR(120)  NOT NULL,
    description  VARCHAR(1000) NOT NULL DEFAULT '',
    steps_json   TEXT          NOT NULL COMMENT 'Estructura de bloques (ver structure.php)',
    created_at   BIGINT        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_templates_coach (coach_id),
    CONSTRAINT fk_templates_coach FOREIGN KEY (coach_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Entrenamientos asignados a un alumno para una fecha (su plan)
CREATE TABLE IF NOT EXISTS assignments (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    athlete_id   INT UNSIGNED  NOT NULL,
    coach_id     INT UNSIGNED  NULL,
    date         DATE          NOT NULL,
    tipo         VARCHAR(16)   NOT NULL,
    name         VARCHAR(120)  NOT NULL,
    note         VARCHAR(1000) NOT NULL DEFAULT '' COMMENT 'Indicaciones para el alumno',
    steps_json   TEXT          NOT NULL COMMENT 'Copia de la estructura al asignarlo',
    status       ENUM('pending','done') NOT NULL DEFAULT 'pending',
    done_at      BIGINT        NULL,
    created_at   BIGINT        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_assignments_athlete_date (athlete_id, date),
    CONSTRAINT fk_assignments_athlete FOREIGN KEY (athlete_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_assignments_coach FOREIGN KEY (coach_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intentos de inicio de sesión fallidos (límite contra adivinar contraseñas).
-- "attempt_key" es un hash del correo o de la IP; se borran solos al pasar la ventana.
CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_key   CHAR(64)      NOT NULL COMMENT 'sha256 de "email:..." o "ip:..."',
    attempted_at  BIGINT        NOT NULL,
    KEY idx_login_attempts (attempt_key, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
