/**
 * app.js
 *
 * Main application initialization and top-level event wiring.
 */

// Notification System

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
  var restoreResult = autoRestoreState();
  if (restoreResult && typeof restoreResult.then === 'function') {
    // async path (IndexedDB)
    restoreResult.then(function(restored) {
      if (!restored) {
        applyTemplate('blank');
      } else {
        renderDesignCanvas();
      }
      console.log('Button Maker initialized.');
    });
  } else {
    // sync fallback (no IndexedDB)
    if (!restoreResult) {
      applyTemplate('blank');
    } else {
      renderDesignCanvas();
    }
    console.log('Button Maker initialized.');
  }
}

/**
 * Wire up controls that don't belong to a specific module.
 */
function initTopLevelControls() {
  // Sidebar toggle
  var toggleBtn = document.getElementById('toggle-sidebar-btn');
  var sidebar = document.getElementById('left-sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
      toggleBtn.classList.toggle('active');
    });
  }
  
  // Quick Reference modal
  var refLink = document.getElementById('quick-ref-link');
  var refOverlay = document.getElementById('quick-ref-overlay');
  var refClose = document.getElementById('quick-ref-close');
  if (refLink && refOverlay) {
    refLink.addEventListener('click', function(e) {
      e.preventDefault();
      refOverlay.classList.remove('hidden');
    });
    refClose.addEventListener('click', function() {
      refOverlay.classList.add('hidden');
    });
    refOverlay.addEventListener('click', function(e) {
      if (e.target === refOverlay) refOverlay.classList.add('hidden');
    });
  }

  // Button Size Selection
  var sizeSelect = document.getElementById('button-size-select');
  if (sizeSelect) {
    sizeSelect.addEventListener('change', function(e) {
      CONFIG.currentButtonSize = e.target.value;
      
      // Force all existing images to adapt to the new size geometry:
      // - master design images
      // - custom slot override images
      if (typeof recalculateImageBaseDimensions === 'function') {
        recalculateImageBaseDimensions();
      }
      if (typeof recalculateOverrideImageBaseDimensions === 'function') {
        recalculateOverrideImageBaseDimensions();
      }
      // Also recalculate _slotEditDesign images if editing a slot
      if (_slotEditDesign && _slotEditDesign.imageElements) {
        _slotEditDesign.imageElements.forEach(function(imgEl) {
          refreshImageElementGeometryForCurrentSize(imgEl);
        });
      }
      
      if (currentMode === 'sheet') {
        // Re-render the sheet with the new dimensions
        sheetZoom = computeFitToScreenZoom(); 
        renderSheetView();
        applyZoom();
      } else {
        // Re-render the design canvas
        renderDesignCanvas();
      }
    });
  }

  // Background color swatches
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
      if (typeof pushUndo === 'function') pushUndo('bg-color');
      clearGradientPresetHighlight();
      document.getElementById('bg-color-picker').value = color;
      handleBackgroundColorChange(color);
    });

    swatchContainer.appendChild(swatch);
  });

  // Background custom color picker
  document.getElementById('bg-color-picker').addEventListener('input', function(e) {
    if (typeof pushUndo === 'function') pushUndo('bg-color-picker');
    clearGradientPresetHighlight();
    handleBackgroundColorChange(e.target.value);
  });

  // Brand text 
  document.getElementById('library-info-input').addEventListener('input', function(e) {
    if (typeof pushUndo === 'function') pushUndo('brand-text');
    if (shouldApplyBrandTextToAllButtons()) {
      applyBrandTextSettingsToAllButtons();
    } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
      applyOverrideToSelectedSlots('libraryInfoText', e.target.value);
    } else {
      if (currentMode === 'sheet') {
        preserveBrandTextOnCustomSlots();
      }
      getActiveDesign().libraryInfoText = e.target.value;
      renderDesignCanvas();
      if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
        refreshSheetThumbnails();
      }
    }
  });

  // Brand text color swatches
  var brandSwatchContainer = document.getElementById('brand-text-color-swatches');
  CONFIG.COLOR_PALETTE.forEach(function(color) {
    var swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;

    if (color === '#FFFFFF') {
      swatch.style.borderColor = '#ccc';
    }

    swatch.addEventListener('click', function() {
      if (typeof pushUndo === 'function') pushUndo('brand-text-color');
      document.getElementById('library-info-color').value = color;
      if (shouldApplyBrandTextToAllButtons()) {
        applyBrandTextSettingsToAllButtons();
      } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
        applyOverrideToSelectedSlots('libraryInfoColor', color);
      } else {
        if (currentMode === 'sheet') {
          preserveBrandTextOnCustomSlots();
        }
        getActiveDesign().libraryInfoColor = color;
        renderDesignCanvas();
        if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
          refreshSheetThumbnails();
        }
      }
    });

    brandSwatchContainer.appendChild(swatch);
  });

  document.getElementById('library-info-color').addEventListener('input', function(e) {
    if (typeof pushUndo === 'function') pushUndo('brand-text-color');
    if (shouldApplyBrandTextToAllButtons()) {
      applyBrandTextSettingsToAllButtons();
    } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
      applyOverrideToSelectedSlots('libraryInfoColor', e.target.value);
    } else {
      if (currentMode === 'sheet') {
        preserveBrandTextOnCustomSlots();
      }
      getActiveDesign().libraryInfoColor = e.target.value;
      renderDesignCanvas();
      if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
        refreshSheetThumbnails();
      }
    }
  });

  // Mode toggle tracking
  document.getElementById('btn-design-mode').addEventListener('click', function() {
    currentMode = 'design';
    applyZoom();
  });
  document.getElementById('btn-sheet-mode').addEventListener('click', function() {
    currentMode = 'sheet';
    sheetZoom = computeFitToScreenZoom();
    applyZoom();
  });

  // Make canvas safe-zone clickable for image upload
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

  // Gradient toggle
  renderGradientPresets();
  document.getElementById('toggle-gradient').addEventListener('change', function(e) {
    if (typeof pushUndo === 'function') pushUndo();
    var gradientControls = document.getElementById('gradient-controls');
    gradientControls.classList.toggle('hidden', !e.target.checked);
    if (e.target.checked) {
      if (shouldApplyBackgroundToAllButtons()) {
        applyBackgroundSettingsToAllButtons();
      } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
        applyGradientOverrideToSelectedSlots();
      } else {
        applyGradientFromUI();
      }
    } else {
      if (shouldApplyBackgroundToAllButtons()) {
        clearGradientPresetHighlight();
        applyBackgroundSettingsToAllButtons();
      } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
        applyOverrideToSelectedSlots('backgroundColor', document.getElementById('bg-color-picker').value);
        // Clear gradient and template overrides so solid color isn't masked
        selectedSlots.forEach(function(slotIndex) {
          var slot = sheetSlots[slotIndex];
          if (slot && slot.overrides) {
            delete slot.overrides.gradient;
            delete slot.overrides.templateId;
          }
        });
        refreshSheetThumbnails();
      } else {
        var target = getActiveDesign();
        target.gradient = null;
        target.templateDraw = null;
        clearGradientPresetHighlight();
        handleBackgroundColorChange(target.backgroundColor);
      }
    }
  });

  // Gradient color2 swatches
  var gradSwatchContainer = document.getElementById('gradient-color2-swatches');
  CONFIG.COLOR_PALETTE.forEach(function(color) {
    var swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;

    if (color === '#FFFFFF') {
      swatch.style.borderColor = '#ccc';
    }

    swatch.addEventListener('click', function() {
      if (typeof pushUndo === 'function') pushUndo('gradient-color2');
      clearGradientPresetHighlight();
      document.getElementById('bg-gradient-color2').value = color;
      if (document.getElementById('toggle-gradient').checked) {
        if (shouldApplyBackgroundToAllButtons()) {
          applyBackgroundSettingsToAllButtons();
        } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
          applyGradientOverrideToSelectedSlots();
        } else {
          applyGradientFromUI();
        }
      }
    });

    gradSwatchContainer.appendChild(swatch);
  });

  document.getElementById('bg-gradient-color2').addEventListener('input', function() {
    if (typeof pushUndo === 'function') pushUndo('gradient-color2');
    if (document.getElementById('toggle-gradient').checked) {
      clearGradientPresetHighlight();
      if (shouldApplyBackgroundToAllButtons()) {
        applyBackgroundSettingsToAllButtons();
      } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
        applyGradientOverrideToSelectedSlots();
      } else {
        applyGradientFromUI();
      }
    }
  });

  document.getElementById('gradient-direction').addEventListener('change', function() {
    if (typeof pushUndo === 'function') pushUndo();
    if (document.getElementById('toggle-gradient').checked) {
      if (shouldApplyBackgroundToAllButtons()) {
        applyBackgroundSettingsToAllButtons();
        return;
      }

      if (currentMode === 'sheet' && selectedSlots.length > 0) {
        applyGradientOverrideToSelectedSlots();
        return;
      }
      
      var activeD = getActiveDesign();
      if (activeD.gradient && activeD.gradient.stops) {
        var direction = document.getElementById('gradient-direction').value;
        activeD.gradient.direction = direction;
        activeD.templateDraw = buildGradientDrawFunction(activeD.gradient);
        renderDesignCanvas();
        if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
          refreshSheetThumbnails();
        }
      } else {
        applyGradientFromUI();
      }
    }
  });

  // Undo/redo buttons and keyboard shortcuts
  var undoBtn = document.getElementById('btn-undo');
  var redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.addEventListener('click', function() { undo(); });
  if (redoBtn) redoBtn.addEventListener('click', function() { redo(); });
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault();
      redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
  });

  // Zoom controls
  initZoomControls();

  // Reset button
  document.getElementById('btn-reset').addEventListener('click', function() {
    if (!confirm('Reset to defaults? This will clear the current design and all saved designs from browser storage.')) return;
    if (typeof pushUndo === 'function') pushUndo();
    clearAllStorage();
    resetDesignToDefaults();
    sheetSlots = [];
    selectedSlots = [];
    sheetName = '';
    if (currentMode === 'sheet') {
      renderSheetView();
    }
  });
}

function shouldApplyBackgroundToAllButtons() {
  var checkbox = document.getElementById('apply-background-to-all');
  return !!(checkbox && checkbox.checked);
}

function shouldApplyBrandTextToAllButtons() {
  var checkbox = document.getElementById('apply-brand-text-to-all');
  return !!(checkbox && checkbox.checked);
}

function clearBackgroundOverridesForAllSlots() {
  if (typeof sheetSlots === 'undefined' || !Array.isArray(sheetSlots)) return;
  sheetSlots.forEach(function(slot) {
    if (!slot || !slot.overrides) return;
    delete slot.overrides.backgroundColor;
    delete slot.overrides.gradient;
    delete slot.overrides.templateId;
  });
}

function clearBrandTextOverridesForAllSlots() {
  if (typeof sheetSlots === 'undefined' || !Array.isArray(sheetSlots)) return;
  sheetSlots.forEach(function(slot) {
    if (!slot || !slot.overrides) return;
    delete slot.overrides.libraryInfoText;
    delete slot.overrides.libraryInfoColor;
  });
}

function preserveBrandTextOnCustomSlots() {
  if (typeof sheetSlots === 'undefined' || !Array.isArray(sheetSlots)) return;
  sheetSlots.forEach(function(slot, slotIndex) {
    if (!slot || !slot.overrides) return;
    if (Object.keys(slot.overrides).length === 0) return;

    var effectiveDesign = (typeof getEffectiveDesignForSlot === 'function')
      ? getEffectiveDesignForSlot(slotIndex)
      : currentDesign;

    if (slot.overrides.libraryInfoText === undefined) {
      slot.overrides.libraryInfoText = effectiveDesign.libraryInfoText;
    }
    if (slot.overrides.libraryInfoColor === undefined) {
      slot.overrides.libraryInfoColor = effectiveDesign.libraryInfoColor;
    }
  });
}

function preserveBackgroundOnCustomSlots() {
  if (typeof sheetSlots === 'undefined' || !Array.isArray(sheetSlots)) return;
  sheetSlots.forEach(function(slot, slotIndex) {
    if (!slot || !slot.overrides) return;
    if (Object.keys(slot.overrides).length === 0) return;

    var effectiveDesign = (typeof getEffectiveDesignForSlot === 'function')
      ? getEffectiveDesignForSlot(slotIndex)
      : currentDesign;

    if (effectiveDesign.gradient) {
      slot.overrides.backgroundColor = effectiveDesign.backgroundColor;
      slot.overrides.gradient = JSON.parse(JSON.stringify(effectiveDesign.gradient));
      slot.overrides.templateId = null;
    } else if (effectiveDesign.templateId && effectiveDesign.templateId !== 'blank') {
      slot.overrides.backgroundColor = effectiveDesign.backgroundColor;
      slot.overrides.gradient = null;
      slot.overrides.templateId = effectiveDesign.templateId;
    } else {
      slot.overrides.backgroundColor = effectiveDesign.backgroundColor;
      slot.overrides.gradient = null;
      slot.overrides.templateId = null;
    }
  });
}

function refreshAfterGlobalSectionApply() {
  renderDesignCanvas();
  if (typeof refreshSheetThumbnails === 'function') {
    refreshSheetThumbnails();
  }
  if (typeof updateSheetOverridePanel === 'function') {
    updateSheetOverridePanel();
  }
  if (typeof updateSheetSelectionUI === 'function') {
    updateSheetSelectionUI();
  }
}

function applyBackgroundSettingsToAllButtons() {
  var color1 = document.getElementById('bg-color-picker').value;
  var gradientEnabled = document.getElementById('toggle-gradient').checked;

  currentDesign.backgroundColor = color1;
  currentDesign.templateId = null;

  if (gradientEnabled) {
    var color2 = document.getElementById('bg-gradient-color2').value;
    var direction = document.getElementById('gradient-direction').value;
    var grad = {
      color1: color1,
      color2: color2,
      stops: null,
      direction: direction,
      preset: null
    };

    var activePresetBtn = document.querySelector('.gradient-preset-btn.active');
    if (activePresetBtn) {
      var presetName = activePresetBtn.dataset.preset;
      var preset = GRADIENT_PRESETS[presetName];
      if (preset) {
        grad.stops = preset.stops;
        grad.preset = presetName;
      }
    }

    currentDesign.gradient = grad;
    currentDesign.templateDraw = buildGradientDrawFunction(grad);
  } else {
    currentDesign.gradient = null;
    currentDesign.templateDraw = null;
  }

  clearBackgroundOverridesForAllSlots();
  refreshAfterGlobalSectionApply();
}

function applyBrandTextSettingsToAllButtons() {
  currentDesign.libraryInfoText = document.getElementById('library-info-input').value;
  currentDesign.libraryInfoColor = document.getElementById('library-info-color').value;
  clearBrandTextOverridesForAllSlots();
  refreshAfterGlobalSectionApply();
}

/**
 * Read gradient settings from the UI and apply to the current design.
 */
function applyGradientFromUI() {
  var color1 = document.getElementById('bg-color-picker').value;
  var color2 = document.getElementById('bg-gradient-color2').value;
  var direction = document.getElementById('gradient-direction').value;

  if (currentMode === 'sheet' && selectedSlots.length === 0 && !shouldApplyBackgroundToAllButtons()) {
    preserveBackgroundOnCustomSlots();
  }

  var target = getActiveDesign();
  target.gradient = {
    color1: color1,
    color2: color2,
    stops: null,
    direction: direction,
    preset: null
  };

  target.templateDraw = buildGradientDrawFunction(target.gradient);
  target.templateId = null;
  renderDesignCanvas();
  if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
    refreshSheetThumbnails();
  }
}

/**
 * Read gradient settings from the UI and apply as an override to selected slots.
 */
function applyGradientOverrideToSelectedSlots() {
  var color1 = document.getElementById('bg-color-picker').value;
  var color2 = document.getElementById('bg-gradient-color2').value;
  var direction = document.getElementById('gradient-direction').value;

  var grad = {
    color1: color1,
    color2: color2,
    stops: null,
    direction: direction,
    preset: null
  };

  var activePresetBtn = document.querySelector('.gradient-preset-btn.active');
  if (activePresetBtn) {
    var presetName = activePresetBtn.dataset.preset;
    var preset = GRADIENT_PRESETS[presetName];
    if (preset) {
       grad.stops = preset.stops;
       grad.preset = presetName;
    }
  }

  applyOverrideToSelectedSlots('gradient', grad);
}

/**
 * Apply a gradient preset by name.
 * @param {string} presetName - key in GRADIENT_PRESETS
 */
function applyGradientPreset(presetName) {
  var preset = GRADIENT_PRESETS[presetName];
  if (!preset) return;
  if (typeof pushUndo === 'function') pushUndo();

  var direction = document.getElementById('gradient-direction').value;

  document.getElementById('bg-color-picker').value = preset.stops[0].color;
  document.getElementById('bg-gradient-color2').value = preset.stops[preset.stops.length - 1].color;
  updateBackgroundSwatches(preset.stops[0].color);

  document.querySelectorAll('.gradient-preset-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.preset === presetName);
  });

  var grad = {
    color1: preset.stops[0].color,
    color2: preset.stops[preset.stops.length - 1].color,
    stops: preset.stops,
    direction: direction,
    preset: presetName
  };

  if (shouldApplyBackgroundToAllButtons()) {
    currentDesign.gradient = grad;
    currentDesign.backgroundColor = grad.color1;
    currentDesign.templateDraw = buildGradientDrawFunction(currentDesign.gradient);
    currentDesign.templateId = null;
    clearBackgroundOverridesForAllSlots();
    refreshAfterGlobalSectionApply();
  } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
    applyOverrideToSelectedSlots('gradient', grad);
  } else {
    if (currentMode === 'sheet') {
      preserveBackgroundOnCustomSlots();
    }
    var target = getActiveDesign();
    target.gradient = grad;
    target.templateDraw = buildGradientDrawFunction(target.gradient);
    target.templateId = null;
    renderDesignCanvas();
    if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
      refreshSheetThumbnails();
    }
  }
}

/**
 * Build a draw function for a gradient specification.
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

    var cssStops = preset.stops.map(function(s) {
      return s.color + ' ' + Math.round(s.offset * 100) + '%';
    }).join(', ');
    btn.style.background = 'linear-gradient(to right, ' + cssStops + ')';

    btn.addEventListener('click', function() {
      document.getElementById('toggle-gradient').checked = true;
      document.getElementById('gradient-controls').classList.remove('hidden');
      applyGradientPreset(key);
    });

    container.appendChild(btn);
  });
}

// Gradient Presets 
var GRADIENT_PRESETS = {
  rainbow: {
    label: 'Rainbow',
    stops: [
      { offset: 0,    color: '#E57575' },
      { offset: 0.17, color: '#E5B075' },
      { offset: 0.33, color: '#E5E575' },
      { offset: 0.50, color: '#75D075' },
      { offset: 0.67, color: '#7575DA' },
      { offset: 0.83, color: '#B075C5' },
      { offset: 1,    color: '#C575E5' }
    ]
  },
  'pride-progress': {
    label: 'Progress',
    stops: [
      { offset: 0,    color: '#858585' },
      { offset: 0.14, color: '#A58B70' },
      { offset: 0.28, color: '#DB7575' },
      { offset: 0.42, color: '#E5B580' },
      { offset: 0.57, color: '#E5DB75' },
      { offset: 0.71, color: '#75B575' },
      { offset: 0.85, color: '#759BE5' },
      { offset: 1,    color: '#B075BD' }
    ]
  },
  'pride-trans': {
    label: 'Trans',
    stops: [
      { offset: 0,    color: '#85C5E5' },
      { offset: 0.25, color: '#E5B5C5' },
      { offset: 0.5,  color: '#F0F0F0' },
      { offset: 0.75, color: '#E5B5C5' },
      { offset: 1,    color: '#85C5E5' }
    ]
  },
  'pride-bi': {
    label: 'Bisexual',
    stops: [
      { offset: 0,    color: '#D580A5' },
      { offset: 0.35, color: '#D580A5' },
      { offset: 0.5,  color: '#B08BB8' },
      { offset: 0.65, color: '#809AD5' },
      { offset: 1,    color: '#809AD5' }
    ]
  },
  'pride-pan': {
    label: 'Pansexual',
    stops: [
      { offset: 0,    color: '#E585B0' },
      { offset: 0.33, color: '#E5D080' },
      { offset: 0.67, color: '#80BCE5' },
      { offset: 1,    color: '#80BCE5' }
    ]
  },
  'pride-nonbinary': {
    label: 'Non-binary',
    stops: [
      { offset: 0,    color: '#E5E075' },
      { offset: 0.33, color: '#F0F0F0' },
      { offset: 0.67, color: '#B590D5' },
      { offset: 1,    color: '#9A9A9A' }
    ]
  },
  'pride-lesbian': {
    label: 'Lesbian',
    stops: [
      { offset: 0,    color: '#D58065' },
      { offset: 0.17, color: '#E0A075' },
      { offset: 0.33, color: '#E5B585' },
      { offset: 0.50, color: '#F0F0F0' },
      { offset: 0.67, color: '#D595B5' },
      { offset: 0.83, color: '#C58AA5' },
      { offset: 1,    color: '#B5709A' }
    ]
  },
  'pride-ace': {
    label: 'Asexual',
    stops: [
      { offset: 0,    color: '#858585' },
      { offset: 0.33, color: '#B5B5B5' },
      { offset: 0.67, color: '#F0F0F0' },
      { offset: 1,    color: '#B580B5' }
    ]
  },
  'pride-gay': {
    label: 'Gay Men',
    stops: [
      { offset: 0,    color: '#75BCA5' },
      { offset: 0.17, color: '#80D0B5' },
      { offset: 0.33, color: '#A0DBC0' },
      { offset: 0.50, color: '#F0F0F0' },
      { offset: 0.67, color: '#9AB5D5' },
      { offset: 0.83, color: '#9085C5' },
      { offset: 1,    color: '#9A80B5' }
    ]
  },
  'pride-aroace': {
    label: 'Aro/Ace',
    stops: [
      { offset: 0,    color: '#DBB570' },
      { offset: 0.25, color: '#E0C580' },
      { offset: 0.50, color: '#F0F0F0' },
      { offset: 0.75, color: '#90B5D5' },
      { offset: 1,    color: '#809DB5' }
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
  var btnFit = document.getElementById('btn-zoom-fit');

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

  if (btnFit) {
    btnFit.addEventListener('click', function() {
      setCurrentZoom(computeFitToScreenZoom());
      applyZoom();
    });
  }

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

function getCurrentZoom() {
  return currentMode === 'sheet' ? sheetZoom : designZoom;
}

function setCurrentZoom(val) {
  if (currentMode === 'sheet') {
    sheetZoom = val;
  } else {
    designZoom = val;
  }
}

function applyZoom() {
  var wrapper = document.getElementById('design-canvas-wrapper');
  var sheetView = document.getElementById('sheet-view');
  var label = document.getElementById('btn-zoom-reset');

  wrapper.style.zoom = designZoom;
  sheetView.style.zoom = sheetZoom;

  var scrollContainer = document.getElementById('canvas-area-scroll');
  var activeZoom = getCurrentZoom();
  if (activeZoom === 1.0 && scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }

  label.textContent = Math.round(activeZoom * 100) + '%';
}

function computeFitToScreenZoom() {
  var scrollContainer = document.getElementById('canvas-area-scroll');
  if (!scrollContainer) return 1.0;

  var containerW = scrollContainer.clientWidth;
  var containerH = scrollContainer.clientHeight;

  var pageW = CONFIG.PAGE.width * 96;
  var pageH = CONFIG.PAGE.height * 96;

  var extraW = 80;  
  var extraH = 40;  

  if (currentMode === 'sheet') {
    var nameRow = document.querySelector('.sheet-name-row');
    var controls = document.getElementById('sheet-controls');
    var colHeaders = document.querySelector('.sheet-col-headers');
    
    var nameH = nameRow ? nameRow.offsetHeight + 8 : 40;
    var controlsH = controls ? controls.offsetHeight + 8 : 40;
    var colHeadH = colHeaders ? colHeaders.offsetHeight + 8 : 40;
    
    extraH += (nameH + controlsH + colHeadH);
  }

  var fitZoom = Math.min(containerW / (pageW + extraW), containerH / (pageH + extraH));
  fitZoom *= 0.98;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
}

function resetDesignToDefaults() {
  // Clear slot edit state if active
  _slotEditDesign = null;
  _editingSlotIndex = null;

  currentDesign.templateId = 'blank';
  currentDesign.backgroundColor = CONFIG.DEFAULTS.backgroundColor;
  currentDesign.templateDraw = null;
  currentDesign.gradient = null;
  currentDesign.textElements = [];
  currentDesign.imageElements = [];
  currentDesign.libraryInfoText = CONFIG.DEFAULTS.libraryInfoText;
  currentDesign.libraryInfoColor = CONFIG.DEFAULTS.libraryInfoColor;

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

  applyTemplate('blank');
}

function handleBackgroundColorChange(color) {
  if (shouldApplyBackgroundToAllButtons()) {
    applyBackgroundSettingsToAllButtons();
  } else if (currentMode === 'sheet' && selectedSlots.length > 0) {
    applyOverrideToSelectedSlots('backgroundColor', color);
    if (document.getElementById('toggle-gradient').checked) {
      applyGradientOverrideToSelectedSlots();
    } else {
      // Clear stale gradient/template overrides so solid color isn't masked
      selectedSlots.forEach(function(slotIndex) {
        var slot = sheetSlots[slotIndex];
        if (slot && slot.overrides) {
          delete slot.overrides.gradient;
          delete slot.overrides.templateId;
        }
      });
      refreshSheetThumbnails();
    }
  } else {
    if (currentMode === 'sheet') {
      preserveBackgroundOnCustomSlots();
    }
    setBackgroundColor(color);
    if (document.getElementById('toggle-gradient').checked) {
      applyGradientFromUI();
    }
  }
  updateBackgroundSwatches(color);
}

document.addEventListener('DOMContentLoaded', initApp);