/**
 * =====================================================================
 * Archivo: athletes.js
 * Descripción: Sección "Alumnos" del entrenador.
 *
 *  - Indicadores del equipo: alumnos, km del mes, cumplimiento promedio
 *    y entrenos pendientes.
 *  - Tabla de alumnos: objetivo, km del mes, último entreno,
 *    cumplimiento (últimas 4 semanas), km de las últimas 12 semanas,
 *    y acciones: Progreso, Asignar, Editar.
 *  - Alta de alumnos (nombre, correo, contraseña temporal, objetivo) y
 *    edición (objetivo, mensaje del entrenador, nueva contraseña, baja).
 *
 * Cumplimiento = entrenos asignados de los últimos 28 días (hasta hoy)
 * marcados como hechos / total asignados en ese periodo.
 *
 * Datos: api/athletes.php. Depende de: Api, UI, Charts, App.
 * =====================================================================
 */

(function () {
  'use strict';

  const esc = UI.esc;
  const root = document.getElementById('athletes-root');
  let athletes = [];

  /* ------------------------------------------------------------------
   * 1. Cálculos por alumno
   * ------------------------------------------------------------------ */

  /** Km del mes actual. */
  function monthKm(a) {
    const now = new Date();
    return a.recent.reduce(function (sum, r) {
      const d = new Date(r.t);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() ? sum + r.km : sum;
    }, 0);
  }

  /** Km de cada una de las últimas 12 semanas (lunes a domingo). */
  function weeklyKm(a) {
    const thisMonday = UI.monday(new Date());
    return Array.from({ length: 12 }, function (_, k) {
      const start = UI.addDays(thisMonday, -(11 - k) * 7);
      const end = UI.addDays(start, 7);
      return a.recent.reduce(function (sum, r) {
        return r.t >= start.getTime() && r.t < end.getTime() ? sum + r.km : sum;
      }, 0);
    });
  }

  /** % de cumplimiento de las últimas 4 semanas (null si no hubo asignaciones). */
  function compliance(a) {
    const today = UI.iso(UI.today());
    const from = UI.iso(UI.addDays(UI.today(), -27));
    const due = a.assignments.filter(function (x) { return x.date >= from && x.date <= today; });
    if (!due.length) return null;
    return Math.round(due.filter(function (x) { return x.status === 'done'; }).length / due.length * 100);
  }

  /** Entrenos pendientes de hoy en adelante. */
  function pendingCount(a) {
    const today = UI.iso(UI.today());
    return a.assignments.filter(function (x) { return x.status === 'pending' && x.date >= today; }).length;
  }

  /* ------------------------------------------------------------------
   * 2. Dibujo
   * ------------------------------------------------------------------ */

  function render() {
    const monthName = UI.MONTHS_LONG[new Date().getMonth()];
    const teamKm = athletes.reduce(function (sum, a) { return sum + monthKm(a); }, 0);
    const rates = athletes.map(compliance).filter(function (c) { return c !== null; });
    const avgRate = rates.length ? Math.round(rates.reduce(function (s, v) { return s + v; }, 0) / rates.length) : null;
    const pending = athletes.reduce(function (sum, a) { return sum + pendingCount(a); }, 0);
    const activeWeek = athletes.filter(function (a) { return weeklyKm(a)[11] > 0; }).length;

    let html = '<div class="kpi-grid">' +
      '<div class="kpi"><span>Alumnos</span><b>' + athletes.length + '</b><small>' + activeWeek + (activeWeek === 1 ? ' corrió' : ' corrieron') + ' esta semana</small></div>' +
      '<div class="kpi"><span>Km del equipo · ' + monthName + '</span><b>' + UI.fmtKm(teamKm) + '</b><small>al ' +
        new Date().getDate() + ' de ' + monthName + '</small></div>' +
      '<div class="kpi"><span>Cumplimiento promedio</span><b>' + (avgRate === null ? '—' : avgRate + '%') + '</b><small>últimas 4 semanas</small></div>' +
      '<div class="kpi"><span>Entrenos pendientes</span><b>' + pending + '</b><small>de hoy en adelante</small></div>' +
      '</div>' +
      '<div class="section-head"><h2 class="section-title">Alumnos</h2>' +
        '<button type="button" class="btn-small" id="add-athlete">+ Agregar alumno</button></div>';

    if (!athletes.length) {
      html += '<div class="group empty-state">Aún no tienes alumnos. Agrega el primero con “+ Agregar alumno”: ' +
              'le darás un correo y una contraseña temporal para que inicie sesión.</div>';
      root.innerHTML = html;
      return;
    }

    html += '<div class="group athlete-table">' +
      '<div class="athlete-row is-head"><div>Alumno</div><div>Km ' + monthName + '</div><div>Último entreno</div>' +
      '<div>Cumplimiento</div><div>12 semanas</div><div></div></div>' +
      athletes.map(function (a) {
        const rate = compliance(a);
        const rateClass = rate === null ? '' : rate >= 85 ? 'is-good' : rate >= 70 ? 'is-warn' : 'is-bad';
        return '<div class="athlete-row">' +
          '<div class="athlete-name">' + UI.avatar(a.name, a.color, 40) +
            '<div><b>' + esc(a.name) + '</b><span>' + esc(a.goal || a.email) + '</span></div></div>' +
          '<div><span class="cell-label">Km ' + monthName + '</span><b>' + UI.fmtKm(monthKm(a)) + '</b> <span class="muted">km</span></div>' +
          '<div><span class="cell-label">Último entreno</span>' + (a.last
            ? esc(a.last.name) + '<br><span class="muted small">' + UI.relDay(a.last.t) + ' · ' + a.last.km.toFixed(1) + ' km</span>'
            : '<span class="muted">Sin entrenos</span>') + '</div>' +
          '<div><span class="cell-label">Cumplimiento</span>' + (rate === null ? '<span class="muted">Sin plan</span>'
            : '<b>' + rate + '%</b><div class="progress-bar ' + rateClass + '"><div style="width:' + rate + '%"></div></div>') + '</div>' +
          '<div><span class="cell-label">12 semanas</span>' + Charts.spark(weeklyKm(a), a.color) + '</div>' +
          '<div class="athlete-actions">' +
            '<button type="button" class="btn-small is-ghost" data-progress="' + a.id + '">Progreso</button>' +
            '<button type="button" class="btn-small" data-assign="' + a.id + '">Asignar</button>' +
            '<button type="button" class="icon-button" data-edit="' + a.id + '" aria-label="Editar a ' + esc(a.name) + '">⋯</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';

    root.innerHTML = html;
  }

  /* ------------------------------------------------------------------
   * 3. Alta y edición
   * ------------------------------------------------------------------ */

  /** Formulario de alta de alumno. */
  function openCreate() {
    const sheet = UI.openModal(
      '<h2 class="sheet-title">Agregar alumno</h2>' +
      '<p class="muted">Comparte con tu alumno el correo y la contraseña temporal; podrá cambiarla desde su cuenta.</p>' +
      '<form id="athlete-form" novalidate><div class="group">' +
        '<label class="row"><span class="row-label">Nombre</span><input class="row-input" name="name" placeholder="Nombre y apellido"></label>' +
        '<label class="row"><span class="row-label">Correo</span><input class="row-input" type="email" name="email" placeholder="alumno@correo.com" autocomplete="off"></label>' +
        '<label class="row"><span class="row-label">Contraseña</span><input class="row-input" name="password" placeholder="Mínimo 8 caracteres" autocomplete="new-password"></label>' +
        '<label class="row"><span class="row-label">Objetivo</span><input class="row-input" name="goal" placeholder="Ej. Medio maratón · feb 2027"></label>' +
      '</div><button type="submit" class="btn-primary">Agregar alumno</button></form>'
    );
    const form = sheet.querySelector('#athlete-form');
    form.name.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.name.value.trim()) return alert('Escribe el nombre del alumno.');
      if (!/^\S+@\S+\.\S+$/.test(form.email.value.trim())) return alert('Escribe un correo válido.');
      if (form.password.value.length < 8) return alert('La contraseña debe tener al menos 8 caracteres.');
      Api.post('api/athletes.php', {
        action: 'create', name: form.name.value.trim(), email: form.email.value.trim(),
        password: form.password.value, goal: form.goal.value.trim()
      }).then(function (athlete) {
        UI.closeModal();
        UI.toast(athlete.name + ' ya puede iniciar sesión');
        load();
      }).catch(function (err) { alert(err.message); });
    });
  }

  /** Formulario de edición (y baja) de un alumno. */
  function openEdit(id) {
    const a = athletes.find(function (x) { return x.id === id; });
    if (!a) return;
    const sheet = UI.openModal(
      '<div class="sheet-head">' + UI.avatar(a.name, a.color, 56) + '<div><h2>' + esc(a.name) + '</h2>' +
        '<div class="muted">' + esc(a.email) + '</div></div></div>' +
      '<form id="athlete-form" novalidate><div class="group">' +
        '<label class="row"><span class="row-label">Nombre</span><input class="row-input" name="name" value="' + esc(a.name) + '"></label>' +
        '<label class="row"><span class="row-label">Objetivo</span><input class="row-input" name="goal" value="' + esc(a.goal) + '" placeholder="Ej. 10K sub 50 min"></label>' +
      '</div>' +
      '<h3 class="section-title">Mensaje para tu alumno</h3>' +
      '<div class="group"><textarea class="text-area" name="coachNote" rows="3" placeholder="Aparece en su sección Mi plan">' +
        esc(a.coachNote) + '</textarea></div>' +
      '<h3 class="section-title">Nueva contraseña (opcional)</h3>' +
      '<div class="group"><label class="row"><span class="row-label">Contraseña</span>' +
        '<input class="row-input" name="password" placeholder="Solo si la olvidó" autocomplete="new-password"></label></div>' +
      '<button type="submit" class="btn-primary">Guardar cambios</button></form>' +
      '<button type="button" class="btn-destructive" id="delete-athlete">Eliminar alumno</button>'
    );
    const form = sheet.querySelector('#athlete-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.name.value.trim()) return alert('Escribe el nombre del alumno.');
      if (form.password.value && form.password.value.length < 8) return alert('La contraseña debe tener al menos 8 caracteres.');
      Api.post('api/athletes.php', {
        action: 'update', id: a.id, name: form.name.value.trim(), goal: form.goal.value.trim(),
        coachNote: form.coachNote.value.trim(), password: form.password.value
      }).then(function () {
        UI.closeModal();
        UI.toast('Cambios guardados');
        load();
      }).catch(function (err) { alert(err.message); });
    });
    sheet.querySelector('#delete-athlete').addEventListener('click', function () {
      if (!confirm('¿Eliminar a ' + a.name + '? Se borrarán su cuenta, sus entrenamientos importados y su plan. ' +
                   'Esta acción no se puede deshacer.')) return;
      Api.del('api/athletes.php?id=' + a.id).then(function () {
        UI.closeModal();
        UI.toast('Alumno eliminado');
        load();
      }).catch(function (err) { alert(err.message); });
    });
  }

  /* ------------------------------------------------------------------
   * 4. Eventos y carga
   * ------------------------------------------------------------------ */

  root.addEventListener('click', function (e) {
    if (e.target.closest('#add-athlete')) return openCreate();
    const progress = e.target.closest('[data-progress]');
    if (progress) {
      App.state.progressAthleteId = Number(progress.dataset.progress);
      return App.go('progreso');
    }
    const assign = e.target.closest('[data-assign]');
    if (assign) {
      App.state.builderPreset = { athleteId: Number(assign.dataset.assign) };
      return App.go('crear');
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) openEdit(Number(edit.dataset.edit));
  });

  function load() {
    return Api.get('api/athletes.php')
      .then(function (list) {
        athletes = list;
        render();
      })
      .catch(function (err) {
        root.innerHTML = '<div class="group empty-state">' + esc(err.message) + '</div>';
      });
  }

  App.register('alumnos', {
    show: function () {
      if (!athletes.length) root.innerHTML = '<div class="list-empty">Cargando alumnos…</div>';
      load();
    }
  });
})();
