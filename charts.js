/**
 * =====================================================================
 * Archivo: charts.js
 * Descripción: Gráficas en SVG puro (sin librerías), con estilo iOS:
 * líneas finas, cuadrícula discreta y tooltip translúcido.
 *
 * Expone el objeto global `Charts` con:
 *  - Charts.bar(contenedor, opciones)       -> barras (km por mes)
 *  - Charts.lineStack(contenedor, opciones) -> varias gráficas de línea
 *        apiladas que comparten el eje X (distancia) y un mismo cursor
 *  - Charts.route(contenedor, track)        -> dibujo de la ruta GPS
 *
 * Los colores se pasan como `var(--color)` para respetar el modo
 * claro/oscuro. Los textos se insertan con textContent (nunca HTML).
 * =====================================================================
 */

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------
   * 1. Utilidades
   * ------------------------------------------------------------------ */

  /**
   * Crea un elemento SVG con atributos y lo agrega a `parent`.
   * @param {string} tag
   * @param {object} attrs
   * @param {Element} [parent]
   * @returns {SVGElement}
   */
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    if (parent) parent.appendChild(el);
    return el;
  }

  /**
   * Calcula marcas "redondas" para un eje (0, 5, 10, 15...).
   * @param {number} min
   * @param {number} max
   * @param {number} count - Número aproximado de divisiones.
   * @returns {{ticks:number[], min:number, max:number}}
   */
  function niceTicks(min, max, count) {
    if (max - min < 1e-9) { max = min + 1; }
    const rawStep = (max - min) / count;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / magnitude;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
    return buildTicks(min, max, step);
  }

  /**
   * Marcas para ejes de tiempo en segundos (ritmo): pasos de 5 s,
   * 10 s, 15 s, 30 s, 1 min, 2 min, 5 min...
   */
  function timeTicks(min, max, count) {
    const steps = [5, 10, 15, 20, 30, 60, 120, 300, 600];
    const span = Math.max(max - min, 1);
    const step = steps.find(function (s) { return span / s <= count; }) || 900;
    return buildTicks(min, max, step);
  }

  function buildTicks(min, max, step) {
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
    return { ticks: ticks, min: start, max: end };
  }

  /**
   * Percentil de una lista de números (para ignorar picos del GPS).
   */
  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
    return sorted[index];
  }

  /**
   * Crea el tooltip compartido de una gráfica.
   * @param {HTMLElement} container - Elemento con position: relative.
   */
  function createTooltip(container) {
    const tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    tip.hidden = true;
    container.appendChild(tip);

    return {
      /**
       * @param {string} title - Encabezado (fecha, distancia...).
       * @param {Array<{color:string, value:string, label:string}>} rows
       * @param {number} x - Posición horizontal (px) dentro del contenedor.
       * @param {number} [y=8] - Posición vertical (px).
       */
      show: function (title, rows, x, y) {
        tip.textContent = '';
        const head = document.createElement('div');
        head.className = 'tooltip-title';
        head.textContent = title;
        tip.appendChild(head);

        rows.forEach(function (row) {
          const line = document.createElement('div');
          line.className = 'tooltip-row';
          const key = document.createElement('span');
          key.className = 'tooltip-key';
          key.style.background = row.color;
          const value = document.createElement('span');
          value.className = 'tooltip-value';
          value.textContent = row.value;
          const label = document.createElement('span');
          label.className = 'tooltip-label';
          label.textContent = row.label;
          line.append(key, value, label);
          tip.appendChild(line);
        });

        tip.hidden = false;
        // Coloca el tooltip a la derecha del cursor; si no cabe, a la izquierda
        const width = tip.offsetWidth;
        const maxX = container.clientWidth - width - 4;
        let left = x + 12;
        if (left > maxX) left = x - width - 12;
        tip.style.left = Math.max(4, left) + 'px';
        tip.style.top = (y === undefined ? 8 : y) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  /**
   * Ruta SVG de una barra con la punta redondeada (4 px) y base recta.
   */
  function roundedBarPath(x, top, width, base) {
    const r = Math.min(4, width / 2, base - top);
    return 'M' + x + ',' + base +
           'V' + (top + r) +
           'Q' + x + ',' + top + ' ' + (x + r) + ',' + top +
           'H' + (x + width - r) +
           'Q' + (x + width) + ',' + top + ' ' + (x + width) + ',' + (top + r) +
           'V' + base + 'Z';
  }

  /* ------------------------------------------------------------------
   * 2. Gráfica de barras
   * ------------------------------------------------------------------ */

  /**
   * Dibuja una gráfica de barras verticales.
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {string[]} opts.labels   - Etiqueta de cada barra (eje X).
   * @param {number[]} opts.values   - Valor de cada barra.
   * @param {function(number):string} opts.formatTick - Formato del eje Y.
   * @param {function(number):string} opts.formatValue - Formato de la etiqueta de la barra mayor.
   * @param {function(number):{title:string, rows:Array}} opts.tooltip - Contenido al pasar el cursor.
   * @param {function(number):string} opts.ariaLabel - Descripción accesible de cada barra.
   * @param {number} [opts.height=220]
   */
  function bar(container, opts) {
    container.textContent = '';
    const width = container.clientWidth || 320;
    const height = opts.height || 220;
    const pad = { top: 22, right: 8, bottom: 26, left: 40 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const n = opts.values.length;

    const svg = svgEl('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height }, container);
    const tooltip = createTooltip(container);

    const maxValue = Math.max.apply(null, opts.values.concat([0]));
    const scale = niceTicks(0, maxValue || 10, 4);
    const y = function (v) { return pad.top + plotH - (v / scale.max) * plotH; };
    const base = pad.top + plotH;

    // Cuadrícula horizontal y etiquetas del eje Y
    scale.ticks.forEach(function (t) {
      svgEl('line', { x1: pad.left, x2: width - pad.right, y1: y(t), y2: y(t), class: 'chart-grid' }, svg);
      const label = svgEl('text', { x: pad.left - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'chart-axis-text' }, svg);
      label.textContent = opts.formatTick(t);
    });

    const band = plotW / n;
    const barWidth = Math.max(4, Math.min(24, band - 6));
    const maxIndex = maxValue > 0 ? opts.values.indexOf(maxValue) : -1;
    const bars = [];

    opts.values.forEach(function (value, i) {
      const cx = pad.left + band * (i + 0.5);

      // Etiqueta del eje X
      const label = svgEl('text', { x: cx, y: height - 8, 'text-anchor': 'middle', class: 'chart-axis-text' }, svg);
      label.textContent = opts.labels[i];

      // Barra (solo si tiene valor)
      let barEl = null;
      if (value > 0) {
        barEl = svgEl('path', { d: roundedBarPath(cx - barWidth / 2, y(value), barWidth, base), class: 'chart-bar' }, svg);
      }
      bars.push(barEl);

      // Etiqueta selectiva: solo el valor más alto
      if (i === maxIndex) {
        const valueLabel = svgEl('text', { x: cx, y: y(value) - 6, 'text-anchor': 'middle', class: 'chart-value-label' }, svg);
        valueLabel.textContent = opts.formatValue(value);
      }
    });

    // Zonas de interacción: toda la columna (más grande que la barra)
    opts.values.forEach(function (value, i) {
      const hit = svgEl('rect', {
        x: pad.left + band * i, y: pad.top, width: band, height: plotH,
        class: 'chart-hit', tabindex: 0, role: 'img', 'aria-label': opts.ariaLabel(i)
      }, svg);

      function show() {
        bars.forEach(function (b, j) { if (b) b.classList.toggle('is-active', j === i); });
        const content = opts.tooltip(i);
        tooltip.show(content.title, content.rows, pad.left + band * (i + 0.5), 4);
      }
      function hide() {
        bars.forEach(function (b) { if (b) b.classList.remove('is-active'); });
        tooltip.hide();
      }
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerdown', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('blur', hide);
    });
  }

  /* ------------------------------------------------------------------
   * 3. Gráficas de línea apiladas (comparten eje X y cursor)
   * ------------------------------------------------------------------ */

  /**
   * Dibuja una gráfica pequeña por serie, una debajo de otra, todas con
   * el mismo eje X (distancia). Un único cursor vertical recorre todas y
   * el tooltip muestra el valor de cada serie en ese punto.
   * (Se usa una gráfica por métrica para no mezclar dos escalas en un eje.)
   *
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {number[]} opts.x - Valores del eje X (km), crecientes.
   * @param {function(number):string} opts.formatX - Formato del eje X / tooltip.
   * @param {Array<object>} opts.series - Cada serie:
   *        { title, unit, color, values[], format(v), summary,
   *          invert (true = valores bajos arriba, p. ej. ritmo),
   *          area (true = relleno suave), timeAxis (true = eje en mm:ss),
   *          minSpan (rango mínimo del eje Y; por defecto 4) }
   * @param {function(number|null)} [opts.onHover] - Índice bajo el cursor.
   * @returns {{setIndex: function(number|null)}}
   */
  function lineStack(container, opts) {
    container.textContent = '';
    const width = container.clientWidth || 320;
    const pad = { top: 10, right: 14, bottom: 8, left: 46 };
    const chartH = 120;
    const axisH = 22;
    const x = opts.x;
    const n = x.length;
    const xMax = x[n - 1] || 1;
    const plotW = width - pad.left - pad.right;
    const sx = function (v) { return pad.left + (v / xMax) * plotW; };

    const seriesList = opts.series.filter(function (s) {
      return s.values.some(function (v) { return v !== null; });
    });
    const charts = [];

    seriesList.forEach(function (s, si) {
      const isLast = si === seriesList.length - 1;

      // Encabezado HTML: título + resumen (p. ej. "Prom. 5:12 /km")
      const head = document.createElement('div');
      head.className = 'chart-head';
      const title = document.createElement('span');
      title.className = 'chart-title';
      const key = document.createElement('span');
      key.className = 'chart-title-key';
      key.style.background = s.color;
      title.append(key, document.createTextNode(s.title));
      const summary = document.createElement('span');
      summary.className = 'chart-summary';
      summary.textContent = s.summary || '';
      head.append(title, summary);
      container.appendChild(head);

      const svgH = chartH + (isLast ? axisH : 0);
      const svg = svgEl('svg', { width: width, height: svgH, viewBox: '0 0 ' + width + ' ' + svgH }, container);
      const plotH = chartH - pad.top - pad.bottom;

      // Dominio del eje Y. En el ritmo se usan percentiles 5–95 para que las
      // pausas y los saltos del GPS no aplasten la línea (se recortan al borde).
      const sorted = s.values.filter(function (v) { return v !== null; }).sort(function (a, b) { return a - b; });
      let lo = percentile(sorted, s.invert ? 0.05 : 0);
      let hi = percentile(sorted, s.invert ? 0.95 : 1);
      // Rango mínimo: evita ejes exagerados (o marcas repetidas) si la serie
      // es casi constante, p. ej. una cadencia fija.
      const minSpan = s.minSpan || 4;
      if (hi - lo < minSpan) {
        const mid = (hi + lo) / 2;
        lo = mid - minSpan / 2;
        hi = mid + minSpan / 2;
      }
      const scale = s.timeAxis ? timeTicks(lo, hi, 3) : niceTicks(lo, hi, 3);

      const y = function (v) {
        const clamped = Math.min(scale.max, Math.max(scale.min, v));
        let t = (clamped - scale.min) / (scale.max - scale.min);
        if (s.invert) t = 1 - t;
        return pad.top + (1 - t) * plotH;
      };

      // Cuadrícula y etiquetas del eje Y
      scale.ticks.forEach(function (t) {
        if (s.timeAxis && t <= 0) return; // un ritmo de 0:00 no tiene sentido
        svgEl('line', { x1: pad.left, x2: width - pad.right, y1: y(t), y2: y(t), class: 'chart-grid' }, svg);
        const label = svgEl('text', { x: pad.left - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'chart-axis-text' }, svg);
        label.textContent = s.format(t);
      });

      // Agrupa los puntos en tramos continuos (la línea se corta donde no hay datos)
      const segments = [];
      let segment = null;
      s.values.forEach(function (v, i) {
        if (v === null) { segment = null; return; }
        if (!segment) { segment = []; segments.push(segment); }
        segment.push(sx(x[i]).toFixed(1) + ',' + y(v).toFixed(1));
      });
      const d = segments.map(function (pts) { return 'M' + pts.join('L'); }).join('');

      // Relleno suave bajo la línea (altitud): cada tramo se cierra contra la base
      if (s.area) {
        const baseY = (pad.top + plotH).toFixed(1);
        const areaD = segments.map(function (pts) {
          const firstX = pts[0].split(',')[0];
          const lastX = pts[pts.length - 1].split(',')[0];
          return 'M' + firstX + ',' + baseY + 'L' + pts.join('L') + 'L' + lastX + ',' + baseY + 'Z';
        }).join('');
        const areaEl = svgEl('path', { d: areaD, class: 'chart-area' }, svg);
        areaEl.style.fill = s.color;
      }

      const line = svgEl('path', { d: d, class: 'chart-line' }, svg);
      line.style.stroke = s.color;

      // Eje X (solo en la última gráfica)
      if (isLast) {
        const xScale = niceTicks(0, xMax, Math.max(2, Math.floor(plotW / 70)));
        xScale.ticks.forEach(function (t) {
          if (t > xMax) return;
          const label = svgEl('text', { x: sx(t), y: chartH + 14, 'text-anchor': 'middle', class: 'chart-axis-text' }, svg);
          label.textContent = opts.formatX(t);
        });
      }

      // Cursor vertical y punto (ocultos hasta pasar el cursor)
      const cross = svgEl('line', { y1: pad.top, y2: chartH - pad.bottom, class: 'chart-crosshair', visibility: 'hidden' }, svg);
      const dot = svgEl('circle', { r: 4.5, class: 'chart-dot', visibility: 'hidden' }, svg);
      dot.style.fill = s.color;

      charts.push({ s: s, svg: svg, y: y, cross: cross, dot: dot });
    });

    const tooltip = createTooltip(container);
    let current = null;

    /** Muestra el cursor en el índice i (o lo oculta con null). */
    function setIndex(i) {
      current = i;
      if (i === null) {
        charts.forEach(function (c) {
          c.cross.setAttribute('visibility', 'hidden');
          c.dot.setAttribute('visibility', 'hidden');
        });
        tooltip.hide();
        if (opts.onHover) opts.onHover(null);
        return;
      }

      const px = sx(x[i]);
      const rows = [];
      charts.forEach(function (c) {
        const v = c.s.values[i];
        c.cross.setAttribute('x1', px);
        c.cross.setAttribute('x2', px);
        c.cross.setAttribute('visibility', 'visible');
        if (v !== null) {
          c.dot.setAttribute('cx', px);
          c.dot.setAttribute('cy', c.y(v));
          c.dot.setAttribute('visibility', 'visible');
        } else {
          c.dot.setAttribute('visibility', 'hidden');
        }
        rows.push({
          color: c.s.color,
          value: v !== null ? c.s.format(v) + ' ' + c.s.unit : '—',
          label: c.s.title
        });
      });

      const svgLeft = charts.length ? charts[0].svg.getBoundingClientRect().left - container.getBoundingClientRect().left : 0;
      tooltip.show(opts.formatX(x[i]), rows, px + svgLeft, 40);
      if (opts.onHover) opts.onHover(i);
    }

    /** Convierte la posición del puntero en el índice más cercano. */
    function indexFromPointer(event) {
      if (!charts.length) return null;
      const rect = charts[0].svg.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (event.clientX - rect.left - pad.left) / plotW));
      const target = t * xMax;
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (x[mid] < target) lo = mid; else hi = mid;
      }
      return target - x[lo] < x[hi] - target ? lo : hi;
    }

    // Se asignan como propiedades (no addEventListener) para que, al
    // redibujar por cambio de tamaño, no se acumulen manejadores repetidos.
    container.onpointermove = function (e) { setIndex(indexFromPointer(e)); };
    container.onpointerdown = function (e) { setIndex(indexFromPointer(e)); };
    container.onpointerleave = function () { setIndex(null); };

    // Teclado: flechas para recorrer la gráfica, Escape para salir
    container.tabIndex = 0;
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Gráficas del entrenamiento. Usa las flechas para recorrerlas.');
    container.onkeydown = function (e) {
      const step = Math.max(1, Math.round(n / 60));
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const base = current === null ? 0 : current;
        setIndex(Math.min(n - 1, Math.max(0, base + (e.key === 'ArrowRight' ? step : -step))));
      } else if (e.key === 'Escape') {
        setIndex(null);
      }
    };
    container.onblur = function () { setIndex(null); };

    return { setIndex: setIndex };
  }

  /* ------------------------------------------------------------------
   * 4. Mapa de la ruta
   * ------------------------------------------------------------------ */

  /**
   * Dibuja el recorrido GPS como una línea, con proyección Mercator
   * (la misma de los mapas web) para conservar la forma real.
   * @param {HTMLElement} container
   * @param {object} track - { lat[], lon[] }
   * @returns {{highlight: function(number|null)}} Marca un punto en la ruta.
   */
  function route(container, track) {
    container.textContent = '';
    const width = container.clientWidth || 320;
    const n = track.lat.length;
    const pad = 24;

    // Proyección Mercator: x = longitud, y = ln(tan(45° + lat/2))
    const px = new Array(n);
    const py = new Array(n);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      px[i] = track.lon[i] * Math.PI / 180;
      py[i] = Math.log(Math.tan(Math.PI / 4 + track.lat[i] * Math.PI / 360));
      if (px[i] < minX) minX = px[i];
      if (px[i] > maxX) maxX = px[i];
      if (py[i] < minY) minY = py[i];
      if (py[i] > maxY) maxY = py[i];
    }
    const spanX = Math.max(maxX - minX, 1e-9);
    const spanY = Math.max(maxY - minY, 1e-9);

    // Alto proporcional a la forma de la ruta (con límites)
    const height = Math.round(Math.min(Math.max(width * (spanY / spanX), 220), Math.min(440, width * 1.1)));
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offX = (width - spanX * scale) / 2;
    const offY = (height - spanY * scale) / 2;
    const X = function (i) { return (px[i] - minX) * scale + offX; };
    const Y = function (i) { return (maxY - py[i]) * scale + offY; };

    const svg = svgEl('svg', {
      width: width, height: height, viewBox: '0 0 ' + width + ' ' + height,
      role: 'img', 'aria-label': 'Mapa del recorrido'
    }, container);

    // Simplifica la línea a ~2000 puntos como máximo (rendimiento)
    const step = Math.max(1, Math.ceil(n / 2000));
    let d = '';
    for (let i = 0; i < n; i += step) d += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ',' + Y(i).toFixed(1);
    d += 'L' + X(n - 1).toFixed(1) + ',' + Y(n - 1).toFixed(1);

    svgEl('path', { d: d, class: 'route-line' }, svg);
    svgEl('circle', { cx: X(0), cy: Y(0), r: 6, class: 'route-start' }, svg);
    svgEl('circle', { cx: X(n - 1), cy: Y(n - 1), r: 6, class: 'route-end' }, svg);
    const marker = svgEl('circle', { r: 7, class: 'route-marker', visibility: 'hidden' }, svg);

    return {
      highlight: function (i) {
        if (i === null || i === undefined) {
          marker.setAttribute('visibility', 'hidden');
          return;
        }
        marker.setAttribute('cx', X(i));
        marker.setAttribute('cy', Y(i));
        marker.setAttribute('visibility', 'visible');
      }
    };
  }

  /* ------------------------------------------------------------------
   * 5. API pública
   * ------------------------------------------------------------------ */
  window.Charts = { bar: bar, lineStack: lineStack, route: route };
})();
