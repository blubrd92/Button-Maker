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
        cell.addEventListener('dblclick', function(e) {
          e.stopPropagation();
          editSlotInDesignMode(idx);
        });
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
    '<span id="sheet-selection-info" style="font-size:12px; color:#888;">Click to select \u00b7 Double-click to edit</span>';
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
      ? selectedSlots.length + ' button(s) selected \u00b7 Double-click to edit'
      : 'Click to select \u00b7 Double-click to edit';
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

// --- Per-button editing in design view ---

// When editing a specific slot, store the original master design so we can
// compute what changed when returning to sheet mode.
var _editingSlotIndex = null;
var _masterDesignBackup = null;

/**
 * Switch to design mode to edit a specific button slot.
 * Loads the slot's merged design (master + overrides) into the design canvas.
 * A "Back to Sheet" banner appears so the user can return and save changes.
 */
function editSlotInDesignMode(slotIndex) {
  _editingSlotIndex = slotIndex;

  // Back up the master design
  _masterDesignBackup = {
    templateId: currentDesign.templateId,
    backgroundColor: currentDesign.backgroundColor,
    templateDraw: currentDesign.templateDraw,
    gradient: currentDesign.gradient ? JSON.parse(JSON.stringify(currentDesign.gradient)) : null,
    textElements: currentDesign.textElements.map(function(t) { return Object.assign({}, t); }),
    imageElements: currentDesign.imageElements.map(function(img) { return Object.assign({}, img); }),
    libraryInfoText: currentDesign.libraryInfoText,
    libraryInfoColor: currentDesign.libraryInfoColor
  };

  // Merge master + overrides into currentDesign
  var overrides = getSlotOverrides(slotIndex);
  if (overrides.backgroundColor !== undefined) {
    currentDesign.backgroundColor = overrides.backgroundColor;
    currentDesign.templateDraw = null;
    currentDesign.templateId = null;
  }
  if (overrides.gradient !== undefined) {
    currentDesign.gradient = overrides.gradient;
    if (overrides.gradient && typeof buildGradientDrawFunction === 'function') {
      currentDesign.templateDraw = buildGradientDrawFunction(overrides.gradient);
    }
  }
  if (overrides.libraryInfoText !== undefined) {
    currentDesign.libraryInfoText = overrides.libraryInfoText;
  }
  if (overrides.libraryInfoColor !== undefined) {
    currentDesign.libraryInfoColor = overrides.libraryInfoColor;
  }
  if (overrides.imageElements !== undefined) {
    currentDesign.imageElements = overrides.imageElements.map(function(img) {
      var el = Object.assign({}, img);
      if (!el.imgObj && el.dataUrl) {
        el.imgObj = getOrCreateCachedImage(el.dataUrl);
      }
      return el;
    });
  }

  // Switch to design mode visually
  currentMode = 'design';
  document.getElementById('btn-design-mode').classList.add('active');
  document.getElementById('btn-sheet-mode').classList.remove('active');
  document.getElementById('design-canvas-wrapper').classList.remove('hidden');
  document.getElementById('sheet-view').classList.add('hidden');

  // Sync sidebar controls
  document.getElementById('bg-color-picker').value = currentDesign.backgroundColor;
  updateBackgroundSwatches(currentDesign.backgroundColor);
  document.getElementById('library-info-input').value = currentDesign.libraryInfoText;
  document.getElementById('library-info-color').value = currentDesign.libraryInfoColor;

  // Sync gradient UI
  var grad = currentDesign.gradient;
  document.getElementById('toggle-gradient').checked = !!grad;
  document.getElementById('gradient-controls').classList.toggle('hidden', !grad);
  if (grad) {
    document.getElementById('bg-gradient-color2').value = grad.color2 || '#4A90D9';
    document.getElementById('gradient-direction').value = grad.direction || 'top-bottom';
    if (grad.preset) {
      document.querySelectorAll('.gradient-preset-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.preset === grad.preset);
      });
    }
  }

  // Show image controls if there's an image
  if (currentDesign.imageElements.length > 0) {
    selectedElement = { type: 'image', index: 0 };
    showImageControls(0);
  }

  // Show the "editing slot" banner
  showSlotEditBanner(slotIndex);

  renderDesignCanvas();
}

/**
 * Show a banner indicating which button is being edited,
 * with a "Done — Back to Sheet" button.
 */
function showSlotEditBanner(slotIndex) {
  removeSlotEditBanner();
  var layout = getCurrentLayout();
  var row = Math.floor(slotIndex / layout.cols);
  var col = slotIndex % layout.cols;
  var label = String.fromCharCode(65 + col) + (row + 1);

  var banner = document.createElement('div');
  banner.id = 'slot-edit-banner';
  banner.innerHTML =
    '<span>Editing button <strong>' + label + '</strong></span>' +
    '<button class="btn btn-small btn-primary" id="btn-done-slot-edit">Done — Back to Sheet</button>';

  var canvasWrapper = document.getElementById('design-canvas-wrapper');
  canvasWrapper.insertBefore(banner, canvasWrapper.firstChild);

  document.getElementById('btn-done-slot-edit').addEventListener('click', finishSlotEdit);
}

function removeSlotEditBanner() {
  var existing = document.getElementById('slot-edit-banner');
  if (existing) existing.remove();
}

/**
 * Finish editing a slot: compute what changed vs the master backup,
 * store as overrides, restore master, and return to sheet mode.
 */
function finishSlotEdit() {
  if (_editingSlotIndex === null || !_masterDesignBackup) {
    removeSlotEditBanner();
    return;
  }

  var slotIndex = _editingSlotIndex;
  var overrides = {};

  // Compare current state to the backed-up master
  if (currentDesign.backgroundColor !== _masterDesignBackup.backgroundColor) {
    overrides.backgroundColor = currentDesign.backgroundColor;
  }
  if (currentDesign.libraryInfoText !== _masterDesignBackup.libraryInfoText) {
    overrides.libraryInfoText = currentDesign.libraryInfoText;
  }
  if (currentDesign.libraryInfoColor !== _masterDesignBackup.libraryInfoColor) {
    overrides.libraryInfoColor = currentDesign.libraryInfoColor;
  }

  // Gradient
  var masterGradJson = _masterDesignBackup.gradient ? JSON.stringify(_masterDesignBackup.gradient) : null;
  var currentGradJson = currentDesign.gradient ? JSON.stringify(currentDesign.gradient) : null;
  if (masterGradJson !== currentGradJson) {
    overrides.gradient = currentDesign.gradient ? JSON.parse(currentGradJson) : null;
  }

  // Image elements — compare by dataUrl, position, scale
  var masterImgs = _masterDesignBackup.imageElements;
  var currentImgs = currentDesign.imageElements;
  var imagesChanged = (masterImgs.length !== currentImgs.length);
  if (!imagesChanged) {
    for (var i = 0; i < currentImgs.length; i++) {
      if (currentImgs[i].dataUrl !== masterImgs[i].dataUrl ||
          currentImgs[i].x !== masterImgs[i].x ||
          currentImgs[i].y !== masterImgs[i].y ||
          currentImgs[i].imageScale !== masterImgs[i].imageScale) {
        imagesChanged = true;
        break;
      }
    }
  }
  if (imagesChanged) {
    overrides.imageElements = currentImgs.map(function(img) {
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
    });
  }

  // Save overrides for this slot
  setSlotOverrides(slotIndex, overrides);

  // Restore the master design
  currentDesign.templateId = _masterDesignBackup.templateId;
  currentDesign.backgroundColor = _masterDesignBackup.backgroundColor;
  currentDesign.templateDraw = _masterDesignBackup.templateDraw;
  currentDesign.gradient = _masterDesignBackup.gradient;
  currentDesign.textElements = _masterDesignBackup.textElements;
  currentDesign.imageElements = _masterDesignBackup.imageElements;
  currentDesign.libraryInfoText = _masterDesignBackup.libraryInfoText;
  currentDesign.libraryInfoColor = _masterDesignBackup.libraryInfoColor;

  // Reset sidebar to master values
  document.getElementById('bg-color-picker').value = currentDesign.backgroundColor;
  updateBackgroundSwatches(currentDesign.backgroundColor);
  document.getElementById('library-info-input').value = currentDesign.libraryInfoText;
  document.getElementById('library-info-color').value = currentDesign.libraryInfoColor;
  var grad = currentDesign.gradient;
  document.getElementById('toggle-gradient').checked = !!grad;
  document.getElementById('gradient-controls').classList.toggle('hidden', !grad);

  // Clean up
  _editingSlotIndex = null;
  _masterDesignBackup = null;
  selectedElement = null;
  hideImageControls();
  removeSlotEditBanner();

  // Switch back to sheet mode
  selectedSlots = [slotIndex];
  currentMode = 'sheet';
  document.getElementById('btn-sheet-mode').classList.add('active');
  document.getElementById('btn-design-mode').classList.remove('active');
  document.getElementById('design-canvas-wrapper').classList.add('hidden');
  document.getElementById('sheet-view').classList.remove('hidden');
  renderSheetView();
}

function initSheetMode() {
  document.getElementById('btn-design-mode').addEventListener('click', function() {
    // If editing a slot, finish and save overrides first
    if (_editingSlotIndex !== null) {
      finishSlotEdit();
      // finishSlotEdit switches to sheet mode, but user wants design mode
      currentMode = 'design';
      document.getElementById('btn-design-mode').classList.add('active');
      document.getElementById('btn-sheet-mode').classList.remove('active');
      document.getElementById('design-canvas-wrapper').classList.remove('hidden');
      document.getElementById('sheet-view').classList.add('hidden');
      renderDesignCanvas();
      return;
    }
    document.getElementById('btn-design-mode').classList.add('active');
    document.getElementById('btn-sheet-mode').classList.remove('active');
    exitSheetMode();
  });
  document.getElementById('btn-sheet-mode').addEventListener('click', function() {
    // If editing a slot, finish and save overrides first
    if (_editingSlotIndex !== null) {
      finishSlotEdit();
      return; // finishSlotEdit already switches to sheet mode
    }
    document.getElementById('btn-sheet-mode').classList.add('active');
    document.getElementById('btn-design-mode').classList.remove('active');
    enterSheetMode();
  });
}
