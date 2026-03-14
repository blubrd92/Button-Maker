/**
 * storage.js
 *
 * Manages saving and loading button designs to/from IndexedDB, localStorage,
 * and .buttons files.
 *
 * Storage strategy:
 * - IndexedDB (primary): large capacity (~50MB+), async API
 * - localStorage (fallback): used for beforeunload sync saves and when
 *   IndexedDB is unavailable
 * - .buttons file download: always exported on Save as the authoritative copy
 *
 * Depends on:
 * - idb-storage.js (IndexedDB wrapper — must be loaded first)
 * - config.js (for default values)
 * - canvas.js (currentDesign, renderDesignCanvas)
 * - templates.js (getTemplateById to restore template draw functions)
 * - image-tool.js (reconstructing Image objects from dataUrls)
 */

var STORAGE_KEY = 'buttonmaker_designs';
var AUTOSAVE_KEY = 'buttonmaker_autosave';
var IDB_DESIGNS_KEY = 'designs';
var IDB_AUTOSAVE_KEY = 'autosave';

/**
 * Serialize a design object for storage (strips non-serializable data).
 * @param {Object} design - The design to serialize
 * @returns {Object} Serializable design data
 */
function serializeDesign(design) {
  return {
    templateId: design.templateId,
    backgroundColor: design.backgroundColor,
    gradient: design.gradient || null,
    textElements: design.textElements.map(function(t) {
      return {
        text: t.text,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        color: t.color,
        bold: t.bold,
        italic: t.italic,
        align: t.align,
        x: t.x,
        y: t.y,
        curved: t.curved,
        curveRadius: t.curveRadius
      };
    }),
    imageElements: design.imageElements.map(function(img) {
      return (typeof serializeImageElement === 'function')
        ? serializeImageElement(img)
        : {
            dataUrl: img.dataUrl,
            x: img.x,
            y: img.y,
            width: img.width,
            height: img.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            baseWidth: img.baseWidth,
            baseHeight: img.baseHeight,
            imageScale: img.imageScale || 1.0
          };
    }),
    libraryInfoText: design.libraryInfoText,
    libraryInfoColor: design.libraryInfoColor
  };
}

/**
 * Deserialize saved design data into the currentDesign object.
 * Reconstructs Image objects and template draw functions.
 * @param {Object} data - Saved design data
 */
function deserializeDesign(data, imageAssets) {
  if (typeof restoreSerializedImageAssets === 'function') {
    restoreSerializedImageAssets(imageAssets || null);
  }

  currentDesign.templateId = data.templateId;
  currentDesign.backgroundColor = data.backgroundColor;
  currentDesign.gradient = data.gradient || null;

  // Restore template draw function
  if (data.templateId) {
    var template = getTemplateById(data.templateId);
    currentDesign.templateDraw = template ? template.draw : null;
  } else {
    currentDesign.templateDraw = null;
  }

  // If gradient is set, override templateDraw with gradient
  if (currentDesign.gradient) {
    currentDesign.templateDraw = buildGradientDrawFunction(currentDesign.gradient);
  }

  // Restore text elements
  currentDesign.textElements = data.textElements || [];

  // Restore image elements (reconstruct Image objects and cover-fill fields)
  currentDesign.imageElements = [];
  var totalImages = data.imageElements ? data.imageElements.length : 0;
  var loadedImages = 0;

  function attemptRender() {
    loadedImages++;
    // Only render the canvas when all images have either loaded or failed
    if (loadedImages === totalImages) {
      if (typeof renderDesignCanvas === 'function') renderDesignCanvas();

      if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
        refreshSheetThumbnails();
      }
    }
  }

  if (totalImages === 0) {
    // If there are no images, we can just render immediately
    if (typeof renderDesignCanvas === 'function') renderDesignCanvas();
    if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
      refreshSheetThumbnails();
    }
  } else {
    (data.imageElements || []).forEach(function(imgData) {
      var element = (typeof hydrateImageElement === 'function')
        ? hydrateImageElement(imgData)
        : Object.assign({}, imgData);

      currentDesign.imageElements.push(element);

      if (!element.imgObj) {
        attemptRender();
        return;
      }

      if (element.imgObj.complete && element.imgObj.naturalWidth) {
        attemptRender();
      } else {
        element.imgObj.addEventListener('load', attemptRender, { once: true });
        element.imgObj.addEventListener('error', function() {
          console.warn('Button Maker: An image failed to load from the save file.');
          attemptRender();
        }, { once: true });
      }
    });
  }

  // Restore library info (brand text)
  currentDesign.libraryInfoText = data.libraryInfoText || '';
  currentDesign.libraryInfoColor = data.libraryInfoColor || CONFIG.DEFAULTS.libraryInfoColor;

  // Update UI controls
  var grad = currentDesign.gradient;
  var bgColor = grad && grad.color1 ? grad.color1 : currentDesign.backgroundColor;
  document.getElementById('bg-color-picker').value = bgColor;
  document.getElementById('library-info-input').value = currentDesign.libraryInfoText;
  document.getElementById('library-info-color').value = currentDesign.libraryInfoColor;
  if (typeof updateBackgroundSwatches === 'function') {
    updateBackgroundSwatches(bgColor);
  }

  // Update gradient UI
  var toggleGradient = document.getElementById('toggle-gradient');
  var gradientControls = document.getElementById('gradient-controls');
  if (toggleGradient) toggleGradient.checked = !!grad;
  if (gradientControls) gradientControls.classList.toggle('hidden', !grad);
  document.querySelectorAll('.gradient-preset-btn').forEach(function(btn) {
    btn.classList.remove('active');
  });
  if (grad) {
    var color2 = document.getElementById('bg-gradient-color2');
    var dir = document.getElementById('gradient-direction');
    if (color2) color2.value = grad.color2 || '#4A90D9';
    if (dir) dir.value = grad.direction || 'top-bottom';
    if (grad.preset) {
      document.querySelectorAll('.gradient-preset-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.preset === grad.preset);
      });
    }
  }

  // Deselect any element
  selectedElement = null;
  if (typeof hideTextControls === 'function') hideTextControls();
  if (typeof hideImageControls === 'function') hideImageControls();
}

// ─── Build save payload ──────────────────────────────────────────

/**
 * Build the full save payload from the current design state.
 * @returns {Object} The serialized save object
 */
function buildSavePayload() {
  var masterData = serializeDesign(currentDesign);
  var slotsData = (typeof getSheetSlots === 'function') ? getSheetSlots() : [];
  if (typeof normalizeSlotDataImageAssets === 'function') {
    normalizeSlotDataImageAssets(slotsData);
  }
  var assetsData = (typeof buildSerializedImageAssetBundle === 'function')
    ? buildSerializedImageAssetBundle(currentDesign, slotsData)
    : null;
  var name = (typeof sheetName === 'string' && sheetName.trim())
    ? sheetName.trim()
    : 'Untitled';

  return {
    name: name,
    savedAt: new Date().toISOString(),
    buttonSize: CONFIG.currentButtonSize,
    master: masterData,
    slots: slotsData,
    assets: assetsData
  };
}

// ─── Quick Save / Load ───────────────────────────────────────────

/**
 * Quick-save: saves current design to IndexedDB (with localStorage fallback),
 * then exports as .buttons file download.
 */
function quickSave() {
  var savedDesign = buildSavePayload();

  // Save to IndexedDB (primary — large capacity)
  if (typeof IDB !== 'undefined') {
    IDB.set(IDB_DESIGNS_KEY, [savedDesign]).catch(function(err) {
      console.warn('IndexedDB save failed:', err);
    });
  }

  // Also try localStorage as a sync fallback (best-effort, may fail on quota)
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ designs: [savedDesign] }));
  } catch (e) {
    // Quota exceeded — that's fine, IndexedDB and the file download cover us
  }

  // Always export as .buttons file download
  exportDesignsFromArray([savedDesign]);
}

/**
 * Quick-load: opens file picker for .buttons file import.
 */
function quickLoad() {
  document.getElementById('import-designs-file').click();
}

// ─── JSON Export/Import ──────────────────────────────────────────

/**
 * Export all saved designs as a JSON file download.
 */
function exportDesignsToJSON() {
  // Try IndexedDB first, fall back to localStorage
  if (typeof IDB !== 'undefined') {
    IDB.get(IDB_DESIGNS_KEY).then(function(designs) {
      if (designs && designs.length > 0) {
        exportDesignsFromArray(designs);
      } else {
        exportDesignsFromLocalStorage();
      }
    }).catch(function() {
      exportDesignsFromLocalStorage();
    });
  } else {
    exportDesignsFromLocalStorage();
  }
}

function exportDesignsFromLocalStorage() {
  try {
    var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    var designs = (data && data.designs) ? data.designs : [];
    if (designs.length === 0) {
      if (typeof showNotification === 'function') showNotification('No designs to export. Save a design first.');
      return;
    }
    exportDesignsFromArray(designs);
  } catch (e) {
    if (typeof showNotification === 'function') showNotification('No designs to export. Save a design first.');
  }
}

/**
 * Export a given array of designs as a .buttons file download.
 * @param {Array} designs - Array of design objects to export
 */
function exportDesignsFromArray(designs) {
  if (!designs || designs.length === 0) {
    if (typeof showNotification === 'function') showNotification('No designs to export. Save a design first.');
    return;
  }
  var payload = {
    app: 'ButtonMaker',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    designs: designs
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var baseName = (typeof sheetName === 'string' && sheetName.trim())
    ? sheetName.trim()
    : 'buttonmaker-designs';
  a.download = CONFIG.currentButtonSize + 'in - ' + baseName + '.buttons';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import designs from a JSON file. After import, loads the first design.
 * Saves to IndexedDB with localStorage fallback.
 * @param {File} file - The JSON file to import
 */
function importDesignsFromJSON(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var raw = JSON.parse(e.target.result);
      var incoming;
      if (Array.isArray(raw)) {
        incoming = raw;
      } else if (raw && Array.isArray(raw.designs)) {
        incoming = raw.designs;
      } else {
        if (typeof showNotification === 'function') showNotification('Invalid file format.');
        return;
      }

      // Sanitize each record
      incoming = incoming.filter(function(d) {
        return d && typeof d.name === 'string' && d.name.trim();
      }).map(function(d) {
        return {
          name: d.name.trim(),
          savedAt: d.savedAt || new Date().toISOString(),
          buttonSize: d.buttonSize || '1.5',
          master: d.master || {},
          slots: Array.isArray(d.slots) ? d.slots : [],
          assets: d.assets || null
        };
      });

      if (incoming.length === 0) {
        if (typeof showNotification === 'function') showNotification('No valid designs found in file.');
        return;
      }

      // Save to IndexedDB (primary)
      if (typeof IDB !== 'undefined') {
        IDB.set(IDB_DESIGNS_KEY, incoming).catch(function(err) {
          console.warn('IndexedDB save on import failed:', err);
        });
      }

      // Best-effort localStorage save
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ designs: incoming }));
      } catch (ignored) {}

      // Load the first imported design
      var first = incoming[0];
      CONFIG.currentButtonSize = first.buttonSize || '1.5';

      var sizeSelect = document.getElementById('button-size-select');
      if (sizeSelect) {
        sizeSelect.value = CONFIG.currentButtonSize;
      }
      if (typeof sheetName !== 'undefined') {
        sheetName = first.name || '';
      }
      deserializeDesign(first.master, first.assets || null);
      if (typeof setSheetSlots === 'function' && first.slots) {
        setSheetSlots(first.slots);
      }

      // Force the active view over to sheet mode
      currentMode = 'sheet';
      var btnDesign = document.getElementById('btn-design-mode');
      var btnSheet = document.getElementById('btn-sheet-mode');
      if (btnDesign) btnDesign.classList.remove('active');
      if (btnSheet) btnSheet.classList.add('active');

      if (typeof enterSheetMode === 'function') {
        enterSheetMode();
      } else if (typeof renderSheetView === 'function') {
        var wrapper = document.getElementById('design-canvas-wrapper');
        var sheetView = document.getElementById('sheet-view');
        if (wrapper) wrapper.classList.add('hidden');
        if (sheetView) sheetView.classList.remove('hidden');
        renderSheetView();
      }

      // Automatically apply "Fit to Page" math since we are loading a new sheet
      if (typeof computeFitToScreenZoom === 'function' && typeof setCurrentZoom === 'function' && typeof applyZoom === 'function') {
        setCurrentZoom(computeFitToScreenZoom());
        applyZoom();
      }

      if (typeof showNotification === 'function') showNotification('Buttons loaded.', 'success');

      // Force an auto-save right now so it survives an immediate window close
      autoSaveState();
    } catch (err) {
      console.error('Import failed:', err);
      if (typeof showNotification === 'function') showNotification('Could not load this file. Is it a valid .buttons file?');
    }
  };
  reader.readAsText(file);
}

// ─── Auto-save (session recovery) ────────────────────────────────

/**
 * Auto-save current working state.
 * Writes to IndexedDB (async, large capacity) and attempts localStorage
 * as a synchronous fallback (important for beforeunload).
 */
function autoSaveState() {
  var state = {
    savedAt: new Date().toISOString(),
    master: serializeDesign(currentDesign),
    buttonSize: CONFIG.currentButtonSize,
    sheetName: (typeof sheetName === 'string') ? sheetName : '',
    slots: (typeof getSheetSlots === 'function') ? getSheetSlots() : [],
    mode: currentMode
  };
  if (typeof normalizeSlotDataImageAssets === 'function') {
    normalizeSlotDataImageAssets(state.slots);
  }
  if (typeof buildSerializedImageAssetBundle === 'function') {
    state.assets = buildSerializedImageAssetBundle(currentDesign, state.slots);
  }

  // Primary: IndexedDB (async, large capacity)
  if (typeof IDB !== 'undefined') {
    IDB.set(IDB_AUTOSAVE_KEY, state).catch(function(err) {
      console.warn('IndexedDB autosave failed:', err);
    });
  }

  // Fallback: localStorage (sync, works in beforeunload, but may fail on quota)
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // Quota exceeded — IndexedDB has us covered
  }
}

/**
 * Restore auto-saved state if present.
 * Checks IndexedDB first (more reliable for large data), then localStorage.
 * Returns a Promise that resolves to true if restored, false otherwise.
 */
function autoRestoreState() {
  // Try IndexedDB first
  if (typeof IDB !== 'undefined') {
    return IDB.get(IDB_AUTOSAVE_KEY).then(function(state) {
      if (state && state.master) {
        applyRestoredState(state);
        return true;
      }
      // IndexedDB had nothing — try localStorage
      return restoreFromLocalStorage();
    }).catch(function() {
      // IndexedDB failed — try localStorage
      return restoreFromLocalStorage();
    });
  }

  // No IndexedDB — use localStorage synchronously wrapped in a resolved Promise
  return Promise.resolve(restoreFromLocalStorage());
}

/**
 * Attempt to restore state from localStorage (synchronous).
 * @returns {boolean} true if restored, false otherwise
 */
function restoreFromLocalStorage() {
  try {
    var raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    var state = JSON.parse(raw);
    if (!state || !state.master) return false;
    applyRestoredState(state);
    return true;
  } catch (e) {
    console.warn('localStorage auto-restore failed:', e);
    return false;
  }
}

/**
 * Apply a restored state object to the app.
 * @param {Object} state - The auto-saved state to restore
 */
function applyRestoredState(state) {
  CONFIG.currentButtonSize = state.buttonSize || '1.5';

  var sizeSelect = document.getElementById('button-size-select');
  if (sizeSelect) {
    sizeSelect.value = CONFIG.currentButtonSize;
  }
  if (typeof sheetName !== 'undefined') {
    sheetName = state.sheetName || '';
    var nameInput = document.getElementById('sheet-name-input');
    if (nameInput) nameInput.value = sheetName;
  }

  deserializeDesign(state.master, state.assets || null);

  if (typeof setSheetSlots === 'function' && state.slots) {
    setSheetSlots(state.slots);
  }

  // Force mode switch if they left off in Sheet view
  if (state.mode === 'sheet') {
    currentMode = 'sheet';
    var btnDesign = document.getElementById('btn-design-mode');
    var btnSheet = document.getElementById('btn-sheet-mode');
    if (btnDesign) btnDesign.classList.remove('active');
    if (btnSheet) btnSheet.classList.add('active');

    if (typeof renderSheetView === 'function') {
      var wrapper = document.getElementById('design-canvas-wrapper');
      var sheetView = document.getElementById('sheet-view');
      if (wrapper) wrapper.classList.add('hidden');
      if (sheetView) sheetView.classList.remove('hidden');
      renderSheetView();

      if (typeof computeFitToScreenZoom === 'function' && typeof setCurrentZoom === 'function' && typeof applyZoom === 'function') {
        setCurrentZoom(computeFitToScreenZoom());
        applyZoom();
      }
    }
  }
}

/**
 * Clear all stored data from both IndexedDB and localStorage.
 */
function clearAllStorage() {
  // Clear IndexedDB
  if (typeof IDB !== 'undefined') {
    IDB.clear().catch(function(err) {
      console.warn('IndexedDB clear failed:', err);
    });
  }
  // Clear localStorage
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (ignored) {}
}

/**
 * Initialize storage: wire up top bar Save/Load buttons and file input.
 * Called once from app.js.
 */
function initStorage() {
  // Pre-open IndexedDB so it's ready when needed
  if (typeof IDB !== 'undefined') {
    IDB.open().catch(function(err) {
      console.warn('IndexedDB not available, using localStorage only:', err);
    });
  }

  // Save button
  document.getElementById('btn-save').addEventListener('click', quickSave);

  // Load button
  document.getElementById('btn-load').addEventListener('click', quickLoad);

  // File input for .buttons import
  document.getElementById('import-designs-file').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
      importDesignsFromJSON(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Auto-save on window close / navigate away
  window.addEventListener('beforeunload', autoSaveState);
}
