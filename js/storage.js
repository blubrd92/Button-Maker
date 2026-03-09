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
    img.onload = function() {
      renderDesignCanvas();
    };
    img.src = imgData.dataUrl;
    currentDesign.imageElements.push(element);
  });

  // Restore library info (brand text)
  currentDesign.libraryInfoText = data.libraryInfoText || '';
  currentDesign.libraryInfoColor = data.libraryInfoColor || CONFIG.DEFAULTS.libraryInfoColor;

  // Update UI controls
  document.getElementById('bg-color-picker').value = currentDesign.backgroundColor;
  document.getElementById('library-info-input').value = currentDesign.libraryInfoText;
  document.getElementById('library-info-color').value = currentDesign.libraryInfoColor;
  updateBackgroundSwatches(currentDesign.backgroundColor);

  // Update gradient UI
  var grad = currentDesign.gradient;
  document.getElementById('toggle-gradient').checked = !!grad;
  document.getElementById('gradient-controls').classList.toggle('hidden', !grad);
  if (grad) {
    document.getElementById('bg-gradient-color2').value = grad.color2 || '#4A90D9';
    document.getElementById('gradient-direction').value = grad.direction || 'top-bottom';
  }

  // Deselect any element
  selectedElement = null;
  if (typeof hideTextControls === 'function') hideTextControls();
  hideImageControls();
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
    layout: CONFIG.currentLayout,
    master: masterData,
    slots: slotsData
  };

  // Save to localStorage
  var designs = getSavedDesigns();
  // Overwrite if same name exists
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
  saveDesignsToStorage(designs);

  // Also export as .buttons file download
  exportDesignsToJSON();
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
    alert('No designs to export. Save a design first.');
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
  var name = (typeof sheetName === 'string' && sheetName.trim())
    ? sheetName.trim()
    : 'buttonmaker-designs';
  a.download = name + '.buttons';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import designs from a JSON file. Supports wrapped { designs: [...] }
 * or raw array [...] formats. Merges by name (case-insensitive overwrite).
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
        alert('Invalid file format.');
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
          layout: d.layout || '15',
          master: d.master || {},
          slots: Array.isArray(d.slots) ? d.slots : []
        };
      });

      if (incoming.length === 0) {
        alert('No valid designs found in file.');
        return;
      }

      // Merge by name (case-insensitive): imported overwrites existing
      var existing = getSavedDesigns();
      var nameMap = {};
      existing.forEach(function(d, i) { nameMap[d.name.toLowerCase()] = i; });

      incoming.forEach(function(d) {
        var key = d.name.toLowerCase();
        if (key in nameMap) {
          existing[nameMap[key]] = d;
        } else {
          existing.push(d);
          nameMap[key] = existing.length - 1;
        }
      });

      saveDesignsToStorage(existing);

      // Load the first imported design
      var first = incoming[0];
      CONFIG.currentButtonSize = first.buttonSize || '1.5';
      CONFIG.currentLayout = first.layout || '15';
      deserializeDesign(first.master);
      if (typeof setSheetSlots === 'function' && first.slots) {
        setSheetSlots(first.slots);
      }
      
      // Update the active view based on current mode
      if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof renderSheetView === 'function') {
        renderSheetView();
      } else {
        renderDesignCanvas();
      }

      alert('Imported ' + incoming.length + ' design(s).');
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed: invalid JSON.');
    }
  };
  reader.readAsText(file);
}

/**
 * Initialize storage: wire up top bar Save/Load buttons and file input.
 * Called once from app.js.
 */
function initStorage() {
  // Save button — quick save to localStorage + file download
  document.getElementById('btn-save').addEventListener('click', quickSave);

  // Load button — opens file picker
  document.getElementById('btn-load').addEventListener('click', quickLoad);

  // File input for .buttons import
  document.getElementById('import-designs-file').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
      importDesignsFromJSON(e.target.files[0]);
      e.target.value = '';
    }
  });
}