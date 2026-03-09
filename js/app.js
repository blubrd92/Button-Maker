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
 * - Save/Load/Reset via top bar buttons
 *
 * Depends on:
 * - config.js (all configuration)
 * - canvas.js (initDesignCanvas, renderDesignCanvas)
 * - templates.js (applyTemplate, getTemplateById)
 * - text-tool.js (rendering functions — text tool UI removed)
 * - image-tool.js (initImageTool)
 * - storage.js (initStorage)
 * - pdf-export.js (initPDFExport)
 * - sheet-mode.js (initSheetMode)
 */

// Track the current editing mode
var currentMode = 'design'; // 'design' or 'sheet'

/**
 * Main initialization function. Called when the DOM is ready.
 */
function initApp() {
  // 1. Initialize the design canvas
  initDesignCanvas();

  // 2. Initialize tools (image only — text UI removed)
  initImageTool();

  // 3. Initialize storage (save/load wiring)
  initStorage();

  // 4. Initialize PDF export
  initPDFExport();

  // 5. Initialize sheet mode
  initSheetMode();

  // 6. Wire up top-level controls
  initTopLevelControls();

  // 7. Apply default template (blank white)
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

  // -- Brand text (formerly library info) --
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
  document.getElementById('design-canvas').addEventListener('click', function(e) {
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

  // -- Gradient toggle --
  document.getElementById('toggle-gradient').addEventListener('change', function(e) {
    var gradientControls = document.getElementById('gradient-controls');
    gradientControls.classList.toggle('hidden', !e.target.checked);
    if (e.target.checked) {
      applyGradientFromUI();
    } else {
      currentDesign.gradient = null;
      currentDesign.templateDraw = null;
      // Re-apply solid bg color
      handleBackgroundColorChange(currentDesign.backgroundColor);
    }
  });

  document.getElementById('bg-gradient-color2').addEventListener('input', function() {
    if (document.getElementById('toggle-gradient').checked) {
      applyGradientFromUI();
    }
  });

  document.getElementById('gradient-direction').addEventListener('change', function() {
    if (document.getElementById('toggle-gradient').checked) {
      applyGradientFromUI();
    }
  });

  // -- Reset button --
  document.getElementById('btn-reset').addEventListener('click', function() {
    if (!confirm('Reset to defaults? This will clear the current design and all saved designs from browser storage.')) return;
    localStorage.removeItem(STORAGE_KEY);
    resetDesignToDefaults();
    sheetSlots = [];
    selectedSlots = [];
    sheetName = '';
    if (currentMode === 'sheet') {
      renderSheetView();
    }
  });
}

/**
 * Read gradient settings from the UI and apply to the current design.
 */
function applyGradientFromUI() {
  var color1 = document.getElementById('bg-color-picker').value;
  var color2 = document.getElementById('bg-gradient-color2').value;
  var direction = document.getElementById('gradient-direction').value;

  currentDesign.gradient = {
    color1: color1,
    color2: color2,
    direction: direction
  };

  currentDesign.templateDraw = buildGradientDrawFunction(currentDesign.gradient);
  currentDesign.templateId = null;
  renderDesignCanvas();
  if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
    refreshSheetThumbnails();
  }
}

/**
 * Build a draw function for a gradient specification.
 * @param {{ color1: string, color2: string, direction: string }} grad
 * @returns {Function} draw(ctx, cx, cy, radius)
 */
function buildGradientDrawFunction(grad) {
  return function(ctx, cx, cy, radius) {
    var gradient;
    if (grad.direction === 'radial') {
      gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    } else if (grad.direction === 'left-right') {
      gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
    } else if (grad.direction === 'right-left') {
      gradient = ctx.createLinearGradient(cx + radius, cy, cx - radius, cy);
    } else if (grad.direction === 'bottom-top') {
      gradient = ctx.createLinearGradient(cx, cy + radius, cx, cy - radius);
    } else {
      // top-bottom (default)
      gradient = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
    }
    gradient.addColorStop(0, grad.color1);
    gradient.addColorStop(1, grad.color2);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  };
}

/**
 * Reset the current design to factory defaults.
 */
function resetDesignToDefaults() {
  currentDesign.templateId = 'blank';
  currentDesign.backgroundColor = CONFIG.DEFAULTS.backgroundColor;
  currentDesign.templateDraw = null;
  currentDesign.gradient = null;
  currentDesign.textElements = [];
  currentDesign.imageElements = [];
  currentDesign.libraryInfoText = CONFIG.DEFAULTS.libraryInfoText;
  currentDesign.libraryInfoColor = CONFIG.DEFAULTS.libraryInfoColor;

  // Reset UI controls
  document.getElementById('bg-color-picker').value = CONFIG.DEFAULTS.backgroundColor;
  document.getElementById('library-info-input').value = '';
  document.getElementById('library-info-color').value = CONFIG.DEFAULTS.libraryInfoColor;
  document.getElementById('toggle-gradient').checked = false;
  document.getElementById('gradient-controls').classList.add('hidden');
  document.getElementById('bg-gradient-color2').value = '#4A90D9';
  document.getElementById('gradient-direction').value = 'top-bottom';
  updateBackgroundSwatches(CONFIG.DEFAULTS.backgroundColor);
  selectedElement = null;
  hideImageControls();

  // Apply blank template and re-render
  applyTemplate('blank');
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
    // If gradient is enabled, update color1 and re-apply
    if (document.getElementById('toggle-gradient').checked) {
      applyGradientFromUI();
    }
  }
  updateBackgroundSwatches(color);
}

// -- Start the app when DOM is ready --
document.addEventListener('DOMContentLoaded', initApp);
