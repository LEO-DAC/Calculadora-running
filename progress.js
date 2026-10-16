/**
 * =====================================================================
 * Archivo: progress.js
 * Descripción: Sección "Progreso": avance en kilómetros de carrera.
 *
 *  Alumno: sus propios entrenamientos.
 *  Entrenador: elige un alumno (chips arriba).
 *
 *  Modos:
 *   - Por mes:  km de cada mes del año elegido vs el año anterior,
 *               mejor mes, promedio mensual y tabla mensual.
 *   - Por año:  total histórico, km por año y km acumulados por año.
 *   - Comparar: mes vs mes (km acumulados día a día) o año vs año
 *               (año completo, a la misma fecha, por mes y acumulado).
 *
 * Solo cuenta actividades de carrera (tipo "run"). Los datos vienen de
 * api/workouts.php (resúmenes). Depende de: Api, UI, WorkoutStore,
 * Charts, App.
 * =====================================================================
 */

(function () {
  'use strict';

  const esc = UI.esc;
  const root = document.getElementById('progress-root');

  /** Colores de las series (definidos en styles.css para claro/oscuro). */
  const COLOR_B = 'var(--accent)';       // periodo principal / actual
  const COLOR_A = 'var(--series-a)';     // periodo con el que se compara
  const COLOR_PREV = 'var(--series-prev)';
  const COLOR_OLDER = 'var(--series-older)';

  const state = {
    mode: 'mes',          // 'mes' | 'anio' | 'cmp'
    cmp: 'mes',           // 'mes' | 'anio' (dentro de Comparar)
    year: null,
    a: null, b: null,     // meses a comparar: "2026-8" (año-mes 0..11)
    ya: null, yb: null,   // años a comparar
    athleteId: null,      // alumno elegido (entrenador)
    athletes: [],         // alumnos del entrenador
    runs: [],             // carreras del usuario mostrado
    charts: []            // funciones que dibujan las gráficas (para redibujar)
  };

  /* ------------------------------------------------------------------
   * 1. Datos y estadísticas
   * ------------------------------------------------------------------ */

  /** Convierte los resúmenes del servidor en carreras simples. */
  function toRuns(workouts) {
    return workouts.filter(function (w) { return w.sport === 'run'; }).map(function (w) {
      return {
        date: new Date(w.startTime || w.importedAt),
        km: w.distanceKm,
        sec: w.movingSec || 0,
        elev: w.elevGain || 0
      };
    });
  }

  /** Totales de una lista de carreras. */
  function stats(runs) {
    let km = 0, sec = 0, timedKm = 0, elev = 0;
    runs.forEach(function (r) {
      km += r.km;
      elev += r.elev;
      if (r.sec) { sec += r.sec; timedKm += r.km; }
    });
    return { km: km, sec: sec, n: runs.length, elev: Math.round(elev), pace: timedKm ? sec / timedKm : 0 };
  }

  function inYear(y) {
    return state.runs.filter(function (r) { return r.date.getFullYear() === y; });
  }

  function inMonth(y, m) {
    return state.runs.filter(function (r) { return r.date.getFullYear() === y && r.date.getMonth() === m; });
  }

  /** Totales del año y del 1 de enero hasta la fecha de hoy (para comparar con el año en curso). */
  function untilToday(y) {
    const now = new Date();
    return stats(inYear(y).filter(function (r) {
      return r.date.getMonth() < now.getMonth() ||
             (r.date.getMonth() === now.getMonth() && r.date.getDate() <= now.getDate());
    }));
  }

  /** Km de cada mes (12 valores) del año y. */
  function monthly(y) {
    const values = new Array(12).fill(0);
    inYear(y).forEach(function (r) { values[r.date.getMonth()] += r.km; });
    return values;
  }

  /** Años desde la primera carrera hasta el actual. */
  function yearsRange() {
    const current = new Date().getFullYear();
    const first = state.runs.reduce(function (min, r) { return Math.min(min, r.date.getFullYear()); }, current);
    const list = [];
    for (let y = first; y <= current; y++) list.push(y);
    return list;
  }

  /** Km acumulados mes a mes (null en los meses que aún no llegan). */
  function cumulativeByMonth(y) {
    const now = new Date();
    let total = 0;
    return monthly(y).map(function (v, m) {
      if (y === now.getFullYear() && m > now.getMonth()) return null;
      total += v;
      return total;
    });
  }

  /** Km acumulados día a día de un mes (null en los días que aún no llegan). */
  function cumulativeByDay(y, m) {
    const days = new Date(y, m + 1, 0).getDate();
    const perDay = new Array(days).fill(0);
    inMonth(y, m).forEach(function (r) { perDay[r.date.getDate() - 1] += r.km; });
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth();
    let total = 0;
    return perDay.map(function (v, i) {
      if (isCurrent && i + 1 > now.getDate()) return null;
      total += v;
      return total;
    });
  }

  /** Nombre de mes: "Octubre 2026" / clave "2026-9". */
  function monthLabel(key, short) {
    const p = key.split('-').map(Number);
    return (short ? UI.MONTHS[p[1]] : UI.capitalize(UI.MONTHS_LONG[p[1]])) + ' ' + p[0];
  }

  /* ------------------------------------------------------------------
   * 2. Piezas de interfaz
   * ------------------------------------------------------------------ */

  /** Tarjeta de indicador. */
  function kpi(label, value, extra, small) {
    return '<div class="kpi"><span>' + label + '</span><b>' + value + '</b>' + (extra || '') +
           (small ? '<small>' + small + '</small>' : '') + '</div>';
  }

  /** Fila de chips seleccionables. */
  function chips(items, selected, attr) {
    return '<div class="chip-line">' + items.map(function (item) {
      return '<button type="button" class="chip" ' + attr + '="' + esc(item.value) + '" aria-pressed="' +
             (String(item.value) === String(selected)) + '">' + esc(item.label) + '</button>';
    }).join('') + '</div>';
  }

  /** Control segmentado pequeño. */
  function segMini(items, selected, attr) {
    return '<div class="seg-mini" role="group">' + items.map(function (item) {
      return '<button type="button" ' + attr + '="' + item.value + '" aria-pressed="' + (item.value === selected) + '">' +
             item.label + '</button>';
    }).join('') + '</div>';
  }

  /** Tarjetas de comparación A vs B (el valor grande es B; la variación es de A a B). */
  function compareCards(sa, sb, la, lb) {
    const rows = [
      ['Kilómetros', UI.fmtKm(sa.km) + ' km', UI.fmtKm(sb.km) + ' km', UI.delta(sa.km, sb.km)],
      ['Entrenamientos', sa.n, sb.n, UI.delta(sa.n, sb.n)],
      ['Ritmo medio', UI.fmtPace(sa.pace) + ' /km', UI.fmtPace(sb.pace) + ' /km', UI.delta(sa.pace, sb.pace, true)],
      ['Desnivel +', sa.elev.toLocaleString('es-MX') + ' m', sb.elev.toLocaleString('es-MX') + ' m', UI.delta(sa.elev, sb.elev)]
    ];
    return '<div class="kpi-grid">' + rows.map(function (r) {
      return '<div class="kpi"><span>' + r[0] + '</span><b>' + r[2] + '</b>' + r[3] +
             '<small><span class="kpi-key" style="background:' + COLOR_A + '"></span>' + esc(la) + ': ' + r[1] + '</small></div>';
    }).join('') + '</div>';
  }

  /** Contenedor de gráfica + función que la dibuja (se ejecuta tras insertar el HTML). */
  function chartBox(draw, legendItems) {
    const id = 'progress-chart-' + state.charts.length;
    state.charts.push({ id: id, draw: draw });
    return '<div class="group chart-card">' + (legendItems ? Charts.legend(legendItems) : '') +
           '<div class="chart" id="' + id + '"></div></div>';
  }

  function drawCharts() {
    state.charts.forEach(function (c) {
      const el = document.getElementById(c.id);
      if (el && el.clientWidth) c.draw(el);
    });
  }

  const kmTick = function (v) { return v >= 1000 ? (v / 1000) + ' mil' : String(v); };
  const kmValue = function (v) { return UI.fmtKm(v) + ' km'; };
  const monthLabels = function (el) {
    return UI.MONTHS.map(function (m) { return el.clientWidth < 420 ? m.charAt(0) : m; });
  };

  /* ------------------------------------------------------------------
   * 3. Vistas
   * ------------------------------------------------------------------ */

  /** Por mes: un año con su comparación contra el anterior. */
  function viewByMonth(years) {
    const y = state.year;
    const hasPrev = years.indexOf(y - 1) !== -1;
    const cur = stats(inYear(y));
    const mv = monthly(y);
    const mp = monthly(y - 1);
    const active = mv.filter(function (v) { return v > 0; });
    const best = mv.indexOf(Math.max.apply(null, mv));
    const maxMonth = Math.max.apply(null, mv) || 1;
    const now = new Date();
    const isCurrent = y === now.getFullYear();
    // El año en curso se compara con el anterior hasta la misma fecha (comparación justa)
    const prev = isCurrent ? untilToday(y - 1) : stats(inYear(y - 1));

    let html = chips(years.map(function (v) { return { value: v, label: String(v) }; }), y, 'data-year') +
      '<h2 class="section-title">Resumen ' + y + (isCurrent ? ' · en curso' : '') + '</h2>' +
      '<div class="kpi-grid">' +
        kpi('Km totales', UI.fmtKm(cur.km), hasPrev ? UI.delta(prev.km, cur.km) : '',
            hasPrev ? (y - 1) + (isCurrent ? ' a la misma fecha: ' : ': ') + UI.fmtKm(prev.km) + ' km' : 'Primer año registrado') +
        kpi('Mejor mes', active.length ? UI.capitalize(UI.MONTHS_LONG[best]) : '—', '',
            active.length ? UI.fmtKm(mv[best]) + ' km' : 'Sin carreras') +
        kpi('Promedio mensual', UI.fmtKm(active.length ? active.reduce(function (s, v) { return s + v; }, 0) / active.length : 0), '',
            'km en ' + active.length + ' meses activos') +
        kpi('Entrenamientos', cur.n, '', 'Ritmo medio ' + UI.fmtPace(cur.pace) + ' /km') +
      '</div>' +
      '<h2 class="section-title">Km por mes · ' + y + '</h2>';

    const series = [{ name: String(y), color: COLOR_B, values: mv }];
    if (hasPrev) series.push({ name: String(y - 1), color: COLOR_PREV, values: mp });
    html += chartBox(function (el) {
      Charts.groupedBar(el, {
        labels: monthLabels(el), series: series, formatTick: kmTick, formatValue: kmValue,
        title: function (i) { return UI.capitalize(UI.MONTHS_LONG[i]); }
      });
    }, hasPrev ? series.map(function (s) { return { color: s.color, name: s.name }; }) : null);

    html += '<h2 class="section-title">Detalle mensual</h2><div class="group table-wrap"><table class="data-table">' +
      '<thead><tr><th scope="col">Mes</th><th scope="col" class="num">Km</th><th scope="col" class="bar-col"><span class="visually-hidden">Barra</span></th>' +
      '<th scope="col" class="num">Entrenos</th><th scope="col" class="num">Ritmo</th>' +
      (hasPrev ? '<th scope="col" class="num">vs ' + (y - 1) + '</th>' : '') + '</tr></thead><tbody>' +
      mv.map(function (v, m) {
        if (isCurrent && m > now.getMonth()) return '';
        const s = stats(inMonth(y, m));
        return '<tr><td>' + UI.MONTHS[m] + '</td><td class="num"><b>' + UI.fmtKm(v) + '</b></td>' +
               '<td class="bar-col"><div class="minibar" style="width:' + (v / maxMonth * 100) + '%"></div></td>' +
               '<td class="num">' + s.n + '</td><td class="num">' + UI.fmtPace(s.pace) + '</td>' +
               (hasPrev ? '<td class="num">' + UI.delta(mp[m], v) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
    return html;
  }

  /** Por año: histórico completo. */
  function viewByYear(years) {
    const perYear = years.map(function (y) { return stats(inYear(y)); });
    const total = stats(state.runs);
    const bestIndex = perYear.reduce(function (b, s, i) { return s.km > perYear[b].km ? i : b; }, 0);
    const now = new Date();

    // Km acumulados: los últimos 3 años (el actual en azul, el anterior en naranja)
    const recent = years.slice(-3);
    const palette = [COLOR_B, COLOR_A, COLOR_OLDER];
    const cumulative = recent.slice().reverse().map(function (y, i) {
      return { name: String(y), color: palette[i], values: cumulativeByMonth(y) };
    }).reverse();

    return '<h2 class="section-title">Resumen histórico</h2>' +
      '<div class="kpi-grid">' +
        kpi('Total histórico', UI.fmtKm(total.km), '', 'km desde ' + years[0]) +
        kpi('Mejor año', String(years[bestIndex]), '', UI.fmtKm(perYear[bestIndex].km) + ' km') +
        kpi('Entrenamientos', total.n.toLocaleString('es-MX'), '', UI.fmtDur(total.sec / 60)) +
        kpi('Desnivel acumulado', total.elev.toLocaleString('es-MX') + ' m', '', 'Ritmo medio ' + UI.fmtPace(total.pace) + ' /km') +
      '</div>' +
      '<h2 class="section-title">Km por año</h2>' +
      chartBox(function (el) {
        Charts.groupedBar(el, {
          labels: years.map(String), series: [{ name: 'Km', color: COLOR_B, values: perYear.map(function (s) { return s.km; }) }],
          formatTick: kmTick, formatValue: kmValue, title: function (i) { return String(years[i]); }
        });
      }) +
      '<p class="group-footer">' + now.getFullYear() + ' en curso: datos hasta el ' + now.getDate() + ' de ' +
        UI.MONTHS_LONG[now.getMonth()] + '.</p>' +
      '<h2 class="section-title">Km acumulados por año</h2>' +
      chartBox(function (el) {
        Charts.multiLine(el, {
          labels: UI.MONTHS, series: cumulative, formatTick: kmTick, formatValue: function (v) { return UI.fmtKm(v); },
          title: function (i) { return 'Hasta ' + UI.MONTHS_LONG[i]; }
        });
      }, cumulative.map(function (s) { return { color: s.color, name: s.name }; }));
  }

  /** Opciones de meses (del más reciente al primero con datos). */
  function monthOptions(selected, years) {
    const now = new Date();
    let html = '';
    for (let y = now.getFullYear(); y >= years[0]; y--) {
      for (let m = 11; m >= 0; m--) {
        if (y === now.getFullYear() && m > now.getMonth()) continue;
        const key = y + '-' + m;
        html += '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + monthLabel(key) + '</option>';
      }
    }
    return html;
  }

  /** Selector con la marca de color de su serie. */
  function picker(color, attr, options) {
    return '<label class="select-pill"><i style="background:' + color + '"></i><select ' + attr + '>' + options + '</select></label>';
  }

  /** Comparar: mes vs mes o año vs año. */
  function viewCompare(years) {
    const now = new Date();
    let html = segMini([{ value: 'mes', label: 'Mes vs mes' }, { value: 'anio', label: 'Año vs año' }], state.cmp, 'data-cmp');

    if (state.cmp === 'mes') {
      const pa = state.a.split('-').map(Number);
      const pb = state.b.split('-').map(Number);
      const la = monthLabel(state.a, true);
      const lb = monthLabel(state.b, true);
      const ca = cumulativeByDay(pa[0], pa[1]);
      const cb = cumulativeByDay(pb[0], pb[1]);
      const days = Math.max(ca.length, cb.length);
      const pad = function (arr) { return arr.concat(new Array(days - arr.length).fill(null)); };
      const series = [{ name: la, color: COLOR_A, values: pad(ca) }, { name: lb, color: COLOR_B, values: pad(cb) }];
      const current = now.getFullYear() + '-' + now.getMonth();

      html += '<div class="compare-pickers">' + picker(COLOR_A, 'data-pick="a"', monthOptions(state.a, years)) +
              '<span class="vs">vs</span>' + picker(COLOR_B, 'data-pick="b"', monthOptions(state.b, years)) + '</div>' +
        '<h2 class="section-title">Comparativa</h2>' +
        compareCards(stats(inMonth(pa[0], pa[1])), stats(inMonth(pb[0], pb[1])), la, lb) +
        '<h2 class="section-title">Km acumulados día a día</h2>' +
        chartBox(function (el) {
          Charts.multiLine(el, {
            labels: Array.from({ length: days }, function (_, i) { return String(i + 1); }),
            series: series, formatTick: kmTick, formatValue: function (v) { return UI.fmtKm(v); },
            title: function (i) { return 'Día ' + (i + 1); }
          });
        }, series.map(function (s) { return { color: s.color, name: s.name }; })) +
        (state.a === current || state.b === current
          ? '<p class="group-footer">' + monthLabel(current) + ' en curso: datos hasta el día ' + now.getDate() + '.</p>' : '');
    } else {
      const ya = state.ya;
      const yb = state.yb;
      const yearOptions = function (sel) {
        return years.slice().reverse().map(function (y) {
          return '<option value="' + y + '"' + (y === sel ? ' selected' : '') + '>' + y + '</option>';
        }).join('');
      };
      // "A la misma fecha": del 1 de enero al día de hoy de cada año
      const sameDate = untilToday;
      const partial = ya === now.getFullYear() || yb === now.getFullYear();
      const bars = [{ name: String(ya), color: COLOR_A, values: monthly(ya) }, { name: String(yb), color: COLOR_B, values: monthly(yb) }];
      const lines = [{ name: String(ya), color: COLOR_A, values: cumulativeByMonth(ya) }, { name: String(yb), color: COLOR_B, values: cumulativeByMonth(yb) }];
      const legend = bars.map(function (s) { return { color: s.color, name: s.name }; });

      html += '<div class="compare-pickers">' + picker(COLOR_A, 'data-pick="ya"', yearOptions(ya)) +
              '<span class="vs">vs</span>' + picker(COLOR_B, 'data-pick="yb"', yearOptions(yb)) + '</div>' +
        '<h2 class="section-title">Año completo</h2>' +
        compareCards(stats(inYear(ya)), stats(inYear(yb)), String(ya), String(yb)) +
        (partial ? '<h2 class="section-title">A la misma fecha (1 ene – ' + now.getDate() + ' ' +
          UI.MONTHS[now.getMonth()].toLowerCase() + ')</h2>' + compareCards(sameDate(ya), sameDate(yb), String(ya), String(yb)) : '') +
        '<h2 class="section-title">Km por mes</h2>' +
        chartBox(function (el) {
          Charts.groupedBar(el, {
            labels: monthLabels(el), series: bars, formatTick: kmTick, formatValue: kmValue,
            title: function (i) { return UI.capitalize(UI.MONTHS_LONG[i]); }
          });
        }, legend) +
        '<h2 class="section-title">Km acumulados</h2>' +
        chartBox(function (el) {
          Charts.multiLine(el, {
            labels: UI.MONTHS, series: lines, formatTick: kmTick, formatValue: function (v) { return UI.fmtKm(v); },
            title: function (i) { return 'Hasta ' + UI.MONTHS_LONG[i]; }
          });
        }, legend);
    }
    return html;
  }

  /* ------------------------------------------------------------------
   * 4. Dibujo general
   * ------------------------------------------------------------------ */

  function render() {
    state.charts = [];
    const isCoach = App.user.role === 'coach';
    let html = '';

    if (isCoach) {
      if (!state.athletes.length) {
        root.innerHTML = '<div class="group empty-state">Aún no tienes alumnos. Agrégalos en la sección ' +
                         '<a href="#alumnos" class="inline-link" data-go="alumnos">Alumnos ›</a></div>';
        return;
      }
      html += chips(state.athletes.map(function (a) { return { value: a.id, label: a.name }; }), state.athleteId, 'data-athlete');
    }

    html += segMini([{ value: 'mes', label: 'Por mes' }, { value: 'anio', label: 'Por año' }, { value: 'cmp', label: 'Comparar' }],
                    state.mode, 'data-mode');

    if (!state.runs.length) {
      html += '<div class="group empty-state">' + (isCoach
        ? 'Este alumno aún no ha importado carreras.'
        : 'Aún no hay carreras. Importa tus archivos GPX en <a href="#entrenos" class="inline-link" data-go="entrenos">Entrenos ›</a>') +
        '</div>';
      root.innerHTML = html;
      return;
    }

    const years = yearsRange();
    const now = new Date();
    if (years.indexOf(state.year) === -1) state.year = years[years.length - 1];
    if (years.indexOf(state.ya) === -1) state.ya = years.length > 1 ? years[years.length - 2] : years[0];
    if (years.indexOf(state.yb) === -1) state.yb = years[years.length - 1];
    if (!state.b) state.b = now.getFullYear() + '-' + now.getMonth();
    if (!state.a) {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      state.a = prevMonth.getFullYear() + '-' + prevMonth.getMonth();
    }

    html += '<div class="progress-body">' + (state.mode === 'mes' ? viewByMonth(years)
      : state.mode === 'anio' ? viewByYear(years) : viewCompare(years)) + '</div>' +
      '<p class="group-footer">Solo se cuentan las actividades de carrera.</p>';

    root.innerHTML = html;
    drawCharts();
  }

  /** Carga las carreras del usuario mostrado y dibuja. */
  function loadRuns() {
    const isCoach = App.user.role === 'coach';
    return WorkoutStore.getAll(isCoach ? state.athleteId : undefined)
      .then(function (workouts) {
        state.runs = toRuns(workouts);
        render();
      })
      .catch(function (err) {
        root.innerHTML = '<div class="group empty-state">' + esc(err.message) + '</div>';
      });
  }

  /* ------------------------------------------------------------------
   * 5. Eventos
   * ------------------------------------------------------------------ */

  root.addEventListener('click', function (e) {
    const el = e.target.closest('[data-year],[data-mode],[data-cmp],[data-athlete]');
    if (!el) return;
    if (el.dataset.year) state.year = Number(el.dataset.year);
    if (el.dataset.mode) state.mode = el.dataset.mode;
    if (el.dataset.cmp) state.cmp = el.dataset.cmp;
    if (el.dataset.athlete) {
      state.athleteId = Number(el.dataset.athlete);
      loadRuns();
      return;
    }
    render();
  });

  root.addEventListener('change', function (e) {
    const key = e.target.dataset.pick;
    if (!key) return;
    state[key] = key === 'ya' || key === 'yb' ? Number(e.target.value) : e.target.value;
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

  App.register('progreso', {
    show: function () {
      if (App.user.role !== 'coach') {
        loadRuns();
        return;
      }
      // Entrenador: primero la lista de alumnos
      Api.get('api/athletes.php')
        .then(function (athletes) {
          state.athletes = athletes;
          const preset = App.state.progressAthleteId;
          App.state.progressAthleteId = null;
          const ids = athletes.map(function (a) { return a.id; });
          if (preset && ids.indexOf(preset) !== -1) state.athleteId = preset;
          if (ids.indexOf(state.athleteId) === -1) state.athleteId = ids[0] || null;
          if (!athletes.length) render();
          else loadRuns();
        })
        .catch(function (err) {
          root.innerHTML = '<div class="group empty-state">' + esc(err.message) + '</div>';
        });
    }
  });
})();
