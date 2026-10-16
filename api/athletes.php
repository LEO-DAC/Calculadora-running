<?php
/**
 * =====================================================================
 * Archivo: api/athletes.php
 * Descripción: Alumnos del entrenador (solo rol entrenador).
 *
 *   GET    athletes.php        -> alumnos con datos para el panel:
 *            recent:      entrenamientos de los últimos 100 días [{t, km}]
 *            last:        último entrenamiento {name, t, km} (o null)
 *            assignments: asignaciones desde hace 40 días [{date, status}]
 *   POST   athletes.php        (JSON con "action")
 *            create { name, email, password, goal }
 *            update { id, name, goal, coachNote, password? }
 *   DELETE athletes.php?id=X   -> elimina al alumno, sus entrenamientos, foto
 *                                 (y archivos GPX) y su plan
 * =====================================================================
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

const MIN_PASSWORD = 8;

/** Colores de avatar para alumnos nuevos (contraste suficiente con texto blanco). */
const AVATAR_COLORS = ['#0a66c2', '#8e44ad', '#c75c00', '#1f8a3b', '#4b47c4', '#1c7f95', '#c62f25', '#6b5b45'];

/** Busca un alumno del entrenador (o error 404). */
function findAthlete(PDO $pdo, int $coachId, int $id): array
{
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND coach_id = ? AND role = 'athlete'");
    $stmt->execute([$id, $coachId]);
    $athlete = $stmt->fetch();
    if (!$athlete) {
        fail(404, 'Ese alumno no existe.');
    }
    return $athlete;
}

/** Lista de alumnos con los datos del panel del entrenador. */
function listAthletes(PDO $pdo, int $coachId): void
{
    $stmt = $pdo->prepare("SELECT * FROM users WHERE coach_id = ? AND role = 'athlete' ORDER BY name");
    $stmt->execute([$coachId]);
    $athletes = $stmt->fetchAll();

    $since = nowMs() - 100 * 86400000;
    $recentStmt = $pdo->prepare('SELECT start_time AS t, distance_km AS km FROM workouts
                                 WHERE user_id = ? AND start_time >= ? ORDER BY start_time');
    $lastStmt = $pdo->prepare('SELECT name, COALESCE(start_time, imported_at) AS t, distance_km AS km
                               FROM workouts WHERE user_id = ? ORDER BY COALESCE(start_time, imported_at) DESC LIMIT 1');
    $planStmt = $pdo->prepare('SELECT DATE_FORMAT(date, \'%Y-%m-%d\') AS date, status FROM assignments
                               WHERE athlete_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 40 DAY)');

    $result = [];
    foreach ($athletes as $a) {
        $recentStmt->execute([$a['id'], $since]);
        $lastStmt->execute([$a['id']]);
        $planStmt->execute([$a['id']]);
        $last = $lastStmt->fetch();

        $result[] = publicUser($a) + [
            'recent' => array_map(function ($r) {
                return ['t' => (int) $r['t'], 'km' => (float) $r['km']];
            }, $recentStmt->fetchAll()),
            'last' => $last ? ['name' => $last['name'], 't' => (int) $last['t'], 'km' => (float) $last['km']] : null,
            'assignments' => $planStmt->fetchAll(),
        ];
    }
    respond(200, $result);
}

runApi(function (string $method) {
    $coach = requireRole('coach');
    $pdo = db();
    $coachId = (int) $coach['id'];

    if ($method === 'GET') {
        listAthletes($pdo, $coachId);
    }

    if ($method === 'POST') {
        $data = readJson();
        $action = $data['action'] ?? '';
        $name = cleanText($data['name'] ?? '', 120);
        $goal = cleanText($data['goal'] ?? '', 255);
        $password = (string) ($data['password'] ?? '');
        if ($name === '') fail(400, 'Escribe el nombre del alumno.');

        if ($action === 'create') {
            $email = strtolower(cleanText($data['email'] ?? '', 190));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Escribe un correo válido.');
            if (mb_strlen($password) < MIN_PASSWORD) fail(400, 'La contraseña debe tener al menos ' . MIN_PASSWORD . ' caracteres.');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            try {
                $pdo->prepare("INSERT INTO users (name, email, password_hash, role, coach_id, goal, color, created_at)
                               VALUES (?, ?, ?, 'athlete', ?, ?, ?, ?)")
                    ->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $coachId, $goal,
                               AVATAR_COLORS[$count % count(AVATAR_COLORS)], nowMs()]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') fail(409, 'Ya existe una cuenta con ese correo.');
                throw $e;
            }
            $athlete = findAthlete($pdo, $coachId, (int) $pdo->lastInsertId());
            respond(201, publicUser($athlete));
        }

        if ($action === 'update') {
            $athlete = findAthlete($pdo, $coachId, (int) ($data['id'] ?? 0));
            $note = cleanText($data['coachNote'] ?? '', 1000);
            $pdo->prepare('UPDATE users SET name = ?, goal = ?, coach_note = ? WHERE id = ?')
                ->execute([$name, $goal, $note, $athlete['id']]);
            // Nueva contraseña (opcional): para cuando el alumno la olvida
            if ($password !== '') {
                if (mb_strlen($password) < MIN_PASSWORD) fail(400, 'La contraseña debe tener al menos ' . MIN_PASSWORD . ' caracteres.');
                $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                    ->execute([password_hash($password, PASSWORD_DEFAULT), $athlete['id']]);
            }
            respond(200, publicUser(findAthlete($pdo, $coachId, (int) $athlete['id'])));
        }

        fail(400, 'Acción no válida.');
    }

    if ($method === 'DELETE') {
        $athlete = findAthlete($pdo, $coachId, (int) ($_GET['id'] ?? 0));
        // Los archivos GPX no los borra la base de datos: se eliminan aquí
        $ids = $pdo->prepare('SELECT id FROM workouts WHERE user_id = ?');
        $ids->execute([$athlete['id']]);
        foreach ($ids->fetchAll(PDO::FETCH_COLUMN) as $workoutId) {
            @unlink(config()['gpx_dir'] . '/' . $workoutId . '.gpx');
        }
        @unlink(config()['avatar_dir'] . '/' . (int) $athlete['id'] . '.jpg');
        // ON DELETE CASCADE elimina sus entrenamientos, asignaciones y tests de Cooper
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$athlete['id']]);
        respond(200, ['ok' => true]);
    }
});
