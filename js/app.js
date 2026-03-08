/**
 * app.js
 *
 * Main application initialization and top-level event wiring.
 *
 * Responsibilities:
 * - Initializing all modules in the correct order
 * - Wiring up top-level UI controls (guides toggle, background pickers)
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
let currentMode = 'design'; // 'design' or 'sheet'

/**
 * Main initialization function. Called when the DOM is ready.
 */
function initApp() {
  // ── 1. Render template picker ──
  renderTemplatePicker();

  // ── 2. Initialize the design canvas ──
  initDesignCanvas();

  // ── 3. Initialize tools ──
  initTextTool();
  initImageTool();

  // ── 4. Initialize save/load ──
  initStorage();

  // ── 5. Initialize PDF export ──
  initPDFExport();

  // ── 6. Initialize sheet mode ──
  initSheetMode();

  // ── 7. Wire up top-level controls ──
  initTopLevelControls();

  // ── 8. Apply default template ──
  applyTemplate('blank');

  console.log('Button Maker initialized.');
}

/**
 * Wire up controls that don't belong to a specific module.
 */
function initTopLevelControls() {
  // ── Guides toggle ──
  document.getElementById('toggle-guides').addEventListener('change', (e) => {
    CONFIG.guidesVisible = e.target.checked;
    renderDesignCanvas();
  });

  // ── Background color swatches ──
  const swatchContainer = document.getElementById('bg-color-swatches');
  CONFIG.COLOR_PALETTE.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;

    // White swatch needs a visible border
    if (color === '#FFFFFF') {
      swatch.style.borderColor = '#ccc';
    }

    swatch.addEventListener('click', () => {
      handleBackgroundColorChange(color);
      document.getElementById('bg-color-picker').value = color;
    });

    swatchContainer.appendChild(swatch);
  });

  // ── Background custom color picker ──
  document.getElementById('bg-color-picker').addEventListener('input', (e) => {
    handleBackgroundColorChange(e.target.value);
  });

  // ── Library info text ──
  document.getElementById('library-info-input').addEventListener('input', (e) => {
    if (currentMode === 'sheet' && selectedSlots.length > 0) {
      applyOverrideToSelectedSlots('libraryInfoText', e.target.value);
    } else {
      currentDesign.libraryInfoText = e.target.value;
      renderDesignCanvas();
    }
  });

  document.getElementById('library-info-color').addEventListener('input', (e) => {
    if (currentMode === 'sheet' && selectedSlots.length > 0) {
      applyOverrideToSelectedSlots('libraryInfoColor', e.target.value);
    } else {
      currentDesign.libraryInfoColor = e.target.value;
      renderDesignCanvas();
    }
  });

  // ── Mode toggle tracking ──
  document.getElementById('btn-design-mode').addEventListener('click', () => {
    currentMode = 'design';
  });
  document.getElementById('btn-sheet-mode').addEventListener('click', () => {
    currentMode = 'sheet';
  });
}

/**
 * Handle background color change. In design mode, updates the master.
 * In sheet mode with selected slots, applies as overrides.
 * @param {string} color - hex color
 */
function handleBackgroundColorChange(color) {
  if (currentMode === 'sheet' && selectedSlots.length > 0) {
    applyOverrideToSelectedSlots('backgroundColor', color);
  } else {
    setBackgroundColor(color);
  }
  updateBackgroundSwatches(color);
}

// ── Start the app when DOM is ready ──
document.addEventListener('DOMContentLoaded', initApp);
