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

// ─── Sheet state ───────────────────────────────────────────────────

// Array of slot objects. Initialized/resized when entering sheet mode.
// Each slot: { slotIndex, row, col, overrides: {} }
let sheetSlots = [];

// Currently selected slot indices (supports multi-select)
let selectedSlots = [];

// ─── Slot management ───────────────────────────────────────────────

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
 * @param {number} slotIndex
 * @returns {Object} Override properties (empty if no overrides)
 */
function getSlotOverrides(slotIndex) {
  const slot = sheetSlots[slotIndex];
  return slot ? slot.overrides : {};
}

/**
 * Set overrides for a specific slot.
 * @param {number} slotIndex
 * @param {Object} overrides
 */
function setSlotOverrides(slotIndex, overrides) {
  if (sheetSlots[slotIndex]) {
    sheetSlots[slotIndex].overrides = overrides;
  }
}

/**
 * Check if a slot has any overrides.
 * @param {number} slotIndex
 * @returns {boolean}
 */
function slotHasOverrides(slotIndex) {
  const slot = sheetSlots[slotIndex];
  return slot && Object.keys(slot.overrides).length > 0;
}

/**
 * Reset a slot to match the master (clear all overrides).
 * @param {number} slotIndex
 */
function resetSlotToMaster(slotIndex) {
  if (sheetSlots[slotIndex]) {
    sheetSlots[slotIndex].overrides = {};
  }
}

/**
 * Get all sheet slots (for save/load).
 * @returns {Array}
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
 * @param {Array} slots
 */
function setSheetSlots(slots) {
  sheetSlots = slots.map(s => ({
    slotIndex: s.slotIndex,
    row: s.row,
    col: s.col,
    overrides: { ...s.overrides }
  }));
}

// ─── Sheet view rendering ──────────────────────────────────────────

/**
 * Render the full sheet grid view.
 * Creates a grid of small button canvases with row/column headers.
 */
function renderSheetView() {
  const container = document.getElementById('sheet-view');
  const layout = getCurrentLayout();
  initSheetSlots();

  container.innerHTML = '';

  // Create grid container
  const grid = document.createElement('div');
  grid.className = 'sheet-grid';
  // Grid template: header column + button columns
  grid.style.gridTemplateColumns = `40px repeat(${layout.cols}, 80px)`;
  grid.style.gridTemplateRows = `30px repeat(${layout.rows}, 80px)`;

  // ── Corner cell (empty) ──
  const corner = document.createElement('div');
  grid.appendChild(corner);

  // ── Column headers (A, B, C, ...) ──
  for (let col = 0; col < layout.cols; col++) {
    const header = document.createElement('div');
    header.className = 'sheet-header';
    header.textContent = String.fromCharCode(65 + col); // A, B, C, D
    header.dataset.col = col;
    header.addEventListener('click', (e) => handleColumnHeaderClick(col, e));
    grid.appendChild(header);
  }

  // ── Rows ──
  for (let row = 0; row < layout.rows; row++) {
    // Row header
    const rowHeader = document.createElement('div');
    rowHeader.className = 'sheet-header';
    rowHeader.textContent = String(row + 1);
    rowHeader.dataset.row = row;
    rowHeader.addEventListener('click', (e) => handleRowHeaderClick(row, e));
    grid.appendChild(rowHeader);

    // Button cells
    for (let col = 0; col < layout.cols; col++) {
      const slotIndex = row * layout.cols + col;
      const cell = document.createElement('div');
      cell.className = 'sheet-cell';
      cell.dataset.slotIndex = slotIndex;

      // Create thumbnail canvas
      const thumbCanvas = document.createElement('canvas');
      const thumbSize = 76;
      thumbCanvas.width = thumbSize;
      thumbCanvas.height = thumbSize;
      cell.appendChild(thumbCanvas);

      // Override badge
      if (slotHasOverrides(slotIndex)) {
        const badge = document.createElement('div');
        badge.className = 'override-badge';
        badge.title = 'This button has custom overrides';
        cell.appendChild(badge);
      }

      // Click handler
      cell.addEventListener('click', (e) => handleCellClick(slotIndex, e));

      grid.appendChild(cell);

      // Render the button thumbnail
      renderSheetThumbnail(thumbCanvas, slotIndex);
    }
  }

  container.appendChild(grid);

  // Add reset button for selected slots
  const controlsDiv = document.createElement('div');
  controlsDiv.id = 'sheet-controls';
  controlsDiv.style.marginTop = '16px';
  controlsDiv.style.display = 'flex';
  controlsDiv.style.gap = '8px';
  controlsDiv.innerHTML = `
    <button class="btn btn-small" id="btn-sheet-reset" style="display:none;">Reset Selected to Master</button>
    <span id="sheet-selection-info" style="font-size:12px; color:#888;"></span>
  `;
  container.appendChild(controlsDiv);

  // Wire reset button
  document.getElementById('btn-sheet-reset').addEventListener('click', () => {
    selectedSlots.forEach(idx => resetSlotToMaster(idx));
    renderSheetView();
    updateSheetSelectionUI();
  });

  updateSheetSelectionUI();
}

/**
 * Render a single button thumbnail for the sheet view.
 * @param {HTMLCanvasElement} canvas - The thumbnail canvas
 * @param {number} slotIndex - The slot index
 */
function renderSheetThumbnail(canvas, slotIndex) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;

  // Scale: map cutDiameter to thumbnail size
  const btnSize = getCurrentButtonSize();
  const thumbScale = size / btnSize.cutDiameter;

  // Build the design for this slot (master + overrides)
  const design = cloneDesignForRender(currentDesign);
  const overrides = getSlotOverrides(slotIndex);
  if (Object.keys(overrides).length > 0) {
    applyOverridesToDesign(design, overrides);
  }

  renderButtonDesign(ctx, cx, cy, thumbScale, design, { showGuides: false });
}

// ─── Selection handling ────────────────────────────────────────────

/**
 * Handle click on a button cell in the sheet grid.
 */
function handleCellClick(slotIndex, event) {
  if (event.ctrlKey || event.metaKey) {
    // Toggle selection (multi-select)
    const idx = selectedSlots.indexOf(slotIndex);
    if (idx >= 0) {
      selectedSlots.splice(idx, 1);
    } else {
      selectedSlots.push(slotIndex);
    }
  } else {
    // Single select
    selectedSlots = [slotIndex];
  }

  updateSheetSelectionUI();
  updateSheetOverridePanel();
}

/**
 * Handle click on a column header. Selects all slots in that column.
 */
function handleColumnHeaderClick(col, event) {
  const layout = getCurrentLayout();
  const columnSlots = [];
  for (let row = 0; row < layout.rows; row++) {
    columnSlots.push(row * layout.cols + col);
  }

  if (event.shiftKey) {
    // Add to selection
    columnSlots.forEach(idx => {
      if (!selectedSlots.includes(idx)) selectedSlots.push(idx);
    });
  } else {
    selectedSlots = columnSlots;
  }

  updateSheetSelectionUI();
  updateSheetOverridePanel();
}

/**
 * Handle click on a row header. Selects all slots in that row.
 */
function handleRowHeaderClick(row, event) {
  const layout = getCurrentLayout();
  const rowSlots = [];
  for (let col = 0; col < layout.cols; col++) {
    rowSlots.push(row * layout.cols + col);
  }

  if (event.shiftKey) {
    // Add to selection
    rowSlots.forEach(idx => {
      if (!selectedSlots.includes(idx)) selectedSlots.push(idx);
    });
  } else {
    selectedSlots = rowSlots;
  }

  updateSheetSelectionUI();
  updateSheetOverridePanel();
}

/**
 * Update the visual selection state in the sheet grid.
 */
function updateSheetSelectionUI() {
  // Update cell selection highlights
  document.querySelectorAll('.sheet-cell').forEach(cell => {
    const idx = parseInt(cell.dataset.slotIndex);
    cell.classList.toggle('selected', selectedSlots.includes(idx));
  });

  // Update row/column header highlights
  const layout = getCurrentLayout();
  document.querySelectorAll('.sheet-header[data-col]').forEach(header => {
    const col = parseInt(header.dataset.col);
    const colSlots = [];
    for (let row = 0; row < layout.rows; row++) {
      colSlots.push(row * layout.cols + col);
    }
    header.classList.toggle('selected', colSlots.every(idx => selectedSlots.includes(idx)));
  });

  document.querySelectorAll('.sheet-header[data-row]').forEach(header => {
    const row = parseInt(header.dataset.row);
    const rowSlots = [];
    for (let col = 0; col < layout.cols; col++) {
      rowSlots.push(row * layout.cols + col);
    }
    header.classList.toggle('selected', rowSlots.every(idx => selectedSlots.includes(idx)));
  });

  // Update info text and reset button
  const info = document.getElementById('sheet-selection-info');
  const resetBtn = document.getElementById('btn-sheet-reset');
  if (info) {
    info.textContent = selectedSlots.length > 0
      ? `${selectedSlots.length} button(s) selected`
      : 'Click a button to select it';
  }

  // Show reset button only if any selected slot has overrides
  if (resetBtn) {
    const hasOverrides = selectedSlots.some(idx => slotHasOverrides(idx));
    resetBtn.style.display = hasOverrides ? '' : 'none';
  }
}

/**
 * Update the right sidebar to show override controls for the selected slot(s).
 * When a single slot is selected, shows its current values.
 * When multiple slots are selected, shows shared override controls.
 */
function updateSheetOverridePanel() {
  // For now, background color override is the main control.
  // When in sheet mode and a slot is selected, the background color picker
  // applies to the selected slots as overrides instead of the master.
  // This is wired up in app.js through the mode-aware event handlers.
}

/**
 * Apply a background color override to all currently selected slots.
 * @param {string} color - hex color
 */
function applyOverrideToSelectedSlots(property, value) {
  selectedSlots.forEach(slotIndex => {
    const slot = sheetSlots[slotIndex];
    if (slot) {
      slot.overrides[property] = value;
    }
  });

  // Re-render affected thumbnails
  refreshSheetThumbnails();
}

/**
 * Refresh all sheet thumbnails (e.g., after master or overrides change).
 */
function refreshSheetThumbnails() {
  document.querySelectorAll('.sheet-cell').forEach(cell => {
    const slotIndex = parseInt(cell.dataset.slotIndex);
    const canvas = cell.querySelector('canvas');
    if (canvas) {
      renderSheetThumbnail(canvas, slotIndex);
    }

    // Update override badge
    const existingBadge = cell.querySelector('.override-badge');
    if (slotHasOverrides(slotIndex)) {
      if (!existingBadge) {
        const badge = document.createElement('div');
        badge.className = 'override-badge';
        badge.title = 'This button has custom overrides';
        cell.appendChild(badge);
      }
    } else {
      if (existingBadge) existingBadge.remove();
    }
  });
}

// ─── Mode switching ────────────────────────────────────────────────

/**
 * Enter Sheet Mode: show the sheet grid, hide the design canvas.
 */
function enterSheetMode() {
  document.getElementById('design-canvas-wrapper').classList.add('hidden');
  document.getElementById('sheet-view').classList.remove('hidden');
  renderSheetView();
}

/**
 * Exit Sheet Mode: show the design canvas, hide the sheet grid.
 */
function exitSheetMode() {
  document.getElementById('sheet-view').classList.add('hidden');
  document.getElementById('design-canvas-wrapper').classList.remove('hidden');
  selectedSlots = [];
  renderDesignCanvas();
}

/**
 * Initialize sheet mode: wire up mode toggle buttons.
 * Called once from app.js.
 */
function initSheetMode() {
  document.getElementById('btn-design-mode').addEventListener('click', () => {
    document.getElementById('btn-design-mode').classList.add('active');
    document.getElementById('btn-sheet-mode').classList.remove('active');
    exitSheetMode();
  });

  document.getElementById('btn-sheet-mode').addEventListener('click', () => {
    document.getElementById('btn-sheet-mode').classList.add('active');
    document.getElementById('btn-design-mode').classList.remove('active');
    enterSheetMode();
  });
}
