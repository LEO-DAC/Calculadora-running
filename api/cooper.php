<?php
/**
 * =====================================================================
 * Archivo: api/cooper.php
 * Descripción: Resultados del test de Cooper (12 minutos).
 *
 *   GET    cooper.php              alumno: sus tests (por fecha)
 *          cooper.php?athlete=X    entrenador: tests de un alumno suyo
 *   POST   cooper.php (JSON con "action")
 *          create { athleteId?, date, distanceM, sex, age, surface,
 *                   hrAvg, hrMax, rpe, tempC, feelings }
 *                   athleteId solo lo envía el entrenador
 *          update { id, ...mismos campos }
 *   DELETE cooper.php?id=X
 *
 * Permisos: el alumno registra, edita y borra sus tests; el entrenador
 * puede hacer lo mismo con los de sus alumnos (suele medirlos él).
 * Los cálculos (VO2máx, categoría) se hacen en el navegador (cooper.js).
 * =====================================================================
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

const SURFACES = ['pista', 'calle', 'caminadora', 'otro'];

/** Fila de la base -> JSON. */
function cooperToJson(array $r): array
{
    $int = function ($v) { return $v === null ? null : (int) $v; };
    return [
        'id'        => (int) $r['id'],
        'userId'    => (int) $r['user_id'],
        'date'      => $r['date'],
        'distanceM' => (int) $r['distance_m'],
        'sex'       => $r['sex'],
        'age'       => $int($r['age']),
        'surface'   => $r['surface'],
        'hrAvg'     => $int($r['hr_avg']),
        'hrMax'     => $int($r['hr_max']),
        'rpe'       => $int($r['rpe']),
        'tempC'     => $int($r['temp_c']),
        'feelings'  => $r['feelings'],
        'createdAt' => (int) $r['created_at'],
    ];
}

/** Id del alumno sobre el que actúa el usuario (él mismo o un alumno del entrenador). */
function targetAthlete(PDO $pdo, array $user, $athleteId): int
{
    if ($user['role'] === 'athlete') {
        return (int) $user['id'];
    }
    $stmt = $pdo->prepare("SELECT id FROM users WHERE id = ? AND coach_id = ? AND role = 'athlete'");
    $stmt->execute([(int) $athleteId, $user['id']]);
    $id = $stmt->fetchColumn();
    if (!$id) {
        fail(404, 'Alumno no encontrado.');
    }
    return (int) $id;
}

/** Test por id, si el usuario puede modificarlo (o error 404). */
function findTest(PDO $pdo, array $user, int $id): array
{
    $stmt = $pdo->prepare('SELECT t.*, u.coach_id FROM cooper_tests t JOIN users u ON u.id = t.user_id WHERE t.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    $mine = $row && ((int) $row['user_id'] === (int) $user['id']
                     || ($user['role'] === 'coach' && (int) $row['coach_id'] === (int) $user['id']));
    if (!$mine) {
        fail(404, 'Test no encontrado.');
    }
    return $row;
}

/** Entero opcional dentro de un rango (null si viene vacío; error si no es válido). */
function optionalInt($value, int $min, int $max, string $label): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_int($value) || $value < $min || $value > $max) {
        fail(400, "$label debe estar entre $min y $max.");
    }
    return $value;
}

/** Valida los campos de un test y los devuelve listos para la base. */
function validateTest(array $d): array
{
    $date = (string) ($d['date'] ?? '');
    $dt = DateTime::createFromFormat('!Y-m-d', $date);
    if (!$dt || $dt->format('Y-m-d') !== $date) {
        fail(400, 'Elige la fecha del test.');
    }
    if ($dt > new DateTime('tomorrow')) {
        fail(400, 'La fecha del test no puede ser futura.');
    }
    $distance = $d['distanceM'] ?? null;
    if (!is_int($distance) || $distance < 200 || $distance > 6000) {
        fail(400, 'La distancia debe estar entre 200 y 6000 metros.');
    }
    $sex = $d['sex'] ?? null;
    if ($sex !== null && $sex !== 'M' && $sex !== 'F') {
        fail(400, 'Sexo no válido.');
    }
    $surface = $d['surface'] ?? 'pista';
    if (!in_array($surface, SURFACES, true)) {
        fail(400, 'Superficie no válida.');
    }
    return [
        'date'       => $date,
        'distance_m' => $distance,
        'sex'        => $sex,
        'age'        => optionalInt($d['age'] ?? null, 8, 99, 'La edad'),
        'surface'    => $surface,
        'hr_avg'     => optionalInt($d['hrAvg'] ?? null, 40, 240, 'La FC media'),
        'hr_max'     => optionalInt($d['hrMax'] ?? null, 40, 240, 'La FC máxima'),
        'rpe'        => optionalInt($d['rpe'] ?? null, 1, 10, 'El esfuerzo percibido'),
        'temp_c'     => optionalInt($d['tempC'] ?? null, -30, 55, 'La temperatura'),
        'feelings'   => cleanText($d['feelings'] ?? '', 2000),
    ];
}

runApi(function (string $method) {
    $user = requireUser();
    $pdo = db();

    if ($method === 'GET') {
        $athleteId = targetAthlete($pdo, $user, $_GET['athlete'] ?? 0);
        $stmt = $pdo->prepare('SELECT * FROM cooper_tests WHERE user_id = ? ORDER BY date, id');
        $stmt->execute([$athleteId]);
        respond(200, array_map('cooperToJson', $stmt->fetchAll()));
    }

    if ($method === 'POST') {
        $data = readJson();
        $action = $data['action'] ?? '';

        if ($action === 'create') {
            $athleteId = targetAthlete($pdo, $user, $data['athleteId'] ?? 0);
            $t = validateTest($data);
            $pdo->prepare('INSERT INTO cooper_tests (user_id, date, distance_m, sex, age, surface, hr_avg, hr_max,
                                                     rpe, temp_c, feelings, created_by, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$athleteId, $t['date'], $t['distance_m'], $t['sex'], $t['age'], $t['surface'], $t['hr_avg'],
                           $t['hr_max'], $t['rpe'], $t['temp_c'], $t['feelings'], $user['id'], nowMs()]);
            $id = (int) $pdo->lastInsertId();
        } elseif ($action === 'update') {
            $id = (int) findTest($pdo, $user, (int) ($data['id'] ?? 0))['id'];
            $t = validateTest($data);
            $pdo->prepare('UPDATE cooper_tests SET date = ?, distance_m = ?, sex = ?, age = ?, surface = ?, hr_avg = ?,
                                                   hr_max = ?, rpe = ?, temp_c = ?, feelings = ?
                           WHERE id = ?')
                ->execute([$t['date'], $t['distance_m'], $t['sex'], $t['age'], $t['surface'], $t['hr_avg'],
                           $t['hr_max'], $t['rpe'], $t['temp_c'], $t['feelings'], $id]);
        } else {
            fail(400, 'Acción no válida.');
        }

        $stmt = $pdo->prepare('SELECT * FROM cooper_tests WHERE id = ?');
        $stmt->execute([$id]);
        respond($action === 'create' ? 201 : 200, cooperToJson($stmt->fetch()));
    }

    if ($method === 'DELETE') {
        $test = findTest($pdo, $user, (int) ($_GET['id'] ?? 0));
        $pdo->prepare('DELETE FROM cooper_tests WHERE id = ?')->execute([$test['id']]);
        respond(200, ['ok' => true]);
    }
});
