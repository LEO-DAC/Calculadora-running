/**
 * =====================================================================
 * Archivo: api.js
 * Descripción: Peticiones a la API del servidor (carpeta api/).
 *
 * Expone el objeto global `Api`:
 *  - Api.request(url, opciones) -> Promise con el JSON de la respuesta
 *  - Api.get(url) / Api.post(url, datos) / Api.del(url)
 *
 * Todas las peticiones envían la cabecera "X-Requested-With", que el
 * servidor exige para modificar datos (protección CSRF). Si la sesión
 * terminó (401), se emite el evento "app:unauthorized" para que
 * auth.js muestre la pantalla de inicio de sesión.
 * =====================================================================
 */

(function () {
  'use strict';

  /**
   * Hace una petición y devuelve el JSON de la respuesta. Si el servidor
   * responde con error, rechaza con un Error que incluye el mensaje del
   * servidor, `status` (código HTTP) y `duplicate` (409).
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<*>}
   */
  function request(url, options) {
    const opts = Object.assign({ cache: 'no-store', credentials: 'same-origin' }, options || {});
    opts.headers = Object.assign({ Accept: 'application/json', 'X-Requested-With': 'fetch' }, opts.headers || {});

    return fetch(url, opts)
      .catch(function () {
        throw new Error('No se pudo conectar con el servidor. Verifica que Apache esté encendido en XAMPP ' +
                        'y que este dispositivo esté en la misma red.');
      })
      .then(function (response) {
        return response.text().then(function (text) {
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { /* respuesta no JSON */ }

          if (!response.ok) {
            const error = new Error((data && data.error) || 'Error del servidor (' + response.status + ').');
            error.status = response.status;
            error.duplicate = response.status === 409;
            // Sesión vencida (salvo en el propio inicio de sesión)
            if (response.status === 401 && url.indexOf('auth.php') === -1) {
              window.dispatchEvent(new CustomEvent('app:unauthorized'));
            }
            throw error;
          }
          if (data === null) {
            throw new Error('El servidor envió una respuesta inesperada. ¿Está activo PHP en XAMPP?');
          }
          return data;
        });
      });
  }

  /** Envía un objeto como JSON con el método indicado. */
  function sendJson(url, method, body) {
    return request(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  window.Api = {
    request: request,
    get: function (url) { return request(url); },
    post: function (url, body) { return sendJson(url, 'POST', body); },
    del: function (url) { return request(url, { method: 'DELETE' }); }
  };
})();
