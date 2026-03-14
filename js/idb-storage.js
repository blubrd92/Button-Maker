/**
 * idb-storage.js
 *
 * Lightweight IndexedDB wrapper for Button Maker.
 * Provides a simple key-value store with ~50MB+ capacity,
 * replacing localStorage for large design data (images).
 *
 * Falls back gracefully if IndexedDB is unavailable.
 */

var IDB = (function() {
  var DB_NAME = 'ButtonMakerDB';
  var DB_VERSION = 1;
  var STORE_NAME = 'designs';
  var _db = null;
  var _ready = null; // Promise that resolves when DB is open

  /**
   * Open (or create) the database. Returns a Promise that resolves
   * with the db instance. Safe to call multiple times — reuses connection.
   */
  function open() {
    if (_ready) return _ready;

    _ready = new Promise(function(resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = function(e) {
        _db = e.target.result;
        resolve(_db);
      };

      request.onerror = function(e) {
        console.warn('IndexedDB open failed:', e.target.error);
        _ready = null;
        reject(e.target.error);
      };
    });

    return _ready;
  }

  /**
   * Store a value by key. Returns a Promise.
   */
  function set(key, value) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var request = store.put(value, key);
        request.onsuccess = function() { resolve(); };
        request.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  /**
   * Retrieve a value by key. Returns a Promise that resolves with the value
   * (or undefined if not found).
   */
  function get(key) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var request = store.get(key);
        request.onsuccess = function() { resolve(request.result); };
        request.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  /**
   * Remove a value by key. Returns a Promise.
   */
  function remove(key) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var request = store.delete(key);
        request.onsuccess = function() { resolve(); };
        request.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  /**
   * Clear all data from the store. Returns a Promise.
   */
  function clear() {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var request = store.clear();
        request.onsuccess = function() { resolve(); };
        request.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  /**
   * Check if IndexedDB is available and working.
   * Returns a Promise that resolves to true/false.
   */
  function isAvailable() {
    return open().then(function() { return true; }).catch(function() { return false; });
  }

  return {
    open: open,
    set: set,
    get: get,
    remove: remove,
    clear: clear,
    isAvailable: isAvailable
  };
})();
