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
  renderGradientPresets();
  document.getElementById('toggle-gradient').addEventListener('change', function(e) {
    var gradientControls = document.getElementById('gradient-controls');
    gradientControls.classList.toggle('hidden', !e.target.checked);
    if (e.target.checked) {
      applyGradientFromUI();
    } else {
      currentDesign.gradient = null;
      currentDesign.templateDraw = null;
      // Clear active preset highlight
      document.querySelectorAll('.gradient-preset-btn').forEach(function(btn) {
        btn.classList.remove('active');
      });
      // Re-apply solid bg color
      handleBackgroundColorChange(currentDesign.backgroundColor);
    }
  });

  document.getElementById('bg-gradient-color2').addEventListener('input', function() {
    if (document.getElementById('toggle-gradient').checked) {
      // Manual color change clears preset
      clearGradientPresetHighlight();
      applyGradientFromUI();
    }
  });

  document.getElementById('gradient-direction').addEventListener('change', function() {
    if (document.getElementById('toggle-gradient').checked) {
      // Changing direction re-applies current gradient (preset or custom)
      if (currentDesign.gradient && currentDesign.gradient.stops) {
        // Re-apply with new direction but keep stops
        var direction = document.getElementById('gradient-direction').value;
        currentDesign.gradient.direction = direction;
        currentDesign.templateDraw = buildGradientDrawFunction(currentDesign.gradient);
        renderDesignCanvas();
        if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
          refreshSheetThumbnails();
        }
      } else {
        applyGradientFromUI();
      }
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
    stops: null,  // null = use color1/color2; array = multi-stop
    direction: direction,
    preset: null
  };

  currentDesign.templateDraw = buildGradientDrawFunction(currentDesign.gradient);
  currentDesign.templateId = null;
  renderDesignCanvas();
  if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
    refreshSheetThumbnails();
  }
}

/**
 * Apply a gradient preset by name.
 * @param {string} presetName - key in GRADIENT_PRESETS
 */
function applyGradientPreset(presetName) {
  var preset = GRADIENT_PRESETS[presetName];
  if (!preset) return;

  var direction = document.getElementById('gradient-direction').value;

  currentDesign.gradient = {
    color1: preset.stops[0].color,
    color2: preset.stops[preset.stops.length - 1].color,
    stops: preset.stops,
    direction: direction,
    preset: presetName
  };

  // Update the two color pickers to reflect the first/last stops
  document.getElementById('bg-color-picker').value = currentDesign.gradient.color1;
  document.getElementById('bg-gradient-color2').value = currentDesign.gradient.color2;
  updateBackgroundSwatches(currentDesign.gradient.color1);

  // Highlight active preset
  document.querySelectorAll('.gradient-preset-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.preset === presetName);
  });

  currentDesign.templateDraw = buildGradientDrawFunction(currentDesign.gradient);
  currentDesign.templateId = null;
  renderDesignCanvas();
  if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
    refreshSheetThumbnails();
  }
}

/**
 * Build a draw function for a gradient specification.
 * Supports both 2-color (color1/color2) and multi-stop (stops array) gradients.
 * @param {Object} grad - { color1, color2, stops, direction }
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

    if (grad.stops && grad.stops.length >= 2) {
      grad.stops.forEach(function(stop) {
        gradient.addColorStop(stop.offset, stop.color);
      });
    } else {
      gradient.addColorStop(0, grad.color1);
      gradient.addColorStop(1, grad.color2);
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  };
}

/**
 * Clear the active highlight from all gradient preset buttons.
 */
function clearGradientPresetHighlight() {
  document.querySelectorAll('.gradient-preset-btn').forEach(function(btn) {
    btn.classList.remove('active');
  });
  if (currentDesign.gradient) {
    currentDesign.gradient.preset = null;
    currentDesign.gradient.stops = null;
  }
}

/**
 * Render gradient preset swatch buttons into the preset container.
 */
function renderGradientPresets() {
  var container = document.getElementById('gradient-presets');
  if (!container) return;
  container.innerHTML = '';

  Object.keys(GRADIENT_PRESETS).forEach(function(key) {
    var preset = GRADIENT_PRESETS[key];
    var btn = document.createElement('button');
    btn.className = 'gradient-preset-btn';
    btn.dataset.preset = key;
    btn.title = preset.label;

    // Build a CSS linear-gradient for the swatch preview
    var cssStops = preset.stops.map(function(s) {
      return s.color + ' ' + Math.round(s.offset * 100) + '%';
    }).join(', ');
    btn.style.background = 'linear-gradient(to right, ' + cssStops + ')';

    btn.addEventListener('click', function() {
      // Ensure gradient toggle is on
      document.getElementById('toggle-gradient').checked = true;
      document.getElementById('gradient-controls').classList.remove('hidden');
      applyGradientPreset(key);
    });

    container.appendChild(btn);
  });
}

// ─── Gradient Presets ─────────────────────────────────────────────
var GRADIENT_PRESETS = {
  rainbow: {
    label: 'Rainbow',
    stops: [
      { offset: 0,    color: '#FF0000' },
      { offset: 0.17, color: '#FF8000' },
      { offset: 0.33, color: '#FFFF00' },
      { offset: 0.50, color: '#00CC00' },
      { offset: 0.67, color: '#0000FF' },
      { offset: 0.83, color: '#4B0082' },
      { offset: 1,    color: '#8B00FF' }
    ]
  },
  'pride-progress': {
    label: 'Progress',
    stops: [
      { offset: 0,    color: '#000000' },
      { offset: 0.12, color: '#784F17' },
      { offset: 0.24, color: '#E40303' },
      { offset: 0.40, color: '#FF8C00' },
      { offset: 0.52, color: '#FFED00' },
      { offset: 0.64, color: '#008026' },
      { offset: 0.76, color: '#004DFF' },
      { offset: 1,    color: '#750787' }
    ]
  },
  'pride-trans': {
    label: 'Trans',
    stops: [
      { offset: 0,    color: '#5BCEFA' },
      { offset: 0.25, color: '#F5A9B8' },
      { offset: 0.5,  color: '#FFFFFF' },
      { offset: 0.75, color: '#F5A9B8' },
      { offset: 1,    color: '#5BCEFA' }
    ]
  },
  'pride-bi': {
    label: 'Bisexual',
    stops: [
      { offset: 0,    color: '#D60270' },
      { offset: 0.35, color: '#D60270' },
      { offset: 0.5,  color: '#9B4F96' },
      { offset: 0.65, color: '#0038A8' },
      { offset: 1,    color: '#0038A8' }
    ]
  },
  'pride-pan': {
    label: 'Pansexual',
    stops: [
      { offset: 0,    color: '#FF218C' },
      { offset: 0.33, color: '#FF218C' },
      { offset: 0.34, color: '#FFD800' },
      { offset: 0.66, color: '#FFD800' },
      { offset: 0.67, color: '#21B1FF' },
      { offset: 1,    color: '#21B1FF' }
    ]
  },
  'pride-nonbinary': {
    label: 'Non-binary',
    stops: [
      { offset: 0,    color: '#FCF434' },
      { offset: 0.25, color: '#FCF434' },
      { offset: 0.26, color: '#FFFFFF' },
      { offset: 0.50, color: '#FFFFFF' },
      { offset: 0.51, color: '#9C59D1' },
      { offset: 0.75, color: '#9C59D1' },
      { offset: 0.76, color: '#2C2C2C' },
      { offset: 1,    color: '#2C2C2C' }
    ]
  },
  'pride-lesbian': {
    label: 'Lesbian',
    stops: [
      { offset: 0,    color: '#D52D00' },
      { offset: 0.20, color: '#EF7627' },
      { offset: 0.40, color: '#FF9A56' },
      { offset: 0.50, color: '#FFFFFF' },
      { offset: 0.60, color: '#D162A4' },
      { offset: 0.80, color: '#B55690' },
      { offset: 1,    color: '#A30262' }
    ]
  },
  'pride-ace': {
    label: 'Asexual',
    stops: [
      { offset: 0,    color: '#000000' },
      { offset: 0.25, color: '#000000' },
      { offset: 0.26, color: '#A3A3A3' },
      { offset: 0.50, color: '#A3A3A3' },
      { offset: 0.51, color: '#FFFFFF' },
      { offset: 0.75, color: '#FFFFFF' },
      { offset: 0.76, color: '#800080' },
      { offset: 1,    color: '#800080' }
    ]
  },
  sunset: {
    label: 'Sunset',
    stops: [
      { offset: 0,    color: '#FF512F' },
      { offset: 0.5,  color: '#F09819' },
      { offset: 1,    color: '#FFED00' }
    ]
  },
  ocean: {
    label: 'Ocean',
    stops: [
      { offset: 0,    color: '#2E3192' },
      { offset: 0.5,  color: '#1BFFFF' },
      { offset: 1,    color: '#2E3192' }
    ]
  }
};

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
