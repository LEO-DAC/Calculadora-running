<?php
/**
 * =====================================================================
 * Archivo: api/structure.php
 * Descripción: Validación de la estructura de un entrenamiento de
 * running (la que arma el entrenador en "Crear entreno") y plantillas
 * iniciales de la biblioteca.
 *
 * Una estructura es una lista de bloques:
 *   - Bloque simple: { k, v, u, p, z }
 *       k: 'warm' (calentamiento), 'steady' (continuo), 'cool' (enfriamiento)
 *       v: cantidad (> 0)      u: unidad 'km' | 'm' | 'min' | 's'
 *       p: ritmo "m:ss" /km    z: zona de intensidad 1–5
 *   - Repeticiones: { k: 'rep', n: veces, steps: [trabajo, recuperación] }
 *       donde trabajo tiene k = 'work' y recuperación k = 'rec'.
 * =====================================================================
 */

declare(strict_types=1);

/** Tipos de entrenamiento (mismas claves que structure.js). */
const WORKOUT_TYPES = ['rep', 'fondo', 'fartlek', 'tempo', 'cuestas', 'suave'];

/**
 * Valida un paso simple. Devuelve el paso limpio o null si no es válido.
 * @param mixed $step
 * @param string[] $kinds Valores permitidos para "k".
 */
function validateStep($step, array $kinds): ?array
{
    if (!is_array($step) || !in_array($step['k'] ?? null, $kinds, true)) {
        return null;
    }
    $v = $step['v'] ?? null;
    $u = $step['u'] ?? null;
    $p = $step['p'] ?? null;
    $z = $step['z'] ?? null;

    if ((!is_int($v) && !is_float($v)) || $v <= 0 || $v > 100000) return null;
    if (!in_array($u, ['km', 'm', 'min', 's'], true)) return null;
    if (!is_string($p) || !preg_match('/^\d{1,2}:[0-5]\d$/', $p)) return null;
    if (!is_int($z) || $z < 1 || $z > 5) return null;

    return ['k' => $step['k'], 'v' => $v, 'u' => $u, 'p' => $p, 'z' => $z];
}

/**
 * Valida una estructura completa (máximo 30 bloques, 50 repeticiones).
 * @param mixed $steps
 * @return array|null Estructura limpia o null si no es válida.
 */
function validateSteps($steps): ?array
{
    if (!is_array($steps) || !array_is_list($steps) || count($steps) < 1 || count($steps) > 30) {
        return null;
    }
    $clean = [];
    foreach ($steps as $block) {
        if (is_array($block) && ($block['k'] ?? null) === 'rep') {
            $n = $block['n'] ?? null;
            $inner = $block['steps'] ?? null;
            if (!is_int($n) || $n < 1 || $n > 50 || !is_array($inner) || count($inner) !== 2) {
                return null;
            }
            $work = validateStep($inner[0] ?? null, ['work']);
            $rec = validateStep($inner[1] ?? null, ['rec']);
            if (!$work || !$rec) {
                return null;
            }
            $clean[] = ['k' => 'rep', 'n' => $n, 'steps' => [$work, $rec]];
        } else {
            $step = validateStep($block, ['warm', 'steady', 'cool']);
            if (!$step) {
                return null;
            }
            $clean[] = $step;
        }
    }
    return $clean;
}

/**
 * Copia las plantillas iniciales (api/default-templates.json) a la
 * biblioteca de un entrenador nuevo.
 */
function seedTemplates(PDO $pdo, int $coachId): void
{
    $defaults = json_decode((string) file_get_contents(__DIR__ . '/default-templates.json'), true) ?: [];
    $stmt = $pdo->prepare(
        'INSERT INTO templates (coach_id, tipo, name, description, steps_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $time = nowMs();
    foreach ($defaults as $i => $t) {
        $steps = validateSteps($t['steps'] ?? null);
        if ($steps && in_array($t['tipo'] ?? '', WORKOUT_TYPES, true)) {
            $stmt->execute([$coachId, $t['tipo'], $t['name'], $t['description'] ?? '',
                            json_encode($steps, JSON_UNESCAPED_UNICODE), $time + $i]);
        }
    }
}
