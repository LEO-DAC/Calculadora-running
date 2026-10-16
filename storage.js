/**
 * =====================================================================
 * Archivo: storage.js
 * Descripción: Acceso a los entrenamientos guardados.
 *
 * 1. WorkoutStore: habla con el servidor (api/workouts.php), que guarda
 *    los datos en MySQL y el archivo .gpx original en el disco. Así
 *    todos los dispositivos de la red ven los mismos entrenamientos.
 *    - El dashboard solo pide los resúmenes (rápido).
 *    - El detalle descarga el .gpx original y lo procesa con gpx.js.
 *
 * 2. LegacyStore: lee los entrenamientos que versiones anteriores de la
 *    app guardaban en el navegador (IndexedDB), para migrarlos al
 *    servidor una sola vez y luego borrarlos del navegador.
 *
 * Todas las funciones devuelven Promesas. Los cambios se avisan a otras
 * pestañas del mismo navegador con BroadcastChannel.
 *
 * Depende de: gpx.js (GPX) para procesar el archivo en get().
 * =====================================================================
 */

(function () {
  'use strict';

  /** Ruta de la API, relativa a index.html / detalle.html. */
  const API_URL = 'api/workouts.php';
  const CHANNEL_NAME = 'calculadora-running-entrenamientos';

  /* ------------------------------------------------------------------
   * 1. Peticiones al servidor
   * ------------------------------------------------------------------ */

  /**
   * Hace una petición a la API y devuelve el JSON de la respuesta.
   * Si el servidor responde con error, rechaza con un Error que incluye
   * el mensaje del servidor, `status` (código HTTP) y `duplicate`.
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<*>}
   */
  function request(url, options) {
    return fetch(url, Object.assign({ headers: { Accept: 'application/json' }, cache: 'no-store' }, options))
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
            throw error;
          }
          if (data === null) {
            throw new Error('El servidor envió una respuesta inesperada. ¿Está activo PHP en XAMPP?');
          }
          return data;
        });
      });
  }

  /** URL de la API para un entrenamiento. */
  function workoutUrl(id) {
    return API_URL + '?id=' + encodeURIComponent(id);
  }

  /* ------------------------------------------------------------------
   * 2. WorkoutStore (servidor)
   * ------------------------------------------------------------------ */

  /**
   * Resúmenes de todos los entrenamientos.
   * @returns {Promise<object[]>}
   */
  function getAll() {
    return request(API_URL);
  }

  /**
   * Entrenamiento completo: resumen + recorrido (puntos GPS), que se
   * obtiene descargando el .gpx original y procesándolo con gpx.js.
   * @param {string} id
   * @returns {Promise<{summary: object, track: object}|null>} null si no existe.
   */
  function get(id) {
    return request(workoutUrl(id))
      .then(function (summary) {
        return fetch(gpxUrl(id), { cache: 'no-store' }).then(function (response) {
          if (!response.ok) throw new Error('No se pudo descargar el archivo GPX del entrenamiento.');
          return response.text();
        }).then(function (text) {
          return { summary: summary, track: GPX.parse(text, summary.fileName || 'entrenamiento.gpx').track };
        });
      })
      .catch(function (error) {
        if (error.status === 404) return null;
        throw error;
      });
  }

  /**
   * Sube un entrenamiento nuevo: el archivo .gpx y el resumen calculado
   * por gpx.js. El servidor asigna el id y la fecha de importación.
   * Si ya existía, rechaza con error.duplicate = true.
   * @param {Blob|File} file - Archivo GPX.
   * @param {string} fileName - Nombre del archivo.
   * @param {object} summary - Resumen de GPX.parse().
   * @returns {Promise<object>} Resumen guardado (con id).
   */
  function add(file, fileName, summary) {
    const form = new FormData();
    form.append('gpx', file, fileName);
    form.append('summary', JSON.stringify(summary));
    return request(API_URL, { method: 'POST', body: form });
  }

  /**
   * Elimina un entrenamiento (datos y archivo).
   * @param {string} id
   * @returns {Promise}
   */
  function remove(id) {
    return request(workoutUrl(id), { method: 'DELETE' });
  }

  /**
   * URL para descargar el archivo .gpx original.
   * @param {string} id
   * @returns {string}
   */
  function gpxUrl(id) {
    return workoutUrl(id) + '&file=1';
  }

  /* ---------- Aviso de cambios entre pestañas del mismo navegador ---------- */

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

  /** Avisa a las demás pestañas abiertas que los datos cambiaron. */
  function notifyChange() {
    if (channel) channel.postMessage('changed');
  }

  /**
   * Registra una función que se ejecuta cuando otra pestaña cambia los datos.
   * @param {function} callback
   */
  function onChange(callback) {
    if (channel) channel.addEventListener('message', callback);
  }

  window.WorkoutStore = {
    getAll: getAll,
    get: get,
    add: add,
    remove: remove,
    gpxUrl: gpxUrl,
    notifyChange: notifyChange,
    onChange: onChange
  };

  /* ------------------------------------------------------------------
   * 3. LegacyStore (datos antiguos guardados en el navegador)
   * ------------------------------------------------------------------
   * Versiones anteriores guardaban los entrenamientos en IndexedDB
   * (base "calculadora-running", tablas "workouts" y "tracks").
   */

  const LEGACY_DB = 'calculadora-running';

  /**
   * Abre la base antigua solo si existe (no la crea).
   * @returns {Promise<IDBDatabase|null>}
   */
  function openLegacy() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(null); return; }
      const request = indexedDB.open(LEGACY_DB);
      let created = false;
      // Si se dispara "upgradeneeded" sin versión previa, la base no existía
      request.onupgradeneeded = function (event) {
        if (event.oldVersion === 0) {
          created = true;
          request.transaction.abort(); // no crea una base vacía
        }
      };
      request.onsuccess = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains('workouts') || !db.objectStoreNames.contains('tracks')) {
          db.close();
          resolve(null);
          return;
        }
        resolve(db);
      };
      request.onerror = function (event) {
        if (created) event.preventDefault();
        resolve(null);
      };
    });
  }

  /** Ejecuta una operación en la base antigua (si existe). */
  function legacyTransaction(mode, work) {
    return openLegacy().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(['workouts', 'tracks'], mode);
        const getResult = work(tx);
        tx.oncomplete = function () {
          db.close();
          resolve(typeof getResult === 'function' ? getResult() : undefined);
        };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  window.LegacyStore = {
    /** Resúmenes guardados en el navegador ([] si no hay). */
    getAll: function () {
      return legacyTransaction('readonly', function (tx) {
        const req = tx.objectStore('workouts').getAll();
        return function () { return req.result || []; };
      }).then(function (list) { return list || []; })
        .catch(function () { return []; });
    },

    /** Resumen + recorrido de un entrenamiento guardado en el navegador. */
    get: function (id) {
      return legacyTransaction('readonly', function (tx) {
        const summaryReq = tx.objectStore('workouts').get(id);
        const trackReq = tx.objectStore('tracks').get(id);
        return function () {
          if (!summaryReq.result || !trackReq.result) return null;
          return { summary: summaryReq.result, track: trackReq.result.track };
        };
      });
    },

    /** Borra un entrenamiento del navegador (tras migrarlo). */
    remove: function (id) {
      return legacyTransaction('readwrite', function (tx) {
        tx.objectStore('workouts').delete(id);
        tx.objectStore('tracks').delete(id);
      });
    }
  };
})();
