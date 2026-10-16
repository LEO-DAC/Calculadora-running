/**
 * =====================================================================
 * Archivo: detalle.js
 * Descripción: Lógica de la página de detalle de un entrenamiento.
 *
 *  1. Lee el id de la URL (detalle.html?id=...) y busca el
 *     entrenamiento guardado (storage.js).
 *  2. Analiza el recorrido (gpx.js): parciales, series para gráficas.
 *  3. Muestra métricas, ruta, gráficas sincronizadas con el mapa,
 *     parciales por km y todos los datos adicionales del archivo.
 *  4. Permite eliminar el entrenamiento y volver al dashboard.
 *
 * Depende de: gpx.js (GPX), storage.js (WorkoutStore), charts.js (Charts).
 * =====================================================================
 */

(function () {
  'use strict';

  const fmt = GPX.format;

  /* ------------------------------------------------------------------
   * 1. Referencias al DOM
   * ------------------------------------------------------------------ */
  const titleEl = document.getElementById('detail-title');
  const subtitleEl = document.getElementById('detail-subtitle');
  const errorEl = document.getElementById('detail-error');
  const contentEl = document.getElementById('detail-content');
  const statGridEl = document.getElementById('stat-grid');
  const mapEl = document.getElementById('route-map');
  const osmLink = document.getElementById('osm-link');
  const chartsEl = document.getElementById('detail-charts');
  const splitsSection = document.getElementById('splits-section');
  const splitsBody = document.getElementById('splits-body');
  const splitsPaceHead = document.getElementById('splits-pace-head');
  const moreDataEl = document.getElementById('more-data');
  const backButton = document.getElementById('back-button');
  const deleteButton = document.getElementById('delete-button');

  const workoutId = new URLSearchParams(window.location.search).get('id');

  /* ------------------------------------------------------------------
   * 2. Navegación
   * ------------------------------------------------------------------ */

  /**
   * Vuelve al dashboard: si esta ventana la abrió el dashboard, se
   * cierra; si no (enlace directo o navegador que no lo permite),
   * navega a index.html#entrenos.
   */
  function goBack() {
    if (window.opener && !window.opener.closed) {
      window.close();
    }
    // Si la ventana sigue abierta tras intentar cerrarla, navega
    setTimeout(function () { window.location.href = 'index.html#entrenos'; }, 150);
  }

  backButton.addEventListener('click', goBack);

  /** Muestra un mensaje cuando no se puede mostrar el entrenamiento. */
  function showError(message) {
    titleEl.textContent = 'Entrenamiento';
    subtitleEl.textContent = '';
    errorEl.textContent = message;
    errorEl.hidden = false;
    contentEl.hidden = true;
  }

  /* ------------------------------------------------------------------
   * 3. Utilidades de presentación
   * ------------------------------------------------------------------ */

  /**
   * Factor y unidad de la cadencia. Garmin/Strava guardan la cadencia de
   * carrera por pierna (~85-95); se multiplica por 2 para obtener pasos
   * por minuto (~170-190), como muestra Strava. En bici son rpm.
   */
  function cadenceInfo(w) {
    if (w.sport === 'ride') return { factor: 1, unit: 'rpm' };
    if (w.cadAvg && w.cadAvg < 120) return { factor: 2, unit: 'ppm' };
    return { factor: 1, unit: 'ppm' };
  }

  /** Crea una tarjeta de métrica. */
  function addStat(label, value, unit) {
    const tile = document.createElement('div');
    tile.className = 'stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'stat-value';
    valueEl.textContent = value;
    if (unit) {
      const unitEl = document.createElement('span');
      unitEl.className = 'stat-unit';
      unitEl.textContent = ' ' + unit;
      valueEl.appendChild(unitEl);
    }
    tile.append(labelEl, valueEl);
    statGridEl.appendChild(tile);
  }

  /** Agrega una fila "etiqueta — valor" a la lista de "Más datos". */
  function addDataRow(label, value) {
    if (value === null || value === undefined || value === '' || value === '—') return;
    const row = document.createElement('div');
    row.className = 'row';
    const labelEl = document.createElement('span');
    labelEl.className = 'row-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'row-value';
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    moreDataEl.appendChild(row);
  }

  /** Redondea o devuelve null. */
  function round(v) {
    return v === null || v === undefined ? null : Math.round(v);
  }

  /** "+12 m" / "−5 m" */
  function signedMeters(v) {
    if (v === null) return '—';
    const r = Math.round(v);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + ' m';
  }

  /** Distancia del eje X: "2.5 km", "10 km". */
  function formatKmAxis(v) {
    return parseFloat(v.toFixed(2)) + ' km';
  }

  /* ------------------------------------------------------------------
   * 4. Secciones del detalle
   * ------------------------------------------------------------------ */

  /** Encabezado y tarjetas de métricas principales. */
  function renderHeader(w, sport, splits) {
    document.title = w.name + ' · Detalle';
    titleEl.textContent = w.name;
    const when = w.startTime ? fmt.dateLong(w.startTime) + ' · ' + fmt.time(w.startTime) : 'Sin fecha';
    subtitleEl.textContent = sport.icon + ' ' + sport.label + ' · ' + when;

    const cad = cadenceInfo(w);
    addStat('Distancia', w.distanceKm.toFixed(2), 'km');
    if (w.movingSec) addStat('Tiempo en movimiento', fmt.duration(w.movingSec));
    if (sport.pace && w.paceSecKm) addStat('Ritmo medio', fmt.pace(w.paceSecKm), '/km');
    if (w.speedKmh) addStat('Velocidad media', w.speedKmh.toFixed(1), 'km/h');
    if (w.elevGain !== null) addStat('Desnivel positivo', String(Math.round(w.elevGain)), 'm');
    if (w.hrAvg) addStat('FC media', String(Math.round(w.hrAvg)), 'lpm');
    if (w.cadAvg) addStat('Cadencia media', String(Math.round(w.cadAvg * cad.factor)), cad.unit);

    // Mejor km completo (el más rápido)
    const full = splits.filter(function (s) { return !s.partial && s.sec; });
    if (sport.pace && full.length) {
      const best = full.reduce(function (a, b) { return a.sec <= b.sec ? a : b; });
      addStat('Mejor km', fmt.pace(best.sec), '/km');
    }
  }

  /** Enlace a OpenStreetMap centrado en el punto de inicio. */
  function renderOsmLink(track) {
    const lat = track.lat[0].toFixed(5);
    const lon = track.lon[0].toFixed(5);
    osmLink.href = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=15/' + lat + '/' + lon;
  }

  /**
   * Dibuja el mapa y las gráficas. Se vuelve a llamar al cambiar el
   * ancho de la ventana para que todo se ajuste.
   */
  function renderVisuals(w, sport, track, series) {
    const routeMap = Charts.route(mapEl, track);
    const cad = cadenceInfo(w);

    const list = [];
    if (series.ele.some(function (v) { return v !== null; })) {
      list.push({
        title: 'Altitud', unit: 'm', color: 'var(--series-elev)', values: series.ele, area: true, minSpan: 20,
        format: function (v) { return String(Math.round(v)); },
        summary: w.elevGain !== null ? '+' + Math.round(w.elevGain) + ' m' : ''
      });
    }
    if (sport.pace) {
      list.push({
        title: 'Ritmo', unit: '/km', color: 'var(--accent)', values: series.pace,
        invert: true, timeAxis: true, minSpan: 60, format: fmt.pace,
        summary: w.paceSecKm ? 'Prom. ' + fmt.pace(w.paceSecKm) + ' /km' : ''
      });
    } else {
      list.push({
        title: 'Velocidad', unit: 'km/h', color: 'var(--accent)', values: series.speed, minSpan: 4,
        format: function (v) { return v.toFixed(1); },
        summary: w.speedKmh ? 'Prom. ' + w.speedKmh.toFixed(1) + ' km/h' : ''
      });
    }
    if (series.hr.some(function (v) { return v !== null; })) {
      list.push({
        title: 'Frecuencia cardiaca', unit: 'lpm', color: 'var(--series-hr)', values: series.hr, minSpan: 10,
        format: function (v) { return String(Math.round(v)); },
        summary: 'Prom. ' + round(w.hrAvg) + ' · Máx. ' + round(w.hrMax) + ' lpm'
      });
    }
    if (series.cad.some(function (v) { return v !== null && v > 0; })) {
      list.push({
        title: 'Cadencia', unit: cad.unit, color: 'var(--series-cad)', minSpan: 10,
        values: series.cad.map(function (v) { return v ? v * cad.factor : null; }),
        format: function (v) { return String(Math.round(v)); },
        summary: w.cadAvg ? 'Prom. ' + Math.round(w.cadAvg * cad.factor) + ' ' + cad.unit : ''
      });
    }

    Charts.lineStack(chartsEl, {
      x: series.distKm,
      formatX: formatKmAxis,
      series: list,
      // Sincroniza el cursor de las gráficas con un punto en el mapa
      onHover: function (i) { routeMap.highlight(i === null ? null : series.index[i]); }
    });
  }

  /** Tabla de parciales por kilómetro. */
  function renderSplits(sport, splits) {
    if (!splits.length) {
      splitsSection.hidden = true;
      return;
    }
    splitsPaceHead.textContent = sport.pace ? 'Ritmo' : 'Velocidad';

    // Velocidad de cada tramo para dibujar barras comparativas
    const speeds = splits.map(function (s) { return s.sec ? s.distKm / s.sec : 0; });
    const maxSpeed = Math.max.apply(null, speeds) || 1;
    const full = splits.filter(function (s) { return !s.partial && s.sec; });
    const best = full.length ? full.reduce(function (a, b) { return a.sec <= b.sec ? a : b; }) : null;

    splits.forEach(function (s, i) {
      const tr = document.createElement('tr');
      if (s === best) tr.className = 'is-best';

      const kmCell = document.createElement('td');
      kmCell.textContent = s.label;

      const paceCell = document.createElement('td');
      if (!s.sec) {
        paceCell.textContent = '—';
      } else if (sport.pace) {
        paceCell.textContent = fmt.pace(s.sec / s.distKm);
      } else {
        paceCell.textContent = (s.distKm / (s.sec / 3600)).toFixed(1) + ' km/h';
      }

      const barCell = document.createElement('td');
      barCell.className = 'split-bar-cell';
      if (speeds[i]) {
        const barEl = document.createElement('div');
        barEl.className = 'split-bar';
        barEl.style.width = Math.max(8, (speeds[i] / maxSpeed) * 100) + '%';
        barCell.appendChild(barEl);
      }

      const hrCell = document.createElement('td');
      hrCell.className = 'num';
      hrCell.textContent = s.hr ? String(Math.round(s.hr)) : '—';

      const elevCell = document.createElement('td');
      elevCell.className = 'num';
      elevCell.textContent = signedMeters(s.elev);

      tr.append(kmCell, paceCell, barCell, hrCell, elevCell);
      splitsBody.appendChild(tr);
    });
  }

  /** Lista con todos los demás datos del archivo GPX. */
  function renderMoreData(w, sport) {
    const cad = cadenceInfo(w);
    const stoppedSec = w.elapsedSec !== null && w.movingSec !== null ? Math.max(0, w.elapsedSec - w.movingSec) : null;

    addDataRow('Fecha', w.startTime ? fmt.dateLong(w.startTime) + ', ' + fmt.time(w.startTime) : null);
    addDataRow('Tipo de actividad', sport.label + (w.rawType ? ' (' + w.rawType + ')' : ''));
    addDataRow('Distancia', w.distanceKm.toFixed(3) + ' km');
    addDataRow('Tiempo total', w.elapsedSec !== null ? fmt.duration(w.elapsedSec) : null);
    addDataRow('Tiempo en movimiento', w.movingSec ? fmt.duration(w.movingSec) : null);
    addDataRow('Tiempo detenido', stoppedSec !== null ? fmt.duration(stoppedSec) : null);
    addDataRow('Ritmo medio', w.paceSecKm ? fmt.pace(w.paceSecKm) + ' /km' : null);
    addDataRow('Velocidad media', w.speedKmh ? w.speedKmh.toFixed(2) + ' km/h' : null);
    addDataRow('Desnivel positivo', w.elevGain !== null ? Math.round(w.elevGain) + ' m' : null);
    addDataRow('Desnivel negativo', w.elevLoss !== null ? Math.round(w.elevLoss) + ' m' : null);
    addDataRow('Altitud mínima', w.eleMin !== null ? Math.round(w.eleMin) + ' m' : null);
    addDataRow('Altitud máxima', w.eleMax !== null ? Math.round(w.eleMax) + ' m' : null);
    addDataRow('FC media', w.hrAvg ? Math.round(w.hrAvg) + ' lpm' : null);
    addDataRow('FC máxima', w.hrMax ? Math.round(w.hrMax) + ' lpm' : null);
    addDataRow('Cadencia media', w.cadAvg ? Math.round(w.cadAvg * cad.factor) + ' ' + cad.unit : null);
    addDataRow('Cadencia máxima', w.cadMax ? Math.round(w.cadMax * cad.factor) + ' ' + cad.unit : null);
    addDataRow('Temperatura', w.tempAvg !== null
      ? 'Prom. ' + Math.round(w.tempAvg) + ' °C (' + Math.round(w.tempMin) + ' a ' + Math.round(w.tempMax) + ' °C)'
      : null);
    addDataRow('Potencia media', w.powerAvg ? Math.round(w.powerAvg) + ' W' : null);
    addDataRow('Potencia máxima', w.powerMax ? Math.round(w.powerMax) + ' W' : null);
    addDataRow('Puntos GPS', w.pointCount.toLocaleString('es'));
    addDataRow('Descripción', w.description);
    addDataRow('Generado por', w.creator);
    addDataRow('Archivo', w.fileName);
    addDataRow('Importado', fmt.date(w.importedAt) + ', ' + fmt.time(w.importedAt));
  }

  /* ------------------------------------------------------------------
   * 5. Carga del entrenamiento
   * ------------------------------------------------------------------ */

  if (!workoutId) {
    showError('No se indicó ningún entrenamiento. Vuelve a Entrenos y elige uno de la lista.');
    return;
  }

  WorkoutStore.get(workoutId)
    .then(function (data) {
      if (!data) {
        showError('Este entrenamiento no existe o fue eliminado.');
        return;
      }

      const w = data.summary;
      const track = data.track;
      const sport = GPX.sportInfo(w.sport);
      const analysis = GPX.analyze(track);
      const splits = GPX.splits(track, analysis);
      const series = GPX.series(track, analysis, 300);

      contentEl.hidden = false; // debe ser visible antes de medir anchos
      renderHeader(w, sport, splits);
      renderOsmLink(track);
      renderVisuals(w, sport, track, series);
      renderSplits(sport, splits);
      renderMoreData(w, sport);

      // Redibuja mapa y gráficas al cambiar el ancho (rotar, redimensionar)
      let lastWidth = chartsEl.clientWidth;
      const redraw = function () {
        const width = chartsEl.clientWidth;
        if (width && width !== lastWidth) {
          lastWidth = width;
          renderVisuals(w, sport, track, series);
        }
      };
      if (window.ResizeObserver) new ResizeObserver(redraw).observe(chartsEl);
      else window.addEventListener('resize', redraw);

      // Eliminar entrenamiento (con confirmación)
      deleteButton.addEventListener('click', function () {
        if (!confirm('¿Eliminar "' + w.name + '"? Esta acción no se puede deshacer.')) return;
        WorkoutStore.remove(w.id)
          .then(function () {
            WorkoutStore.notifyChange(); // el dashboard se actualiza solo
            goBack();
          })
          .catch(function (err) { alert('No se pudo eliminar el entrenamiento.\n' + err.message); });
      });
    })
    .catch(function (err) {
      showError('No se pudo cargar el entrenamiento. ' + err.message);
    });
})();
