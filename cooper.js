/**
 * =====================================================================
 * Archivo: cooper.js
 * Descripción: Sección "Test de Cooper" (alumno y entrenador).
 *
 *  El test de Cooper consiste en correr la mayor distancia posible en
 *  12 minutos. Esta sección permite:
 *   - Registrar cada test: fecha, metros (o vueltas de pista + metros),
 *     superficie, FC media/máxima, esfuerzo percibido (1-10),
 *     temperatura, sexo y edad (para la tabla de referencia) y sensaciones.
 *   - Ver indicadores: último resultado, mejor marca, VO2máx estimado,
 *     categoría según la tabla de Cooper y mejora desde el primer test.
 *   - Gráficas de la evolución de la distancia y del VO2máx.
 *   - Comparar dos tests cualesquiera.
 *   - Historial con detalle, edición y eliminación.
 *   - Información de qué es la prueba, cómo hacerla y tabla de referencia.
 *
 *  Alumno: sus propios tests. Entrenador: elige un alumno (chips arriba)
 *  y puede registrar tests en su nombre (suele medirlos él).
 *
 *  Cálculos:
 *    VO2máx (ml/kg/min) ≈ (metros − 504.9) / 44.73      (Cooper, 1968)
 *    ritmo (s/km) = 720 s / km recorridos
 *
 * Datos: api/cooper.php. Depende de: Api, UI, Charts, App.
 * =====================================================================
 */

(function () {
  'use strict';

  const API_URL = 'api/cooper.php';
  const TEST_SECONDS = 12 * 60;
  const TRACK_LAP_M = 400;
  const esc = UI.esc;
  const root = document.getElementById('cooper-root');

  const SURFACES = { pista: 'Pista', calle: 'Calle / parque', caminadora: 'Caminadora', otro: 'Otro' };

  /**
   * Tabla de referencia del test de Cooper (metros en 12 min) por sexo y
   * edad. Cada fila: [edad mín., edad máx., excelente (>), bueno (≥),
   * promedio (≥), bajo (≥)]; por debajo del último valor: muy bajo.
   */
  const NORMS = {
    M: [[13, 14, 2700, 2400, 2200, 2100], [15, 16, 2800, 2500, 2300, 2200], [17, 19, 3000, 2700, 2500, 2300],
        [20, 29, 2800, 2400, 2200, 1600], [30, 39, 2700, 2300, 1900, 1500], [40, 49, 2500, 2100, 1700, 1400],
        [50, 120, 2400, 2000, 1600, 1300]],
    F: [[13, 14, 2000, 1900, 1600, 1500], [15, 16, 2100, 2000, 1700, 1600], [17, 19, 2300, 2100, 1800, 1700],
        [20, 29, 2700, 2200, 1800, 1500], [30, 39, 2500, 2000, 1700, 1400], [40, 49, 2300, 1900, 1500, 1200],
        [50, 120, 2200, 1700, 1400, 1100]]
  };

  /** Categorías de la tabla (de mejor a peor) con su estilo. */
  const LEVELS = [
    { key: 'exc', label: 'Excelente' },
    { key: 'good', label: 'Bueno' },
    { key: 'avg', label: 'Promedio' },
    { key: 'low', label: 'Bajo' },
    { key: 'poor', label: 'Muy bajo' }
  ];

  const state = {
    athletes: [],       // alumnos del entrenador
    athleteId: null,    // alumno elegido (entrenador)
    tests: [],          // tests del usuario mostrado (por fecha)
    cmpA: null,         // ids de los tests a comparar
    cmpB: null,
    normSex: 'M',       // tabla de referencia que se muestra
    charts: []
  };

  /* ------------------------------------------------------------------
   * 1. Cálculos
   * ------------------------------------------------------------------ */

  /** VO2máx estimado (ml/kg/min) a partir de los metros en 12 minutos. */
  function vo2(meters) {
    return Math.max(0, (meters - 504.9) / 44.73);
  }

  /** Ritmo medio (s/km) del test. */
  function paceSec(meters) {
    return TEST_SECONDS / (meters / 1000);
  }

  /** Velocidad media (km/h). */
  function speed(meters) {
    return meters / 1000 * (3600 / TEST_SECONDS);
  }

  /** Fila de la tabla para un sexo y edad (o null). */
  function normRow(sex, age) {
    if (!NORMS[sex] || !age) return null;
    return NORMS[sex].find(function (r) { return age >= r[0] && age <= r[1]; }) || null;
  }

  /** Categoría de un test según la tabla (o null si falta sexo/edad o es menor de 13). */
  function level(test) {
    const row = normRow(test.sex, test.age);
    if (!row) return null;
    const d = test.distanceM;
    const i = d > row[2] ? 0 : d >= row[3] ? 1 : d >= row[4] ? 2 : d >= row[5] ? 3 : 4;
    return LEVELS[i];
  }

  /** Insignia de categoría. */
  function levelBadge(test) {
    const lv = level(test);
    return lv ? '<span class="cooper-level is-' + lv.key + '">' + lv.label + '</span>'
              : '<span class="muted" title="Agrega sexo y edad para ver la categoría">—</span>';
  }

  const fmtM = function (m) { return Math.round(m).toLocaleString('es-MX') + ' m'; };
  const fmtVo2 = function (v) { return v.toFixed(1); };
  const dateOf = function (t) { return UI.parseIso(t.date); };
  const shortDate = function (t) {
    const d = dateOf(t);
    return d.getDate() + ' ' + UI.MONTHS[d.getMonth()].toLowerCase() + ' ' + String(d.getFullYear()).slice(2);
  };

  /** Diferencia en metros con signo y color (verde si mejora). */
  function meterDelta(before, after) {
    const diff = after - before;
    if (!diff) return '<span class="delta">= 0 m</span>';
    return '<span class="delta ' + (diff > 0 ? 'is-up' : 'is-down') + '">' + (diff > 0 ? '▲ +' : '▼ −') +
           Math.abs(diff).toLocaleString('es-MX') + ' m</span>';
  }

  /* ------------------------------------------------------------------
   * 2. Piezas de la vista
   * ------------------------------------------------------------------ */

  function kpi(label, value, extra, small) {
    return '<div class="kpi"><span>' + label + '</span><b>' + value + '</b>' + (extra || '') +
           (small ? '<small>' + small + '</small>' : '') + '</div>';
  }

  function chips(items, selected, attr) {
    return '<div class="chip-line">' + items.map(function (item) {
      return '<button type="button" class="chip" ' + attr + '="' + esc(item.value) + '" aria-pressed="' +
             (String(item.value) === String(selected)) + '">' + esc(item.label) + '</button>';
    }).join('') + '</div>';
  }

  /** Contenedor de gráfica; se dibuja después de insertar el HTML. */
  function chartBox(draw) {
    const id = 'cooper-chart-' + state.charts.length;
    state.charts.push({ id: id, draw: draw });
    return '<div class="group chart-card"><div class="chart" id="' + id + '"></div></div>';
  }

  function drawCharts() {
    state.charts.forEach(function (c) {
      const el = document.getElementById(c.id);
      if (el && el.clientWidth) c.draw(el);
    });
  }

  /** Indicadores principales. */
  function kpis(tests) {
    const last = tests[tests.length - 1];
    const prev = tests.length > 1 ? tests[tests.length - 2] : null;
    const first = tests[0];
    const best = tests.reduce(function (b, t) { return t.distanceM > b.distanceM ? t : b; }, first);
    const lv = level(last);
    return '<div class="kpi-grid">' +
      kpi('Último test', fmtM(last.distanceM), prev ? meterDelta(prev.distanceM, last.distanceM) : '',
          UI.fmtDate(dateOf(last)) + (prev ? ' · vs. anterior' : '')) +
      kpi('Mejor marca', fmtM(best.distanceM), '', UI.fmtDate(dateOf(best))) +
      kpi('VO2máx estimado', fmtVo2(vo2(last.distanceM)) + ' <small class="unit">ml/kg/min</small>',
          prev ? UI.delta(vo2(prev.distanceM), vo2(last.distanceM)) : '', 'Último test') +
      kpi(tests.length > 1 ? 'Mejora total' : 'Categoría',
          tests.length > 1 ? (last.distanceM - first.distanceM >= 0 ? '+' : '−') +
                             fmtM(Math.abs(last.distanceM - first.distanceM)) : (lv ? lv.label : '—'),
          tests.length > 1 ? UI.delta(first.distanceM, last.distanceM) : '',
          tests.length > 1 ? 'Desde el ' + UI.fmtDate(dateOf(first)) + ' · ' + tests.length + ' tests'
                           : (lv ? 'Según edad y sexo' : 'Agrega sexo y edad al test')) +
    '</div>';
  }

  /** Gráficas de evolución. */
  function charts(tests) {
    // En pantallas angostas: solo mes y año ("sep 26") para que no se encimen
    const labelsFor = function (el) {
      return tests.map(function (t) {
        if (el.clientWidth >= 560) return shortDate(t);
        const d = dateOf(t);
        return UI.MONTHS[d.getMonth()].toLowerCase() + ' ' + String(d.getFullYear()).slice(2);
      });
    };
    const title = function (i) {
      const lv = level(tests[i]);
      return UI.fmtDate(dateOf(tests[i])) + (lv ? ' · ' + lv.label : '');
    };
    return '<h2 class="section-title">Evolución de la distancia</h2>' +
      chartBox(function (el) {
        Charts.multiLine(el, {
          labels: labelsFor(el), fitMin: true, height: 230,
          series: [{ name: 'Distancia', color: 'var(--accent)', values: tests.map(function (t) { return t.distanceM; }) }],
          formatTick: function (v) { return v.toLocaleString('es-MX'); },
          formatValue: function (v) { return fmtM(v); },
          title: title
        });
      }) +
      '<h2 class="section-title">VO2máx estimado (ml/kg/min)</h2>' +
      chartBox(function (el) {
        Charts.multiLine(el, {
          labels: labelsFor(el), fitMin: true, height: 200,
          series: [{ name: 'VO2máx', color: 'var(--t-tempo)', values: tests.map(function (t) { return Number(vo2(t.distanceM).toFixed(1)); }) }],
          formatTick: function (v) { return String(v); },
          formatValue: function (v) { return v.toFixed(1); },
          title: title
        });
      });
  }

  /** Comparación de dos tests. */
  function compare(tests) {
    const byId = function (id) { return tests.find(function (t) { return t.id === id; }); };
    let a = byId(state.cmpA);
    let b = byId(state.cmpB);
    if (!a) a = tests[0];
    if (!b) b = tests[tests.length - 1];
    state.cmpA = a.id;
    state.cmpB = b.id;
    const options = function (selected) {
      return tests.map(function (t) {
        return '<option value="' + t.id + '"' + (t.id === selected ? ' selected' : '') + '>' +
               esc(UI.fmtDate(dateOf(t))) + ' · ' + fmtM(t.distanceM) + '</option>';
      }).join('');
    };
    const num = function (v, f) { return v === null || v === undefined ? '—' : f(v); };
    const rows = [
      ['Distancia', fmtM(a.distanceM), fmtM(b.distanceM), meterDelta(a.distanceM, b.distanceM)],
      ['VO2máx', fmtVo2(vo2(a.distanceM)), fmtVo2(vo2(b.distanceM)), UI.delta(vo2(a.distanceM), vo2(b.distanceM))],
      ['Ritmo medio', UI.fmtPace(paceSec(a.distanceM)) + ' /km', UI.fmtPace(paceSec(b.distanceM)) + ' /km',
       UI.delta(paceSec(a.distanceM), paceSec(b.distanceM), true)],
      ['Velocidad', speed(a.distanceM).toFixed(2) + ' km/h', speed(b.distanceM).toFixed(2) + ' km/h',
       UI.delta(speed(a.distanceM), speed(b.distanceM))],
      ['FC media', num(a.hrAvg, String), num(b.hrAvg, String), ''],
      ['Esfuerzo (1-10)', num(a.rpe, String), num(b.rpe, String), ''],
      ['Categoría', levelBadge(a), levelBadge(b), '']
    ];
    return '<h2 class="section-title">Comparar tests</h2>' +
      '<div class="compare-pickers">' +
        '<label class="select-pill"><i style="background:var(--series-a)"></i><select data-cmp="a" aria-label="Test A">' + options(a.id) + '</select></label>' +
        '<span class="vs">vs</span>' +
        '<label class="select-pill"><i style="background:var(--accent)"></i><select data-cmp="b" aria-label="Test B">' + options(b.id) + '</select></label>' +
      '</div>' +
      '<div class="group table-wrap"><table class="data-table cooper-cmp-table"><thead><tr><th></th>' +
        '<th class="num">Test A</th><th class="num">Test B</th><th class="num">Cambio</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td><td class="num"><b>' + r[2] + '</b></td>' +
                 '<td class="num">' + r[3] + '</td></tr>';
        }).join('') +
      '</tbody></table></div>';
  }

  /** Historial de tests (más reciente primero). */
  function history(tests) {
    const rows = tests.slice().reverse().map(function (t) {
      const i = tests.indexOf(t);
      const prev = i > 0 ? tests[i - 1] : null;
      return '<tr class="is-clickable" data-open="' + t.id + '" tabindex="0">' +
        '<td>' + esc(UI.fmtDate(dateOf(t))) + '<small class="cooper-sub">' + esc(SURFACES[t.surface] || '') + '</small></td>' +
        '<td class="num"><b>' + fmtM(t.distanceM) + '</b>' + (prev ? '<small class="cooper-sub">' + meterDelta(prev.distanceM, t.distanceM) + '</small>' : '') + '</td>' +
        '<td class="num">' + UI.fmtPace(paceSec(t.distanceM)) + '</td>' +
        '<td class="num">' + fmtVo2(vo2(t.distanceM)) + '</td>' +
        '<td>' + levelBadge(t) + '</td>' +
        '<td class="cooper-feel">' + (t.feelings ? esc(t.feelings) : '<span class="muted">—</span>') + '</td>' +
        '</tr>';
    }).join('');
    return '<h2 class="section-title">Historial</h2>' +
      '<div class="group table-wrap"><table class="data-table cooper-table"><thead><tr>' +
        '<th>Fecha</th><th class="num">Distancia</th><th class="num">Ritmo</th><th class="num">VO2máx</th>' +
        '<th>Categoría</th><th>Sensaciones</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="group-footer">Toca un test para ver todos sus datos, editarlo o eliminarlo.</p>';
  }

  /** Información, instrucciones y tabla de referencia. */
  function info(openByDefault) {
    const rows = NORMS[state.normSex].map(function (r) {
      const ages = r[1] >= 120 ? r[0] + '+' : r[0] + '–' + r[1];
      return '<tr><td>' + ages + ' años</td><td class="num">&gt; ' + r[2].toLocaleString('es-MX') + '</td>' +
             '<td class="num">' + r[3].toLocaleString('es-MX') + '–' + r[2].toLocaleString('es-MX') + '</td>' +
             '<td class="num">' + r[4].toLocaleString('es-MX') + '–' + (r[3] - 1).toLocaleString('es-MX') + '</td>' +
             '<td class="num">' + r[5].toLocaleString('es-MX') + '–' + (r[4] - 1).toLocaleString('es-MX') + '</td>' +
             '<td class="num">&lt; ' + r[5].toLocaleString('es-MX') + '</td></tr>';
    }).join('');

    return '<h2 class="section-title">Sobre el test</h2>' +
      '<details class="group cooper-info"' + (openByDefault ? ' open' : '') + '><summary>¿Qué es el test de Cooper?</summary><div class="cooper-info-body">' +
        '<p>Es una prueba de resistencia creada en 1968 por el médico <b>Kenneth H. Cooper</b> para la Fuerza Aérea de Estados Unidos. ' +
        'Consiste en <b>correr la mayor distancia posible en 12 minutos</b>.</p>' +
        '<p>Con los metros recorridos se estima el <b>VO2máx</b> (consumo máximo de oxígeno), el principal indicador de la capacidad aeróbica:</p>' +
        '<p class="cooper-formula">VO2máx ≈ (metros − 504.9) ÷ 44.73 &nbsp;ml/kg/min</p>' +
        '<p>Solo necesitas una pista de 400 m (o un recorrido plano medido) y un cronómetro. Repetirlo cada <b>6 a 8 semanas</b> ' +
        'permite ver si el entrenamiento está mejorando tu condición aeróbica.</p>' +
      '</div></details>' +
      '<details class="group cooper-info"' + (openByDefault ? ' open' : '') + '><summary>Cómo hacerlo paso a paso</summary><div class="cooper-info-body">' +
        '<h4>Antes del test</h4><ul>' +
          '<li>Llega <b>descansado</b>: evita entrenamientos intensos 24–48 h antes.</li>' +
          '<li>Come algo ligero 2–3 h antes, hidrátate y usa ropa y calzado cómodos.</li>' +
          '<li>Elige una <b>pista de 400 m</b> o un circuito plano medido; marca puntos cada 100 m (conos o referencias).</li>' +
          '<li>Pide ayuda a alguien para contar vueltas y avisarte el tiempo (o usa un reloj con alarma a los 12:00).</li>' +
        '</ul><h4>Calentamiento (10–15 min)</h4><ul>' +
          '<li>Trote suave, movilidad articular y 2–3 aceleraciones progresivas de 60–80 m.</li>' +
        '</ul><h4>Durante el test (12 min)</h4><ol>' +
          '<li>Inicia el cronómetro y corre la <b>mayor distancia posible</b> a un ritmo constante que puedas sostener.</li>' +
          '<li>Controla los primeros 2–3 minutos: salir demasiado rápido es el error más común.</li>' +
          '<li>Si lo necesitas, puedes bajar el ritmo o caminar; lo importante es no detenerte.</li>' +
          '<li>Cuenta las <b>vueltas completas</b>. En los últimos 2 minutos acelera progresivamente.</li>' +
          '<li>Al llegar a <b>12:00</b>, detente y marca el punto exacto; mide los metros desde la última referencia.</li>' +
        '</ol><h4>Después</h4><ul>' +
          '<li>Camina o trota suave 5–10 min para enfriar.</li>' +
          '<li>Registra aquí la distancia (vueltas × 400 m + metros extra), tu FC, el esfuerzo percibido y cómo te sentiste.</li>' +
          '<li>Para comparar de forma justa, repite el test en <b>condiciones similares</b>: misma superficie, horario y clima parecido.</li>' +
        '</ul>' +
        '<p class="cooper-warning"><b>Precaución:</b> es una prueba de esfuerzo máximo. Si tienes alguna condición cardiaca o respiratoria, ' +
        'llevas tiempo sin hacer ejercicio o tienes más de 40 años sin chequeo médico reciente, consulta a tu médico antes. ' +
        'Detente si sientes dolor en el pecho, mareo o falta de aire anormal.</p>' +
        '<p class="muted small-note">Los relojes GPS pueden medir de más o de menos en pista; contar vueltas es más preciso.</p>' +
      '</div></details>' +
      '<details class="group cooper-info"><summary>Tabla de referencia (metros en 12 min)</summary><div class="cooper-info-body">' +
        '<div class="seg-mini" role="group">' +
          '<button type="button" data-norm="M" aria-pressed="' + (state.normSex === 'M') + '">Hombres</button>' +
          '<button type="button" data-norm="F" aria-pressed="' + (state.normSex === 'F') + '">Mujeres</button>' +
        '</div>' +
        '<div class="table-wrap"><table class="data-table cooper-norms"><thead><tr><th>Edad</th>' +
          '<th class="num">Excelente</th><th class="num">Bueno</th><th class="num">Promedio</th><th class="num">Bajo</th><th class="num">Muy bajo</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="muted small-note">Valores orientativos de la tabla clásica de Cooper para población general. ' +
        'La categoría de cada test se calcula con el sexo y la edad registrados.</p>' +
      '</div></details>';
  }

  /* ------------------------------------------------------------------
   * 3. Dibujo general
   * ------------------------------------------------------------------ */

  function render() {
    state.charts = [];
    const isCoach = App.user.role === 'coach';
    const tests = state.tests;
    let html = '';

    if (isCoach) {
      if (!state.athletes.length) {
        root.innerHTML = '<div class="group empty-state">Aún no tienes alumnos. Agrégalos en la sección ' +
                         '<a href="#alumnos" class="inline-link" data-go="alumnos">Alumnos ›</a></div>' + info(false);
        return;
      }
      html += chips(state.athletes.map(function (a) { return { value: a.id, label: a.name }; }), state.athleteId, 'data-athlete');
    }

    html += '<div class="section-head"><h2 class="section-title">' + (tests.length ? 'Resumen' : 'Tus resultados') + '</h2>' +
            '<button type="button" class="btn-small" data-new>+ Registrar test</button></div>';

    if (!tests.length) {
      html += '<div class="group empty-state">' + (isCoach
        ? 'Este alumno aún no tiene tests de Cooper. Usa “+ Registrar test” para agregar su primer resultado.'
        : 'Aún no has registrado ningún test. Lee abajo cómo hacerlo y usa “+ Registrar test” para guardar tu primer resultado.') +
        '</div>' + info(true);
      root.innerHTML = html;
      return;
    }

    html += kpis(tests);
    if (tests.length > 1) html += charts(tests) + compare(tests);
    else html += '<p class="group-footer">Registra un segundo test para ver gráficas de evolución y comparaciones.</p>';
    html += history(tests) + info(false);

    root.innerHTML = html;
    drawCharts();
  }

  /** Carga los tests del usuario mostrado. */
  function loadTests() {
    const isCoach = App.user.role === 'coach';
    return Api.get(API_URL + (isCoach ? '?athlete=' + state.athleteId : ''))
      .then(function (tests) {
        state.tests = tests;
        render();
      })
      .catch(function (err) {
        root.innerHTML = '<div class="group empty-state">' + esc(err.message) + '</div>';
      });
  }

  /* ------------------------------------------------------------------
   * 4. Formulario (registrar / editar) y detalle
   * ------------------------------------------------------------------ */

  /** Abre el formulario. Sin `test` es uno nuevo (con sexo y edad del último). */
  function openForm(test) {
    const last = state.tests[state.tests.length - 1] || {};
    const t = test || { date: UI.iso(new Date()), sex: last.sex || null, age: last.age || null, surface: last.surface || 'pista' };
    const val = function (v) { return v === null || v === undefined ? '' : esc(String(v)); };
    const opt = function (value, label, current) {
      return '<option value="' + value + '"' + (String(current) === String(value) ? ' selected' : '') + '>' + label + '</option>';
    };
    const isCoach = App.user.role === 'coach';
    const athlete = isCoach ? state.athletes.find(function (a) { return a.id === state.athleteId; }) : null;

    const sheet = UI.openModal(
      '<h2 class="sheet-title">' + (test ? 'Editar test' : 'Registrar test de Cooper') + '</h2>' +
      (athlete ? '<p class="muted">Alumno: <b>' + esc(athlete.name) + '</b></p>' : '') +
      '<form id="cooper-form" novalidate>' +
        '<div class="group">' +
          '<label class="row"><span class="row-label">Fecha</span><input class="row-input" type="date" name="date" value="' + val(t.date) + '" max="' + UI.iso(new Date()) + '"></label>' +
          '<label class="row"><span class="row-label">Superficie</span><select class="row-input row-select" name="surface">' +
            Object.keys(SURFACES).map(function (k) { return opt(k, SURFACES[k], t.surface); }).join('') + '</select></label>' +
        '</div>' +
        '<h3 class="section-title">Resultado en 12 minutos</h3>' +
        '<div class="group">' +
          '<label class="row"><span class="row-label">Vueltas de 400 m</span><input class="row-input" type="number" inputmode="numeric" min="0" max="15" step="1" name="laps" placeholder="Opcional"></label>' +
          '<label class="row"><span class="row-label">Metros extra</span><input class="row-input" type="number" inputmode="numeric" min="0" max="399" step="1" name="extra" placeholder="Opcional"></label>' +
          '<label class="row"><span class="row-label"><b>Distancia total</b></span><input class="row-input" type="number" inputmode="numeric" min="200" max="6000" step="1" name="distance" value="' + val(t.distanceM) + '" placeholder="metros"></label>' +
        '</div>' +
        '<p class="group-footer" id="cooper-preview">Si corriste en pista, escribe las vueltas y los metros extra y se calcula la distancia.</p>' +
        '<h3 class="section-title">Datos para la tabla de referencia</h3>' +
        '<div class="group">' +
          '<label class="row"><span class="row-label">Sexo</span><select class="row-input row-select" name="sex">' +
            opt('', '—', t.sex || '') + opt('M', 'Hombre', t.sex) + opt('F', 'Mujer', t.sex) + '</select></label>' +
          '<label class="row"><span class="row-label">Edad</span><input class="row-input" type="number" inputmode="numeric" min="8" max="99" name="age" value="' + val(t.age) + '" placeholder="años"></label>' +
        '</div>' +
        '<h3 class="section-title">Cómo fue (opcional)</h3>' +
        '<div class="group">' +
          '<label class="row"><span class="row-label">FC media</span><input class="row-input" type="number" inputmode="numeric" min="40" max="240" name="hrAvg" value="' + val(t.hrAvg) + '" placeholder="ppm"></label>' +
          '<label class="row"><span class="row-label">FC máxima</span><input class="row-input" type="number" inputmode="numeric" min="40" max="240" name="hrMax" value="' + val(t.hrMax) + '" placeholder="ppm"></label>' +
          '<label class="row"><span class="row-label">Esfuerzo percibido</span><select class="row-input row-select" name="rpe">' + opt('', '—', t.rpe || '') +
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) {
              return opt(n, n + (n === 1 ? ' · muy fácil' : n === 5 ? ' · moderado' : n === 8 ? ' · muy duro' : n === 10 ? ' · máximo' : ''), t.rpe);
            }).join('') + '</select></label>' +
          '<label class="row"><span class="row-label">Temperatura</span><input class="row-input" type="number" inputmode="numeric" min="-30" max="55" name="tempC" value="' + val(t.tempC) + '" placeholder="°C"></label>' +
        '</div>' +
        '<h3 class="section-title">Sensaciones</h3>' +
        '<div class="group"><textarea class="text-area" name="feelings" rows="4" maxlength="2000" ' +
          'placeholder="Ej. Salí muy rápido y sufrí en los minutos 6-9; buen cierre. Viento en la recta, pista mojada.">' + val(t.feelings) + '</textarea></div>' +
        '<button type="submit" class="btn-primary">' + (test ? 'Guardar cambios' : 'Guardar test') + '</button>' +
      '</form>'
    );

    const form = sheet.querySelector('#cooper-form');
    const preview = sheet.querySelector('#cooper-preview');
    const intOrNull = function (input) {
      const v = input.value.trim();
      return v === '' ? null : Number(v);
    };

    /** Vista previa: ritmo, VO2máx y categoría con lo escrito. */
    function updatePreview() {
      const d = intOrNull(form.distance);
      if (!d || d < 200) {
        preview.textContent = 'Si corriste en pista, escribe las vueltas y los metros extra y se calcula la distancia.';
        return;
      }
      const lv = level({ distanceM: d, sex: form.sex.value || null, age: intOrNull(form.age) });
      preview.innerHTML = 'Ritmo <b>' + UI.fmtPace(paceSec(d)) + ' /km</b> · ' + speed(d).toFixed(2) + ' km/h · VO2máx ≈ <b>' +
                          fmtVo2(vo2(d)) + '</b>' + (lv ? ' · Categoría: <b>' + lv.label + '</b>' : '');
    }

    function fromLaps() {
      const laps = intOrNull(form.laps);
      const extra = intOrNull(form.extra);
      if (laps === null && extra === null) return;
      form.distance.value = (laps || 0) * TRACK_LAP_M + (extra || 0);
      updatePreview();
    }
    form.laps.addEventListener('input', fromLaps);
    form.extra.addEventListener('input', fromLaps);
    ['distance', 'age'].forEach(function (n) { form[n].addEventListener('input', updatePreview); });
    form.sex.addEventListener('change', updatePreview);
    updatePreview();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const d = intOrNull(form.distance);
      if (!form.date.value) return alert('Elige la fecha del test.');
      if (form.date.value > UI.iso(new Date())) return alert('La fecha del test no puede ser futura.');
      if (!d || !Number.isInteger(d) || d < 200 || d > 6000) return alert('Escribe la distancia total en metros (entre 200 y 6000).');
      const extra = intOrNull(form.extra);
      if (extra !== null && (extra < 0 || extra >= TRACK_LAP_M)) return alert('Los metros extra deben ser menores a 400 (una vuelta).');
      const ranges = [['age', 8, 99, 'La edad'], ['hrAvg', 40, 240, 'La FC media'], ['hrMax', 40, 240, 'La FC máxima'],
                      ['tempC', -30, 55, 'La temperatura']];
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        const v = intOrNull(form[r[0]]);
        if (v !== null && (!Number.isInteger(v) || v < r[1] || v > r[2])) return alert(r[3] + ' debe ser un número entero entre ' + r[1] + ' y ' + r[2] + '.');
      }

      const payload = {
        action: test ? 'update' : 'create',
        id: test ? test.id : undefined,
        athleteId: isCoach ? state.athleteId : undefined,
        date: form.date.value,
        distanceM: d,
        surface: form.surface.value,
        sex: form.sex.value || null,
        age: intOrNull(form.age),
        hrAvg: intOrNull(form.hrAvg),
        hrMax: intOrNull(form.hrMax),
        rpe: form.rpe.value ? Number(form.rpe.value) : null,
        tempC: intOrNull(form.tempC),
        feelings: form.feelings.value.trim()
      };
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      Api.post(API_URL, payload)
        .then(function (saved) {
          UI.closeModal();
          UI.toast(test ? 'Test actualizado' : 'Test guardado · ' + fmtM(saved.distanceM));
          if (!test) { state.cmpA = null; state.cmpB = null; }
          loadTests();
        })
        .catch(function (err) {
          button.disabled = false;
          alert(err.message);
        });
    });
  }

  /** Detalle de un test con acciones. */
  function openDetail(id) {
    const i = state.tests.findIndex(function (t) { return t.id === id; });
    if (i === -1) return;
    const t = state.tests[i];
    const prev = i > 0 ? state.tests[i - 1] : null;
    const lv = level(t);
    const item = function (label, value) {
      return '<div class="row"><span class="row-label">' + label + '</span><span class="row-value">' + value + '</span></div>';
    };
    const sheet = UI.openModal(
      '<h2 class="sheet-title">Test de Cooper · ' + esc(UI.fmtDate(dateOf(t))) + '</h2>' +
      '<div class="kpi-grid kpi-grid-3">' +
        kpi('Distancia', fmtM(t.distanceM), prev ? meterDelta(prev.distanceM, t.distanceM) : '') +
        kpi('VO2máx', fmtVo2(vo2(t.distanceM)), '', 'ml/kg/min') +
        kpi('Categoría', lv ? lv.label : '—', '', lv ? (t.sex === 'F' ? 'Mujer' : 'Hombre') + ', ' + t.age + ' años' : 'Falta sexo/edad') +
      '</div>' +
      '<div class="group">' +
        item('Ritmo medio', UI.fmtPace(paceSec(t.distanceM)) + ' /km') +
        item('Velocidad media', speed(t.distanceM).toFixed(2) + ' km/h') +
        item('Vueltas de 400 m', (t.distanceM / TRACK_LAP_M).toFixed(2)) +
        item('Superficie', esc(SURFACES[t.surface] || t.surface)) +
        item('FC media / máxima', (t.hrAvg || '—') + ' / ' + (t.hrMax || '—') + ' ppm') +
        item('Esfuerzo percibido', t.rpe ? t.rpe + ' / 10' : '—') +
        item('Temperatura', t.tempC !== null ? t.tempC + ' °C' : '—') +
      '</div>' +
      '<h3 class="section-title">Sensaciones</h3>' +
      '<div class="group padded cooper-feel-full">' + (t.feelings ? esc(t.feelings) : '<span class="muted">Sin notas.</span>') + '</div>' +
      '<button type="button" class="btn-primary" id="cooper-edit">Editar</button>' +
      '<button type="button" class="btn-destructive" id="cooper-delete">Eliminar test</button>'
    );
    sheet.querySelector('#cooper-edit').addEventListener('click', function () { openForm(t); });
    sheet.querySelector('#cooper-delete').addEventListener('click', function () {
      if (!confirm('¿Eliminar el test del ' + UI.fmtDate(dateOf(t)) + ' (' + fmtM(t.distanceM) + ')? Esta acción no se puede deshacer.')) return;
      Api.del(API_URL + '?id=' + t.id)
        .then(function () {
          UI.closeModal();
          UI.toast('Test eliminado');
          loadTests();
        })
        .catch(function (err) { alert(err.message); });
    });
  }

  /* ------------------------------------------------------------------
   * 5. Eventos
   * ------------------------------------------------------------------ */

  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-new]')) return openForm(null);
    const open = e.target.closest('[data-open]');
    if (open) return openDetail(Number(open.dataset.open));
    const norm = e.target.closest('[data-norm]');
    if (norm) {
      state.normSex = norm.dataset.norm;
      const details = norm.closest('details');
      render();
      // mantiene abierta la tabla después de redibujar
      const again = root.querySelectorAll('details.cooper-info');
      if (details && again.length) again[again.length - 1].open = true;
      return;
    }
    const athlete = e.target.closest('[data-athlete]');
    if (athlete) {
      state.athleteId = Number(athlete.dataset.athlete);
      state.cmpA = state.cmpB = null;
      loadTests();
    }
  });

  root.addEventListener('keydown', function (e) {
    const open = e.target.closest('[data-open]');
    if (open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDetail(Number(open.dataset.open));
    }
  });

  root.addEventListener('change', function (e) {
    const which = e.target.dataset.cmp;
    if (!which) return;
    if (which === 'a') state.cmpA = Number(e.target.value);
    else state.cmpB = Number(e.target.value);
    render();
  });

  // Redibuja las gráficas al cambiar el ancho
  if (window.ResizeObserver) {
    let lastWidth = 0;
    new ResizeObserver(function () {
      if (root.clientWidth && root.clientWidth !== lastWidth) {
        lastWidth = root.clientWidth;
        drawCharts();
      }
    }).observe(root);
  }

  App.register('cooper', {
    show: function () {
      if (App.user.role !== 'coach') {
        loadTests();
        return;
      }
      // Entrenador: primero la lista de alumnos
      Api.get('api/athletes.php')
        .then(function (athletes) {
          state.athletes = athletes;
          const ids = athletes.map(function (a) { return a.id; });
          if (ids.indexOf(state.athleteId) === -1) state.athleteId = ids[0] || null;
          if (!athletes.length) render();
          else loadTests();
        })
        .catch(function (err) {
          root.innerHTML = '<div class="group empty-state">' + esc(err.message) + '</div>';
        });
    }
  });
})();
