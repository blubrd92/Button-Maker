/**
 * storage.js
 *
 * Manages saving and loading button designs to/from localStorage and files.
 *
 * Responsibilities:
 * - Serializing design state (master + per-button overrides) to JSON
 * - Saving/loading designs via .buttons files (export/import)
 * - Quick save to localStorage with auto-generated name
 * - Quick load from localStorage (most recent) or file picker
 *
 * Depends on:
 * - config.js (for default values)
 * - canvas.js (currentDesign, renderDesignCanvas)
 * - templates.js (getTemplateById to restore template draw functions)
 * - image-tool.js (reconstructing Image objects from dataUrls)
 */

const STORAGE_KEY = 'buttonmaker_designs';
const AUTOSAVE_KEY = 'buttonmaker_autosave';

/**
 * Get all saved designs from localStorage.
 * @returns {Array} Array of saved design objects
 */
function getSavedDesigns() {
  try {
    var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return (data && data.designs) ? data.designs : [];
  } catch (e) {
    console.warn('Failed to parse saved designs:', e);
    return [];
  }
}

/**
 * Save all designs to localStorage.
 * @param {Array} designs - Array of design objects
 */
function saveDesignsToStorage(designs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ designs: designs }));
}

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
      return {
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
function deserializeDesign(data) {
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
      var img = new Image();
      var element = Object.assign({}, imgData, { imgObj: img });
      
      // Ensure cover-fill fields exist (for designs saved before this feature)
      if (!element.baseWidth || !element.baseHeight) {
        var cover = computeCoverFillSize(
          element.naturalWidth || 1,
          element.naturalHeight || 1
        );
        element.baseWidth = cover.width;
        element.baseHeight = cover.height;
      }
      if (!element.imageScale) {
        element.imageScale = 1.0;
      }
      
      // Push element BEFORE setting src
      currentDesign.imageElements.push(element);
      
      img.onload = attemptRender;
      img.onerror = function() {
        console.warn('Button Maker: An image failed to load from the save file.');
        attemptRender();
      };
      
      img.src = imgData.dataUrl;
    });
  }

  // Restore library info (brand text)
  currentDesign.libraryInfoText = data.libraryInfoText || '';
  currentDesign.libraryInfoColor = data.libraryInfoColor || CONFIG.DEFAULTS.libraryInfoColor;

  // Update UI controls
  document.getElementById('bg-color-picker').value = currentDesign.backgroundColor;
  document.getElementById('library-info-input').value = currentDesign.libraryInfoText;
  document.getElementById('library-info-color').value = currentDesign.libraryInfoColor;
  if (typeof updateBackgroundSwatches === 'function') {
    updateBackgroundSwatches(currentDesign.backgroundColor);
  }

  // Update gradient UI
  var grad = currentDesign.gradient;
  var toggleGradient = document.getElementById('toggle-gradient');
  var gradientControls = document.getElementById('gradient-controls');
  if (toggleGradient) toggleGradient.checked = !!grad;
  if (gradientControls) gradientControls.classList.toggle('hidden', !grad);
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

/**
 * Quick-save: saves current design to localStorage with a timestamp name,
 * then exports as .buttons file download.
 */
function quickSave() {
  var masterData = serializeDesign(currentDesign);
  var slotsData = (typeof getSheetSlots === 'function') ? getSheetSlots() : [];
  var name = (typeof sheetName === 'string' && sheetName.trim())
    ? sheetName.trim()
    : 'Untitled';

  var savedDesign = {
    name: name,
    savedAt: new Date().toISOString(),
    buttonSize: CONFIG.currentButtonSize,
    master: masterData,
    slots: slotsData
  };

  // Save to localStorage (best-effort; limit to last 5 to prevent bloat)
  var designs = getSavedDesigns();
  var existingIdx = -1;
  for (var i = 0; i < designs.length; i++) {
    if (designs[i].name.toLowerCase() === name.toLowerCase()) {
      existingIdx = i;
      break;
    }
  }
  if (existingIdx >= 0) {
    designs[existingIdx] = savedDesign;
  } else {
    designs.push(savedDesign);
  }

  // Enforce a maximum of 5 saved designs in local storage
  if (designs.length > 5) {
    designs = designs.slice(designs.length - 5);
  }

  try {
    saveDesignsToStorage(designs);
  } catch (e) {
    console.warn('localStorage save failed (quota?):', e);
    if (typeof showNotification === 'function') {
      showNotification('Browser memory full. Background save failed. Please rely on downloaded files.', 'error');
    }
  }

  // Always export as .buttons file download, even if localStorage failed
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
  var designs = getSavedDesigns();
  if (designs.length === 0) {
    if (typeof showNotification === 'function') showNotification('No designs to export. Save a design first.');
    return;
  }
  exportDesignsFromArray(designs);
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
  a.download = CONFIG.currentButtonSize + ' - ' + baseName + '.buttons';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import designs from a JSON file. Supports wrapped { designs: [...] }
 * or raw array [...] formats. Avoids name collisions.
 * After import, loads the first design.
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
          slots: Array.isArray(d.slots) ? d.slots : []
        };
      });

      if (incoming.length === 0) {
        if (typeof showNotification === 'function') showNotification('No valid designs found in file.');
        return;
      }

      // Merge by name: append a number if the name already exists
      var existing = getSavedDesigns();
      var nameMap = {};
      existing.forEach(function(d, i) { nameMap[d.name.toLowerCase()] = i; });

      incoming.forEach(function(d) {
        var originalName = d.name;
        var key = originalName.toLowerCase();
        var counter = 1;
        
        // If the name is already taken, keep incrementing a number until we find a free slot
        while (key in nameMap) {
          d.name = originalName + ' (' + counter + ')';
          key = d.name.toLowerCase();
          counter++;
        }
        
        existing.push(d);
        nameMap[key] = existing.length - 1;
      });

      // Enforce the same limit of 5 designs after importing
      if (existing.length > 5) {
        existing = existing.slice(existing.length - 5);
      }

      saveDesignsToStorage(existing);

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
      deserializeDesign(first.master);
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
 * Auto-save current working state to localStorage.
 * Called on beforeunload and periodically.
 */
function autoSaveState() {
  try {
    var state = {
      savedAt: new Date().toISOString(),
      master: serializeDesign(currentDesign),
      buttonSize: CONFIG.currentButtonSize,
      sheetName: (typeof sheetName === 'string') ? sheetName : '',
      slots: (typeof getSheetSlots === 'function') ? getSheetSlots() : [],
      mode: currentMode
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // Storage full or unavailable
  }
}

/**
 * Restore auto-saved state if present. Returns true if restored.
 */
function autoRestoreState() {
  try {
    var raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    var state = JSON.parse(raw);
    if (!state || !state.master) return false;

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

    deserializeDesign(state.master);

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

    return true;
  } catch (e) {
    console.warn('Auto-restore failed:', e);
    return false;
  }
}

/**
 * Initialize storage: wire up top bar Save/Load buttons and file input.
 * Called once from app.js.
 */
function initStorage() {
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