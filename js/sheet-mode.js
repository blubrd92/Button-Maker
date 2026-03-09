/**
 * sheet-mode.js
 *
 * Implements Sheet Mode: the visual grid view of all buttons on a sheet,
 * with per-button override editing, row/column selection, and reset.
 *
 * Responsibilities:
 * - Rendering the sheet grid (3x5 or 4x5 depending on layout)
 * - Click-to-select individual buttons, rows, or columns
 * - Multi-select with Ctrl/Cmd-click and Shift-click
 * - Applying property overrides to selected buttons
 * - Showing override badges on customized buttons
 * - Reset-to-master for individual buttons
 * - Providing slot data for save/load and PDF export
 *
 * Depends on:
 * - config.js (SHEET_LAYOUTS, BUTTON_SIZES)
 * - canvas.js (renderButtonDesign, currentDesign)
 * - templates.js (getTemplateById for override template restoration)
 *
 * Gotchas:
 * - Overrides use sparse objects: only properties that differ from master
 *   are stored. An empty overrides object means the slot matches master.
 * - When the master design changes in Design Mode, all non-overridden
 *   slots automatically pick up the change (they inherit from master).
 * - The sheet grid uses small canvases for each button thumbnail.
 *   These are re-rendered when the master or overrides change.
 */

// --- Sheet state ---

// Array of slot objects. Initialized/resized when entering sheet mode.
// Each slot: { slotIndex, row, col, overrides: {} }
let sheetSlots = [];

// Currently selected slot indices (supports multi-select)
let selectedSlots = [];

// User-editable name for this sheet (shown above grid, used as PDF filename)
let sheetName = '';

// --- Slot management ---

/**
 * Initialize sheet slots for the current layout.
 * Preserves existing overrides if the layout hasn't changed.
 */
function initSheetSlots() {
  const layout = getCurrentLayout();
  const totalSlots = layout.cols * layout.rows;

  // If slots already exist and match the layout, keep them
  if (sheetSlots.length === totalSlots) return;

  // Resize: preserve existing overrides for slots that still exist
  const newSlots = [];
  for (let i = 0; i < totalSlots; i++) {
    const row = Math.floor(i / layout.cols);
    const col = i % layout.cols;
    const existing = sheetSlots[i];
    newSlots.push({
      slotIndex: i,
      row: row,
      col: col,
      overrides: existing ? existing.overrides : {}
    });
  }
  sheetSlots = newSlots;
}

/**
 * Get overrides for a specific slot.
 */
function getSlotOverrides(slotIndex) {
  const slot = sheetSlots[slotIndex];
  return slot ? slot.overrides : {};
}

/**
 * Set overrides for a specific slot.
 */
function setSlotOverrides(slotIndex, overrides) {
  if (sheetSlots[slotIndex]) {
    sheetSlots[slotIndex].overrides = overrides;
  }
}

/**
 * Check if a slot has any overrides.
 */
function slotHasOverrides(slotIndex) {
  const slot = sheetSlots[slotIndex];
  return slot && Object.keys(slot.overrides).length > 0;
}

/**
 * Reset a slot to match the master (clear all overrides).
 */
function resetSlotToMaster(slotIndex) {
  if (sheetSlots[slotIndex]) {
    sheetSlots[slotIndex].overrides = {};
  }
}

/**
 * Get all sheet slots (for save/load).
 */
function getSheetSlots() {
  return sheetSlots.map(slot => ({
    slotIndex: slot.slotIndex,
    row: slot.row,
    col: slot.col,
    overrides: { ...slot.overrides }
  }));
}

/**
 * Set sheet slots from saved data (for load).
 */
function setSheetSlots(slots) {
  sheetSlots = slots.map(s => ({
    slotIndex: s.slotIndex,
    row: s.row,
    col: s.col,
    overrides: { ...s.overrides }
  }));
}

// --- Sheet view rendering ---

/**
 * Render the full sheet grid view.
 * The button grid is centered. Row/column headers sit outside the grid
 * and are purely for the UI (they don't appear on the PDF).
 */
function renderSheetView() {
  const container = document.getElementById('sheet-view');
  const layout = getCurrentLayout();
  initSheetSlots();

  container.innerHTML = '';

  // -- Sheet name input (centered above the grid) --
  const nameRow = document.createElement('div');
  nameRow.className = 'sheet-name-row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'sheet-name-input';
  nameInput.className = 'sheet-name-input';
  nameInput.placeholder = 'Sheet name (used as PDF filename)...';
  nameInput.value = sheetName;
  nameInput.addEventListener('input', function(e) { sheetName = e.target.value; });
  nameRow.appendChild(nameInput);
  container.appendChild(nameRow);

  // -- Wrapper: headers + button grid --
  const wrapper = document.createElement('div');
  wrapper.className = 'sheet-wrapper';

  // Thumbnail size: large enough to be useful
  const thumbSize = 120;
  const cellSize = thumbSize + 12; // cell includes border/padding

  // -- Column headers (A, B, C, ...) above the grid --
  const colHeaderRow = document.createElement('div');
  colHeaderRow.className = 'sheet-col-headers';
  // Spacer for row-header width
  const spacer = document.createElement('div');
  spacer.style.width = '36px';
  colHeaderRow.appendChild(spacer);
  for (let col = 0; col < layout.cols; col++) {
    const header = document.createElement('div');
    header.className = 'sheet-header';
    header.style.width = cellSize + 'px';
    header.textContent = String.fromCharCode(65 + col);
    header.dataset.col = col;
    header.addEventListener('click', function(e) { handleColumnHeaderClick(col, e); });
    colHeaderRow.appendChild(header);
  }
  wrapper.appendChild(colHeaderRow);

  // -- Main area: row headers (left) + button grid --
  const mainArea = document.createElement('div');
  mainArea.className = 'sheet-main-area';

  // Row headers column
  const rowHeaderCol = document.createElement('div');
  rowHeaderCol.className = 'sheet-row-headers';
  for (let row = 0; row < layout.rows; row++) {
    const header = document.createElement('div');
    header.className = 'sheet-header';
    header.style.height = cellSize + 'px';
    header.textContent = String(row + 1);
    header.dataset.row = row;
    header.addEventListener('click', function(e) { handleRowHeaderClick(row, e); });
    rowHeaderCol.appendChild(header);
  }

  // Button grid (only buttons, no headers)
  const grid = document.createElement('div');
  grid.className = 'sheet-grid';
  grid.style.gridTemplateColumns = 'repeat(' + layout.cols + ', ' + cellSize + 'px)';
  grid.style.gridTemplateRows = 'repeat(' + layout.rows + ', ' + cellSize + 'px)';

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      var slotIndex = row * layout.cols + col;
      var cell = document.createElement('div');
      cell.className = 'sheet-cell';
      cell.dataset.slotIndex = slotIndex;

      var thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = thumbSize;
      thumbCanvas.height = thumbSize;
      cell.appendChild(thumbCanvas);

      if (slotHasOverrides(slotIndex)) {
        var badge = document.createElement('div');
        badge.className = 'override-badge';
        badge.title = 'This button has custom overrides';
        cell.appendChild(badge);
      }

      (function(idx) {
        cell.addEventListener('click', function(e) { handleCellClick(idx, e); });
      })(slotIndex);

      grid.appendChild(cell);
      renderSheetThumbnail(thumbCanvas, slotIndex);
    }
  }

  mainArea.appendChild(rowHeaderCol);
  mainArea.appendChild(grid);
  wrapper.appendChild(mainArea);
  container.appendChild(wrapper);

  // -- Controls below the grid --
  var controlsDiv = document.createElement('div');
  controlsDiv.id = 'sheet-controls';
  controlsDiv.className = 'sheet-controls-bar';
  controlsDiv.innerHTML =
    '<button class="btn btn-small" id="btn-sheet-reset" style="display:none;">Reset Selected to Master</button>' +
    '<span id="sheet-selection-info" style="font-size:12px; color:#888;">Click a button to select it</span>';
  container.appendChild(controlsDiv);

  document.getElementById('btn-sheet-reset').addEventListener('click', function() {
    selectedSlots.forEach(function(idx) { resetSlotToMaster(idx); });
    renderSheetView();
    updateSheetSelectionUI();
  });

  updateSheetSelectionUI();
}

/**
 * Render a single button thumbnail for the sheet view.
 */
function renderSheetThumbnail(canvas, slotIndex) {
  var ctx = canvas.getContext('2d');
  var size = canvas.width;
  var cx = size / 2;
  var cy = size / 2;

  var btnSize = getCurrentButtonSize();
  var thumbScale = size / btnSize.cutDiameter;

  var design = cloneDesignForRender(currentDesign);
  var overrides = getSlotOverrides(slotIndex);
  if (Object.keys(overrides).length > 0) {
    applyOverridesToDesign(design, overrides);
  }

  renderButtonDesign(ctx, cx, cy, thumbScale, design, { showGuides: false });
}

// --- Selection handling ---

function handleCellClick(slotIndex, event) {
  if (event.ctrlKey || event.metaKey) {
    var idx = selectedSlots.indexOf(slotIndex);
    if (idx >= 0) {
      selectedSlots.splice(idx, 1);
    } else {
      selectedSlots.push(slotIndex);
    }
  } else {
    selectedSlots = [slotIndex];
  }
  updateSheetSelectionUI();
  updateSheetOverridePanel();
}

function handleColumnHeaderClick(col, event) {
  var layout = getCurrentLayout();
  var columnSlots = [];
  for (var row = 0; row < layout.rows; row++) {
    columnSlots.push(row * layout.cols + col);
  }
  if (event.shiftKey) {
    columnSlots.forEach(function(idx) {
      if (!selectedSlots.includes(idx)) selectedSlots.push(idx);
    });
  } else {
    selectedSlots = columnSlots;
  }
  updateSheetSelectionUI();
  updateSheetOverridePanel();
}

function handleRowHeaderClick(row, event) {
  var layout = getCurrentLayout();
  var rowSlots = [];
  for (var col = 0; col < layout.cols; col++) {
    rowSlots.push(row * layout.cols + col);
  }
  if (event.shiftKey) {
    rowSlots.forEach(function(idx) {
      if (!selectedSlots.includes(idx)) selectedSlots.push(idx);
    });
  } else {
    selectedSlots = rowSlots;
  }
  updateSheetSelectionUI();
  updateSheetOverridePanel();
}

function updateSheetSelectionUI() {
  document.querySelectorAll('.sheet-cell').forEach(function(cell) {
    var idx = parseInt(cell.dataset.slotIndex);
    cell.classList.toggle('selected', selectedSlots.includes(idx));
  });

  var layout = getCurrentLayout();
  document.querySelectorAll('.sheet-header[data-col]').forEach(function(header) {
    var col = parseInt(header.dataset.col);
    var colSlots = [];
    for (var row = 0; row < layout.rows; row++) {
      colSlots.push(row * layout.cols + col);
    }
    header.classList.toggle('selected', colSlots.every(function(idx) { return selectedSlots.includes(idx); }));
  });

  document.querySelectorAll('.sheet-header[data-row]').forEach(function(header) {
    var row = parseInt(header.dataset.row);
    var rowSlots = [];
    for (var col = 0; col < layout.cols; col++) {
      rowSlots.push(row * layout.cols + col);
    }
    header.classList.toggle('selected', rowSlots.every(function(idx) { return selectedSlots.includes(idx); }));
  });

  var info = document.getElementById('sheet-selection-info');
  var resetBtn = document.getElementById('btn-sheet-reset');
  if (info) {
    info.textContent = selectedSlots.length > 0
      ? selectedSlots.length + ' button(s) selected'
      : 'Click a button to select it';
  }
  if (resetBtn) {
    var hasOverrides = selectedSlots.some(function(idx) { return slotHasOverrides(idx); });
    resetBtn.style.display = hasOverrides ? '' : 'none';
  }
}

function updateSheetOverridePanel() {
  if (selectedSlots.length === 1) {
    var slotIndex = selectedSlots[0];
    var overrides = getSlotOverrides(slotIndex);
    var bgColor = overrides.backgroundColor || currentDesign.backgroundColor;
    document.getElementById('bg-color-picker').value = bgColor;
    updateBackgroundSwatches(bgColor);
    var libText = overrides.libraryInfoText !== undefined
      ? overrides.libraryInfoText : currentDesign.libraryInfoText;
    var libColor = overrides.libraryInfoColor !== undefined
      ? overrides.libraryInfoColor : currentDesign.libraryInfoColor;
    document.getElementById('library-info-input').value = libText;
    document.getElementById('library-info-color').value = libColor;
  }
}

function applyOverrideToSelectedSlots(property, value) {
  selectedSlots.forEach(function(slotIndex) {
    var slot = sheetSlots[slotIndex];
    if (slot) {
      slot.overrides[property] = value;
    }
  });
  refreshSheetThumbnails();
}

function refreshSheetThumbnails() {
  document.querySelectorAll('.sheet-cell').forEach(function(cell) {
    var slotIndex = parseInt(cell.dataset.slotIndex);
    var canvas = cell.querySelector('canvas');
    if (canvas) {
      renderSheetThumbnail(canvas, slotIndex);
    }
    var existingBadge = cell.querySelector('.override-badge');
    if (slotHasOverrides(slotIndex)) {
      if (!existingBadge) {
        var badge = document.createElement('div');
        badge.className = 'override-badge';
        badge.title = 'This button has custom overrides';
        cell.appendChild(badge);
      }
    } else {
      if (existingBadge) existingBadge.remove();
    }
  });
}

// --- Mode switching ---

function enterSheetMode() {
  document.getElementById('design-canvas-wrapper').classList.add('hidden');
  document.getElementById('sheet-view').classList.remove('hidden');
  renderSheetView();
}

function exitSheetMode() {
  document.getElementById('sheet-view').classList.add('hidden');
  document.getElementById('design-canvas-wrapper').classList.remove('hidden');
  selectedSlots = [];
  renderDesignCanvas();
}

function initSheetMode() {
  document.getElementById('btn-design-mode').addEventListener('click', function() {
    document.getElementById('btn-design-mode').classList.add('active');
    document.getElementById('btn-sheet-mode').classList.remove('active');
    exitSheetMode();
  });
  document.getElementById('btn-sheet-mode').addEventListener('click', function() {
    document.getElementById('btn-sheet-mode').classList.add('active');
    document.getElementById('btn-design-mode').classList.remove('active');
    enterSheetMode();
  });
}
