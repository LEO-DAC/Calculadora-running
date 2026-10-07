/**
 * =====================================================================
 * Archivo: app.js
 * Descripción: Lógica de la Calculadora de Running.
 *
 *  Calculadora de Ritmo (secciones 1-7):
 *  - Muestra/oculta el campo de distancia personalizada ("Otro").
 *  - Restringe los campos para aceptar solo valores numéricos.
 *  - Valida el formulario y notifica errores con alert().
 *  - Calcula el ritmo (min/km), la velocidad (km/h) y muestra el resultado.
 *      ritmo (segundos por km) = tiempo total en segundos / distancia en km
 *
 *  Cambio de calculadora (sección 8):
 *  - Control segmentado que alterna entre las vistas Ritmo y Backyard.
 *
 *  Calculadora Backyard (sección 9):
 *  - Vueltas completas de 6.7 km + km extra opcionales (interruptor).
 *      km totales = vueltas × 6.7 + km extra
 * =====================================================================
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 1. Referencias a elementos del DOM
   * ------------------------------------------------------------------ */
  const form = document.getElementById('pace-form');
  const distanceSelect = document.getElementById('distance');   // select oculto (valor real)
  const pickerButton = document.getElementById('picker-button'); // botón del menú personalizado
  const pickerText = document.getElementById('picker-text');
  const pickerMenu = document.getElementById('picker-menu');
  const customRow = document.getElementById('custom-distance-row');
  const customInput = document.getElementById('custom-distance');
  const hoursInput = document.getElementById('hours');
  const minutesInput = document.getElementById('minutes');
  const secondsInput = document.getElementById('seconds');

  const resultsSection = document.getElementById('results');
  const paceValue = document.getElementById('pace-value');
  const speedValue = document.getElementById('speed-value');
  const distanceValue = document.getElementById('distance-value');
  const timeValue = document.getElementById('time-value');

  /* ------------------------------------------------------------------
   * 2. Utilidades de formato
   * ------------------------------------------------------------------ */

  /**
   * Agrega un cero a la izquierda a números menores de 10.
   * @param {number} n - Número entero.
   * @returns {string} Ej.: 5 -> "05"
   */
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /**
   * Convierte segundos totales a texto "h:mm:ss" (o "mm:ss" si no hay horas).
   * @param {number} totalSeconds - Segundos (puede tener decimales).
   * @returns {string}
   */
  function formatDuration(totalSeconds) {
    const rounded = Math.round(totalSeconds);
    const h = Math.floor(rounded / 3600);
    const m = Math.floor((rounded % 3600) / 60);
    const s = rounded % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  /**
   * Formatea un número de kilómetros sin ceros decimales innecesarios.
   * @param {number} km
   * @returns {string} Ej.: 10 -> "10 km", 21.0975 -> "21.0975 km"
   */
  function formatKm(km) {
    return `${parseFloat(km.toFixed(4))} km`;
  }

  /* ------------------------------------------------------------------
   * 3. Restricción de entrada: solo números
   * ------------------------------------------------------------------ */

  /**
   * Limpia el valor de un campo de tiempo dejando solo dígitos (0-9).
   * Se ejecuta en cada 'input', por lo que también cubre pegar texto
   * o el autocompletado del teclado móvil.
   * @param {Event} event
   */
  function sanitizeInteger(event) {
    const input = event.target;
    const clean = input.value.replace(/\D/g, '');
    if (clean !== input.value) input.value = clean;
  }

  /**
   * Limpia el campo de distancia personalizada: permite dígitos y un
   * único separador decimal. La coma se convierte en punto para
   * teclados en español que usan coma decimal.
   * @param {Event} event
   */
  function sanitizeDecimal(event) {
    const input = event.target;
    let clean = input.value.replace(',', '.').replace(/[^\d.]/g, '');
    const firstDot = clean.indexOf('.');
    if (firstDot !== -1) {
      // Elimina cualquier punto adicional después del primero
      clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '');
    }
    if (clean !== input.value) input.value = clean;
  }

  /**
   * Bloquea en el teclado físico cualquier tecla que no sea un número
   * (permitiendo teclas de control: borrar, flechas, tab, atajos, etc.).
   * @param {KeyboardEvent} event
   * @param {boolean} allowDecimal - true para permitir "." o ","
   */
  function blockNonNumericKeys(event, allowDecimal) {
    // Teclas de control y atajos (Ctrl/Cmd + C, V, A...) siempre permitidas
    if (event.key.length > 1 || event.ctrlKey || event.metaKey) return;
    if (/\d/.test(event.key)) return;
    if (allowDecimal && (event.key === '.' || event.key === ',')) return;
    event.preventDefault();
  }

  // Aplica las restricciones a los campos de tiempo (enteros)
  [hoursInput, minutesInput, secondsInput].forEach(function (input) {
    input.addEventListener('keydown', function (e) { blockNonNumericKeys(e, false); });
    input.addEventListener('input', sanitizeInteger);
  });

  // Aplica las restricciones al campo de distancia personalizada (decimal)
  customInput.addEventListener('keydown', function (e) { blockNonNumericKeys(e, true); });
  customInput.addEventListener('input', sanitizeDecimal);

  /* ------------------------------------------------------------------
   * 4. Dropdown personalizado estilo iOS
   * ------------------------------------------------------------------
   * El <select> nativo queda oculto y sigue guardando el valor. Este
   * menú solo es la "vista": lee las opciones del select, y al elegir
   * una actualiza el select y dispara su evento 'change'.
   */

  // Icono de check (✓) que se muestra en la opción seleccionada
  const CHECK_ICON =
    '<svg class="picker-check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /**
   * Construye los <li> del menú a partir de las <option> del select,
   * omitiendo la opción vacía "Seleccionar".
   */
  function buildPickerMenu() {
    Array.from(distanceSelect.options).forEach(function (option) {
      if (!option.value) return;

      const item = document.createElement('li');
      item.className = 'picker-option';
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '-1');
      item.dataset.value = option.value;
      item.innerHTML =
        CHECK_ICON +
        '<span class="picker-option-title"></span>' +
        '<span class="picker-option-detail"></span>';
      // textContent evita inyectar HTML desde los atributos
      item.children[1].textContent = option.dataset.title || option.text;
      item.children[2].textContent = option.dataset.detail || '';

      pickerMenu.appendChild(item);
    });
  }

  /** @returns {HTMLElement[]} Lista de opciones del menú. */
  function getPickerItems() {
    return Array.from(pickerMenu.querySelectorAll('.picker-option'));
  }

  /**
   * Sincroniza el botón y las marcas ✓ con el valor actual del select.
   * Se llama al elegir una opción y al limpiar el formulario.
   */
  function updatePickerDisplay() {
    const selected = distanceSelect.selectedOptions[0];
    const hasValue = Boolean(distanceSelect.value);

    pickerText.textContent = hasValue
      ? (selected.dataset.title || selected.text)
      : 'Seleccionar';
    pickerText.classList.toggle('is-placeholder', !hasValue);

    getPickerItems().forEach(function (item) {
      item.setAttribute('aria-selected', String(item.dataset.value === distanceSelect.value));
    });
  }

  /**
   * Abre el menú y enfoca la opción seleccionada (o la primera).
   */
  function openPicker() {
    pickerMenu.hidden = false;
    pickerButton.setAttribute('aria-expanded', 'true');
    const items = getPickerItems();
    const current = items.find(function (i) { return i.dataset.value === distanceSelect.value; });
    (current || items[0]).focus();
  }

  /**
   * Cierra el menú.
   * @param {boolean} returnFocus - true para devolver el foco al botón.
   */
  function closePicker(returnFocus) {
    if (pickerMenu.hidden) return;
    pickerMenu.hidden = true;
    pickerButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) pickerButton.focus();
  }

  /**
   * Aplica la opción elegida al select oculto y notifica el cambio.
   * @param {HTMLElement} item - <li> elegido.
   */
  function selectPickerItem(item) {
    distanceSelect.value = item.dataset.value;
    updatePickerDisplay();
    // "Otro" mueve el foco al campo de km; el resto lo devuelve al botón
    closePicker(item.dataset.value !== 'other');
    distanceSelect.dispatchEvent(new Event('change'));
  }

  // Abrir / cerrar con clic o toque en el botón
  pickerButton.addEventListener('click', function () {
    if (pickerMenu.hidden) openPicker(); else closePicker(true);
  });

  // Abrir con flechas desde el teclado
  pickerButton.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openPicker();
    }
  });

  // Elegir una opción con clic o toque
  pickerMenu.addEventListener('click', function (e) {
    const item = e.target.closest('.picker-option');
    if (item) selectPickerItem(item);
  });

  // Navegación con teclado dentro del menú
  pickerMenu.addEventListener('keydown', function (e) {
    const items = getPickerItems();
    const index = items.indexOf(document.activeElement);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[Math.min(index + 1, items.length - 1)].focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[Math.max(index - 1, 0)].focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0].focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1].focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (index !== -1) selectPickerItem(items[index]);
        break;
      case 'Escape':
        e.preventDefault();
        closePicker(true);
        break;
      case 'Tab':
        closePicker(false);
        break;
    }
  });

  // Cerrar al tocar/hacer clic fuera del menú
  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.picker')) closePicker(false);
  });

  buildPickerMenu();
  updatePickerDisplay();

  /* ------------------------------------------------------------------
   * 5. Dropdown: mostrar campo "Otro"
   * ------------------------------------------------------------------ */

  /**
   * Muestra y habilita el campo de distancia personalizada solo cuando
   * la opción seleccionada es "Otro"; en cualquier otro caso lo oculta,
   * lo deshabilita y lo vacía.
   */
  function toggleCustomDistance() {
    const isOther = distanceSelect.value === 'other';
    customRow.hidden = !isOther;
    customInput.disabled = !isOther;
    if (isOther) {
      customInput.focus();
    } else {
      customInput.value = '';
    }
  }

  distanceSelect.addEventListener('change', toggleCustomDistance);

  /* ------------------------------------------------------------------
   * 5. Lectura y validación del formulario
   * ------------------------------------------------------------------ */

  /**
   * Obtiene la distancia en km a partir del dropdown (o del campo "Otro").
   * Muestra un alert y devuelve null si el dato no es válido.
   * @returns {number|null}
   */
  function getDistanceKm() {
    const selected = distanceSelect.value;

    if (!selected) {
      alert('Por favor selecciona una distancia.');
      pickerButton.focus(); // el select real está oculto; enfocamos el botón visible
      return null;
    }

    if (selected === 'other') {
      const raw = customInput.value.trim();
      const km = Number(raw);
      if (raw === '' || !Number.isFinite(km) || km <= 0) {
        alert('Ingresa una distancia válida en kilómetros (número mayor que 0).');
        customInput.focus();
        return null;
      }
      return km;
    }

    return Number(selected);
  }

  /**
   * Lee horas, minutos y segundos, valida que sean numéricos y estén en
   * rango, y devuelve el tiempo total en segundos.
   * Muestra un alert y devuelve null si algún dato no es válido.
   * @returns {number|null}
   */
  function getTotalSeconds() {
    // Campos vacíos se consideran 0
    const fields = [
      { input: hoursInput, name: 'horas', max: Infinity },
      { input: minutesInput, name: 'minutos', max: 59 },
      { input: secondsInput, name: 'segundos', max: 59 }
    ];

    const values = [];
    for (const field of fields) {
      const raw = field.input.value.trim();

      // Validación de tipo: solo dígitos
      if (raw !== '' && !/^\d+$/.test(raw)) {
        alert(`El campo de ${field.name} solo acepta números.`);
        field.input.focus();
        return null;
      }

      const value = raw === '' ? 0 : parseInt(raw, 10);

      // Validación de rango (minutos y segundos de 0 a 59)
      if (value > field.max) {
        alert(`Los ${field.name} deben estar entre 0 y ${field.max}.`);
        field.input.focus();
        return null;
      }
      values.push(value);
    }

    const total = values[0] * 3600 + values[1] * 60 + values[2];

    if (total <= 0) {
      alert('Ingresa el tiempo de carrera (horas, minutos y/o segundos).');
      hoursInput.focus();
      return null;
    }

    return total;
  }

  /* ------------------------------------------------------------------
   * 6. Cálculo y presentación de resultados
   * ------------------------------------------------------------------ */

  /**
   * Calcula ritmo y velocidad.
   * @param {number} distanceKm - Distancia en kilómetros.
   * @param {number} totalSeconds - Tiempo total en segundos.
   * @returns {{paceSecondsPerKm:number, speedKmh:number}}
   */
  function calculatePace(distanceKm, totalSeconds) {
    return {
      paceSecondsPerKm: totalSeconds / distanceKm,          // s/km
      speedKmh: distanceKm / (totalSeconds / 3600)          // km/h
    };
  }

  /**
   * Escribe los resultados en la tarjeta y la hace visible.
   */
  function renderResults(distanceKm, totalSeconds, result) {
    paceValue.textContent = formatDuration(result.paceSecondsPerKm);
    speedValue.textContent = `${result.speedKmh.toFixed(2)} km/h`;
    distanceValue.textContent = formatKm(distanceKm);
    timeValue.textContent = formatDuration(totalSeconds);

    resultsSection.hidden = false;
    // Desplaza suavemente hasta el resultado (útil en pantallas pequeñas)
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ------------------------------------------------------------------
   * 7. Eventos del formulario
   * ------------------------------------------------------------------ */

  // Botón "Calcular": valida, calcula y muestra el resultado
  form.addEventListener('submit', function (event) {
    event.preventDefault(); // Evita recargar la página

    const distanceKm = getDistanceKm();
    if (distanceKm === null) return;

    const totalSeconds = getTotalSeconds();
    if (totalSeconds === null) return;

    const result = calculatePace(distanceKm, totalSeconds);
    renderResults(distanceKm, totalSeconds, result);
  });

  // Botón "Limpiar": el navegador vacía los campos; aquí ocultamos
  // resultados y el campo "Otro" después de que el reset se aplique.
  form.addEventListener('reset', function () {
    setTimeout(function () {
      closePicker(false);
      updatePickerDisplay();
      toggleCustomDistance();
      resultsSection.hidden = true;
    }, 0);
  });

  /* ==================================================================
   * 8. Cambio de calculadora (control segmentado Ritmo / Backyard)
   * ================================================================== */

  const switcher = document.getElementById('calc-switcher');
  const tabs = Array.from(switcher.querySelectorAll('.segmented-option'));
  const appTitle = document.getElementById('app-title');
  const appSubtitle = document.getElementById('app-subtitle');

  /**
   * Activa una pestaña: marca el segmento, mueve la pastilla, muestra
   * su vista, oculta las demás y actualiza título y subtítulo.
   * @param {number} index - Posición de la pestaña (0 = Ritmo, 1 = Backyard).
   */
  function activateTab(index) {
    tabs.forEach(function (tab, i) {
      const isActive = i === index;
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;  // solo la pestaña activa recibe Tab
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !isActive;
    });

    switcher.dataset.active = String(index);      // mueve la pastilla (CSS)
    appTitle.textContent = tabs[index].dataset.title;
    appSubtitle.textContent = tabs[index].dataset.subtitle;
    closePicker(false);                            // por si el menú quedó abierto
  }

  // Cambiar con clic o toque
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { activateTab(i); });
  });

  // Cambiar con flechas izquierda / derecha (patrón accesible de pestañas)
  switcher.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const current = tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; });
    const next = (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activateTab(next);
    tabs[next].focus();
  });

  /* ==================================================================
   * 9. Calculadora Backyard
   * ------------------------------------------------------------------
   * Fórmula:
   *    km totales = vueltas completas × 6.7 km + km extra (opcional)
   * Los km extra representan una vuelta incompleta, por lo que deben ser
   * mayores que 0 y menores que la distancia de una vuelta.
   * ================================================================== */

  /** Distancia de una vuelta del backyard, en km. */
  const BACKYARD_LAP_KM = 6.7;

  const backyardForm = document.getElementById('backyard-form');
  const lapsInput = document.getElementById('laps');
  const extraToggle = document.getElementById('extra-toggle');
  const extraRow = document.getElementById('extra-row');
  const extraInput = document.getElementById('extra-km');

  const backyardResults = document.getElementById('backyard-results');
  const backyardTotal = document.getElementById('backyard-total');
  const backyardLapsValue = document.getElementById('backyard-laps-value');
  const backyardLapsKm = document.getElementById('backyard-laps-km');
  const backyardExtraValue = document.getElementById('backyard-extra-value');

  // Restricción numérica: vueltas = enteros, km extra = decimales
  // (reutiliza las funciones de la sección 3)
  lapsInput.addEventListener('keydown', function (e) { blockNonNumericKeys(e, false); });
  lapsInput.addEventListener('input', sanitizeInteger);
  extraInput.addEventListener('keydown', function (e) { blockNonNumericKeys(e, true); });
  extraInput.addEventListener('input', sanitizeDecimal);

  /**
   * Muestra y habilita el campo de km extra solo si el interruptor está
   * encendido; al apagarlo lo oculta, lo deshabilita y lo vacía.
   */
  function updateExtraField() {
    const enabled = extraToggle.checked;
    extraRow.hidden = !enabled;
    extraInput.disabled = !enabled;
    if (enabled) {
      extraInput.focus();
    } else {
      extraInput.value = '';
    }
  }

  extraToggle.addEventListener('change', updateExtraField);

  /**
   * Lee y valida el número de vueltas completas.
   * Muestra un alert y devuelve null si el dato no es válido.
   * @returns {number|null}
   */
  function getLaps() {
    const raw = lapsInput.value.trim();

    if (raw === '') {
      alert('Ingresa el número de vueltas completadas.');
      lapsInput.focus();
      return null;
    }
    if (!/^\d+$/.test(raw)) {
      alert('El campo de vueltas solo acepta números enteros.');
      lapsInput.focus();
      return null;
    }
    return parseInt(raw, 10);
  }

  /**
   * Lee y valida los km extra. Si el interruptor está apagado devuelve 0.
   * Muestra un alert y devuelve null si el dato no es válido.
   * @returns {number|null}
   */
  function getExtraKm() {
    if (!extraToggle.checked) return 0;

    const raw = extraInput.value.trim();
    const km = Number(raw);

    if (raw === '' || !Number.isFinite(km) || km <= 0) {
      alert('Ingresa los km extra (número mayor que 0) o desactiva "Vuelta incompleta".');
      extraInput.focus();
      return null;
    }
    if (km >= BACKYARD_LAP_KM) {
      alert(`Los km extra deben ser menores a ${BACKYARD_LAP_KM} km (una vuelta completa). ` +
            'Si completaste la vuelta, súmala en "Vueltas completas".');
      extraInput.focus();
      return null;
    }
    return km;
  }

  /**
   * Calcula los kilómetros del backyard.
   * @param {number} laps - Vueltas completas.
   * @param {number} extraKm - Km extra de una vuelta incompleta.
   * @returns {{lapsKm:number, totalKm:number}}
   */
  function calculateBackyard(laps, extraKm) {
    const lapsKm = laps * BACKYARD_LAP_KM;
    return { lapsKm: lapsKm, totalKm: lapsKm + extraKm };
  }

  /**
   * Escribe el resultado del backyard en su tarjeta y la hace visible.
   */
  function renderBackyardResults(laps, extraKm, result) {
    // toFixed + parseFloat corrige errores de coma flotante (p. ej. 3 × 6.7)
    backyardTotal.textContent = String(parseFloat(result.totalKm.toFixed(3)));
    backyardLapsValue.textContent = String(laps);
    backyardLapsKm.textContent = formatKm(result.lapsKm);
    backyardExtraValue.textContent = extraKm > 0 ? formatKm(extraKm) : '—';

    backyardResults.hidden = false;
    backyardResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Botón "Calcular" del backyard
  backyardForm.addEventListener('submit', function (event) {
    event.preventDefault();

    const laps = getLaps();
    if (laps === null) return;

    const extraKm = getExtraKm();
    if (extraKm === null) return;

    if (laps === 0 && extraKm === 0) {
      alert('Ingresa al menos una vuelta completa o km extra.');
      lapsInput.focus();
      return;
    }

    renderBackyardResults(laps, extraKm, calculateBackyard(laps, extraKm));
  });

  // Botón "Limpiar" del backyard: tras el reset nativo (que apaga el
  // interruptor), oculta el campo extra y el resultado.
  backyardForm.addEventListener('reset', function () {
    setTimeout(function () {
      updateExtraField();
      backyardResults.hidden = true;
    }, 0);
  });
})();
