/**
 * =====================================================================
 * Archivo: ui.js
 * Descripción: Utilidades de interfaz compartidas por todas las
 * secciones. Expone el objeto global `UI`:
 *
 *  - UI.esc(texto)            escapa texto para insertarlo en HTML
 *  - UI.openModal(html)       hoja modal (cierra con ✕, fondo o Escape)
 *  - UI.closeModal()
 *  - UI.toast(mensaje)        aviso breve en la parte inferior
 *  - UI.avatar(nombre, color, tamaño, foto) foto de perfil o iniciales
 *  - Formatos: km, ritmo, duración, fechas, variación porcentual
 *  - Fechas: iso, parseIso, monday, addDays, relDay...
 *
 * IMPORTANTE: todo texto que venga del usuario o del servidor (nombres,
 * notas, objetivos) se inserta con UI.esc() para evitar inyección de HTML.
 * =====================================================================
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 1. Texto seguro
   * ------------------------------------------------------------------ */

  /** Escapa &, <, >, " y ' para insertar texto en HTML. */
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------------
   * 2. Hoja modal
   * ------------------------------------------------------------------ */

  const modal = document.getElementById('modal');
  const sheet = document.getElementById('sheet');
  let lastFocus = null;

  /**
   * Abre la hoja modal con el HTML indicado (agrega el botón ✕).
   * @param {string} html
   * @returns {HTMLElement} La hoja, para enlazar eventos a su contenido.
   */
  function openModal(html) {
    lastFocus = document.activeElement;
    sheet.innerHTML = '<button type="button" class="sheet-close" data-close aria-label="Cerrar">✕</button>' + html;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    sheet.focus();
    return sheet;
  }

  /** Cierra la hoja modal y devuelve el foco a donde estaba. */
  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    sheet.innerHTML = '';
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (modal) {
    // Cierra al tocar el fondo oscuro o un elemento con data-close
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  /* ------------------------------------------------------------------
   * 3. Aviso breve (toast)
   * ------------------------------------------------------------------ */

  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  /** Muestra un aviso breve durante ~2.5 s. */
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2600);
  }

  /* ------------------------------------------------------------------
   * 4. Avatar
   * ------------------------------------------------------------------ */

  /** Iniciales de un nombre: "Ana Torres" -> "AT". */
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }

  /**
   * Círculo con la foto de perfil o, si no hay, las iniciales sobre el
   * color del usuario. Si la foto no carga, se ven las iniciales.
   * @param {string} name
   * @param {string} color - Color hexadecimal (#rrggbb).
   * @param {number} [size=38] - Diámetro en px.
   * @param {string|null} [photo] - URL de la foto (user.avatar, de api/avatar.php).
   */
  function avatar(name, color, size, photo) {
    const s = size || 38;
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#0a66c2';
    const img = photo && /^api\/avatar\.php\?id=\d+&v=\d+$/.test(photo)
      ? '<img src="' + esc(photo) + '" alt="" loading="lazy" onerror="this.remove()">' : '';
    return '<span class="avatar" style="background:' + safeColor + ';width:' + s + 'px;height:' + s +
           'px;font-size:' + Math.round(s * 0.37) + 'px" aria-hidden="true">' + esc(initials(name)) + img + '</span>';
  }

  /* ------------------------------------------------------------------
   * 5. Formatos
   * ------------------------------------------------------------------ */

  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                       'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  /** Primera letra en mayúscula. */
  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  /** Km: "12.3", o "1,234" a partir de 100. */
  function fmtKm(v) {
    v = v || 0;
    return v >= 100 ? Math.round(v).toLocaleString('es-MX') : v.toFixed(1);
  }

  /** Segundos por km -> "5:12" ("—" si no hay dato). */
  function fmtPace(sec) {
    if (!sec || !isFinite(sec)) return '—';
    const s = Math.round(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /** Minutos -> "1 h 05 min" o "45 min". */
  function fmtDur(min) {
    const m = Math.round(min || 0);
    return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min';
  }

  /** Fecha -> "15 oct 2026". */
  function fmtDate(d) {
    return d.getDate() + ' ' + MONTHS[d.getMonth()].toLowerCase() + ' ' + d.getFullYear();
  }

  /**
   * Insignia de variación porcentual entre a (antes) y b (después).
   * Verde si mejora y rojo si empeora (con ▲/▼, no solo color).
   * @param {number} a
   * @param {number} b
   * @param {boolean} [lowerIsBetter=false] - p. ej. el ritmo.
   */
  function delta(a, b, lowerIsBetter) {
    if (!a || !b) return '<span class="delta">—</span>';
    const pct = (b - a) / a * 100;
    const better = lowerIsBetter ? pct < 0 : pct > 0;
    const cls = Math.abs(pct) < 0.5 ? '' : (better ? ' is-up' : ' is-down');
    return '<span class="delta' + cls + '">' + (pct >= 0 ? '▲' : '▼') + ' ' + Math.abs(pct).toFixed(0) + '%</span>';
  }

  /* ------------------------------------------------------------------
   * 6. Fechas (zona horaria local del dispositivo)
   * ------------------------------------------------------------------ */

  /** Date -> "2026-10-15". */
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** "2026-10-15" -> Date a las 00:00 locales. */
  function parseIso(text) {
    const p = String(text).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  /** Hoy a las 00:00. */
  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Suma días a una fecha (devuelve una nueva). */
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  /** Lunes de la semana de la fecha, a las 00:00. */
  function monday(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - (x.getDay() + 6) % 7);
    return x;
  }

  /** "hoy", "ayer" o "hace N días". */
  function relDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const n = Math.round((today() - d) / 86400000);
    return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' días';
  }

  window.UI = {
    esc: esc,
    openModal: openModal,
    closeModal: closeModal,
    toast: toast,
    initials: initials,
    avatar: avatar,
    MONTHS: MONTHS,
    MONTHS_LONG: MONTHS_LONG,
    DAYS: DAYS,
    capitalize: capitalize,
    fmtKm: fmtKm,
    fmtPace: fmtPace,
    fmtDur: fmtDur,
    fmtDate: fmtDate,
    delta: delta,
    iso: iso,
    parseIso: parseIso,
    today: today,
    addDays: addDays,
    monday: monday,
    relDay: relDay
  };
})();
