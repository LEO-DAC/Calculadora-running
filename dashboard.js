/**
 * =====================================================================
 * Archivo: dashboard.js
 * Descripción: Lógica de la sección "Entrenos" (dashboard).
 *
 *  - Importa uno o varios archivos GPX (botón o arrastrar y soltar).
 *  - Guarda cada entrenamiento en el navegador (storage.js).
 *  - Filtros por año y tipo de actividad, que afectan a todo lo de abajo.
 *  - Resumen: km totales, entrenamientos, tiempo, ritmo y desnivel.
 *  - Lista de entrenamientos con botón para ver el detalle en otra ventana.
 *  - Gráfica de km por mes (charts.js).
 *
 * Depende de: gpx.js (GPX), storage.js (WorkoutStore), charts.js (Charts).
 * =====================================================================
 */

(function () {
  'use strict';

  const fmt = GPX.format;

  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
                  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul',
                        'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  /** Cuántos entrenamientos se muestran antes de "Mostrar todos". */
  const LIST_PREVIEW = 8;

  /* ------------------------------------------------------------------
   * 1. Referencias al DOM
   * ------------------------------------------------------------------ */
  const fileInput = document.getElementById('gpx-input');
  const importButton = document.getElementById('import-button');
  const importLabel = document.getElementById('import-label');
  const dropZone = document.getElementById('drop-zone');

  const filtersEl = document.getElementById('dash-filters');
  const yearChips = document.getElementById('year-chips');
  const sportChips = document.getElementById('sport-chips');

  const totalKmEl = document.getElementById('total-km');
  const totalCaptionEl = document.getElementById('total-caption');
  const statCountEl = document.getElementById('stat-count');
  const statTimeEl = document.getElementById('stat-time');
  const statPaceLabelEl = document.getElementById('stat-pace-label');
  const statPaceEl = document.getElementById('stat-pace');
  const statElevEl = document.getElementById('stat-elev');
  const allTimeEl = document.getElementById('all-time');

  const listEl = document.getElementById('workout-list');
  const listMoreButton = document.getElementById('list-more');
  const chartEl = document.getElementById('monthly-chart');
  const chartTitleEl = document.getElementById('chart-title');

  /* ------------------------------------------------------------------
   * 2. Estado
   * ------------------------------------------------------------------ */
  const state = {
    workouts: [],   // resúmenes de todos los entrenamientos
    year: new Date().getFullYear(), // año seleccionado en el filtro
    sport: 'all',   // actividad seleccionada ('all' = todas)
    showAll: false  // lista completa o solo los primeros
  };

  /** Fecha del entrenamiento (o de importación si el GPX no trae hora). */
  function workoutDate(w) {
    return new Date(w.startTime || w.importedAt);
  }

  /** Ordena del más reciente al más antiguo. */
  function sortWorkouts() {
    state.workouts.sort(function (a, b) { return workoutDate(b) - workoutDate(a); });
  }

  /* ------------------------------------------------------------------
   * 3. Carga e importación
   * ------------------------------------------------------------------ */

  /** Lee los entrenamientos guardados y redibuja el dashboard. */
  function load() {
    return WorkoutStore.getAll()
      .then(function (workouts) { state.workouts = workouts; })
      .catch(function (err) {
        state.workouts = [];
        alert('No se pudieron cargar los entrenamientos guardados.\n' + err.message);
      })
      .then(function () {
        sortWorkouts();
        render();
      });
  }

  /**
   * ¿Ya existe un entrenamiento igual? (misma hora de inicio y distancia,
   * o mismo archivo y distancia si no trae hora).
   */
  function isDuplicate(summary) {
    return state.workouts.some(function (w) {
      const sameDistance = Math.abs(w.distanceKm - summary.distanceKm) < 0.01;
      return sameDistance && (summary.startTime
        ? w.startTime === summary.startTime
        : w.fileName === summary.fileName);
    });
  }

  /** Muestra el botón de importar como ocupado / disponible. */
  function setBusy(busy) {
    importButton.disabled = busy;
    importLabel.textContent = busy ? 'Importando…' : 'Importar entrenamiento';
  }

  /**
   * Importa una lista de archivos GPX. Valida la extensión, lee cada
   * archivo, evita duplicados y avisa con alert() de cualquier problema.
   * @param {FileList|File[]} fileList
   */
  async function importFiles(fileList) {
    let files = Array.from(fileList || []);
    if (!files.length) return;

    const notGpx = files.filter(function (f) { return !/\.gpx$/i.test(f.name); });
    if (notGpx.length) {
      alert('Solo se pueden importar archivos .gpx.\nSe omitirán:\n• ' +
            notGpx.map(function (f) { return f.name; }).join('\n• '));
      files = files.filter(function (f) { return /\.gpx$/i.test(f.name); });
      if (!files.length) return;
    }

    setBusy(true);
    const imported = [];
    const duplicates = [];
    const errors = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const result = GPX.parse(text, file.name);
        if (isDuplicate(result.summary)) {
          duplicates.push(file.name);
          continue;
        }
        result.summary.id = WorkoutStore.createId();
        result.summary.importedAt = Date.now();
        await WorkoutStore.add(result.summary, result.track);
        state.workouts.push(result.summary);
        imported.push(result.summary);
      } catch (err) {
        errors.push(file.name + ': ' + err.message);
      }
    }

    setBusy(false);
    fileInput.value = ''; // permite volver a elegir el mismo archivo

    if (imported.length) {
      WorkoutStore.notifyChange();
      sortWorkouts();
      // Muestra el año del entrenamiento importado más reciente
      const newest = imported.reduce(function (a, b) { return workoutDate(a) > workoutDate(b) ? a : b; });
      state.year = workoutDate(newest).getFullYear();
      state.sport = 'all';
      render();
    }

    // Avisos de problemas (solo si los hubo)
    const messages = [];
    if (duplicates.length) messages.push('Ya estaban importados:\n• ' + duplicates.join('\n• '));
    if (errors.length) messages.push('No se pudieron leer:\n• ' + errors.join('\n• '));
    if (messages.length) {
      if (imported.length) messages.unshift('Se importaron ' + imported.length + ' entrenamiento(s).');
      alert(messages.join('\n\n'));
    }
  }

  // Botón "Importar entrenamiento": abre el selector de archivos (input oculto)
  importButton.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () { importFiles(fileInput.files); });

  // Arrastrar y soltar archivos sobre la tarjeta de importación (escritorio)
  ['dragenter', 'dragover'].forEach(function (type) {
    dropZone.addEventListener(type, function (e) {
      e.preventDefault();
      dropZone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    dropZone.addEventListener(type, function (e) {
      e.preventDefault();
      dropZone.classList.remove('is-dragover');
    });
  });
  dropZone.addEventListener('drop', function (e) {
    if (e.dataTransfer) importFiles(e.dataTransfer.files);
  });

  /* ------------------------------------------------------------------
   * 4. Filtros (año y actividad)
   * ------------------------------------------------------------------ */

  /**
   * Dibuja una fila de "chips" seleccionables.
   * @param {HTMLElement} container
   * @param {Array<{value:*, label:string}>} options
   * @param {*} selected
   * @param {function(*)} onSelect
   */
  function renderChips(container, options, selected, onSelect) {
    container.textContent = '';
    options.forEach(function (option) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = option.label;
      chip.setAttribute('aria-pressed', String(option.value === selected));
      chip.addEventListener('click', function () { onSelect(option.value); });
      container.appendChild(chip);
    });
  }

  /** Entrenamientos que cumplen los filtros activos. */
  function filteredWorkouts() {
    return state.workouts.filter(function (w) {
      return workoutDate(w).getFullYear() === state.year &&
             (state.sport === 'all' || w.sport === state.sport);
    });
  }

  /* ------------------------------------------------------------------
   * 5. Dibujo del dashboard
   * ------------------------------------------------------------------ */

  /** Redibuja filtros, resumen, lista y gráfica. */
  function render() {
    // Años disponibles (más reciente primero)
    const years = Array.from(new Set(state.workouts.map(function (w) {
      return workoutDate(w).getFullYear();
    }))).sort(function (a, b) { return b - a; });
    if (years.indexOf(state.year) === -1) state.year = years.length ? years[0] : new Date().getFullYear();

    // Actividades presentes en el año elegido
    const sports = GPX.SPORT_ORDER.filter(function (key) {
      return state.workouts.some(function (w) {
        return w.sport === key && workoutDate(w).getFullYear() === state.year;
      });
    });
    if (state.sport !== 'all' && sports.indexOf(state.sport) === -1) state.sport = 'all';

    filtersEl.hidden = state.workouts.length === 0;
    renderChips(yearChips, years.map(function (y) { return { value: y, label: String(y) }; }),
      state.year, function (value) { state.year = value; state.showAll = false; render(); });
    renderChips(sportChips,
      [{ value: 'all', label: 'Todas' }].concat(sports.map(function (key) {
        const info = GPX.sportInfo(key);
        return { value: key, label: info.icon + ' ' + info.label };
      })),
      state.sport, function (value) { state.sport = value; state.showAll = false; render(); });

    const workouts = filteredWorkouts();
    renderSummary(workouts);
    renderList(workouts);
    renderChart();
  }

  /** Tarjeta de resumen (km totales y estadísticas del filtro). */
  function renderSummary(workouts) {
    // Ritmo medio (min/km) o velocidad media (km/h) si el filtro es ciclismo
    const usesPace = state.sport === 'all' || GPX.sportInfo(state.sport).pace;

    let km = 0;
    let totalSec = 0;  // tiempo en movimiento de todos
    let movingSec = 0; // tiempo usado para el ritmo / velocidad medios
    let timedKm = 0;
    let elev = 0;
    workouts.forEach(function (w) {
      km += w.distanceKm;
      elev += w.elevGain || 0;
      totalSec += w.movingSec || 0;
      // Con "Todas", el ritmo medio solo considera actividades medidas en
      // ritmo (carrera, caminata...) para no mezclarlo con la bici.
      if (w.movingSec && (!usesPace || GPX.sportInfo(w.sport).pace)) {
        movingSec += w.movingSec;
        timedKm += w.distanceKm;
      }
    });

    totalKmEl.textContent = km.toFixed(km >= 1000 ? 0 : 1);
    const sportLabel = state.sport === 'all' ? '' : ' · ' + GPX.sportInfo(state.sport).label;
    totalCaptionEl.textContent = 'km en ' + state.year + sportLabel;

    statCountEl.textContent = String(workouts.length);
    statTimeEl.textContent = fmt.hoursMinutes(totalSec);

    statPaceLabelEl.textContent = usesPace ? 'Ritmo medio' : 'Velocidad media';
    if (!movingSec || !timedKm) {
      statPaceEl.textContent = '—';
    } else if (usesPace) {
      statPaceEl.textContent = fmt.pace(movingSec / timedKm) + ' /km';
    } else {
      statPaceEl.textContent = (timedKm / (movingSec / 3600)).toFixed(1) + ' km/h';
    }
    statElevEl.textContent = Math.round(elev).toLocaleString('es') + ' m';

    // Total histórico (todos los entrenamientos, sin filtros)
    const allKm = state.workouts.reduce(function (sum, w) { return sum + w.distanceKm; }, 0);
    allTimeEl.textContent = 'Total histórico: ' + allKm.toFixed(1) + ' km en ' +
                            state.workouts.length + ' entrenamiento(s)';
  }

  /**
   * Abre el detalle de un entrenamiento en otra ventana/pestaña.
   * Se usa window.open para que la ventana de detalle pueda cerrarse sola.
   */
  function openDetail(event, url) {
    event.preventDefault();
    const win = window.open(url, '_blank');
    if (!win) window.location.href = url; // si el navegador bloquea la ventana
  }

  /** Lista de entrenamientos del filtro activo. */
  function renderList(workouts) {
    listEl.textContent = '';

    if (!workouts.length) {
      const empty = document.createElement('li');
      empty.className = 'list-empty';
      empty.textContent = state.workouts.length
        ? 'No hay entrenamientos para este filtro.'
        : 'Aún no has importado entrenamientos. Usa “Importar entrenamiento” para agregar tu primer archivo GPX.';
      listEl.appendChild(empty);
      listMoreButton.hidden = true;
      return;
    }

    const visible = state.showAll ? workouts : workouts.slice(0, LIST_PREVIEW);
    visible.forEach(function (w) {
      const info = GPX.sportInfo(w.sport);
      const url = 'detalle.html?id=' + encodeURIComponent(w.id);

      const row = document.createElement('li');
      row.className = 'workout-row';

      const icon = document.createElement('span');
      icon.className = 'workout-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = info.icon;

      const main = document.createElement('div');
      main.className = 'workout-info';
      const name = document.createElement('span');
      name.className = 'workout-name';
      name.textContent = w.name;
      const meta = document.createElement('span');
      meta.className = 'workout-meta';
      const metaParts = [info.label, fmt.date(w.startTime || w.importedAt)];
      if (info.pace && w.paceSecKm) metaParts.push(fmt.pace(w.paceSecKm) + ' /km');
      if (!info.pace && w.speedKmh) metaParts.push(w.speedKmh.toFixed(1) + ' km/h');
      meta.textContent = metaParts.join(' · ');
      main.append(name, meta);

      const side = document.createElement('div');
      side.className = 'workout-side';
      const km = document.createElement('span');
      km.className = 'workout-km';
      km.textContent = w.distanceKm.toFixed(2);
      const unit = document.createElement('small');
      unit.textContent = ' km';
      km.appendChild(unit);
      const link = document.createElement('a');
      link.className = 'workout-detail';
      link.href = url;
      link.target = '_blank';
      link.textContent = 'Ver detalle ›';
      link.setAttribute('aria-label', 'Ver detalle de ' + w.name);
      link.addEventListener('click', function (e) { openDetail(e, url); });
      side.append(km, link);

      row.append(icon, main, side);
      listEl.appendChild(row);
    });

    listMoreButton.hidden = workouts.length <= LIST_PREVIEW;
    listMoreButton.textContent = state.showAll ? 'Mostrar menos' : 'Mostrar todos (' + workouts.length + ')';
  }

  listMoreButton.addEventListener('click', function () {
    state.showAll = !state.showAll;
    renderList(filteredWorkouts());
  });

  /** Gráfica de km por mes del año y actividad seleccionados. */
  function renderChart() {
    chartTitleEl.textContent = 'Km por mes · ' + state.year;
    if (!chartEl.clientWidth) return; // vista oculta: se dibuja al mostrarse

    const km = new Array(12).fill(0);
    const counts = new Array(12).fill(0);
    filteredWorkouts().forEach(function (w) {
      const month = workoutDate(w).getMonth();
      km[month] += w.distanceKm;
      counts[month]++;
    });

    // En pantallas angostas los meses se abrevian a una letra
    const narrow = chartEl.clientWidth < 420;
    const labels = MONTHS_SHORT.map(function (m) { return narrow ? m.charAt(0) : m; });

    Charts.bar(chartEl, {
      labels: labels,
      values: km,
      formatTick: function (v) { return String(v); },
      formatValue: function (v) { return v.toFixed(1); },
      ariaLabel: function (i) {
        return MONTHS[i] + ' ' + state.year + ': ' + km[i].toFixed(1) + ' km, ' + counts[i] + ' entrenamientos';
      },
      tooltip: function (i) {
        return {
          title: MONTHS[i] + ' ' + state.year,
          rows: [{
            color: 'var(--accent)',
            value: km[i].toFixed(1) + ' km',
            label: counts[i] + (counts[i] === 1 ? ' entrenamiento' : ' entrenamientos')
          }]
        };
      }
    });
  }

  // Redibuja la gráfica cuando cambia su ancho (rotar, redimensionar,
  // o al mostrarse la pestaña "Entrenos")
  if (window.ResizeObserver) {
    let lastWidth = 0;
    new ResizeObserver(function () {
      const width = chartEl.clientWidth;
      if (width && width !== lastWidth) {
        lastWidth = width;
        renderChart();
      }
    }).observe(chartEl);
  } else {
    window.addEventListener('resize', renderChart);
  }

  // Si otra ventana (detalle) elimina un entrenamiento, recarga los datos
  WorkoutStore.onChange(load);

  render(); // estado inicial (vacío) mientras se leen los datos guardados
  load();
})();
