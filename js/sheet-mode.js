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
 * The sheet visually represents a US Letter page (8.5 × 11 aspect ratio)
 * with the button grid centered within the printable area using page margins
 * and computed gutters. Row/column headers sit outside the page for UI only.
 */
function renderSheetView() {
  var container = document.getElementById('sheet-view');
  var layout = getCurrentLayout();
  var btnSize = getCurrentButtonSize();
  var gutters = computeSheetGutters(CONFIG.currentLayout);
  initSheetSlots();

  container.innerHTML = '';

  // -- Sheet name input (centered above the page) --
  var nameRow = document.createElement('div');
  nameRow.className = 'sheet-name-row';
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'sheet-name-input';
  nameInput.className = 'sheet-name-input';
  nameInput.placeholder = 'Sheet name (used as PDF filename)...';
  nameInput.value = sheetName;
  nameInput.addEventListener('input', function(e) { sheetName = e.target.value; });
  nameRow.appendChild(nameInput);
  container.appendChild(nameRow);

  // -- Compute pixel scaling for the page representation --
  // Target page height in CSS pixels (fit nicely in viewport)
  var pageDisplayHeight = 680;
  var pageScale = pageDisplayHeight / CONFIG.PAGE.height; // px per inch
  var pageDisplayWidth = CONFIG.PAGE.width * pageScale;

  // Button thumbnail size in CSS px (based on cutDiameter scaled to page)
  var thumbSize = Math.round(btnSize.cutDiameter * pageScale);
  var colGutterPx = Math.round(gutters.columnGutter * pageScale);
  var rowGutterPx = Math.round(gutters.rowGutter * pageScale);
  var marginPx = Math.round(CONFIG.PAGE.margin * pageScale);

  // -- Outer wrapper with headers --
  var outerWrapper = document.createElement('div');
  outerWrapper.className = 'sheet-outer-wrapper';

  // -- Column headers above the page (aligned with button centers) --
  var colHeaderRow = document.createElement('div');
  colHeaderRow.className = 'sheet-col-headers';
  // Offset for row-header width + page margin
  colHeaderRow.style.paddingLeft = (36 + marginPx) + 'px';
  for (var col = 0; col < layout.cols; col++) {
    var header = document.createElement('div');
    header.className = 'sheet-header';
    header.style.width = thumbSize + 'px';
    if (col > 0) header.style.marginLeft = colGutterPx + 'px';
    header.textContent = String.fromCharCode(65 + col);
    header.dataset.col = col;
    header.addEventListener('click', (function(c) {
      return function(e) { handleColumnHeaderClick(c, e); };
    })(col));
    colHeaderRow.appendChild(header);
  }
  outerWrapper.appendChild(colHeaderRow);

  // -- Main area: row headers (left) + page --
  var mainArea = document.createElement('div');
  mainArea.className = 'sheet-main-area';

  // Row headers column (positioned to align with button rows on the page)
  var rowHeaderCol = document.createElement('div');
  rowHeaderCol.className = 'sheet-row-headers';
  rowHeaderCol.style.paddingTop = marginPx + 'px';
  for (var row = 0; row < layout.rows; row++) {
    var rowHeader = document.createElement('div');
    rowHeader.className = 'sheet-header';
    rowHeader.style.height = thumbSize + 'px';
    if (row > 0) rowHeader.style.marginTop = rowGutterPx + 'px';
    rowHeader.textContent = String(row + 1);
    rowHeader.dataset.row = row;
    rowHeader.addEventListener('click', (function(r) {
      return function(e) { handleRowHeaderClick(r, e); };
    })(row));
    rowHeaderCol.appendChild(rowHeader);
  }

  // -- Page div (US Letter aspect, white background) --
  var page = document.createElement('div');
  page.className = 'sheet-page';
  page.style.width = pageDisplayWidth + 'px';
  page.style.height = pageDisplayHeight + 'px';

  // Button grid positioned inside the page with margins
  var grid = document.createElement('div');
  grid.className = 'sheet-grid';
  grid.style.position = 'absolute';
  grid.style.top = marginPx + 'px';
  grid.style.left = marginPx + 'px';
  grid.style.gridTemplateColumns = 'repeat(' + layout.cols + ', ' + thumbSize + 'px)';
  grid.style.gridTemplateRows = 'repeat(' + layout.rows + ', ' + thumbSize + 'px)';
  grid.style.columnGap = colGutterPx + 'px';
  grid.style.rowGap = rowGutterPx + 'px';

  for (var r = 0; r < layout.rows; r++) {
    for (var c = 0; c < layout.cols; c++) {
      var slotIndex = r * layout.cols + c;
      var cell = document.createElement('div');
      cell.className = 'sheet-cell';
      cell.dataset.slotIndex = slotIndex;

      var thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = thumbSize * 2; // render at 2x for crisp display
      thumbCanvas.height = thumbSize * 2;
      thumbCanvas.style.width = thumbSize + 'px';
      thumbCanvas.style.height = thumbSize + 'px';
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

  page.appendChild(grid);
  mainArea.appendChild(rowHeaderCol);
  mainArea.appendChild(page);
  outerWrapper.appendChild(mainArea);
  container.appendChild(outerWrapper);

  // -- Controls below the page --
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
  var size = canvas.width; // may be 2x the CSS display size
  var cx = size / 2;
  var cy = size / 2;

  ctx.clearRect(0, 0, size, size);
  var btnSize = getCurrentButtonSize();
  var thumbScale = size / btnSize.cutDiameter;

  var design = cloneDesignForRender(currentDesign);
  var overrides = getSlotOverrides(slotIndex);
  if (Object.keys(overrides).length > 0) {
    applyOverridesToDesign(design, overrides);
  }

  renderButtonDesign(ctx, cx, cy, thumbScale, design, { showGuides: false });

  // Draw a thin black outline so light-colored buttons are visible
  var cutRadius = (btnSize.cutDiameter / 2) * thumbScale;
  ctx.beginPath();
  ctx.arc(cx, cy, cutRadius - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
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
