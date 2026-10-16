/**
 * =====================================================================
 * Archivo: storage.js
 * Descripción: Guarda los entrenamientos importados en el navegador
 * usando IndexedDB, para que sigan disponibles al recargar la página y
 * para que la ventana de detalle pueda leerlos.
 *
 * Se usan dos "tablas" (object stores) con la misma clave `id`:
 *  - workouts: resumen ligero (nombre, fecha, km, ritmo...) -> dashboard
 *  - tracks:   puntos GPS completos                         -> detalle
 * Así el dashboard carga rápido aunque haya muchos entrenamientos.
 *
 * Expone el objeto global `WorkoutStore` (todas sus funciones devuelven
 * Promesas). Los cambios se avisan entre ventanas con BroadcastChannel.
 * =====================================================================
 */

(function () {
  'use strict';

  const DB_NAME = 'calculadora-running';
  const DB_VERSION = 1;
  const CHANNEL_NAME = 'calculadora-running-entrenamientos';

  /** Promesa reutilizable con la conexión a la base de datos. */
  let dbPromise = null;

  /**
   * Abre (o crea) la base de datos.
   * @returns {Promise<IDBDatabase>}
   */
  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('Tu navegador no permite guardar datos (IndexedDB no disponible).'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Se ejecuta la primera vez (o al subir DB_VERSION): crea las tablas
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });

    // Si falla, permite reintentar en la siguiente llamada
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  /**
   * Ejecuta una transacción y resuelve cuando termina por completo.
   * @param {string[]} stores - Tablas involucradas.
   * @param {'readonly'|'readwrite'} mode
   * @param {function(IDBTransaction): *} work - Recibe la transacción;
   *        puede devolver una función que produce el resultado final.
   * @returns {Promise<*>}
   */
  function transaction(stores, mode, work) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(stores, mode);
        const getResult = work(tx);
        tx.oncomplete = function () { resolve(typeof getResult === 'function' ? getResult() : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Operación cancelada.')); };
      });
    });
  }

  /**
   * Devuelve los resúmenes de todos los entrenamientos.
   * @returns {Promise<object[]>}
   */
  function getAll() {
    return transaction(['workouts'], 'readonly', function (tx) {
      const request = tx.objectStore('workouts').getAll();
      return function () { return request.result || []; };
    });
  }

  /**
   * Devuelve un entrenamiento completo (resumen + puntos GPS).
   * @param {string} id
   * @returns {Promise<{summary: object, track: object}|null>}
   */
  function get(id) {
    return transaction(['workouts', 'tracks'], 'readonly', function (tx) {
      const summaryReq = tx.objectStore('workouts').get(id);
      const trackReq = tx.objectStore('tracks').get(id);
      return function () {
        if (!summaryReq.result || !trackReq.result) return null;
        return { summary: summaryReq.result, track: trackReq.result.track };
      };
    });
  }

  /**
   * Guarda un entrenamiento nuevo.
   * @param {object} summary - Debe incluir `id`.
   * @param {object} track
   * @returns {Promise<void>}
   */
  function add(summary, track) {
    return transaction(['workouts', 'tracks'], 'readwrite', function (tx) {
      tx.objectStore('workouts').put(summary);
      tx.objectStore('tracks').put({ id: summary.id, track: track });
    });
  }

  /**
   * Elimina un entrenamiento.
   * @param {string} id
   * @returns {Promise<void>}
   */
  function remove(id) {
    return transaction(['workouts', 'tracks'], 'readwrite', function (tx) {
      tx.objectStore('workouts').delete(id);
      tx.objectStore('tracks').delete(id);
    });
  }

  /**
   * Genera un identificador único. (No se usa crypto.randomUUID porque
   * no existe fuera de HTTPS, p. ej. al abrir la app por IP en XAMPP.)
   * @returns {string}
   */
  function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- Aviso de cambios entre ventanas ---------- */

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

  /** Avisa a las demás ventanas abiertas que los datos cambiaron. */
  function notifyChange() {
    if (channel) channel.postMessage('changed');
  }

  /**
   * Registra una función que se ejecuta cuando otra ventana cambia los datos.
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
    createId: createId,
    notifyChange: notifyChange,
    onChange: onChange
  };
})();
