/**
 * =====================================================================
 * Archivo: gpx.js
 * Descripción: Lectura y análisis de archivos GPX (exportados desde
 * Strava, Garmin, Coros, etc.). Se comparte entre el dashboard
 * (index.html) y la página de detalle (detalle.html).
 *
 * Expone el objeto global `GPX` con:
 *  - GPX.parse(texto, nombreArchivo) -> { summary, track }
 *  - GPX.analyze(track)              -> distancias y tiempos acumulados
 *  - GPX.splits(track, analysis)     -> parciales por kilómetro
 *  - GPX.series(track, analysis, n)  -> datos remuestreados para gráficas
 *  - GPX.sportInfo(clave)            -> etiqueta e icono de la actividad
 *  - GPX.format.*                    -> utilidades de formato
 *
 * Estructura del "track" (arreglos paralelos, uno por punto GPS):
 *    { lat[], lon[], ele[], time[], hr[], cad[], temp[], power[] }
 *  - time en milisegundos (epoch). Un arreglo es null si el archivo
 *    no trae ese dato en ningún punto (ahorra espacio al guardar).
 * =====================================================================
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 1. Constantes
   * ------------------------------------------------------------------ */

  /** Radio medio de la Tierra en metros (para la fórmula de Haversine). */
  const EARTH_RADIUS_M = 6371008.8;

  /**
   * Velocidad mínima (m/s) para considerar que el atleta está en
   * movimiento. Por debajo, el tramo no suma "tiempo en movimiento"
   * (pausas, semáforos, auto-pausa del reloj), igual que hace Strava.
   */
  const MIN_MOVING_SPEED_MS = 0.5;

  /** Ritmos más lentos que esto (s/km) se consideran detenido en las gráficas. */
  const MAX_CHART_PACE_SEC = 30 * 60;

  /**
   * Tipos de actividad conocidos. `pace: true` indica que se expresa en
   * ritmo (min/km); `false` que se expresa en velocidad (km/h).
   */
  const SPORTS = {
    run:   { label: 'Carrera',    icon: '🏃', pace: true },
    ride:  { label: 'Ciclismo',   icon: '🚴', pace: false },
    walk:  { label: 'Caminata',   icon: '🚶', pace: true },
    hike:  { label: 'Senderismo', icon: '🥾', pace: true },
    swim:  { label: 'Natación',   icon: '🏊', pace: true },
    other: { label: 'Actividad',  icon: '⏱️', pace: true }
  };

  /** Orden en que se muestran los tipos de actividad en los filtros. */
  const SPORT_ORDER = ['run', 'ride', 'walk', 'hike', 'swim', 'other'];

  /**
   * Traducción del valor <type> del GPX a nuestra clave de actividad.
   * Strava exporta textos ("running", "cycling") y, en archivos antiguos,
   * códigos numéricos ("9" = carrera, "1" = bici, "10" = caminata).
   */
  const TYPE_MAP = {
    running: 'run', run: 'run', trail_running: 'run', trailrun: 'run',
    virtualrun: 'run', treadmill_running: 'run', '9': 'run',
    cycling: 'ride', biking: 'ride', ride: 'ride', road_biking: 'ride',
    mountain_biking: 'ride', virtualride: 'ride', ebikeride: 'ride',
    gravel_cycling: 'ride', '1': 'ride',
    walking: 'walk', walk: 'walk', '10': 'walk',
    hiking: 'hike', hike: 'hike', '4': 'hike',
    swimming: 'swim', swim: 'swim', open_water_swimming: 'swim'
  };

  /* ------------------------------------------------------------------
   * 2. Utilidades de lectura del XML
   * ------------------------------------------------------------------ */

  /**
   * Convierte un texto a número; devuelve null si no es válido.
   * @param {string|null} text
   * @returns {number|null}
   */
  function toNumber(text) {
    if (text === null || text === '') return null;
    const value = parseFloat(text);
    return Number.isFinite(value) ? value : null;
  }

  /**
   * Devuelve el texto del primer descendiente con ese nombre local,
   * sin importar el prefijo de namespace (gpxtpx:hr, ns3:hr, hr...).
   * @param {Element} element
   * @param {string} name - Nombre local de la etiqueta.
   * @returns {string|null}
   */
  function descendantText(element, name) {
    const found = element.getElementsByTagNameNS('*', name)[0];
    return found ? found.textContent.trim() : null;
  }

  /**
   * Devuelve el texto de un hijo DIRECTO con ese nombre local
   * (por ejemplo el <name> del <trk>, no el de un punto).
   * @param {Element|undefined} element
   * @param {string} name
   * @returns {string|null}
   */
  function childText(element, name) {
    if (!element) return null;
    for (const child of Array.from(element.children)) {
      if (child.localName === name) return child.textContent.trim();
    }
    return null;
  }

  /**
   * Si todos los valores de un arreglo son null, lo reemplaza por null
   * para no almacenar datos vacíos.
   * @param {Array} values
   * @returns {Array|null}
   */
  function compact(values) {
    return values.some(function (v) { return v !== null; }) ? values : null;
  }

  /* ------------------------------------------------------------------
   * 3. Cálculos geográficos y estadísticos
   * ------------------------------------------------------------------ */

  /**
   * Distancia en metros entre dos coordenadas (fórmula de Haversine).
   */
  function haversine(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /**
   * Suaviza una serie con media móvil centrada (ignora nulls).
   * Se usa en la altitud para que el ruido del GPS no infle el desnivel.
   * @param {Array<number|null>} values
   * @param {number} radius - Puntos a cada lado.
   * @returns {Array<number|null>}
   */
  function smooth(values, radius) {
    return values.map(function (value, i) {
      if (value === null) return null;
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
        if (values[j] !== null) { sum += values[j]; count++; }
      }
      return sum / count;
    });
  }

  /**
   * Promedio, mínimo y máximo de una serie ignorando nulls
   * (y ceros, si se indica: p. ej. cadencia 0 = detenido).
   * @param {Array<number|null>|null} values
   * @param {boolean} [skipZero=false]
   * @returns {{avg:number, min:number, max:number}|null}
   */
  function basicStats(values, skipZero) {
    if (!values) return null;
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (v === null || (skipZero && v === 0)) continue;
      sum += v;
      count++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return count ? { avg: sum / count, min: min, max: max } : null;
  }

  /**
   * Índice del último punto cuya distancia acumulada es <= x
   * (búsqueda binaria; `dist` está ordenado de forma creciente).
   * @param {number[]} dist
   * @param {number} x - Distancia en metros.
   * @returns {number}
   */
  function indexAt(dist, x) {
    let lo = 0;
    let hi = dist.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (dist[mid] <= x) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /**
   * Interpola linealmente el valor de una serie en la distancia x.
   * @param {Array<number|null>} values
   * @param {number[]} dist
   * @param {number} x
   * @returns {number|null}
   */
  function valueAt(values, dist, x) {
    const i = indexAt(dist, x);
    if (i >= dist.length - 1) return values[dist.length - 1];
    const a = values[i];
    const b = values[i + 1];
    if (a === null) return b;
    if (b === null) return a;
    const span = dist[i + 1] - dist[i];
    const f = span > 0 ? (x - dist[i]) / span : 0;
    return a + f * (b - a);
  }

  /* ------------------------------------------------------------------
   * 4. Tipo de actividad
   * ------------------------------------------------------------------ */

  /**
   * Determina la clave de actividad a partir del <type> del GPX y, si no
   * existe, a partir del nombre ("Carrera matutina", "Morning Ride"...).
   * @param {string|null} rawType
   * @param {string} name
   * @returns {string} Clave de SPORTS.
   */
  function detectSport(rawType, name) {
    if (rawType) {
      const key = rawType.trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (TYPE_MAP[key]) return TYPE_MAP[key];
    }
    const text = (name || '').toLowerCase();
    if (/run|carrera|correr|trote|trail/.test(text)) return 'run';
    if (/ride|bici|cicl|bike/.test(text)) return 'ride';
    if (/walk|camin/.test(text)) return 'walk';
    if (/hike|sender|excurs/.test(text)) return 'hike';
    if (/swim|nata/.test(text)) return 'swim';
    return 'other';
  }

  /**
   * Información visible de una actividad (etiqueta, icono, ritmo/velocidad).
   * @param {string} key
   */
  function sportInfo(key) {
    return SPORTS[key] || SPORTS.other;
  }

  /* ------------------------------------------------------------------
   * 5. Análisis del recorrido
   * ------------------------------------------------------------------ */

  /**
   * Calcula, para cada punto, la distancia acumulada (m) y el tiempo en
   * movimiento acumulado (s). También suaviza la altitud.
   * @param {object} track
   * @returns {{dist:number[], moving:number[], eleSmooth:Array|null}}
   */
  function analyze(track) {
    const n = track.lat.length;
    const dist = new Array(n);
    const moving = new Array(n);
    dist[0] = 0;
    moving[0] = 0;

    for (let i = 1; i < n; i++) {
      const d = haversine(track.lat[i - 1], track.lon[i - 1], track.lat[i], track.lon[i]);
      dist[i] = dist[i - 1] + d;
      moving[i] = moving[i - 1];

      if (track.time && track.time[i - 1] !== null && track.time[i] !== null) {
        const dt = (track.time[i] - track.time[i - 1]) / 1000;
        if (dt > 0 && d / dt >= MIN_MOVING_SPEED_MS) moving[i] += dt;
      }
    }

    return {
      dist: dist,
      moving: moving,
      eleSmooth: track.ele ? smooth(track.ele, 3) : null
    };
  }

  /**
   * Calcula el resumen de métricas del entrenamiento.
   * @param {object} track
   * @param {object} analysis - Resultado de analyze().
   * @returns {object}
   */
  function computeStats(track, analysis) {
    const n = track.lat.length;
    const distanceKm = analysis.dist[n - 1] / 1000;

    // Tiempos: primer y último punto con hora
    let firstTime = null;
    let lastTime = null;
    if (track.time) {
      firstTime = track.time.find(function (t) { return t !== null; }) || null;
      for (let i = n - 1; i >= 0; i--) {
        if (track.time[i] !== null) { lastTime = track.time[i]; break; }
      }
    }
    const elapsedSec = firstTime !== null && lastTime !== null ? (lastTime - firstTime) / 1000 : null;
    const movingSec = track.time ? analysis.moving[n - 1] : null;
    const hasPace = movingSec > 0 && distanceKm > 0;

    // Desnivel acumulado (con altitud suavizada)
    let elevGain = null;
    let elevLoss = null;
    if (analysis.eleSmooth) {
      elevGain = 0;
      elevLoss = 0;
      let prev = null;
      for (const e of analysis.eleSmooth) {
        if (e === null) continue;
        if (prev !== null) {
          if (e > prev) elevGain += e - prev; else elevLoss += prev - e;
        }
        prev = e;
      }
    }

    const ele = basicStats(track.ele);
    const hr = basicStats(track.hr, true);
    const cad = basicStats(track.cad, true);
    const temp = basicStats(track.temp);
    const power = basicStats(track.power, true);

    return {
      distanceKm: distanceKm,
      startTime: firstTime,
      elapsedSec: elapsedSec,
      movingSec: movingSec,
      paceSecKm: hasPace ? movingSec / distanceKm : null,
      speedKmh: hasPace ? distanceKm / (movingSec / 3600) : null,
      elevGain: elevGain,
      elevLoss: elevLoss,
      eleMin: ele ? ele.min : null,
      eleMax: ele ? ele.max : null,
      hrAvg: hr ? hr.avg : null,
      hrMax: hr ? hr.max : null,
      cadAvg: cad ? cad.avg : null,
      cadMax: cad ? cad.max : null,
      tempAvg: temp ? temp.avg : null,
      tempMin: temp ? temp.min : null,
      tempMax: temp ? temp.max : null,
      powerAvg: power ? power.avg : null,
      powerMax: power ? power.max : null,
      pointCount: n
    };
  }

  /* ------------------------------------------------------------------
   * 6. Lectura del archivo GPX
   * ------------------------------------------------------------------ */

  /**
   * Lee el texto de un archivo GPX y devuelve el resumen y el recorrido.
   * Lanza un Error con un mensaje en español si el archivo no es válido.
   * @param {string} text - Contenido del archivo.
   * @param {string} fileName - Nombre del archivo (respaldo para el título).
   * @returns {{summary: object, track: object}}
   */
  function parse(text, fileName) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');

    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('el archivo está dañado o no es XML válido.');
    }
    const root = doc.documentElement;
    if (!root || root.localName !== 'gpx') {
      throw new Error('el archivo no tiene formato GPX.');
    }

    // Puntos del recorrido: <trkpt> (actividades) o <rtept> (rutas)
    let nodes = doc.getElementsByTagNameNS('*', 'trkpt');
    if (nodes.length === 0) nodes = doc.getElementsByTagNameNS('*', 'rtept');

    const track = { lat: [], lon: [], ele: [], time: [], hr: [], cad: [], temp: [], power: [] };

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const lat = toNumber(node.getAttribute('lat'));
      const lon = toNumber(node.getAttribute('lon'));
      if (lat === null || lon === null) continue;

      const timeText = descendantText(node, 'time');
      const time = timeText ? Date.parse(timeText) : NaN;

      track.lat.push(lat);
      track.lon.push(lon);
      track.ele.push(toNumber(descendantText(node, 'ele')));
      track.time.push(Number.isFinite(time) ? time : null);
      // Extensiones de Garmin/Strava (<gpxtpx:TrackPointExtension>)
      track.hr.push(toNumber(descendantText(node, 'hr')));
      track.cad.push(toNumber(descendantText(node, 'cad')));
      track.temp.push(toNumber(descendantText(node, 'atemp') || descendantText(node, 'temp')));
      track.power.push(toNumber(descendantText(node, 'power')));
    }

    if (track.lat.length < 2) {
      throw new Error('el archivo no contiene puntos de recorrido.');
    }

    // Descarta las métricas que el archivo no trae
    ['ele', 'time', 'hr', 'cad', 'temp', 'power'].forEach(function (key) {
      track[key] = compact(track[key]);
    });

    // Metadatos: nombre, tipo, fecha y dispositivo/app que generó el archivo
    const metadata = doc.getElementsByTagNameNS('*', 'metadata')[0];
    const trk = doc.getElementsByTagNameNS('*', 'trk')[0];
    const name = childText(trk, 'name') || childText(metadata, 'name') ||
                 fileName.replace(/\.gpx$/i, '');
    const rawType = childText(trk, 'type');
    const metadataTime = Date.parse(childText(metadata, 'time') || '');

    const analysis = analyze(track);
    const stats = computeStats(track, analysis);
    if (stats.startTime === null && Number.isFinite(metadataTime)) stats.startTime = metadataTime;

    const summary = Object.assign({
      fileName: fileName,
      name: name,
      rawType: rawType,
      sport: detectSport(rawType, name),
      creator: root.getAttribute('creator') || null,
      description: childText(trk, 'desc') || childText(metadata, 'desc')
    }, stats);

    return { summary: summary, track: track };
  }

  /* ------------------------------------------------------------------
   * 7. Parciales por kilómetro
   * ------------------------------------------------------------------ */

  /**
   * Divide el recorrido en tramos de 1 km (más un tramo final parcial).
   * El tiempo de cada tramo es tiempo en movimiento, interpolado en el
   * punto exacto donde se cruza cada kilómetro.
   * @returns {Array<{label:string, distKm:number, sec:number|null,
   *                  hr:number|null, elev:number|null, partial:boolean}>}
   */
  function splits(track, analysis) {
    const { dist, moving, eleSmooth } = analysis;
    const n = dist.length;
    const total = dist[n - 1];
    const hasTime = Boolean(track.time);
    const result = [];

    let km = 1;
    let prevMoving = 0;
    let prevEle = eleSmooth ? valueAt(eleSmooth, dist, 0) : null;
    let hrSum = 0;
    let hrCount = 0;

    /** Agrega un tramo que termina en la distancia `end` (m). */
    function pushSplit(end, distKm, partial) {
      const mv = valueAt(moving, dist, end);
      const ele = eleSmooth ? valueAt(eleSmooth, dist, end) : null;
      result.push({
        label: partial ? (end / 1000).toFixed(2) : String(km),
        distKm: distKm,
        sec: hasTime ? mv - prevMoving : null,
        hr: hrCount ? hrSum / hrCount : null,
        elev: ele !== null && prevEle !== null ? ele - prevEle : null,
        partial: partial
      });
      prevMoving = mv;
      prevEle = ele;
      hrSum = 0;
      hrCount = 0;
    }

    for (let i = 1; i < n; i++) {
      if (track.hr && track.hr[i] !== null) { hrSum += track.hr[i]; hrCount++; }
      while (dist[i] >= km * 1000) {
        pushSplit(km * 1000, 1, false);
        km++;
      }
    }

    // Tramo final incompleto (si supera 50 m)
    const remaining = total - (km - 1) * 1000;
    if (remaining >= 50) pushSplit(total, remaining / 1000, true);

    return result;
  }

  /* ------------------------------------------------------------------
   * 8. Series para gráficas
   * ------------------------------------------------------------------ */

  /**
   * Remuestrea el recorrido en `samples` posiciones equidistantes (por
   * distancia) para graficar. El ritmo se calcula sobre una ventana de
   * al menos 200 m para suavizar el ruido del GPS.
   * @param {object} track
   * @param {object} analysis
   * @param {number} [samples=300]
   * @returns {{distKm:number[], ele:Array, pace:Array, speed:Array,
   *            hr:Array, cad:Array, index:number[]}}
   */
  function series(track, analysis, samples) {
    const { dist, moving, eleSmooth } = analysis;
    const n = dist.length;
    const total = dist[n - 1];
    const count = Math.max(2, Math.min(samples || 300, n));
    const step = total / (count - 1);
    const win = Math.max(200, step * 2);

    const out = { distKm: [], ele: [], pace: [], speed: [], hr: [], cad: [], index: [] };

    for (let k = 0; k < count; k++) {
      const x = k * step;
      const i = indexAt(dist, x);
      // Punto GPS más cercano (para ubicar la posición en el mapa)
      out.index.push(i < n - 1 && dist[i + 1] - x < x - dist[i] ? i + 1 : i);
      out.distKm.push(x / 1000);
      out.ele.push(eleSmooth ? valueAt(eleSmooth, dist, x) : null);
      out.hr.push(track.hr ? valueAt(track.hr, dist, x) : null);
      out.cad.push(track.cad ? valueAt(track.cad, dist, x) : null);

      let pace = null;
      if (track.time) {
        const a = Math.max(0, x - win / 2);
        const b = Math.min(total, x + win / 2);
        const dMoving = valueAt(moving, dist, b) - valueAt(moving, dist, a);
        const dKm = (b - a) / 1000;
        if (dMoving > 0 && dKm > 0) pace = dMoving / dKm;
        if (pace !== null && pace > MAX_CHART_PACE_SEC) pace = null;
      }
      out.pace.push(pace);
      out.speed.push(pace ? 3600 / pace : null);
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * 9. Formatos de presentación
   * ------------------------------------------------------------------ */

  const format = {
    /** Segundos -> "h:mm:ss" o "m:ss". */
    duration: function (sec) {
      if (sec === null || !Number.isFinite(sec)) return '—';
      const r = Math.round(sec);
      const h = Math.floor(r / 3600);
      const m = Math.floor((r % 3600) / 60);
      const s = r % 60;
      const pad = function (v) { return String(v).padStart(2, '0'); };
      return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
    },

    /** Segundos -> "12 h 05 min" o "45 min" (para totales grandes). */
    hoursMinutes: function (sec) {
      if (!sec) return '0 min';
      const totalMin = Math.round(sec / 60);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return h > 0 ? h + ' h ' + String(m).padStart(2, '0') + ' min' : m + ' min';
    },

    /** Segundos por km -> "5:12". */
    pace: function (secPerKm) {
      return secPerKm ? format.duration(secPerKm) : '—';
    },

    /** Número con decimales fijos -> "12.34". */
    number: function (value, decimals) {
      return value === null || !Number.isFinite(value) ? '—' : value.toFixed(decimals);
    },

    /** Fecha corta -> "12 oct 2026". */
    date: function (ms) {
      if (!ms) return 'Sin fecha';
      return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    /** Fecha larga -> "lunes, 12 de octubre de 2026". */
    dateLong: function (ms) {
      if (!ms) return 'Sin fecha';
      return new Date(ms).toLocaleDateString('es', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    },

    /** Hora -> "07:35". */
    time: function (ms) {
      if (!ms) return '';
      return new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    }
  };

  /* ------------------------------------------------------------------
   * 10. API pública
   * ------------------------------------------------------------------ */
  window.GPX = {
    parse: parse,
    analyze: analyze,
    splits: splits,
    series: series,
    sportInfo: sportInfo,
    SPORT_ORDER: SPORT_ORDER,
    format: format
  };
})();
