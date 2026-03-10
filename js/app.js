/**
 * app.js
 *
 * Main application initialization and top-level event wiring.
 *
 * Responsibilities:
 * - Initializing all modules in the correct order
 * - Wiring up top-level UI controls (guides toggle, background pickers,
 * layout toggle, sheet name)
 * - Managing application-level state (current mode, etc.)
 * - Save/Load/Reset via top bar buttons
 *
 * Depends on:
 * - config.js (all configuration)
 * - canvas.js (initDesignCanvas, renderDesignCanvas)
 * - templates.js (applyTemplate, getTemplateById)
 * - text-tool.js (rendering functions - text tool UI removed)
 * - image-tool.js (initImageTool)
 * - storage.js (initStorage)
 * - pdf-export.js (initPDFExport)
 * - sheet-mode.js (initSheetMode)
 */

// ─── Notification System ─────────────────────────────────────────

var _notificationTimeout = null;
var NOTIFICATION_DURATION_MS = 3000;

function showNotification(message, type, autoHide) {
  if (type === undefined) type = 'error';
  if (autoHide === undefined) autoHide = true;
  var area = document.getElementById('notification-area');
  if (!area) return;
  if (_notificationTimeout) {
    clearTimeout(_notificationTimeout);
    _notificationTimeout = null;
  }
  area.textContent = message;
  area.className = type;
  area.classList.add('show');
  if (autoHide) {
    _notificationTimeout = setTimeout(function() {
      hideNotification();
    }, NOTIFICATION_DURATION_MS);
  }
}

function hideNotification() {
  var area = document.getElementById('notification-area');
  if (area) area.classList.remove('show');
}

// Track the current editing mode
var currentMode = 'design'; // 'design' or 'sheet'

// Zoom state (separate per view)
var designZoom = 1.0;
var sheetZoom = 1.0;
var ZOOM_MIN = 0.25;
var ZOOM_MAX = 3.0;
var ZOOM_STEP = 0.25;

/**
 * Main initialization function. Called when the DOM is ready.
 */
function initApp() {
  // 1. Initialize the design canvas
  initDesignCanvas();

  // 2. Initialize tools (image only - text UI removed)
  initImageTool();

  // 3. Initialize storage (save/load wiring)
  initStorage();

  // 4. Initialize PDF export
  initPDFExport();

  // 5. Initialize sheet mode
  initSheetMode();

  // 6. Wire up top-level controls
  initTopLevelControls();

  // 7. Restore auto-saved session, or apply default template
  var restored = autoRestoreState();
  if (!restored) {
    applyTemplate('blank');
  }

  console.log('Button Maker initialized.');
}

/**
 * Wire up controls that don't belong to a specific module.
 */
function initTopLevelControls() {
  // -- Sidebar toggle --
  var toggleBtn = document.getElementById('toggle-sidebar-btn');
  var sidebar = document.getElementById('left-sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
      toggleBtn.classList.toggle('active');
    });
  }

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
      // Clear preset highlights since we are picking a manual color
      clearGradientPresetHighlight();
      
      // Update the picker value first so the gradient function reads the new color
      document.getElementById('bg-color-picker').value = color;
      handleBackgroundColorChange(color);
    });

    swatchContainer.appendChild(swatch);
  });

  // -- Background custom color picker --
  document.getElementById('bg-color-picker').addEventListener('input', function(e) {
    // Clear preset highlights since we are picking a manual color
    clearGradientPresetHighlight();
    handleBackgroundColorChange(e.target.value);
  });

  // -- Brand text (formerly library info) --
  document.getElementById('library-info-input').addEventListener('input', function(e) {
    if (currentMode === 'sheet' && selectedSlots.length > 0) {
      applyOverrideToSelectedSlots('libraryInfoText', e.target.value);
    } else {
      currentDesign.libraryInfoText = e.target.value;
      renderDesignCanvas();
      if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
        refreshSheetThumbnails();
      }
    }
  });

  document.getElementById('library-info-color').addEventListener('input', function(e) {
    if (currentMode === 'sheet' && selectedSlots.length > 0) {
      applyOverrideToSelectedSlots('libraryInfoColor', e.target.value);
    } else {
      currentDesign.libraryInfoColor = e.target.value;
      renderDesignCanvas();
      if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
        refreshSheetThumbnails();
      }
    }
  });

  // -- Mode toggle tracking --
  document.getElementById('btn-design-mode').addEventListener('click', function() {
    currentMode = 'design';
    applyZoom();
  });
  document.getElementById('btn-sheet-mode').addEventListener('click', function() {
    currentMode = 'sheet';
    applyZoom();
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
      clearGradientPresetHighlight();
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

  // -- Zoom controls --
  initZoomControls();

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

// --- Gradient Presets ---------------------------------------------
// All presets use evenly-spaced stops with smooth blending between colors.
var GRADIENT_PRESETS = {
  rainbow: {
    label: 'Rainbow',
    stops: [
      { offset: 0,    color: '#F09090' },
      { offset: 0.17, color: '#F0C090' },
      { offset: 0.33, color: '#F0F090' },
      { offset: 0.50, color: '#90E090' },
      { offset: 0.67, color: '#9090E8' },
      { offset: 0.83, color: '#C090D0' },
      { offset: 1,    color: '#D090F0' }
    ]
  },
  'pride-progress': {
    label: 'Progress',
    stops: [
      { offset: 0,    color: '#989898' },
      { offset: 0.14, color: '#B8A088' },
      { offset: 0.28, color: '#E89090' },
      { offset: 0.42, color: '#F0C898' },
      { offset: 0.57, color: '#F0E890' },
      { offset: 0.71, color: '#90C890' },
      { offset: 0.85, color: '#90B0F0' },
      { offset: 1,    color: '#C090CC' }
    ]
  },
  'pride-trans': {
    label: 'Trans',
    stops: [
      { offset: 0,    color: '#A0D8F0' },
      { offset: 0.25, color: '#F0C8D4' },
      { offset: 0.5,  color: '#FAFAFA' },
      { offset: 0.75, color: '#F0C8D4' },
      { offset: 1,    color: '#A0D8F0' }
    ]
  },
  'pride-bi': {
    label: 'Bisexual',
    stops: [
      { offset: 0,    color: '#E098B8' },
      { offset: 0.35, color: '#E098B8' },
      { offset: 0.5,  color: '#C0A0C8' },
      { offset: 0.65, color: '#98ACD8' },
      { offset: 1,    color: '#98ACD8' }
    ]
  },
  'pride-pan': {
    label: 'Pansexual',
    stops: [
      { offset: 0,    color: '#F0A0C4' },
      { offset: 0.33, color: '#F0E098' },
      { offset: 0.67, color: '#98CCF0' },
      { offset: 1,    color: '#98CCF0' }
    ]
  },
  'pride-nonbinary': {
    label: 'Non-binary',
    stops: [
      { offset: 0,    color: '#F0EC90' },
      { offset: 0.33, color: '#FAFAFA' },
      { offset: 0.67, color: '#C8A8E0' },
      { offset: 1,    color: '#B0B0B0' }
    ]
  },
  'pride-lesbian': {
    label: 'Lesbian',
    stops: [
      { offset: 0,    color: '#E09880' },
      { offset: 0.17, color: '#EBB890' },
      { offset: 0.33, color: '#F0C8A0' },
      { offset: 0.50, color: '#FAFAFA' },
      { offset: 0.67, color: '#E0ACC8' },
      { offset: 0.83, color: '#D4A0BC' },
      { offset: 1,    color: '#C888B0' }
    ]
  },
  'pride-ace': {
    label: 'Asexual',
    stops: [
      { offset: 0,    color: '#989898' },
      { offset: 0.33, color: '#CCCCCC' },
      { offset: 0.67, color: '#FAFAFA' },
      { offset: 1,    color: '#C898C8' }
    ]
  },
  'pride-gay': {
    label: 'Gay Men',
    stops: [
      { offset: 0,    color: '#90CCB8' },
      { offset: 0.17, color: '#98DCC4' },
      { offset: 0.33, color: '#B8E8D0' },
      { offset: 0.50, color: '#FAFAFA' },
      { offset: 0.67, color: '#B0C8E0' },
      { offset: 0.83, color: '#A8A0D8' },
      { offset: 1,    color: '#B098C8' }
    ]
  },
  'pride-aroace': {
    label: 'Aro/Ace',
    stops: [
      { offset: 0,    color: '#E8C888' },
      { offset: 0.25, color: '#ECD898' },
      { offset: 0.50, color: '#FAFAFA' },
      { offset: 0.75, color: '#A8C8E0' },
      { offset: 1,    color: '#98B0C4' }
    ]
  }
};

/**
 * Initialize zoom controls for the preview area.
 */
function initZoomControls() {
  var btnIn = document.getElementById('btn-zoom-in');
  var btnOut = document.getElementById('btn-zoom-out');
  var btnReset = document.getElementById('btn-zoom-reset');

  btnIn.addEventListener('click', function() {
    setCurrentZoom(Math.min(ZOOM_MAX, getCurrentZoom() + ZOOM_STEP));
    applyZoom();
  });

  btnOut.addEventListener('click', function() {
    setCurrentZoom(Math.max(ZOOM_MIN, getCurrentZoom() - ZOOM_STEP));
    applyZoom();
  });

  btnReset.addEventListener('click', function() {
    setCurrentZoom(1.0);
    applyZoom();
  });

  // Ctrl+scroll wheel zoom
  var canvasArea = document.getElementById('canvas-area');
  canvasArea.addEventListener('wheel', function(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      setCurrentZoom(Math.min(ZOOM_MAX, getCurrentZoom() + ZOOM_STEP));
    } else {
      setCurrentZoom(Math.max(ZOOM_MIN, getCurrentZoom() - ZOOM_STEP));
    }
    applyZoom();
  }, { passive: false });
}

/** Get the zoom level for the active view. */
function getCurrentZoom() {
  return currentMode === 'sheet' ? sheetZoom : designZoom;
}

/** Set the zoom level for the active view. */
function setCurrentZoom(val) {
  if (currentMode === 'sheet') {
    sheetZoom = val;
  } else {
    designZoom = val;
  }
}

/**
 * Apply the current zoom level to the active view.
 * Uses CSS zoom (not transform: scale) so the element's layout box
 * scales with it, allowing overflow: auto to show scrollbars when
 * zoomed content exceeds the viewport.
 */
function applyZoom() {
  var wrapper = document.getElementById('design-canvas-wrapper');
  var sheetView = document.getElementById('sheet-view');
  var label = document.getElementById('btn-zoom-reset');

  wrapper.style.zoom = designZoom;
  sheetView.style.zoom = sheetZoom;

  // Reset scroll when zoom is back at 100%
  var scrollContainer = document.getElementById('canvas-area-scroll');
  var activeZoom = getCurrentZoom();
  if (activeZoom === 1.0 && scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }

  label.textContent = Math.round(activeZoom * 100) + '%';
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

// --- Start the app when DOM is ready -------------------------------
document.addEventListener('DOMContentLoaded', initApp);