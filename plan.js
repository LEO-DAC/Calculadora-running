/**
 * =====================================================================
 * Archivo: plan.js
 * Descripción: Sección "Mi plan" del alumno.
 *
 *  - Mensaje del entrenador.
 *  - Semana actual (con flechas para ir a otras semanas): cada día
 *    muestra los entrenamientos asignados o "Descanso".
 *  - Avance de la semana: km corridos (importados) vs km planificados
 *    y sesiones completadas.
 *  - Próximos entrenamientos pendientes.
 *  - Al tocar un entrenamiento: estructura, indicaciones del entrenador
 *    y botón para marcarlo como hecho / pendiente.
 *
 * Datos: api/assignments.php (plan) y api/workouts.php (km corridos).
 * Depende de: Api, UI, Structure, WorkoutStore, App.
 * =====================================================================
 */

(function () {
  'use strict';

  const esc = UI.esc;
  const root = document.getElementById('plan-root');

  const state = {
    weekOffset: 0,     // 0 = semana actual, -1 = anterior, 1 = siguiente
    assignments: [],
    workouts: [],
    loaded: false
  };

  /* ------------------------------------------------------------------
   * 1. Datos
   * ------------------------------------------------------------------ */

  /** Carga el plan y los entrenamientos del alumno. */
  function load() {
    return Promise.all([Api.get('api/assignments.php'), WorkoutStore.getAll()])
      .then(function (results) {
        state.assignments = results[0];
        state.workouts = results[1];
        state.loaded = true;
        render();
      })
      .catch(function (err) {
        root.innerHTML = '<div class="group empty-state">' + esc(err.message) + '</div>';
      });
  }

  /** Asignación por id. */
  function findAssignment(id) {
    return state.assignments.find(function (a) { return a.id === id; });
  }

  /* ------------------------------------------------------------------
   * 2. Dibujo
   * ------------------------------------------------------------------ */

  /** Botón de un entreno en el calendario semanal. */
  function dayChip(a) {
    const t = Structure.type(a.tipo);
    return '<button type="button" class="plan-chip' + (a.status === 'done' ? ' is-done' : '') + '" data-open="' + a.id +
           '" style="--type:var(--t-' + esc(a.tipo) + ');--type-bg:var(--t-' + esc(a.tipo) + '-bg)">' +
           '<b>' + (a.status === 'done' ? '✓ ' : '') + t.label + '</b>' + esc(a.name) + '</button>';
  }

  function render() {
    const coach = App.coach;
    const today = UI.today();
    const start = UI.addDays(UI.monday(today), state.weekOffset * 7);
    const days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return UI.addDays(start, i); });
    const end = UI.addDays(start, 7);

    const weekPlan = state.assignments.filter(function (a) {
      const d = UI.parseIso(a.date);
      return d >= start && d < end;
    });
    const plannedKm = weekPlan.reduce(function (sum, a) { return sum + Structure.totals(a.steps).km; }, 0);
    const doneKm = state.workouts.reduce(function (sum, w) {
      const d = new Date(w.startTime || w.importedAt);
      return d >= start && d < end ? sum + w.distanceKm : sum;
    }, 0);
    const doneSessions = weekPlan.filter(function (a) { return a.status === 'done'; }).length;
    const progress = plannedKm ? Math.min(100, doneKm / plannedKm * 100) : 0;

    const pending = state.assignments.filter(function (a) { return a.status === 'pending'; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });

    const fmtShort = function (d) { return d.getDate() + ' ' + UI.MONTHS[d.getMonth()].toLowerCase(); };

    root.innerHTML =
      // Mensaje del entrenador
      '<div class="group coach-card">' +
        (coach ? UI.avatar(coach.name, coach.color, 46) : '') +
        '<div><b>' + esc(coach ? coach.name : 'Sin entrenador') + '</b> <span class="muted">· tu entrenador</span>' +
        '<p>' + (App.user.coachNote ? '“' + esc(App.user.coachNote) + '”' : 'Tu entrenador aún no te ha dejado un mensaje.') + '</p></div>' +
      '</div>' +

      // Navegación de semanas
      '<div class="week-nav">' +
        '<button type="button" class="round-button" data-week="-1" aria-label="Semana anterior">‹</button>' +
        '<h2 class="section-title">Semana del ' + fmtShort(days[0]) + ' al ' + fmtShort(days[6]) +
          (state.weekOffset !== 0 ? ' · <a href="#" class="inline-link" data-week="0">Hoy</a>' : '') + '</h2>' +
        '<button type="button" class="round-button" data-week="1" aria-label="Semana siguiente">›</button>' +
      '</div>' +

      // Calendario semanal
      '<div class="week-grid">' + days.map(function (d, i) {
        const items = weekPlan.filter(function (a) { return a.date === UI.iso(d); });
        const isToday = UI.iso(d) === UI.iso(today);
        return '<div class="week-day' + (isToday ? ' is-today' : '') + '">' +
                 '<h4>' + UI.DAYS[i] + '<b>' + d.getDate() + '</b></h4>' +
                 (items.map(dayChip).join('') || '<span class="week-rest">Descanso</span>') +
               '</div>';
      }).join('') + '</div>' +

      // Avance de la semana
      '<div class="group week-progress">' +
        '<div class="week-progress-text"><span><b>' + UI.fmtKm(doneKm) + '</b> <span class="muted">de ' + UI.fmtKm(plannedKm) +
          ' km planificados esta semana</span></span><span class="muted">' + doneSessions + '/' + weekPlan.length +
          ' sesiones completadas</span></div>' +
        '<div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
          Math.round(progress) + '"><div style="width:' + progress + '%"></div></div>' +
      '</div>' +

      // Próximos entrenamientos
      '<h2 class="section-title">Próximos entrenamientos</h2>' +
      '<div class="group">' + (pending.length ? pending.map(function (a) {
        const t = Structure.type(a.tipo);
        const tt = Structure.totals(a.steps);
        const d = UI.parseIso(a.date);
        const late = d < today;
        return '<button type="button" class="next-row" data-open="' + a.id + '">' +
                 '<span class="type-icon" style="--type-bg:var(--t-' + esc(a.tipo) + '-bg)">' + t.emoji + '</span>' +
                 '<span class="next-info"><b>' + esc(a.name) + '</b><span>' + t.label + ' · ' + UI.DAYS[(d.getDay() + 6) % 7] + ' ' +
                   UI.fmtDate(d) + (late ? ' · <em class="late">atrasado</em>' : '') + ' · ≈ ' + UI.fmtKm(tt.km) + ' km · ' +
                   UI.fmtDur(tt.sec / 60) + '</span></span>' +
                 '<span class="next-struct">' + Structure.svg(a.steps, 36, a.tipo) + '</span>' +
                 '<span class="chevron" aria-hidden="true">›</span>' +
               '</button>';
      }).join('') : '<div class="list-empty">' + (state.assignments.length
        ? '¡Al día! No tienes entrenamientos pendientes.'
        : 'Tu entrenador aún no te ha asignado entrenamientos.') + '</div>') + '</div>';
  }

  /* ------------------------------------------------------------------
   * 3. Detalle de un entrenamiento asignado
   * ------------------------------------------------------------------ */

  function openAssignment(id) {
    const a = findAssignment(id);
    if (!a) return;
    const tt = Structure.totals(a.steps);
    const coach = App.coach;
    const done = a.status === 'done';

    const sheet = UI.openModal(
      Structure.badge(a.tipo) +
      '<h2 class="sheet-title">' + esc(a.name) + '</h2>' +
      '<div class="muted">' + UI.capitalize(UI.parseIso(a.date).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })) +
        (coach ? ' · asignado por ' + esc(coach.name) : '') + '</div>' +
      '<div class="kpi-grid kpi-grid-3">' +
        '<div class="kpi"><span>Distancia est.</span><b>' + UI.fmtKm(tt.km) + ' km</b></div>' +
        '<div class="kpi"><span>Duración est.</span><b>' + UI.fmtDur(tt.sec / 60) + '</b></div>' +
        '<div class="kpi"><span>Estado</span><b>' + (done ? '<span class="status-badge is-done">✓ Completado</span>'
                                                         : '<span class="status-badge">Pendiente</span>') + '</b></div>' +
      '</div>' +
      '<div class="group padded">' + Structure.svg(a.steps, 70, a.tipo) + Structure.listHtml(a.steps) + '</div>' +
      (a.note ? '<div class="group padded note-card">' + (coach ? UI.avatar(coach.name, coach.color, 32) : '') +
        '<div><b>Indicaciones de tu entrenador</b><p>' + esc(a.note) + '</p></div></div>' : '') +
      '<button type="button" class="btn-primary" id="status-button">' +
        (done ? 'Marcar como pendiente' : 'Marcar como hecho') + '</button>'
    );

    sheet.querySelector('#status-button').addEventListener('click', function (e) {
      e.target.disabled = true;
      Api.post('api/assignments.php', { action: 'status', id: a.id, status: done ? 'pending' : 'done' })
        .then(function (updated) {
          Object.assign(a, updated);
          UI.closeModal();
          render();
          UI.toast(done ? 'Entreno marcado como pendiente' : '¡Entreno marcado como hecho!');
        })
        .catch(function (err) {
          e.target.disabled = false;
          alert(err.message);
        });
    });
  }

  /* ------------------------------------------------------------------
   * 4. Eventos
   * ------------------------------------------------------------------ */

  root.addEventListener('click', function (e) {
    const week = e.target.closest('[data-week]');
    if (week) {
      e.preventDefault();
      const value = Number(week.dataset.week);
      state.weekOffset = value === 0 ? 0 : state.weekOffset + value;
      render();
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) openAssignment(Number(open.dataset.open));
  });

  App.register('plan', {
    show: function () {
      if (!state.loaded) root.innerHTML = '<div class="list-empty">Cargando tu plan…</div>';
      load();
    }
  });
})();
