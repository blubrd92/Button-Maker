/**
 * undo.js
 *
 * Undo/redo history for Button Maker.
 *
 * Approach:
 *   - Snapshots capture serialized master design + slot overrides + sheet name
 *   - Image assets stay in the global registry (additive, never cleared by undo)
 *   - Restore rebuilds runtime objects (templateDraw, gradient draw, imgObj)
 *     from serialized data without touching the asset registry
 *   - Coalescing prevents rapid-fire snapshots from the same control
 *   - Slot editing mode is exited (discarded) before undo/redo
 */

var _undoStack = [];
var _redoStack = [];
var _isUndoRestoring = false;
var _lastPushGroup = null;
var _lastPushTime = 0;
var UNDO_MAX = 50;
var UNDO_COALESCE_MS = 1000;

// ─── Snapshot capture ────────────────────────────────────────────

function _captureSnapshot() {
  var master = serializeDesign(currentDesign);

  // Strip the gradient draw function — JSON can't serialize it
  if (master.gradient && typeof master.gradient.draw === 'function') {
    var g = {};
    for (var k in master.gradient) {
      if (k !== 'draw') g[k] = master.gradient[k];
    }
    master.gradient = g;
  }

  var rawSlots = (typeof getSheetSlots === 'function') ? getSheetSlots() : [];
  var slots = [];
  for (var i = 0; i < rawSlots.length; i++) {
    var slot = rawSlots[i];
    var o = _serializeOverrides(slot.overrides);
    slots.push({ slotIndex: slot.slotIndex, row: slot.row, col: slot.col, overrides: o });
  }

  var name = (typeof sheetName !== 'undefined') ? sheetName : '';

  return JSON.stringify({ master: master, slots: slots, sheetName: name });
}

function _serializeOverrides(overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return {};
  var result = {};
  for (var key in overrides) {
    if (key === 'templateDraw') continue;
    if (key === 'imageElements' && Array.isArray(overrides[key])) {
      result.imageElements = overrides[key].map(function(el) {
        return (typeof serializeImageElement === 'function')
          ? serializeImageElement(el) : el;
      });
    } else if (key === 'gradient' && overrides[key] && typeof overrides[key] === 'object') {
      var g = {};
      for (var gk in overrides[key]) {
        if (gk !== 'draw') g[gk] = overrides[key][gk];
      }
      result[key] = JSON.parse(JSON.stringify(g));
    } else {
      result[key] = JSON.parse(JSON.stringify(overrides[key]));
    }
  }
  return result;
}

// ─── Snapshot restore ────────────────────────────────────────────

function _restoreSnapshot(json) {
  _isUndoRestoring = true;
  try {
    var snap = JSON.parse(json);
    var d = snap.master;

    // --- Restore master design ---
    currentDesign.templateId = d.templateId || null;
    currentDesign.backgroundColor = d.backgroundColor || '#FFFFFF';
    currentDesign.libraryInfoText = d.libraryInfoText || '';
    currentDesign.libraryInfoColor = d.libraryInfoColor || CONFIG.DEFAULTS.libraryInfoColor;
    currentDesign.textElements = d.textElements || [];

    // Reconstruct templateDraw
    currentDesign.templateDraw = null;
    if (d.templateId) {
      var tmpl = (typeof getTemplateById === 'function') ? getTemplateById(d.templateId) : null;
      if (tmpl && tmpl.draw) currentDesign.templateDraw = tmpl.draw;
    }

    // Reconstruct gradient (including draw function)
    if (d.gradient) {
      currentDesign.gradient = d.gradient;
      if (typeof buildGradientDrawFunction === 'function') {
        currentDesign.templateDraw = buildGradientDrawFunction(d.gradient);
      }
    } else {
      currentDesign.gradient = null;
    }

    // Reconstruct image elements from the existing asset registry
    currentDesign.imageElements = [];
    if (d.imageElements && d.imageElements.length > 0) {
      for (var i = 0; i < d.imageElements.length; i++) {
        var el = (typeof hydrateImageElement === 'function')
          ? hydrateImageElement(d.imageElements[i])
          : d.imageElements[i];
        currentDesign.imageElements.push(el);
      }
    }

    // --- Restore sheet slots ---
    var restoredSlots = [];
    for (var s = 0; s < snap.slots.length; s++) {
      var slotData = snap.slots[s];
      var overrides = _hydrateOverrides(slotData.overrides);
      restoredSlots.push({
        slotIndex: slotData.slotIndex,
        row: slotData.row,
        col: slotData.col,
        overrides: overrides
      });
    }
    if (typeof setSheetSlots === 'function') setSheetSlots(restoredSlots);

    // --- Restore sheet name ---
    if (typeof sheetName !== 'undefined') {
      sheetName = snap.sheetName || '';
      var nameInput = document.getElementById('sheet-name-input');
      if (nameInput) nameInput.value = sheetName;
    }

    // --- Deselect and sync UI ---
    selectedElement = null;
    if (typeof hideImageControls === 'function') hideImageControls();
    if (typeof hideTextControls === 'function') hideTextControls();
    if (typeof syncSidebarToDesign === 'function') syncSidebarToDesign(currentDesign);

    // --- Re-render ---
    if (typeof renderDesignCanvas === 'function') renderDesignCanvas();
    if (typeof currentMode !== 'undefined' && currentMode === 'sheet' &&
        typeof refreshSheetThumbnails === 'function') {
      refreshSheetThumbnails();
    }
  } finally {
    _isUndoRestoring = false;
  }
}

function _hydrateOverrides(overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return {};
  var result = {};
  for (var key in overrides) {
    if (key === 'imageElements' && Array.isArray(overrides[key])) {
      result.imageElements = overrides[key].map(function(el) {
        return (typeof hydrateImageElement === 'function')
          ? hydrateImageElement(el) : el;
      });
    } else if (key === 'gradient' && overrides[key] && typeof overrides[key] === 'object') {
      result.gradient = overrides[key];
      if (typeof buildGradientDrawFunction === 'function') {
        result.gradient.draw = buildGradientDrawFunction(overrides[key]);
      }
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Save the current state to the undo stack before a mutation.
 * Call this BEFORE making changes.
 *
 * @param {string} [group] - Optional group ID for coalescing rapid changes.
 *   Same group within UNDO_COALESCE_MS will be collapsed to one undo step.
 */
function pushUndo(group) {
  if (_isUndoRestoring) return;

  var now = Date.now();
  if (group && group === _lastPushGroup && (now - _lastPushTime) < UNDO_COALESCE_MS) {
    _lastPushTime = now;
    return;
  }

  var snapshot = _captureSnapshot();
  _undoStack.push(snapshot);
  if (_undoStack.length > UNDO_MAX) _undoStack.shift();
  _redoStack = [];

  _lastPushGroup = group || null;
  _lastPushTime = now;

  _updateUndoRedoButtons();
}

/**
 * Undo the most recent change.
 */
function undo() {
  if (_undoStack.length === 0) return;

  // Exit slot editing mode if active (discard changes)
  _exitSlotEditIfActive();

  // Save current state to redo stack
  var current = _captureSnapshot();
  _redoStack.push(current);

  // Restore previous state
  var previous = _undoStack.pop();
  _restoreSnapshot(previous);

  _lastPushGroup = null;
  _updateUndoRedoButtons();

  if (typeof showNotification === 'function') {
    showNotification('Undo', 'info');
  }
}

/**
 * Redo the most recently undone change.
 */
function redo() {
  if (_redoStack.length === 0) return;

  // Exit slot editing mode if active
  _exitSlotEditIfActive();

  // Save current state to undo stack
  var current = _captureSnapshot();
  _undoStack.push(current);

  // Restore next state
  var next = _redoStack.pop();
  _restoreSnapshot(next);

  _lastPushGroup = null;
  _updateUndoRedoButtons();

  if (typeof showNotification === 'function') {
    showNotification('Redo', 'info');
  }
}

function canUndo() { return _undoStack.length > 0; }
function canRedo() { return _redoStack.length > 0; }

/**
 * Clear all undo/redo history.
 * Call after loading a file or resetting the app.
 */
function clearUndoHistory() {
  _undoStack = [];
  _redoStack = [];
  _lastPushGroup = null;
  _lastPushTime = 0;
  _updateUndoRedoButtons();
}

// ─── Internal helpers ────────────────────────────────────────────

function _exitSlotEditIfActive() {
  // If the user is editing a slot in design mode, discard and exit
  if (typeof _editingSlotIndex !== 'undefined' && _editingSlotIndex !== null &&
      typeof _mainDesignBackup !== 'undefined' && _mainDesignBackup) {
    // Restore main design without saving overrides
    currentDesign.templateId = _mainDesignBackup.templateId;
    currentDesign.backgroundColor = _mainDesignBackup.backgroundColor;
    currentDesign.templateDraw = _mainDesignBackup.templateDraw;
    currentDesign.gradient = _mainDesignBackup.gradient;
    currentDesign.textElements = _mainDesignBackup.textElements;
    currentDesign.imageElements = _mainDesignBackup.imageElements;
    currentDesign.libraryInfoText = _mainDesignBackup.libraryInfoText;
    currentDesign.libraryInfoColor = _mainDesignBackup.libraryInfoColor;

    _editingSlotIndex = null;
    _mainDesignBackup = null;
    if (typeof _editingGroup !== 'undefined') _editingGroup = null;
    if (typeof removeSlotEditBanner === 'function') removeSlotEditBanner();
  }
}

function _updateUndoRedoButtons() {
  var undoBtn = document.getElementById('btn-undo');
  var redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = _undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = _redoStack.length === 0;
}
