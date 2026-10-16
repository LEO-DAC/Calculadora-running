/**
 * =====================================================================
 * Archivo: builder.js
 * Descripción: Secciones del entrenador "Crear entreno" y "Biblioteca".
 *
 * Crear entreno:
 *  - Tipo (repeticiones, fondo, fartlek, tempo, cuestas, rodaje): carga
 *    una estructura base desde la biblioteca, que se puede editar.
 *  - Datos: nombre, fecha, alumnos a los que se asigna e indicaciones.
 *  - Estructura por bloques: calentamiento, continuo, repeticiones
 *    (trabajo + recuperación) y enfriamiento; cada paso con cantidad,
 *    unidad, ritmo y zona. Se pueden mover y eliminar.
 *  - Vista previa en vivo: distancia y duración estimadas e intensidad.
 *  - Asignar a los alumnos elegidos o guardar en la biblioteca.
 *
 * Biblioteca:
 *  - Plantillas filtrables por tipo: ver, usar como base o eliminar.
 *
 * Datos: api/templates.php, api/athletes.php, api/assignments.php.
 * Depende de: Api, UI, Structure, App.
 * =====================================================================
 */

(function () {
  'use strict';

  const esc = UI.esc;
  const S = Structure;
  const builderRoot = document.getElementById('builder-root');
  const libraryRoot = document.getElementById('library-root');

  const data = { athletes: [], templates: [] };
  let builder = null;      // entrenamiento en edición
  let libraryFilter = 'todos';

  /* ------------------------------------------------------------------
   * 1. Datos
   * ------------------------------------------------------------------ */

  /** Carga alumnos y plantillas del entrenador. */
  function loadData() {
    return Promise.all([Api.get('api/athletes.php'), Api.get('api/templates.php')])
      .then(function (results) {
        data.athletes = results[0];
        data.templates = results[1];
      });
  }

  /** Mañana en formato "AAAA-MM-DD" (fecha por defecto al asignar). */
  function tomorrow() {
    return UI.iso(UI.addDays(UI.today(), 1));
  }

  /**
   * Nuevo entrenamiento en el editor.
   * @param {string} tipo
   * @param {number[]} athleteIds
   * @param {object} [template] - Plantilla de partida.
   */
  function newBuilder(tipo, athleteIds, template) {
    const base = template || data.templates.find(function (t) { return t.tipo === tipo; }) ||
                 { tipo: tipo, name: S.type(tipo).label, steps: [S.clone(S.NEW_BLOCKS.steady)] };
    builder = {
      tipo: base.tipo,
      name: base.name,
      date: builder ? builder.date : tomorrow(),
      athleteIds: athleteIds || [],
      note: builder ? builder.note : '',
      steps: S.clone(base.steps)
    };
  }

  /* ------------------------------------------------------------------
   * 2. Editor: dibujo
   * ------------------------------------------------------------------ */

  /** Campos de un paso (cantidad + unidad, ritmo, zona). */
  function stepRow(step, path, label) {
    return '<div class="step-row">' + (label ? '<span class="step-label">' + label + '</span>' : '') +
      '<div class="field"><input type="number" step="any" min="0" value="' + esc(step.v) + '" data-bp="' + path + '.v" aria-label="Cantidad">' +
        '<select data-bp="' + path + '.u" aria-label="Unidad">' + ['km', 'm', 'min', 's'].map(function (u) {
          return '<option' + (u === step.u ? ' selected' : '') + '>' + u + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><span>Ritmo</span><input class="pace-input" value="' + esc(step.p) + '" data-bp="' + path +
        '.p" placeholder="5:30" aria-label="Ritmo por km"><span>/km</span></div>' +
      '<div class="field"><span>Zona</span><select data-bp="' + path + '.z" aria-label="Zona">' + [1, 2, 3, 4, 5].map(function (z) {
          return '<option value="' + z + '"' + (z === Number(step.z) ? ' selected' : '') + '>Z' + z + '</option>';
        }).join('') + '</select></div>' +
    '</div>';
  }

  /** Botones de un bloque: subir, bajar, eliminar. */
  function blockControls(i) {
    return '<span class="spacer"></span>' +
      '<button type="button" class="icon-button" data-move="' + i + ',-1" aria-label="Subir bloque">↑</button>' +
      '<button type="button" class="icon-button" data-move="' + i + ',1" aria-label="Bajar bloque">↓</button>' +
      '<button type="button" class="icon-button" data-remove="' + i + '" aria-label="Eliminar bloque">✕</button>';
  }

  function renderBuilder() {
    const b = builder;
    const blocks = b.steps.map(function (s, i) {
      if (s.k === 'rep') {
        return '<div class="block" style="--block:' + S.KINDS.work.color + '">' +
          '<div class="block-head"><b>Repeticiones</b><div class="field"><input type="number" min="1" max="50" step="1" value="' +
            esc(s.n) + '" data-bp="' + i + '.n" class="reps-input" aria-label="Número de repeticiones"><span>veces</span></div>' +
            blockControls(i) + '</div>' +
          stepRow(s.steps[0], i + '.steps.0', 'Trabajo') + stepRow(s.steps[1], i + '.steps.1', 'Recuperación') +
        '</div>';
      }
      const color = s.k === 'steady' ? 'var(--t-' + b.tipo + ')' : S.KINDS[s.k].color;
      return '<div class="block" style="--block:' + color + '"><div class="block-head"><b>' + S.KINDS[s.k].label + '</b>' +
             blockControls(i) + '</div>' + stepRow(s, String(i)) + '</div>';
    }).join('');

    builderRoot.innerHTML = '<div class="builder-grid"><div>' +
      '<h2 class="section-title">Tipo de entrenamiento</h2>' +
      '<div class="chip-line">' + Object.keys(S.TYPES).map(function (key) {
        return '<button type="button" class="chip" data-btype="' + key + '" aria-pressed="' + (key === b.tipo) + '">' +
               S.TYPES[key].emoji + ' ' + S.TYPES[key].label + '</button>';
      }).join('') + '</div>' +
      '<p class="group-footer">Al elegir un tipo se carga una estructura base de tu biblioteca que puedes editar.</p>' +

      '<h2 class="section-title">Datos</h2>' +
      '<div class="group">' +
        '<label class="row"><span class="row-label">Nombre</span><input class="row-input" data-bf="name" value="' + esc(b.name) + '"></label>' +
        '<label class="row"><span class="row-label">Fecha</span><input class="row-input" type="date" data-bf="date" value="' + esc(b.date) + '"></label>' +
        '<div class="row row-stack"><span class="row-label">Asignar a</span><div class="chip-line">' + (data.athletes.length
          ? data.athletes.map(function (a) {
              return '<button type="button" class="chip chip-small" data-athlete="' + a.id + '" aria-pressed="' +
                     (b.athleteIds.indexOf(a.id) !== -1) + '">' + esc(a.name) + '</button>';
            }).join('')
          : '<span class="muted">Aún no tienes alumnos. <a href="#alumnos" class="inline-link" data-go="alumnos">Agrégalos ›</a></span>') +
        '</div></div>' +
        '<div class="row row-stack"><span class="row-label">Indicaciones para el alumno</span>' +
          '<textarea class="text-area" rows="2" data-bf="note" placeholder="Ej. Recuperación al trote, no caminando">' + esc(b.note) + '</textarea></div>' +
      '</div>' +

      '<h2 class="section-title">Estructura</h2>' +
      (blocks || '<div class="group empty-state">Agrega bloques para armar el entrenamiento.</div>') +
      '<div class="add-row">' +
        '<button type="button" data-add="warm">+ Calentamiento</button>' +
        '<button type="button" data-add="steady">+ Bloque continuo</button>' +
        '<button type="button" data-add="rep">+ Repeticiones</button>' +
        '<button type="button" data-add="cool">+ Enfriamiento</button>' +
      '</div>' +
    '</div>' +

    '<aside class="builder-side"><h2 class="section-title">Vista previa</h2>' +
      '<div class="group preview" id="builder-preview"></div>' +
      '<button type="button" class="btn-primary" data-save="assign" id="assign-button"></button>' +
      '<button type="button" class="btn-secondary" data-save="library">Guardar en biblioteca</button>' +
    '</aside></div>';

    renderPreview();
  }

  /** Vista previa (se actualiza en vivo al escribir). */
  function renderPreview() {
    const b = builder;
    const preview = document.getElementById('builder-preview');
    if (!preview) return;
    const tt = S.totals(b.steps);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? UI.fmtDate(UI.parseIso(b.date)) : 'Sin fecha';

    preview.innerHTML = S.badge(b.tipo) +
      '<h3>' + esc(b.name || 'Sin nombre') + '</h3><div class="muted small">' + date + '</div>' +
      '<div class="preview-totals">' +
        '<div><span>Distancia</span><b>' + UI.fmtKm(tt.km) + ' km</b></div>' +
        '<div><span>Duración</span><b>' + UI.fmtDur(tt.sec / 60) + '</b></div>' +
        '<div><span>Bloques</span><b>' + S.flatten(b.steps).length + '</b></div>' +
      '</div>' +
      S.svg(b.steps, 64, b.tipo) +
      '<div class="preview-axis"><span>Inicio</span><span>Intensidad por zona</span><span>Fin</span></div>' +
      S.listHtml(b.steps);

    const n = b.athleteIds.length;
    document.getElementById('assign-button').textContent = n ? 'Asignar a ' + n + ' alumno' + (n === 1 ? '' : 's') : 'Asignar a alumnos';
  }

  /* ------------------------------------------------------------------
   * 3. Editor: validación y guardado
   * ------------------------------------------------------------------ */

  /** Devuelve el primer error de la estructura (o null si es válida). */
  function structureError(steps) {
    if (!steps.length) return 'Agrega al menos un bloque a la estructura.';
    for (const block of steps) {
      if (block.k === 'rep' && !(Number.isInteger(block.n) && block.n >= 1 && block.n <= 50)) {
        return 'Las repeticiones deben ser un número entero entre 1 y 50.';
      }
      const parts = block.k === 'rep' ? block.steps : [block];
      for (const s of parts) {
        if (!(s.v > 0)) return 'Cada bloque necesita una cantidad mayor que 0.';
        if (!S.isValidPace(s.p)) return 'Escribe los ritmos con el formato minutos:segundos, por ejemplo 5:30.';
      }
    }
    return null;
  }

  function save(target) {
    const b = builder;
    if (!b.name.trim()) return alert('Escribe el nombre del entrenamiento.');
    const error = structureError(b.steps);
    if (error) return alert(error);

    if (target === 'assign') {
      if (!b.athleteIds.length) return alert('Selecciona al menos un alumno.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return alert('Elige la fecha del entrenamiento.');
      Api.post('api/assignments.php', {
        action: 'create', athleteIds: b.athleteIds, date: b.date, tipo: b.tipo,
        name: b.name.trim(), note: b.note.trim(), steps: b.steps
      }).then(function (result) {
        UI.toast('Asignado a ' + result.count + ' alumno' + (result.count === 1 ? '' : 's') + ' para el ' + UI.fmtDate(UI.parseIso(b.date)));
      }).catch(function (err) { alert(err.message); });
    } else {
      Api.post('api/templates.php', {
        tipo: b.tipo, name: b.name.trim(), description: b.note.trim() || S.type(b.tipo).label, steps: b.steps
      }).then(function (template) {
        data.templates.push(template);
        UI.toast('Guardado en la biblioteca');
      }).catch(function (err) { alert(err.message); });
    }
  }

  /** Cambia un valor de la estructura a partir de su ruta ("1.steps.0.p"). */
  function setPath(path, value) {
    const keys = path.split('.');
    let obj = builder.steps;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    const last = keys[keys.length - 1];
    obj[last] = ['v', 'n', 'z'].indexOf(last) !== -1 ? (value === '' ? 0 : Number(value)) : value.trim();
  }

  /* ------------------------------------------------------------------
   * 4. Editor: eventos
   * ------------------------------------------------------------------ */

  // Escribir en campos: actualiza el estado y la vista previa (sin redibujar el formulario)
  builderRoot.addEventListener('input', function (e) {
    const t = e.target;
    if (t.dataset.bp) setPath(t.dataset.bp, t.value);
    else if (t.dataset.bf) builder[t.dataset.bf] = t.value;
    else return;
    renderPreview();
  });

  // Los <select> también disparan "change"
  builderRoot.addEventListener('change', function (e) {
    if (e.target.tagName === 'SELECT' && e.target.dataset.bp) {
      setPath(e.target.dataset.bp, e.target.value);
      renderPreview();
    }
  });

  builderRoot.addEventListener('click', function (e) {
    const el = e.target.closest('[data-btype],[data-athlete],[data-add],[data-move],[data-remove],[data-save]');
    if (!el) return;
    const steps = builder.steps;

    if (el.dataset.btype) {
      newBuilder(el.dataset.btype, builder.athleteIds);
    } else if (el.dataset.athlete) {
      const id = Number(el.dataset.athlete);
      const index = builder.athleteIds.indexOf(id);
      if (index === -1) builder.athleteIds.push(id); else builder.athleteIds.splice(index, 1);
    } else if (el.dataset.add) {
      // Los bloques nuevos se agregan antes del enfriamiento final
      const block = S.clone(S.NEW_BLOCKS[el.dataset.add]);
      if (el.dataset.add === 'cool' || !steps.length || steps[steps.length - 1].k !== 'cool') steps.push(block);
      else steps.splice(steps.length - 1, 0, block);
    } else if (el.dataset.move) {
      const parts = el.dataset.move.split(',').map(Number);
      const j = parts[0] + parts[1];
      if (j < 0 || j >= steps.length) return;
      const tmp = steps[parts[0]];
      steps[parts[0]] = steps[j];
      steps[j] = tmp;
    } else if (el.dataset.remove) {
      steps.splice(Number(el.dataset.remove), 1);
    } else if (el.dataset.save) {
      return save(el.dataset.save);
    }
    renderBuilder();
  });

  App.register('crear', {
    show: function () {
      builderRoot.innerHTML = '<div class="list-empty">Cargando…</div>';
      loadData().then(function () {
        // Entradas desde otras secciones: "Asignar" (Alumnos) o "Usar como base" (Biblioteca)
        const preset = App.state.builderPreset;
        App.state.builderPreset = null;
        if (preset && preset.template) newBuilder(preset.template.tipo, [], preset.template);
        else if (preset && preset.athleteId) newBuilder(builder ? builder.tipo : 'rep', [preset.athleteId]);
        else if (!builder) newBuilder('rep', []);
        // Quita alumnos que ya no existen
        const ids = data.athletes.map(function (a) { return a.id; });
        builder.athleteIds = builder.athleteIds.filter(function (id) { return ids.indexOf(id) !== -1; });
        renderBuilder();
      }).catch(function (err) {
        builderRoot.innerHTML = '<div class="group empty-state">' + esc(err.message) + '</div>';
      });
    }
  });

  /* ------------------------------------------------------------------
   * 5. Biblioteca
   * ------------------------------------------------------------------ */

  function renderLibrary() {
    const list = data.templates.filter(function (t) { return libraryFilter === 'todos' || t.tipo === libraryFilter; });
    libraryRoot.innerHTML =
      '<div class="chip-line">' +
        '<button type="button" class="chip" data-filter="todos" aria-pressed="' + (libraryFilter === 'todos') + '">Todos</button>' +
        '<span class="chip-divider" aria-hidden="true"></span>' +
        Object.keys(S.TYPES).map(function (key) {
          return '<button type="button" class="chip" data-filter="' + key + '" aria-pressed="' + (key === libraryFilter) + '">' +
                 S.TYPES[key].emoji + ' ' + S.TYPES[key].label + '</button>';
        }).join('') +
      '</div>' +
      '<h2 class="section-title">' + list.length + ' plantilla' + (list.length === 1 ? '' : 's') + '</h2>' +
      (list.length ? '<div class="library-grid">' + list.map(function (t) {
        const tt = S.totals(t.steps);
        return '<div class="library-card">' + S.badge(t.tipo) +
          '<h3>' + esc(t.name) + '</h3><p class="muted">' + esc(t.description) + '</p>' +
          S.svg(t.steps, 40, t.tipo) +
          '<p><b>' + UI.fmtKm(tt.km) + ' km</b> <span class="muted">· ' + UI.fmtDur(tt.sec / 60) + '</span></p>' +
          '<div class="card-actions">' +
            '<button type="button" class="btn-small" data-use="' + t.id + '">Usar como base</button>' +
            '<button type="button" class="btn-small is-ghost" data-view="' + t.id + '">Ver</button>' +
            '<button type="button" class="icon-button" data-delete="' + t.id + '" aria-label="Eliminar plantilla ' + esc(t.name) + '">✕</button>' +
          '</div></div>';
      }).join('') + '</div>' : '<div class="group empty-state">No hay plantillas de este tipo. Crea una en ' +
        '<a href="#crear" class="inline-link" data-go="crear">Crear entreno ›</a> y guárdala en la biblioteca.</div>');
  }

  libraryRoot.addEventListener('click', function (e) {
    const el = e.target.closest('[data-filter],[data-use],[data-view],[data-delete]');
    if (!el) return;
    if (el.dataset.filter) {
      libraryFilter = el.dataset.filter;
      return renderLibrary();
    }
    const id = Number(el.dataset.use || el.dataset.view || el.dataset.delete);
    const t = data.templates.find(function (x) { return x.id === id; });
    if (!t) return;

    if (el.dataset.use) {
      App.state.builderPreset = { template: t };
      App.go('crear');
    } else if (el.dataset.view) {
      const tt = S.totals(t.steps);
      UI.openModal(S.badge(t.tipo) + '<h2 class="sheet-title">' + esc(t.name) + '</h2>' +
        '<div class="muted">' + esc(t.description) + ' · ' + UI.fmtKm(tt.km) + ' km · ' + UI.fmtDur(tt.sec / 60) + '</div>' +
        '<div class="group padded">' + S.svg(t.steps, 70, t.tipo) + S.listHtml(t.steps) + '</div>');
    } else if (el.dataset.delete) {
      if (!confirm('¿Eliminar la plantilla "' + t.name + '"? Los entrenos ya asignados no cambian.')) return;
      Api.del('api/templates.php?id=' + t.id).then(function () {
        data.templates = data.templates.filter(function (x) { return x.id !== t.id; });
        renderLibrary();
        UI.toast('Plantilla eliminada');
      }).catch(function (err) { alert(err.message); });
    }
  });

  App.register('biblioteca', {
    show: function () {
      if (!data.templates.length) libraryRoot.innerHTML = '<div class="list-empty">Cargando…</div>';
      loadData().then(renderLibrary).catch(function (err) {
        libraryRoot.innerHTML = '<div class="group empty-state">' + esc(err.message) + '</div>';
      });
    }
  });
})();
