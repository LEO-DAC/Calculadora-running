/**
 * =====================================================================
 * Archivo: structure.js
 * Descripción: Estructura de los entrenamientos de running que crea el
 * entrenador (repeticiones, fondo, fartlek, tempo, cuestas, rodaje).
 * Se usa en Crear entreno, Biblioteca y Mi plan.
 *
 * Una estructura es una lista de bloques (mismo formato que valida
 * api/structure.php):
 *   - Bloque simple: { k, v, u, p, z }
 *       k: 'warm' | 'steady' | 'cool'   v: cantidad   u: 'km'|'m'|'min'|'s'
 *       p: ritmo "m:ss" por km           z: zona 1–5
 *   - Repeticiones: { k: 'rep', n, steps: [trabajo (k 'work'), recuperación (k 'rec')] }
 *
 * Expone el objeto global `Structure`.
 * =====================================================================
 */

(function () {
  'use strict';

  const esc = UI.esc;

  /** Tipos de entrenamiento: etiqueta e icono. El color sale de CSS (--t-<tipo>). */
  const TYPES = {
    rep:     { label: 'Repeticiones', emoji: '⚡' },
    fondo:   { label: 'Fondo',        emoji: '🛣️' },
    fartlek: { label: 'Fartlek',      emoji: '🎲' },
    tempo:   { label: 'Tempo',        emoji: '🔥' },
    cuestas: { label: 'Cuestas',      emoji: '⛰️' },
    suave:   { label: 'Rodaje suave', emoji: '🌿' }
  };

  /** Clases de bloque: etiqueta y color en las barras de estructura. */
  const KINDS = {
    warm:   { label: 'Calentamiento', color: 'var(--k-easy)' },
    work:   { label: 'Trabajo',       color: 'var(--t-rep)' },
    rec:    { label: 'Recuperación',  color: 'var(--t-cuestas)' },
    cool:   { label: 'Enfriamiento',  color: 'var(--k-easy)' },
    steady: { label: 'Continuo',      color: 'var(--accent)' }
  };

  /** Bloques nuevos que agrega el editor. */
  const NEW_BLOCKS = {
    warm:   { k: 'warm', v: 2, u: 'km', p: '6:00', z: 2 },
    steady: { k: 'steady', v: 5, u: 'km', p: '5:30', z: 3 },
    rep:    { k: 'rep', n: 4, steps: [{ k: 'work', v: 400, u: 'm', p: '4:00', z: 5 },
                                      { k: 'rec', v: 200, u: 'm', p: '6:30', z: 1 }] },
    cool:   { k: 'cool', v: 1, u: 'km', p: '6:15', z: 1 }
  };

  /** Copia profunda de un objeto simple. */
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** Información de un tipo (o del rodaje si no existe). */
  function type(key) {
    return TYPES[key] || TYPES.suave;
  }

  /** ¿Es un ritmo válido "m:ss"? */
  function isValidPace(text) {
    return /^\d{1,2}:[0-5]\d$/.test(String(text || ''));
  }

  /** "5:30" -> 330 segundos por km. */
  function paceSec(text) {
    const parts = String(text || '6:00').split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0) || 360;
  }

  /**
   * Distancia (km) y duración (s) estimadas de un paso. Si el paso es por
   * tiempo, la distancia se estima con el ritmo, y viceversa.
   */
  function stepMetrics(step) {
    const pace = paceSec(step.p);
    const v = Number(step.v) || 0;
    let km;
    let sec;
    if (step.u === 'km') { km = v; sec = km * pace; }
    else if (step.u === 'm') { km = v / 1000; sec = km * pace; }
    else if (step.u === 'min') { sec = v * 60; km = sec / pace; }
    else { sec = v; km = sec / pace; }
    return { km: km || 0, sec: sec || 0 };
  }

  /** Expande las repeticiones en la lista de pasos que se corren. */
  function flatten(steps) {
    const out = [];
    (steps || []).forEach(function (block) {
      if (block.k === 'rep') {
        for (let i = 0; i < block.n; i++) block.steps.forEach(function (s) { out.push(s); });
      } else {
        out.push(block);
      }
    });
    return out;
  }

  /** Distancia (km) y duración (s) totales estimadas. */
  function totals(steps) {
    return flatten(steps).reduce(function (acc, s) {
      const m = stepMetrics(s);
      acc.km += m.km;
      acc.sec += m.sec;
      return acc;
    }, { km: 0, sec: 0 });
  }

  /** Cantidad con unidad: "800 m", "2 km", "10′", "45″". */
  function formatValue(step) {
    if (step.u === 'km') return step.v + ' km';
    if (step.u === 'm') return step.v + ' m';
    if (step.u === 'min') return step.v + '′';
    return step.v + '″';
  }

  /** "800 m @ 4:10 /km · Z5" */
  function stepText(step) {
    return formatValue(step) + ' @ ' + step.p + ' /km · Z' + step.z;
  }

  /** Lista legible de los bloques (HTML). */
  function listHtml(steps) {
    return '<ul class="steps-list">' + (steps || []).map(function (s) {
      if (s.k === 'rep') {
        return '<li><i style="background:' + KINDS.work.color + '"></i><span><b>' + esc(s.n) + ' ×</b> ( ' +
               esc(stepText(s.steps[0])) + ' <span class="muted">+</span> ' + esc(stepText(s.steps[1])) + ' )</span></li>';
      }
      const kind = KINDS[s.k] || KINDS.steady;
      return '<li><i style="background:' + kind.color + '"></i><span><b>' + kind.label + '</b> · ' +
             esc(stepText(s)) + '</span></li>';
    }).join('') + '</ul>';
  }

  /**
   * Barras de la estructura (SVG): ancho = duración de cada paso,
   * alto = zona de intensidad. El bloque continuo toma el color del tipo.
   * @param {Array} steps
   * @param {number} [height=44]
   * @param {string} [tipo]
   */
  function svg(steps, height, tipo) {
    const h = height || 44;
    const flat = flatten(steps);
    const total = flat.reduce(function (sum, s) { return sum + stepMetrics(s).sec; }, 0) || 1;
    let x = 0;
    let rects = '';
    flat.forEach(function (s) {
      const w = stepMetrics(s).sec / total * 300;
      const bh = Math.max(6, (s.z / 5) * h);
      const color = s.k === 'steady' && tipo ? 'var(--t-' + tipo + ')' : (KINDS[s.k] || KINDS.steady).color;
      rects += '<rect x="' + x.toFixed(2) + '" y="' + (h - bh).toFixed(1) + '" width="' +
               Math.max(0.6, w - 0.8).toFixed(2) + '" height="' + bh.toFixed(1) + '" rx="2" style="fill:' + color + '"/>';
      x += w;
    });
    return '<svg class="struct-svg" viewBox="0 0 300 ' + h + '" preserveAspectRatio="none" style="height:' + h +
           'px" role="img" aria-label="Estructura del entrenamiento por zonas">' + rects + '</svg>';
  }

  /** Insignia del tipo: punto de color + icono + nombre. */
  function badge(tipo) {
    const t = type(tipo);
    return '<span class="type-badge" style="--type:var(--t-' + esc(tipo) + ');--type-bg:var(--t-' + esc(tipo) + '-bg)">' +
           '<i></i>' + t.emoji + ' ' + t.label + '</span>';
  }

  window.Structure = {
    TYPES: TYPES,
    KINDS: KINDS,
    NEW_BLOCKS: NEW_BLOCKS,
    clone: clone,
    type: type,
    isValidPace: isValidPace,
    totals: totals,
    flatten: flatten,
    stepText: stepText,
    listHtml: listHtml,
    svg: svg,
    badge: badge
  };
})();
