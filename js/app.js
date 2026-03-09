/**
 * app.js
 *
 * Main application initialization and top-level event wiring.
 *
 * Responsibilities:
 * - Initializing all modules in the correct order
 * - Wiring up top-level UI controls (guides toggle, background pickers,
 *   layout toggle, sheet name)
 * - Managing application-level state (current mode, etc.)
 *
 * Depends on:
 * - config.js (all configuration)
 * - canvas.js (initDesignCanvas, renderDesignCanvas)
 * - templates.js (renderTemplatePicker)
 * - text-tool.js (initTextTool)
 * - image-tool.js (initImageTool)
 * - storage.js (initStorage)
 * - pdf-export.js (initPDFExport)
 * - sheet-mode.js (initSheetMode)
 *
 * Gotchas:
 * - Module initialization order matters. config.js must be loaded first.
 *   canvas.js must be initialized before any rendering calls.
 * - The "current mode" (design vs sheet) affects how some controls behave.
 *   For example, background color changes in sheet mode apply as overrides
 *   to selected slots, not to the master design.
 */

// Track the current editing mode
var currentMode = 'design'; // 'design' or 'sheet'

/**
 * Main initialization function. Called when the DOM is ready.
 */
function initApp() {
  // 1. Render template picker
  renderTemplatePicker();

  // 2. Initialize the design canvas
  initDesignCanvas();

  // 3. Initialize tools
  initTextTool();
  initImageTool();

  // 4. Initialize save/load
  initStorage();

  // 5. Initialize PDF export
  initPDFExport();

  // 6. Initialize sheet mode
  initSheetMode();

  // 7. Wire up top-level controls
  initTopLevelControls();

  // 8. Apply default template
  applyTemplate('blank');

  console.log('Button Maker initialized.');
}

/**
 * Wire up controls that don't belong to a specific module.
 */
function initTopLevelControls() {
  // -- Guides toggle --
  document.getElementById('toggle-guides').addEventListener('change', function(e) {
    CONFIG.guidesVisible = e.target.checked;
    renderDesignCanvas();
  });

  // -- Layout toggle (15 / 20 per sheet) --
  document.getElementById('btn-layout-15').addEventListener('click', function() {
    setLayout('15');
  });
  document.getElementById('btn-layout-20').addEventListener('click', function() {
    setLayout('20');
  });

  // -- Background color swatches --
  var swatchContainer = document.getElementById('bg-color-swatches');
  CONFIG.COLOR_PALETTE.forEach(function(color) {
    var swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;

    if (color === '#FFFFFF') {
      swatch.style.borderColor = '#ccc';
    }

    swatch.addEventListener('click', function() {
      handleBackgroundColorChange(color);
      document.getElementById('bg-color-picker').value = color;
    });

    swatchContainer.appendChild(swatch);
  });

  // -- Background custom color picker --
  document.getElementById('bg-color-picker').addEventListener('input', function(e) {
    handleBackgroundColorChange(e.target.value);
  });

  // -- Library info text --
  document.getElementById('library-info-input').addEventListener('input', function(e) {
    if (currentMode === 'sheet' && selectedSlots.length > 0) {
      applyOverrideToSelectedSlots('libraryInfoText', e.target.value);
    } else {
      currentDesign.libraryInfoText = e.target.value;
      renderDesignCanvas();
    }
  });

  document.getElementById('library-info-color').addEventListener('input', function(e) {
    if (currentMode === 'sheet' && selectedSlots.length > 0) {
      applyOverrideToSelectedSlots('libraryInfoColor', e.target.value);
    } else {
      currentDesign.libraryInfoColor = e.target.value;
      renderDesignCanvas();
    }
  });

  // -- Mode toggle tracking --
  document.getElementById('btn-design-mode').addEventListener('click', function() {
    currentMode = 'design';
  });
  document.getElementById('btn-sheet-mode').addEventListener('click', function() {
    currentMode = 'sheet';
  });

  // -- Make canvas safe-zone clickable for image upload --
  // Only triggers when clicking empty space (no element hit) inside the safe zone.
  // Uses lastMouseDownHitElement flag set by handleCanvasMouseDown in canvas.js.
  document.getElementById('design-canvas').addEventListener('click', function(e) {
    // If mousedown hit an existing element, don't trigger upload
    if (lastMouseDownHitElement) return;

    var canvas = e.target;
    var rect = canvas.getBoundingClientRect();
    var cssToCanvas = canvas.width / rect.width;
    var mouseX = (e.clientX - rect.left) * cssToCanvas;
    var mouseY = (e.clientY - rect.top) * cssToCanvas;
    var cx = CONFIG.CANVAS_DISPLAY_DIAMETER / 2;
    var cy = CONFIG.CANVAS_DISPLAY_DIAMETER / 2;
    var scale = getCanvasScale();
    var btnSize = getCurrentButtonSize();
    var safeRadius = (btnSize.safeDiameter / 2) * scale;

    var dist = Math.sqrt(Math.pow(mouseX - cx, 2) + Math.pow(mouseY - cy, 2));
    if (dist <= safeRadius) {
      document.getElementById('image-upload').click();
    }
  });
}

/**
 * Switch between 15 and 20 per-sheet layout.
 */
function setLayout(layoutKey) {
  CONFIG.currentLayout = layoutKey;

  // Update toggle button states
  document.getElementById('btn-layout-15').classList.toggle('active', layoutKey === '15');
  document.getElementById('btn-layout-20').classList.toggle('active', layoutKey === '20');

  // Also sync the export modal radio
  var radio = document.querySelector('input[name="layout"][value="' + layoutKey + '"]');
  if (radio) radio.checked = true;

  // Reset sheet slots so they match the new layout
  sheetSlots = [];

  // If in sheet mode, re-render
  if (currentMode === 'sheet') {
    renderSheetView();
  }
}

/**
 * Handle background color change. In design mode, updates the master.
 * In sheet mode with selected slots, applies as overrides.
 */
function handleBackgroundColorChange(color) {
  if (currentMode === 'sheet' && selectedSlots.length > 0) {
    applyOverrideToSelectedSlots('backgroundColor', color);
  } else {
    setBackgroundColor(color);
  }
  updateBackgroundSwatches(color);
}

// -- Start the app when DOM is ready --
document.addEventListener('DOMContentLoaded', initApp);
