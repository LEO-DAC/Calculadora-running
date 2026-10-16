/**
 * =====================================================================
 * Archivo: auth.js
 * Descripción: Acceso a la app. Se carga al final y la arranca:
 *
 *  1. Pregunta al servidor si hay sesión (api/auth.php).
 *  2. Sin sesión: muestra "Iniciar sesión" o, si todavía no existe
 *     ninguna cuenta, "Crear cuenta de entrenador".
 *  3. Con sesión: llama a App.start(usuario) (app.js).
 *  4. Botón de cuenta (arriba a la derecha): datos del usuario, cambiar
 *     contraseña y cerrar sesión.
 *
 * Si la sesión vence mientras se usa la app (evento "app:unauthorized"
 * de api.js), se recarga la página para volver a iniciar sesión.
 * =====================================================================
 */

(function () {
  'use strict';

  const AUTH_URL = 'api/auth.php';
  const esc = UI.esc;

  const authScreen = document.getElementById('auth-screen');
  const loginForm = document.getElementById('login-form');
  const setupForm = document.getElementById('setup-form');
  const userPill = document.getElementById('user-pill');

  const ROLE_LABELS = { coach: 'Entrenador', athlete: 'Alumno' };

  /* ------------------------------------------------------------------
   * 1. Pantallas de acceso
   * ------------------------------------------------------------------ */

  /** Muestra el formulario de acceso que corresponda. */
  function showAuth(needsSetup) {
    authScreen.hidden = false;
    loginForm.hidden = needsSetup;
    setupForm.hidden = !needsSetup;
    const first = (needsSetup ? setupForm : loginForm).querySelector('input');
    if (first) first.focus();
  }

  /** Deshabilita el botón del formulario mientras se envía. */
  function setSending(form, sending) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = sending;
  }

  /** Entra a la app con la respuesta de auth.php. */
  function enter(info) {
    authScreen.hidden = true;
    renderUserPill(info.user);
    App.start(info.user, info.coach);
  }

  // Iniciar sesión
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;
    if (!email || !password) {
      alert('Escribe tu correo y tu contraseña.');
      return;
    }
    setSending(loginForm, true);
    Api.post(AUTH_URL, { action: 'login', email: email, password: password })
      .then(function (info) {
        loginForm.reset();
        enter(info);
      })
      .catch(function (err) {
        alert(err.message);
        loginForm.password.select();
      })
      .then(function () { setSending(loginForm, false); });
  });

  // Configuración inicial: cuenta del entrenador
  setupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const f = setupForm;
    if (!f.name.value.trim()) return alert('Escribe tu nombre.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.value.trim())) return alert('Escribe un correo válido.');
    if (f.password.value.length < 8) return alert('La contraseña debe tener al menos 8 caracteres.');
    if (f.password.value !== f.confirm.value) return alert('Las contraseñas no coinciden.');

    setSending(f, true);
    Api.post(AUTH_URL, { action: 'setup', name: f.name.value.trim(), email: f.email.value.trim(), password: f.password.value })
      .then(function (info) {
        f.reset();
        enter(info);
        UI.toast('Cuenta creada. Ahora agrega a tus alumnos.');
      })
      .catch(function (err) { alert(err.message); })
      .then(function () { setSending(f, false); });
  });

  /* ------------------------------------------------------------------
   * 2. Cuenta del usuario
   * ------------------------------------------------------------------ */

  /** Botón de cuenta: avatar, nombre y rol. */
  function renderUserPill(user) {
    userPill.innerHTML = UI.avatar(user.name, user.color, 34) +
      '<span class="user-pill-text"><b>' + esc(user.name) + '</b><span>' + ROLE_LABELS[user.role] + '</span></span>';
  }

  /** Panel de cuenta: datos, cambiar contraseña y cerrar sesión. */
  function openAccount() {
    const user = App.user;
    const coach = App.coach;
    const sheet = UI.openModal(
      '<div class="sheet-head">' + UI.avatar(user.name, user.color, 56) +
        '<div><h2>' + esc(user.name) + '</h2><div class="muted">' + esc(user.email) + ' · ' + ROLE_LABELS[user.role] + '</div></div></div>' +
      (coach ? '<p class="muted">Tu entrenador: <b>' + esc(coach.name) + '</b></p>' : '') +
      (user.goal ? '<p class="muted">Objetivo: <b>' + esc(user.goal) + '</b></p>' : '') +
      '<h3 class="section-title">Cambiar contraseña</h3>' +
      '<form id="password-form" novalidate>' +
        '<div class="group">' +
          '<label class="row"><span class="row-label">Actual</span><input class="row-input" type="password" name="current" autocomplete="current-password"></label>' +
          '<label class="row"><span class="row-label">Nueva</span><input class="row-input" type="password" name="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>' +
          '<label class="row"><span class="row-label">Confirmar</span><input class="row-input" type="password" name="confirm" autocomplete="new-password"></label>' +
        '</div>' +
        '<button type="submit" class="btn-secondary">Guardar contraseña</button>' +
      '</form>' +
      '<button type="button" class="btn-destructive" id="logout-button">Cerrar sesión</button>'
    );

    const form = sheet.querySelector('#password-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.password.value.length < 8) return alert('La nueva contraseña debe tener al menos 8 caracteres.');
      if (form.password.value !== form.confirm.value) return alert('Las contraseñas no coinciden.');
      Api.post(AUTH_URL, { action: 'password', current: form.current.value, password: form.password.value })
        .then(function () {
          UI.closeModal();
          UI.toast('Contraseña actualizada');
        })
        .catch(function (err) { alert(err.message); });
    });

    sheet.querySelector('#logout-button').addEventListener('click', function () {
      Api.post(AUTH_URL, { action: 'logout' })
        .catch(function () { /* aunque falle, se recarga */ })
        .then(function () {
          window.location.hash = '';
          window.location.reload();
        });
    });
  }

  userPill.addEventListener('click', openAccount);

  // Sesión vencida durante el uso: recarga para volver a la pantalla de acceso
  let reloading = false;
  window.addEventListener('app:unauthorized', function () {
    if (reloading) return;
    reloading = true;
    alert('Tu sesión terminó. Inicia sesión de nuevo.');
    window.location.reload();
  });

  /* ------------------------------------------------------------------
   * 3. Arranque
   * ------------------------------------------------------------------ */

  Api.get(AUTH_URL)
    .then(function (info) {
      if (info.user) enter(info);
      else showAuth(info.needsSetup);
    })
    .catch(function (err) {
      authScreen.hidden = false;
      loginForm.hidden = true;
      setupForm.hidden = true;
      const message = document.createElement('p');
      message.className = 'auth-text';
      message.textContent = err.message;
      authScreen.querySelector('.auth-card').appendChild(message);
    });
})();
