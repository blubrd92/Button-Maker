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
 * - Reset-to-main for individual buttons
 * - Providing slot data for save/load and PDF export
 *
 * Depends on:
 * - config.js (SHEET_LAYOUTS, BUTTON_SIZES)
 * - canvas.js (renderButtonDesign, currentDesign)
 * - templates.js (getTemplateById for override template restoration)
 *
 * Gotchas:
 * - Overrides use sparse objects: only properties that differ from main
 * are stored. An empty overrides object means the slot matches main.
 * - When the main design changes in Design Mode, all non-overridden
 * slots automatically pick up the change (they inherit from main).
 * - The sheet grid uses small canvases for each button thumbnail.
 * These are re-rendered when the main or overrides change.
 */

// --- Sheet state ---

// Array of slot objects. Initialized/resized when entering sheet mode.
// Each slot: { slotIndex, row, col, overrides: {} }
let sheetSlots = [];

// Currently selected slot indices (supports multi-select)
let selectedSlots = [];

// User-editable name for this sheet (shown above grid, used as PDF filename)
let sheetName = '';

// Clipboard for copying a button's full design (main + overrides merged)
let _copiedDesign = null;

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
 * Reset a slot to match the main design (clear all overrides).
 */
function resetSlotToMain(slotIndex) {
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
 * The sheet visually represents a US Letter page (8.5 x 11 aspect ratio)
 * with the button grid centered within the printable area using page margins
 * and computed gutters. Row/column headers sit outside the page for UI only.
 */
function renderSheetView() {
  var container = document.getElementById('sheet-view');
  var layout = getCurrentLayout();
  var btnSize = getCurrentButtonSize();
  var gutters = computeSheetGutters();
  initSheetSlots();

  container.innerHTML = '';

  // -- Sheet name input (centered above the page) --
  var nameRow = document.createElement('div');
  nameRow.className = 'sheet-name-row';

  var nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'sheet-name-input';
  nameLabel.textContent = 'Sheet Name:';
  nameRow.appendChild(nameLabel);

  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'sheet-name-input';
  nameInput.className = 'list-name-input';
  nameInput.placeholder = 'Untitled Sheet';
  nameInput.value = sheetName;
  nameInput.addEventListener('input', function(e) { sheetName = e.target.value; });
  
  nameRow.appendChild(nameInput);

  var hintSpan = document.createElement('span');
  hintSpan.id = 'sheet-selection-info';
  hintSpan.className = 'sheet-selection-hint';
  hintSpan.textContent = 'Click to select \u00b7 Ctrl/Cmd-click for multiple \u00b7 Double-click to edit';
  nameRow.appendChild(hintSpan);

  // nameRow will be inserted into outerWrapper (below) so it shares the page width

  // -- Controls (below sheet name, above the grid) --
  var controlsDiv = document.createElement('div');
  controlsDiv.id = 'sheet-controls';
  controlsDiv.className = 'sheet-controls-bar';

  controlsDiv.innerHTML =
    '<button class="btn btn-small" id="btn-sheet-reset" style="display:none;">Reset to Main</button>' +
    '<button class="btn btn-small" id="btn-apply-col" style="display:none;">Apply to Col</button>' +
    '<button class="btn btn-small" id="btn-apply-row" style="display:none;">Apply to Row</button>' +
    '<button class="btn btn-small" id="btn-make-main" style="display:none;">Make Main Design</button>' +
    '<button class="btn btn-small" id="btn-edit-selected" style="display:none;">Edit</button>' +
    '<button class="btn btn-small" id="btn-copy-design" style="display:none;">Copy</button>' +
    '<button class="btn btn-small" id="btn-paste-design" style="display:none;">Paste</button>' +
    '<button class="btn btn-small" id="btn-clear-selection" style="display:none;">Clear Selection</button>';

  // Wire up the new controls (use querySelector on controlsDiv since it's not in the DOM yet)
  controlsDiv.querySelector('#btn-sheet-reset').addEventListener('click', function() {
    selectedSlots.forEach(function(idx) { resetSlotToMain(idx); });
    renderSheetView();
    updateSheetSelectionUI();
  });

  controlsDiv.querySelector('#btn-apply-col').addEventListener('click', function() {
    if (selectedSlots.length !== 1) return;
    var sourceIdx = selectedSlots[0];
    var sourceSlot = sheetSlots[sourceIdx];
    var layout = getCurrentLayout();
    var overrides = getSlotOverrides(sourceIdx);

    for (var r = 0; r < layout.rows; r++) {
      var targetIdx = r * layout.cols + sourceSlot.col;
      // Deep copy to prevent reference issues
      setSlotOverrides(targetIdx, JSON.parse(JSON.stringify(overrides))); 
    }
    refreshSheetThumbnails();
    updateSheetSelectionUI();
  });

  controlsDiv.querySelector('#btn-apply-row').addEventListener('click', function() {
    if (selectedSlots.length !== 1) return;
    var sourceIdx = selectedSlots[0];
    var sourceSlot = sheetSlots[sourceIdx];
    var layout = getCurrentLayout();
    var overrides = getSlotOverrides(sourceIdx);

    for (var c = 0; c < layout.cols; c++) {
      var targetIdx = sourceSlot.row * layout.cols + c;
      // Deep copy to prevent reference issues
      setSlotOverrides(targetIdx, JSON.parse(JSON.stringify(overrides))); 
    }
    refreshSheetThumbnails();
    updateSheetSelectionUI();
  });

  controlsDiv.querySelector('#btn-make-main').addEventListener('click', function() {
    if (selectedSlots.length !== 1) return;
    var sourceIdx = selectedSlots[0];
    var overrides = getSlotOverrides(sourceIdx);

    if (Object.keys(overrides).length === 0) return;

    if (overrides.backgroundColor !== undefined) {
      currentDesign.backgroundColor = overrides.backgroundColor;
      currentDesign.templateDraw = null;
      currentDesign.templateId = null;
    }
    
    if (overrides.gradient !== undefined) {
      currentDesign.gradient = overrides.gradient;
      if (overrides.gradient && typeof buildGradientDrawFunction === 'function') {
        currentDesign.templateDraw = buildGradientDrawFunction(overrides.gradient);
      } else {
        currentDesign.templateDraw = null;
      }
    }
    
    if (overrides.templateId !== undefined) {
      currentDesign.templateId = overrides.templateId;
      if (typeof getTemplateById === 'function') {
        var t = getTemplateById(overrides.templateId);
        currentDesign.templateDraw = t ? t.draw : null;
      }
    }
    
    if (overrides.libraryInfoText !== undefined) {
      currentDesign.libraryInfoText = overrides.libraryInfoText;
    }
    
    if (overrides.libraryInfoColor !== undefined) {
      currentDesign.libraryInfoColor = overrides.libraryInfoColor;
    }
    
    if (overrides.textElements !== undefined) {
      currentDesign.textElements = JSON.parse(JSON.stringify(overrides.textElements));
    }
    
    if (overrides.imageElements !== undefined) {
      currentDesign.imageElements = [];
      overrides.imageElements.forEach(function(imgData) {
        var img = new Image();
        var element = Object.assign({}, imgData, { imgObj: img });
        currentDesign.imageElements.push(element);
        img.onload = function() {
          refreshSheetThumbnails();
        };
        img.src = imgData.dataUrl;
      });
    }

    setSlotOverrides(sourceIdx, {});
    refreshSheetThumbnails();
    updateSheetSelectionUI();
    updateSheetOverridePanel();

    document.getElementById('bg-color-picker').value = currentDesign.backgroundColor;
    if (typeof updateBackgroundSwatches === 'function') updateBackgroundSwatches(currentDesign.backgroundColor);
    document.getElementById('library-info-input').value = currentDesign.libraryInfoText;
    document.getElementById('library-info-color').value = currentDesign.libraryInfoColor;
    
    var grad = currentDesign.gradient;
    var gradToggle = document.getElementById('toggle-gradient');
    if (gradToggle) gradToggle.checked = !!grad;
    
    var gradControls = document.getElementById('gradient-controls');
    if (gradControls) gradControls.classList.toggle('hidden', !grad);
    
    if (grad) {
      var color2Input = document.getElementById('bg-gradient-color2');
      if (color2Input) color2Input.value = grad.color2 || '#4A90D9';
      
      var dirInput = document.getElementById('gradient-direction');
      if (dirInput) dirInput.value = grad.direction || 'top-bottom';
    }
  });

  controlsDiv.querySelector('#btn-edit-selected').addEventListener('click', function() {
    if (selectedSlots.length === 0) return;
    if (selectedSlots.length === 1) {
      editSlotInDesignMode(selectedSlots[0]);
    } else {
      _editingGroup = { type: 'selection', index: null, slots: selectedSlots.slice() };
      editSlotInDesignMode(selectedSlots[0]);
    }
  });

  controlsDiv.querySelector('#btn-copy-design').addEventListener('click', function() {
    if (selectedSlots.length !== 1) return;
    var overrides = getSlotOverrides(selectedSlots[0]);
    // Store a deep copy of the overrides
    _copiedDesign = JSON.parse(JSON.stringify(overrides));
    updateSheetSelectionUI();
  });

  controlsDiv.querySelector('#btn-paste-design').addEventListener('click', function() {
    if (!_copiedDesign || selectedSlots.length === 0) return;
    selectedSlots.forEach(function(idx) {
      // Merge copied overrides onto each target slot
      var existing = getSlotOverrides(idx);
      var merged = Object.assign({}, existing, JSON.parse(JSON.stringify(_copiedDesign)));
      setSlotOverrides(idx, merged);
    });
    _copiedDesign = null; // Clear clipboard after paste
    refreshSheetThumbnails();
    updateSheetSelectionUI();
  });

  controlsDiv.querySelector('#btn-clear-selection').addEventListener('click', function() {
    selectedSlots = [];
    updateSheetSelectionUI();
    updateSheetOverridePanel();
  });


  // -- Compute pixel scaling for the page representation --
  // Use 96 CSS px per inch so the preview matches actual US Letter paper size
  var pageScale = 96; // 1 CSS inch = 96px (standard)
  var pageDisplayHeight = CONFIG.PAGE.height * pageScale;
  var pageDisplayWidth = CONFIG.PAGE.width * pageScale;

  // Button thumbnail size in CSS px (based on cutDiameter scaled to page)
  var thumbSize = Math.round(btnSize.cutDiameter * pageScale);
  var colGutterPx = Math.round(gutters.columnGutter * pageScale);
  var rowGutterPx = Math.round(gutters.rowGutter * pageScale);
  var marginPx = Math.round(CONFIG.PAGE.margin * pageScale);
  var colInsetPx = Math.round((gutters.columnInset || 0) * pageScale);

  // -- Outer wrapper with headers --
  var outerWrapper = document.createElement('div');
  outerWrapper.className = 'sheet-outer-wrapper';
  
  // Listen for clicks on the void to clear selection
  outerWrapper.addEventListener('click', function(e) {
    var isVoid = e.target.classList.contains('sheet-outer-wrapper') || 
                 e.target.classList.contains('sheet-main-area') || 
                 e.target.classList.contains('sheet-page') || 
                 e.target.classList.contains('sheet-grid');
    if (isVoid && selectedSlots.length > 0) {
      selectedSlots = [];
      updateSheetSelectionUI();
      updateSheetOverridePanel();
    }
  });

  // Name row & controls bar inside the wrapper so they share the page width
  nameRow.style.paddingLeft = '36px'; // offset for row-header column width
  outerWrapper.appendChild(nameRow);
  outerWrapper.appendChild(controlsDiv);

  // -- Column headers above the page (aligned with button centers) --
  var colHeaderRow = document.createElement('div');
  colHeaderRow.className = 'sheet-col-headers';
  // Offset for row-header width + page margin
  colHeaderRow.style.paddingLeft = (36 + marginPx + colInsetPx) + 'px';
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
    header.addEventListener('dblclick', (function(c) {
      return function(e) {
        e.stopPropagation();
        editGroupInDesignMode('col', c);
      };
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
  grid.style.left = (marginPx + colInsetPx) + 'px';
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

  // Initial UI sync
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

  // Draw a black outline so light-colored buttons are visible
  var cutRadius = (btnSize.cutDiameter / 2) * thumbScale;
  ctx.beginPath();
  ctx.arc(cx, cy, cutRadius - 2, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 4;
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
    // If clicking the only currently selected button, deselect it. Otherwise, select just it.
    if (selectedSlots.length === 1 && selectedSlots[0] === slotIndex) {
      selectedSlots = [];
    } else {
      selectedSlots = [slotIndex];
    }
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
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    // Shift/Ctrl/Cmd: toggle this column's slots in the current selection
    var allPresent = columnSlots.every(function(idx) { return selectedSlots.includes(idx); });
    if (allPresent) {
      // Remove column from selection
      selectedSlots = selectedSlots.filter(function(idx) { return !columnSlots.includes(idx); });
    } else {
      // Add column to selection
      columnSlots.forEach(function(idx) {
        if (!selectedSlots.includes(idx)) selectedSlots.push(idx);
      });
    }
  } else {
    // Toggle: if this column is already exactly selected, deselect all
    var alreadySelected = selectedSlots.length === columnSlots.length &&
      columnSlots.every(function(idx) { return selectedSlots.includes(idx); });
    selectedSlots = alreadySelected ? [] : columnSlots;
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
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    // Shift/Ctrl/Cmd: toggle this row's slots in the current selection
    var allPresent = rowSlots.every(function(idx) { return selectedSlots.includes(idx); });
    if (allPresent) {
      // Remove row from selection
      selectedSlots = selectedSlots.filter(function(idx) { return !rowSlots.includes(idx); });
    } else {
      // Add row to selection
      rowSlots.forEach(function(idx) {
        if (!selectedSlots.includes(idx)) selectedSlots.push(idx);
      });
    }
  } else {
    // Toggle: if this row is already exactly selected, deselect all
    var alreadySelected = selectedSlots.length === rowSlots.length &&
      rowSlots.every(function(idx) { return selectedSlots.includes(idx); });
    selectedSlots = alreadySelected ? [] : rowSlots;
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
  var applyColBtn = document.getElementById('btn-apply-col');
  var applyRowBtn = document.getElementById('btn-apply-row');
  var makeMainBtn = document.getElementById('btn-make-main');
  var editSelectedBtn = document.getElementById('btn-edit-selected');
  var clearSelectionBtn = document.getElementById('btn-clear-selection');

  if (info) {
    info.textContent = selectedSlots.length > 0
      ? selectedSlots.length + ' button(s) selected \u00b7 Ctrl/Cmd-click for multiple \u00b7 Double-click to edit'
      : 'Click to select \u00b7 Ctrl/Cmd-click for multiple \u00b7 Double-click to edit';
  }

  var hasOverrides = selectedSlots.some(function(idx) { return slotHasOverrides(idx); });

  // Show/hide buttons dynamically so they flow to the left of the info text
  if (resetBtn) {
    resetBtn.style.display = hasOverrides ? 'inline-flex' : 'none';
  }

  if (applyColBtn && applyRowBtn && makeMainBtn) {
    if (selectedSlots.length === 1) {
      applyColBtn.style.display = 'inline-flex';
      applyRowBtn.style.display = 'inline-flex';
      makeMainBtn.style.display = slotHasOverrides(selectedSlots[0]) ? 'inline-flex' : 'none';
    } else {
      applyColBtn.style.display = 'none';
      applyRowBtn.style.display = 'none';
      makeMainBtn.style.display = 'none';
    }
  }

  // Show "Edit Selected in Design" when 1+ buttons are selected
  if (editSelectedBtn) {
    editSelectedBtn.style.display = selectedSlots.length >= 1 ? 'inline-flex' : 'none';
  }

  // Copy Design: visible when exactly 1 button is selected and it has custom overrides
  var copyBtn = document.getElementById('btn-copy-design');
  if (copyBtn) {
    copyBtn.style.display = (selectedSlots.length === 1 && slotHasOverrides(selectedSlots[0])) ? 'inline-flex' : 'none';
  }

  // Paste Design: visible when there's a copied design and buttons are selected
  var pasteBtn = document.getElementById('btn-paste-design');
  if (pasteBtn) {
    pasteBtn.style.display = (_copiedDesign && selectedSlots.length > 0) ? 'inline-flex' : 'none';
  }
  
  if (clearSelectionBtn) {
    clearSelectionBtn.style.display = selectedSlots.length > 0 ? 'inline-flex' : 'none';
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
  updateSheetSelectionUI();
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

function showMainDesignBanner() {
  if (document.getElementById('main-design-banner')) return;
  var banner = document.createElement('div');
  banner.id = 'main-design-banner';
  banner.innerHTML =
    '<span>Editing <strong>Main Button Design</strong> - Changes apply to all buttons without custom designs</span>';
  var canvasWrapper = document.getElementById('design-canvas-wrapper');
  canvasWrapper.insertBefore(banner, canvasWrapper.firstChild);
}

function removeMainDesignBanner() {
  var existing = document.getElementById('main-design-banner');
  if (existing) existing.remove();
}

function enterSheetMode() {
  removeMainDesignBanner();
  document.getElementById('design-canvas-wrapper').classList.add('hidden');
  document.getElementById('sheet-view').classList.remove('hidden');
  renderSheetView();
}

function exitSheetMode() {
  document.getElementById('sheet-view').classList.add('hidden');
  document.getElementById('design-canvas-wrapper').classList.remove('hidden');
  selectedSlots = [];
  showMainDesignBanner();
  renderDesignCanvas();
}

// --- Per-button editing in design view ---

// When editing a specific slot, store the original main design so we can
// compute what changed when returning to sheet mode.
var _editingSlotIndex = null;
var _mainDesignBackup = null;

/**
 * Switch to design mode to edit a specific button slot.
 * Loads the slot's merged design (main + overrides) into the design canvas.
 * A "Back to Sheet" banner appears so the user can return and save changes.
 */
function editSlotInDesignMode(slotIndex) {
  _editingSlotIndex = slotIndex;

  // Back up the main design
  _mainDesignBackup = {
    templateId: currentDesign.templateId,
    backgroundColor: currentDesign.backgroundColor,
    templateDraw: currentDesign.templateDraw,
    gradient: currentDesign.gradient ? JSON.parse(JSON.stringify(currentDesign.gradient)) : null,
    textElements: currentDesign.textElements.map(function(t) { return Object.assign({}, t); }),
    imageElements: currentDesign.imageElements.map(function(img) { return Object.assign({}, img); }),
    libraryInfoText: currentDesign.libraryInfoText,
    libraryInfoColor: currentDesign.libraryInfoColor
  };

  // Merge main + overrides into currentDesign
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
  if (overrides.templateId !== undefined) {
    currentDesign.templateId = overrides.templateId;
    var tmpl = getTemplateById(overrides.templateId);
    currentDesign.templateDraw = tmpl ? tmpl.draw : null;
  }
  if (overrides.textElements !== undefined) {
    currentDesign.textElements = overrides.textElements.map(function(t) { return Object.assign({}, t); });
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

// Track group editing (row or column)
var _editingGroup = null; // { type: 'row'|'col', index: number, slots: number[] }

/**
 * Edit all buttons in a row or column. Opens design view for the first
 * button in the group; when done, applies the changes to all slots in the group.
 */
function editGroupInDesignMode(groupType, groupIndex) {
  var layout = getCurrentLayout();
  var slots = [];
  if (groupType === 'row') {
    for (var c = 0; c < layout.cols; c++) {
      slots.push(groupIndex * layout.cols + c);
    }
  } else {
    for (var r = 0; r < layout.rows; r++) {
      slots.push(r * layout.cols + groupIndex);
    }
  }
  _editingGroup = { type: groupType, index: groupIndex, slots: slots };
  // Open the first slot for editing - finishSlotEdit will apply to all
  editSlotInDesignMode(slots[0]);
}

/**
 * Show a banner indicating which button is being edited,
 * with a "Done - Back to Sheet" button.
 */
function showSlotEditBanner(slotIndex) {
  removeMainDesignBanner();
  removeSlotEditBanner();
  var layout = getCurrentLayout();
  var row = Math.floor(slotIndex / layout.cols);
  var col = slotIndex % layout.cols;
  var label;
  if (_editingGroup) {
    if (_editingGroup.type === 'row') {
      label = 'Row ' + (_editingGroup.index + 1) + ' (' + _editingGroup.slots.length + ' buttons)';
    } else if (_editingGroup.type === 'col') {
      label = 'Column ' + String.fromCharCode(65 + _editingGroup.index) + ' (' + _editingGroup.slots.length + ' buttons)';
    } else {
      label = _editingGroup.slots.length + ' selected buttons';
    }
  } else {
    label = 'button ' + String.fromCharCode(65 + col) + (row + 1);
  }

  var banner = document.createElement('div');
  banner.id = 'slot-edit-banner';
  banner.innerHTML =
    '<span>Editing <strong>' + label + '</strong></span>' +
    '<button class="btn btn-small btn-primary" id="btn-done-slot-edit">Done - Back to Sheet</button>';

  var canvasWrapper = document.getElementById('design-canvas-wrapper');
  canvasWrapper.insertBefore(banner, canvasWrapper.firstChild);

  document.getElementById('btn-done-slot-edit').addEventListener('click', finishSlotEdit);
}

function removeSlotEditBanner() {
  var existing = document.getElementById('slot-edit-banner');
  if (existing) existing.remove();
}

/**
 * Finish editing a slot: compute what changed vs the main backup,
 * store as overrides, restore main, and return to sheet mode.
 */
function finishSlotEdit() {
  if (_editingSlotIndex === null || !_mainDesignBackup) {
    removeSlotEditBanner();
    return;
  }

  var slotIndex = _editingSlotIndex;
  var overrides = {};

  // Compare current state to the backed-up main
  if (currentDesign.backgroundColor !== _mainDesignBackup.backgroundColor) {
    overrides.backgroundColor = currentDesign.backgroundColor;
  }
  if (currentDesign.libraryInfoText !== _mainDesignBackup.libraryInfoText) {
    overrides.libraryInfoText = currentDesign.libraryInfoText;
  }
  if (currentDesign.libraryInfoColor !== _mainDesignBackup.libraryInfoColor) {
    overrides.libraryInfoColor = currentDesign.libraryInfoColor;
  }

  // Gradient
  var mainGradJson = _mainDesignBackup.gradient ? JSON.stringify(_mainDesignBackup.gradient) : null;
  var currentGradJson = currentDesign.gradient ? JSON.stringify(currentDesign.gradient) : null;
  if (mainGradJson !== currentGradJson) {
    overrides.gradient = currentDesign.gradient ? JSON.parse(currentGradJson) : null;
  }

  // Template
  if (currentDesign.templateId !== _mainDesignBackup.templateId) {
    overrides.templateId = currentDesign.templateId;
  }

  // Text elements - compare by serialized content
  var mainTextsJson = JSON.stringify(_mainDesignBackup.textElements.map(function(t) {
    return { text: t.text, fontFamily: t.fontFamily, fontSize: t.fontSize, color: t.color,
      bold: t.bold, italic: t.italic, align: t.align, x: t.x, y: t.y,
      curved: t.curved, curveRadius: t.curveRadius };
  }));
  var currentTextsJson = JSON.stringify(currentDesign.textElements.map(function(t) {
    return { text: t.text, fontFamily: t.fontFamily, fontSize: t.fontSize, color: t.color,
      bold: t.bold, italic: t.italic, align: t.align, x: t.x, y: t.y,
      curved: t.curved, curveRadius: t.curveRadius };
  }));
  if (mainTextsJson !== currentTextsJson) {
    overrides.textElements = currentDesign.textElements.map(function(t) {
      return { text: t.text, fontFamily: t.fontFamily, fontSize: t.fontSize, color: t.color,
        bold: t.bold, italic: t.italic, align: t.align, x: t.x, y: t.y,
        curved: t.curved, curveRadius: t.curveRadius };
    });
  }

  // Image elements - compare by dataUrl, position, scale
  var mainImgs = _mainDesignBackup.imageElements;
  var currentImgs = currentDesign.imageElements;
  var imagesChanged = (mainImgs.length !== currentImgs.length);
  if (!imagesChanged) {
    for (var i = 0; i < currentImgs.length; i++) {
      if (currentImgs[i].dataUrl !== mainImgs[i].dataUrl ||
          currentImgs[i].x !== mainImgs[i].x ||
          currentImgs[i].y !== mainImgs[i].y ||
          currentImgs[i].imageScale !== mainImgs[i].imageScale) {
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

  // Save overrides - if editing a group, apply to all slots in the group
  if (_editingGroup) {
    _editingGroup.slots.forEach(function(idx) {
      // Merge new overrides with any existing per-slot overrides
      var existing = getSlotOverrides(idx);
      var merged = Object.assign({}, existing, overrides);
      // If no actual differences remain, clear overrides
      if (Object.keys(merged).length === 0) {
        setSlotOverrides(idx, {});
      } else {
        setSlotOverrides(idx, merged);
      }
    });
    _editingGroup = null;
  } else {
    setSlotOverrides(slotIndex, overrides);
  }

  // Restore the main design
  currentDesign.templateId = _mainDesignBackup.templateId;
  currentDesign.backgroundColor = _mainDesignBackup.backgroundColor;
  currentDesign.templateDraw = _mainDesignBackup.templateDraw;
  currentDesign.gradient = _mainDesignBackup.gradient;
  currentDesign.textElements = _mainDesignBackup.textElements;
  currentDesign.imageElements = _mainDesignBackup.imageElements;
  currentDesign.libraryInfoText = _mainDesignBackup.libraryInfoText;
  currentDesign.libraryInfoColor = _mainDesignBackup.libraryInfoColor;

  // Reset sidebar to main values
  document.getElementById('bg-color-picker').value = currentDesign.backgroundColor;
  updateBackgroundSwatches(currentDesign.backgroundColor);
  document.getElementById('library-info-input').value = currentDesign.libraryInfoText;
  document.getElementById('library-info-color').value = currentDesign.libraryInfoColor;
  var grad = currentDesign.gradient;
  document.getElementById('toggle-gradient').checked = !!grad;
  document.getElementById('gradient-controls').classList.toggle('hidden', !grad);

  // Clean up
  _editingSlotIndex = null;
  _mainDesignBackup = null;
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
      showMainDesignBanner();
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

  // App starts in design mode — show the main design banner immediately
  showMainDesignBanner();
}