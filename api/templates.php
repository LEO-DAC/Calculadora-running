<?php
/**
 * =====================================================================
 * Archivo: api/templates.php
 * Descripción: Biblioteca de plantillas del entrenador (solo entrenador).
 *
 *   GET    templates.php        -> plantillas del entrenador
 *   POST   templates.php        -> crea una { tipo, name, description, steps }
 *   DELETE templates.php?id=X   -> elimina una plantilla
 * =====================================================================
 */

declare(strict_types=1);

require __DIR__ . '/db.php';
require __DIR__ . '/structure.php';

/** Convierte una fila en el objeto que usa el navegador. */
function templateToJson(array $row): array
{
    return [
        'id'          => (int) $row['id'],
        'tipo'        => $row['tipo'],
        'name'        => $row['name'],
        'description' => $row['description'],
        'steps'       => json_decode($row['steps_json'], true),
        'createdAt'   => (int) $row['created_at'],
    ];
}

runApi(function (string $method) {
    $coach = requireRole('coach');
    $pdo = db();

    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT * FROM templates WHERE coach_id = ? ORDER BY created_at');
        $stmt->execute([$coach['id']]);
        respond(200, array_map('templateToJson', $stmt->fetchAll()));
    }

    if ($method === 'POST') {
        $data = readJson();
        $tipo = $data['tipo'] ?? '';
        $name = cleanText($data['name'] ?? '', 120);
        $steps = validateSteps($data['steps'] ?? null);
        if (!in_array($tipo, WORKOUT_TYPES, true)) fail(400, 'Tipo de entrenamiento no válido.');
        if ($name === '') fail(400, 'Escribe el nombre del entrenamiento.');
        if (!$steps) fail(400, 'La estructura del entrenamiento no es válida.');

        $pdo->prepare('INSERT INTO templates (coach_id, tipo, name, description, steps_json, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$coach['id'], $tipo, $name, cleanText($data['description'] ?? '', 1000),
                       json_encode($steps, JSON_UNESCAPED_UNICODE), nowMs()]);
        $stmt = $pdo->prepare('SELECT * FROM templates WHERE id = ?');
        $stmt->execute([$pdo->lastInsertId()]);
        respond(201, templateToJson($stmt->fetch()));
    }

    if ($method === 'DELETE') {
        $stmt = $pdo->prepare('DELETE FROM templates WHERE id = ? AND coach_id = ?');
        $stmt->execute([(int) ($_GET['id'] ?? 0), $coach['id']]);
        if ($stmt->rowCount() === 0) fail(404, 'Esa plantilla no existe.');
        respond(200, ['ok' => true]);
    }
});
