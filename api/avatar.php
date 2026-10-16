<?php
/**
 * =====================================================================
 * Archivo: api/avatar.php
 * Descripción: Foto de perfil de los usuarios.
 *
 *   GET    avatar.php?id=X   -> la imagen JPEG del usuario X. Pueden verla:
 *                               él mismo, su entrenador y sus alumnos.
 *   POST   avatar.php        -> sube/reemplaza la foto propia
 *                               (multipart/form-data, campo "photo")
 *   DELETE avatar.php        -> quita la foto propia
 *
 * El navegador recorta y reduce la foto a un JPEG cuadrado de 256 px
 * antes de subirla (auth.js); el servidor solo acepta JPEG pequeños.
 * Los archivos se guardan en api/storage/avatars/<id>.jpg (bloqueada para
 * acceso directo). La URL pública lleva ?v=<fecha> (ver avatarUrl()).
 * =====================================================================
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

/** Tamaño máximo del archivo y de cada lado de la imagen. */
const AVATAR_MAX_BYTES = 1024 * 1024;
const AVATAR_MAX_SIDE = 1024;

/** Ruta del archivo de la foto de un usuario. */
function avatarPath(int $userId): string
{
    return config()['avatar_dir'] . '/' . $userId . '.jpg';
}

/** ¿El usuario actual puede ver la foto de $target? */
function canSeeAvatar(array $me, array $target): bool
{
    return (int) $me['id'] === (int) $target['id']
        || ($target['coach_id'] !== null && (int) $target['coach_id'] === (int) $me['id'])  // mi alumno
        || ($me['coach_id'] !== null && (int) $me['coach_id'] === (int) $target['id']);     // mi entrenador
}

runApi(function (string $method) {
    $me = requireUser();
    $pdo = db();

    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([(int) ($_GET['id'] ?? 0)]);
        $target = $stmt->fetch();
        if (!$target || !canSeeAvatar($me, $target) || empty($target['avatar_at'])
            || !is_file(avatarPath((int) $target['id']))) {
            fail(404, 'No hay foto.');
        }
        header('Content-Type: image/jpeg');
        header('X-Content-Type-Options: nosniff');
        // La URL cambia (?v=) con cada foto nueva: se puede guardar en caché
        header('Cache-Control: private, max-age=31536000, immutable');
        header('Content-Length: ' . filesize(avatarPath((int) $target['id'])));
        readfile(avatarPath((int) $target['id']));
        exit;
    }

    if ($method === 'POST') {
        $upload = $_FILES['photo'] ?? null;
        if (!$upload || is_array($upload['error']) || $upload['error'] !== UPLOAD_ERR_OK
            || !is_uploaded_file($upload['tmp_name'])) {
            fail(400, 'No se recibió la foto.');
        }
        if ($upload['size'] > AVATAR_MAX_BYTES) {
            fail(413, 'La foto es demasiado grande.');
        }
        $info = @getimagesize($upload['tmp_name']);
        if (!$info || $info[2] !== IMAGETYPE_JPEG || $info[0] > AVATAR_MAX_SIDE || $info[1] > AVATAR_MAX_SIDE) {
            fail(400, 'La foto no es una imagen válida.');
        }

        $dir = config()['avatar_dir'];
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('No se pudo crear la carpeta de fotos.');
        }
        if (!move_uploaded_file($upload['tmp_name'], avatarPath((int) $me['id']))) {
            throw new RuntimeException('No se pudo guardar la foto.');
        }
        $pdo->prepare('UPDATE users SET avatar_at = ? WHERE id = ?')->execute([nowMs(), $me['id']]);

        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$me['id']]);
        respond(200, publicUser($stmt->fetch()));
    }

    if ($method === 'DELETE') {
        @unlink(avatarPath((int) $me['id']));
        $pdo->prepare('UPDATE users SET avatar_at = NULL WHERE id = ?')->execute([$me['id']]);
        $me['avatar_at'] = null;
        respond(200, publicUser($me));
    }
});
