/**
 * undo.js
 *
 * Undo/redo history for Button Maker.
 *
 * Approach:
 *   - Snapshots capture serialized master design + slot overrides + sheet name + button size
 *   - currentDesign is ALWAYS the main design (never swapped during slot editing)
 *   - During slot editing, _slotEditDesign holds the in-progress merged design;
 *     snapshots diff it against currentDesign to compute the editing slot's overrides
 *   - Image assets stay in the global registry (additive, never cleared by undo)
 *   - Restore rebuilds runtime objects (templateDraw, gradient draw, imgObj)
 *   - Coalescing prevents rapid-fire snapshots from the same control
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
  // currentDesign is always the main design — serialize it directly
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
    var o;
    if (_slotEditDesign && slot.slotIndex === _editingSlotIndex) {
      // Compute overrides from in-progress edits vs main design
      o = _computeOverrides(currentDesign, _slotEditDesign);
    } else {
      o = _serializeOverrides(slot.overrides);
    }
    slots.push({ slotIndex: slot.slotIndex, row: slot.row, col: slot.col, overrides: o });
  }

  var name = (typeof sheetName !== 'undefined') ? sheetName : '';

  return JSON.stringify({ master: master, slots: slots, sheetName: name, buttonSize: CONFIG.currentButtonSize });
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

    // --- Restore button size ---
    var restoredSize = snap.buttonSize || '1.5';
    var sizeChanged = (restoredSize !== CONFIG.currentButtonSize);
    if (sizeChanged) {
      CONFIG.currentButtonSize = restoredSize;
      var sizeSelect = document.getElementById('button-size-select');
      if (sizeSelect) sizeSelect.value = restoredSize;
      if (typeof recalculateImageBaseDimensions === 'function') recalculateImageBaseDimensions();
      if (typeof recalculateOverrideImageBaseDimensions === 'function') recalculateOverrideImageBaseDimensions();
    }

    // --- Deselect and sync UI ---
    selectedElement = null;
    if (typeof hideImageControls === 'function') hideImageControls();
    if (typeof hideTextControls === 'function') hideTextControls();
    if (typeof syncSidebarToDesign === 'function') syncSidebarToDesign(currentDesign);

    // --- Re-render ---
    if (typeof renderDesignCanvas === 'function') renderDesignCanvas();
    if (typeof currentMode !== 'undefined' && currentMode === 'sheet') {
      if (sizeChanged) {
        if (typeof computeFitToScreenZoom === 'function') sheetZoom = computeFitToScreenZoom();
        if (typeof renderSheetView === 'function') renderSheetView();
        if (typeof applyZoom === 'function') applyZoom();
      } else {
        if (typeof refreshSheetThumbnails === 'function') refreshSheetThumbnails();
      }
      if (typeof updateSheetSelectionUI === 'function') updateSheetSelectionUI();
    }

    // Clamp selectedSlots to valid range for restored layout
    if (sizeChanged) {
      var newLayout = getCurrentLayout();
      var maxSlots = newLayout.cols * newLayout.rows;
      selectedSlots = selectedSlots.filter(function(idx) { return idx < maxSlots; });
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

  // Flag for periodic autosave
  if (typeof window._markAutosaveDirty === 'function') window._markAutosaveDirty();
}

/**
 * Undo the most recent change.
 */
function undo() {
  if (_undoStack.length === 0) return;

  // Save slot editing context so we can re-enter after restore
  var slotCtx = _saveSlotEditContext();

  // Save current state to redo stack
  var current = _captureSnapshot();
  _redoStack.push(current);

  // Clear slot edit state before restoring so _restoreSnapshot writes
  // to currentDesign cleanly (no stale _slotEditDesign interfering)
  _clearSlotEditState();

  // Restore previous state
  var previous = _undoStack.pop();
  _restoreSnapshot(previous);

  // Re-enter slot editing if we were in it
  _resumeSlotEditContext(slotCtx);

  _lastPushGroup = null;
  _updateUndoRedoButtons();
}

/**
 * Redo the most recently undone change.
 */
function redo() {
  if (_redoStack.length === 0) return;

  // Save slot editing context
  var slotCtx = _saveSlotEditContext();

  // Save current state to undo stack
  var current = _captureSnapshot();
  _undoStack.push(current);

  // Clear slot edit state before restoring
  _clearSlotEditState();

  // Restore next state
  var next = _redoStack.pop();
  _restoreSnapshot(next);

  // Re-enter slot editing if we were in it
  _resumeSlotEditContext(slotCtx);

  _lastPushGroup = null;
  _updateUndoRedoButtons();
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

/**
 * Save the current slot/group editing context so we can re-enter after undo/redo.
 * Returns null if not in slot editing mode.
 */
function _saveSlotEditContext() {
  if (typeof _editingSlotIndex === 'undefined' || _editingSlotIndex === null) return null;
  return {
    slotIndex: _editingSlotIndex,
    group: (typeof _editingGroup !== 'undefined' && _editingGroup)
      ? JSON.parse(JSON.stringify(_editingGroup)) : null
  };
}

/**
 * Clear slot edit state without saving overrides.
 * Called before _restoreSnapshot so the restore writes to a clean state.
 */
function _clearSlotEditState() {
  _slotEditDesign = null;
  _editingSlotIndex = null;
  if (typeof _editingGroup !== 'undefined') _editingGroup = null;
  if (typeof removeSlotEditBanner === 'function') removeSlotEditBanner();
  var sizeSelect = document.getElementById('button-size-select');
  if (sizeSelect) sizeSelect.disabled = false;
}

/**
 * Re-enter slot/group editing after undo/redo restored the snapshot.
 * The restored snapshot has the correct main design and slot overrides,
 * so editSlotInDesignMode will rebuild _slotEditDesign properly.
 */
function _resumeSlotEditContext(ctx) {
  if (!ctx) return;
  // Restore group state before entering slot edit
  if (ctx.group && typeof _editingGroup !== 'undefined') {
    _editingGroup = ctx.group;
  }
  if (typeof editSlotInDesignMode === 'function') {
    editSlotInDesignMode(ctx.slotIndex);
  }
}

function _updateUndoRedoButtons() {
  var undoBtn = document.getElementById('btn-undo');
  var redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = _undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = _redoStack.length === 0;
}
