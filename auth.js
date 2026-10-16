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
    userPill.innerHTML = UI.avatar(user.name, user.color, 34, user.avatar) +
      '<span class="user-pill-text"><b>' + esc(user.name) + '</b><span>' + ROLE_LABELS[user.role] + '</span></span>';
  }

  /** Lado (px) de la foto de perfil que se sube al servidor. */
  const AVATAR_SIZE = 256;

  /**
   * Recorta la imagen elegida al cuadrado central y la reduce a
   * AVATAR_SIZE px en JPEG (fotos de celular de varios MB quedan en ~20 KB).
   * @param {File} file
   * @returns {Promise<Blob>}
   */
  function resizePhoto(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // fondo para imágenes con transparencia
        ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
                      0, 0, AVATAR_SIZE, AVATAR_SIZE);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('No se pudo procesar la foto.'));
        }, 'image/jpeg', 0.86);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen. Usa una foto JPG o PNG.'));
      };
      img.src = url;
    });
  }

  /** Guarda la foto nueva (o null al quitarla) en el usuario y redibuja. */
  function applyAvatar(updated) {
    App.user.avatar = updated.avatar;
    renderUserPill(App.user);
    openAccount();
  }

  /** Sube la foto elegida. */
  function uploadPhoto(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      alert('Elige un archivo de imagen (JPG o PNG).');
      return;
    }
    resizePhoto(file)
      .then(function (blob) {
        const form = new FormData();
        form.append('photo', blob, 'avatar.jpg');
        return Api.request('api/avatar.php', { method: 'POST', body: form });
      })
      .then(function (updated) {
        applyAvatar(updated);
        UI.toast('Foto de perfil actualizada');
      })
      .catch(function (err) { alert(err.message); });
  }

  /** Panel de cuenta: foto, datos, cambiar contraseña y cerrar sesión. */
  function openAccount() {
    const user = App.user;
    const coach = App.coach;
    const sheet = UI.openModal(
      '<div class="sheet-head">' + UI.avatar(user.name, user.color, 56, user.avatar) +
        '<div><h2>' + esc(user.name) + '</h2><div class="muted">' + esc(user.email) + ' · ' + ROLE_LABELS[user.role] + '</div></div></div>' +
      '<div class="avatar-actions">' +
        '<button type="button" class="btn-small" id="photo-button">' + (user.avatar ? 'Cambiar foto' : 'Agregar foto de perfil') + '</button>' +
        (user.avatar ? '<button type="button" class="btn-small btn-small-danger" id="photo-remove">Quitar foto</button>' : '') +
        '<input type="file" id="photo-input" accept="image/*" hidden>' +
      '</div>' +
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

    const photoInput = sheet.querySelector('#photo-input');
    sheet.querySelector('#photo-button').addEventListener('click', function () { photoInput.click(); });
    photoInput.addEventListener('change', function () { uploadPhoto(photoInput.files[0]); });
    const removeButton = sheet.querySelector('#photo-remove');
    if (removeButton) {
      removeButton.addEventListener('click', function () {
        if (!confirm('¿Quitar tu foto de perfil?')) return;
        Api.del('api/avatar.php')
          .then(function (updated) {
            applyAvatar(updated);
            UI.toast('Foto de perfil eliminada');
          })
          .catch(function (err) { alert(err.message); });
      });
    }

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
