<?php
/**
 * =====================================================================
 * Archivo: api/auth.php
 * Descripción: Inicio de sesión y cuenta del usuario.
 *
 *   GET  auth.php  -> { user, coach, needsSetup }
 *        user: usuario con sesión (o null); coach: su entrenador (alumnos);
 *        needsSetup: true si aún no existe ninguna cuenta.
 *   POST auth.php  (JSON con "action")
 *        setup    { name, email, password }  crea la PRIMERA cuenta
 *                                              (entrenador) e inicia sesión
 *        login    { email, password }
 *        logout
 *        password { current, password }       cambia la contraseña
 *
 * Las contraseñas se guardan con password_hash() (bcrypt), nunca en texto.
 * =====================================================================
 */

declare(strict_types=1);

require __DIR__ . '/db.php';
require __DIR__ . '/structure.php';

/** Longitud mínima de las contraseñas. */
const MIN_PASSWORD = 8;

/** Respuesta con el usuario actual y su entrenador. */
function sessionInfo(?array $user): array
{
    $coach = null;
    if ($user && $user['coach_id'] !== null) {
        $stmt = db()->prepare('SELECT id, name, color FROM users WHERE id = ?');
        $stmt->execute([$user['coach_id']]);
        $row = $stmt->fetch();
        if ($row) {
            $coach = ['id' => (int) $row['id'], 'name' => $row['name'], 'color' => $row['color']];
        }
    }
    $needsSetup = !$user && (int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0;
    return ['user' => $user ? publicUser($user) : null, 'coach' => $coach, 'needsSetup' => $needsSetup];
}

/** Guarda el usuario en la sesión (con un id de sesión nuevo). */
function signIn(int $userId): void
{
    startSession();
    session_regenerate_id(true); // evita la fijación de sesión
    $_SESSION['uid'] = $userId;
    session_write_close();
}

runApi(function (string $method) {
    if ($method === 'GET') {
        respond(200, sessionInfo(currentUser()));
    }
    if ($method !== 'POST') {
        return;
    }

    $data = readJson();
    $pdo = db();

    switch ($data['action'] ?? '') {
        case 'setup':
            // Solo se permite si todavía no hay ninguna cuenta
            if ((int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) {
                fail(409, 'La aplicación ya está configurada. Inicia sesión.');
            }
            $name = cleanText($data['name'] ?? '', 120);
            $email = strtolower(cleanText($data['email'] ?? '', 190));
            $password = (string) ($data['password'] ?? '');
            if ($name === '') fail(400, 'Escribe tu nombre.');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Escribe un correo válido.');
            if (mb_strlen($password) < MIN_PASSWORD) fail(400, 'La contraseña debe tener al menos ' . MIN_PASSWORD . ' caracteres.');

            $pdo->beginTransaction();
            $pdo->prepare('INSERT INTO users (name, email, password_hash, role, color, created_at)
                           VALUES (?, ?, ?, \'coach\', \'#d6245a\', ?)')
                ->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), nowMs()]);
            $id = (int) $pdo->lastInsertId();
            seedTemplates($pdo, $id);
            $pdo->commit();

            signIn($id);
            $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
            $stmt->execute([$id]);
            respond(201, sessionInfo($stmt->fetch()));

        case 'login':
            $email = strtolower(cleanText($data['email'] ?? '', 190));
            $password = (string) ($data['password'] ?? '');
            $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            if (!$user || !password_verify($password, $user['password_hash'])) {
                usleep(400000); // frena los intentos repetidos
                fail(401, 'Correo o contraseña incorrectos.');
            }
            signIn((int) $user['id']);
            respond(200, sessionInfo($user));

        case 'logout':
            startSession();
            $_SESSION = [];
            session_destroy();
            respond(200, ['ok' => true]);

        case 'password':
            $user = requireUser();
            $new = (string) ($data['password'] ?? '');
            if (!password_verify((string) ($data['current'] ?? ''), $user['password_hash'])) {
                fail(400, 'La contraseña actual no es correcta.');
            }
            if (mb_strlen($new) < MIN_PASSWORD) {
                fail(400, 'La nueva contraseña debe tener al menos ' . MIN_PASSWORD . ' caracteres.');
            }
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
            respond(200, ['ok' => true]);

        default:
            fail(400, 'Acción no válida.');
    }
});
