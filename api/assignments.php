<?php
/**
 * =====================================================================
 * Archivo: api/assignments.php
 * Descripción: Entrenamientos asignados (el plan de cada alumno).
 *
 *   GET    assignments.php              alumno: su plan completo
 *          assignments.php?athlete=X    entrenador: plan de un alumno suyo
 *   POST   assignments.php (JSON con "action")
 *          create { athleteIds[], date, tipo, name, note, steps }  (entrenador)
 *          status { id, status: 'done' | 'pending' }               (alumno)
 *   DELETE assignments.php?id=X        entrenador: quita una asignación
 *
 * Al asignar se guarda una COPIA de la estructura: si después se edita o
 * borra la plantilla, el plan del alumno no cambia.
 * =====================================================================
 */

declare(strict_types=1);

require __DIR__ . '/db.php';
require __DIR__ . '/structure.php';

/** Convierte una fila en el objeto que usa el navegador. */
function assignmentToJson(array $row): array
{
    return [
        'id'        => (int) $row['id'],
        'athleteId' => (int) $row['athlete_id'],
        'date'      => $row['date'],
        'tipo'      => $row['tipo'],
        'name'      => $row['name'],
        'note'      => $row['note'],
        'steps'     => json_decode($row['steps_json'], true),
        'status'    => $row['status'],
        'doneAt'    => $row['done_at'] !== null ? (int) $row['done_at'] : null,
    ];
}

/** Plan de un alumno ordenado por fecha. */
function listFor(PDO $pdo, int $athleteId): void
{
    $stmt = $pdo->prepare('SELECT * FROM assignments WHERE athlete_id = ? ORDER BY date, id');
    $stmt->execute([$athleteId]);
    respond(200, array_map('assignmentToJson', $stmt->fetchAll()));
}

/** ¿El alumno pertenece al entrenador? */
function isCoachOf(PDO $pdo, int $coachId, int $athleteId): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM users WHERE id = ? AND coach_id = ? AND role = 'athlete'");
    $stmt->execute([$athleteId, $coachId]);
    return (bool) $stmt->fetchColumn();
}

runApi(function (string $method) {
    $user = requireUser();
    $pdo = db();
    $userId = (int) $user['id'];
    $isCoach = $user['role'] === 'coach';

    if ($method === 'GET') {
        if (!$isCoach) {
            listFor($pdo, $userId);
        }
        $athleteId = (int) ($_GET['athlete'] ?? 0);
        if (!isCoachOf($pdo, $userId, $athleteId)) fail(404, 'Ese alumno no existe.');
        listFor($pdo, $athleteId);
    }

    if ($method === 'POST') {
        $data = readJson();
        $action = $data['action'] ?? '';

        if ($action === 'create') {
            if (!$isCoach) fail(403, 'Solo el entrenador puede asignar entrenamientos.');
            $tipo = $data['tipo'] ?? '';
            $name = cleanText($data['name'] ?? '', 120);
            $date = (string) ($data['date'] ?? '');
            $steps = validateSteps($data['steps'] ?? null);
            $ids = array_values(array_unique(array_map('intval', (array) ($data['athleteIds'] ?? []))));

            if (!in_array($tipo, WORKOUT_TYPES, true)) fail(400, 'Tipo de entrenamiento no válido.');
            if ($name === '') fail(400, 'Escribe el nombre del entrenamiento.');
            $parsed = DateTime::createFromFormat('!Y-m-d', $date);
            if (!$parsed || $parsed->format('Y-m-d') !== $date) fail(400, 'Elige una fecha válida.');
            if (!$steps) fail(400, 'La estructura del entrenamiento no es válida.');
            if (!$ids) fail(400, 'Selecciona al menos un alumno.');
            foreach ($ids as $id) {
                if (!isCoachOf($pdo, $userId, $id)) fail(404, 'Uno de los alumnos no existe.');
            }

            $stmt = $pdo->prepare('INSERT INTO assignments (athlete_id, coach_id, date, tipo, name, note, steps_json, created_at)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $json = json_encode($steps, JSON_UNESCAPED_UNICODE);
            $note = cleanText($data['note'] ?? '', 1000);
            $pdo->beginTransaction();
            foreach ($ids as $id) {
                $stmt->execute([$id, $userId, $date, $tipo, $name, $note, $json, nowMs()]);
            }
            $pdo->commit();
            respond(201, ['ok' => true, 'count' => count($ids)]);
        }

        if ($action === 'status') {
            // Solo el alumno marca su propio entrenamiento como hecho / pendiente
            $status = $data['status'] ?? '';
            if (!in_array($status, ['done', 'pending'], true)) fail(400, 'Estado no válido.');
            $stmt = $pdo->prepare('UPDATE assignments SET status = ?, done_at = ? WHERE id = ? AND athlete_id = ?');
            $stmt->execute([$status, $status === 'done' ? nowMs() : null, (int) ($data['id'] ?? 0), $userId]);
            $check = $pdo->prepare('SELECT * FROM assignments WHERE id = ? AND athlete_id = ?');
            $check->execute([(int) ($data['id'] ?? 0), $userId]);
            $row = $check->fetch();
            if (!$row) fail(404, 'Ese entrenamiento no existe.');
            respond(200, assignmentToJson($row));
        }

        fail(400, 'Acción no válida.');
    }

    if ($method === 'DELETE') {
        if (!$isCoach) fail(403, 'Solo el entrenador puede quitar entrenamientos del plan.');
        $stmt = $pdo->prepare('DELETE a FROM assignments a JOIN users u ON u.id = a.athlete_id
                               WHERE a.id = ? AND u.coach_id = ?');
        $stmt->execute([(int) ($_GET['id'] ?? 0), $userId]);
        if ($stmt->rowCount() === 0) fail(404, 'Ese entrenamiento no existe.');
        respond(200, ['ok' => true]);
    }
});
