/**
 * pdf-export.js
 *
 * Generates print-ready tiled PDFs of button designs.
 *
 * Responsibilities:
 * - Tiling button designs onto US Letter pages (15 or 20 per sheet)
 * - Drawing cut line guides (toggleable)
 * - Rendering all design elements at 300 DPI for print accuracy
 *
 * Depends on:
 * - config.js (button dimensions, layout constants, DPI, PDF settings)
 * - canvas.js (renderButtonDesign for shared rendering)
 * - templates.js (template draw functions)
 * - jsPDF (external library, loaded via CDN)
 *
 * Gotchas:
 * - All measurements are in inches internally. jsPDF uses points (72 per inch).
 *   Convert with inchesToPoints(). Do NOT use pixel values here.
 * - The curved library info text must be re-rendered at print DPI,
 *   not copied from the screen canvas, or it will be blurry.
 * - Each button is rendered to an offscreen canvas at 300 DPI, then
 *   placed as an image in the PDF. This ensures text and curves
 *   are crisp at print resolution.
 */

/**
 * Generate and download a PDF with tiled button designs.
 *
 * @param {Object} [options] - Export options
 * @param {string} [options.layout] - Layout key ("15" or "20"), defaults to current
 * @param {boolean} [options.showCutGuides] - Draw cut circle guides on each button
 */
function generatePDF(options = {}) {
  const layoutKey = options.layout || CONFIG.currentLayout;
  const showCutGuides = options.showCutGuides !== undefined ? options.showCutGuides : CONFIG.PDF.showCutGuides;

  const layout = CONFIG.SHEET_LAYOUTS[layoutKey];
  const btnSize = getCurrentButtonSize();
  const { columnGutter, rowGutter } = computeSheetGutters(layoutKey);

  // Total buttons on the sheet
  const totalButtons = layout.cols * layout.rows;

  // Get per-button designs (master + overrides from sheet mode)
  const buttonDesigns = getButtonDesignsForExport(totalButtons);

  // ── Create offscreen canvases for each button at 300 DPI ──
  // Each button is rendered as a square image at cutDiameter * DPI pixels
  const printPixels = Math.ceil(btnSize.cutDiameter * CONFIG.DPI);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  // Render each button and place on the PDF
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const slotIndex = row * layout.cols + col;
      const design = buttonDesigns[slotIndex];

      // Create offscreen canvas for this button
      const offCanvas = document.createElement('canvas');
      offCanvas.width = printPixels;
      offCanvas.height = printPixels;
      const offCtx = offCanvas.getContext('2d');

      // Render the button design at print resolution
      const printScale = CONFIG.DPI; // pixels per inch at 300 DPI
      const printCx = printPixels / 2;
      const printCy = printPixels / 2;

      renderButtonDesign(offCtx, printCx, printCy, printScale, design, {
        showCutGuide: showCutGuides,
        isPrint: true
      });

      // Position on the PDF page (in inches)
      // Each button is centered in its grid cell
      // Cell position: margin + col * (cutDiameter + columnGutter)
      const cellX = CONFIG.PAGE.margin + col * (btnSize.cutDiameter + columnGutter);
      const cellY = CONFIG.PAGE.margin + row * (btnSize.cutDiameter + rowGutter);

      // Add the rendered button as an image to the PDF
      const imgData = offCanvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', cellX, cellY, btnSize.cutDiameter, btnSize.cutDiameter);
    }
  }

  // Save the PDF
  doc.save('buttons.pdf');
}

/**
 * Get an array of design objects for each button slot on the sheet.
 * Applies per-button overrides from sheet mode on top of the master design.
 *
 * @param {number} totalButtons - Number of button slots
 * @returns {Array<Object>} Array of design objects, one per slot
 */
function getButtonDesignsForExport(totalButtons) {
  const designs = [];

  for (let i = 0; i < totalButtons; i++) {
    // Start with a copy of the master design
    const design = cloneDesignForRender(currentDesign);

    // Apply overrides from sheet mode if available
    if (typeof getSlotOverrides === 'function') {
      const overrides = getSlotOverrides(i);
      if (overrides && Object.keys(overrides).length > 0) {
        applyOverridesToDesign(design, overrides);
      }
    }

    designs.push(design);
  }

  return designs;
}

/**
 * Create a shallow clone of a design suitable for rendering.
 * Copies arrays so modifications don't affect the master.
 *
 * @param {Object} design - The design to clone
 * @returns {Object} Cloned design
 */
function cloneDesignForRender(design) {
  return {
    templateId: design.templateId,
    backgroundColor: design.backgroundColor,
    templateDraw: design.templateDraw,
    textElements: design.textElements.map(t => ({ ...t })),
    imageElements: design.imageElements.map(img => ({ ...img })),
    libraryInfoText: design.libraryInfoText,
    libraryInfoColor: design.libraryInfoColor
  };
}

/**
 * Apply override properties to a design object.
 * Only overrides that are explicitly set replace the master values.
 *
 * @param {Object} design - The design to modify
 * @param {Object} overrides - Override properties
 */
function applyOverridesToDesign(design, overrides) {
  if (overrides.backgroundColor !== undefined) {
    design.backgroundColor = overrides.backgroundColor;
    // If background color is overridden, clear template draw
    design.templateDraw = null;
  }
  if (overrides.templateId !== undefined) {
    design.templateId = overrides.templateId;
    const template = getTemplateById(overrides.templateId);
    design.templateDraw = template ? template.draw : null;
  }
  if (overrides.textElements !== undefined) {
    design.textElements = overrides.textElements.map(t => ({ ...t }));
  }
  if (overrides.imageElements !== undefined) {
    design.imageElements = overrides.imageElements.map(img => ({ ...img }));
  }
  if (overrides.libraryInfoText !== undefined) {
    design.libraryInfoText = overrides.libraryInfoText;
  }
  if (overrides.libraryInfoColor !== undefined) {
    design.libraryInfoColor = overrides.libraryInfoColor;
  }
}

/**
 * Initialize PDF export: wire up the export button and modal controls.
 * Called once from app.js.
 */
function initPDFExport() {
  const exportBtn = document.getElementById('btn-export');
  const modal = document.getElementById('export-modal');
  const cancelBtn = document.getElementById('btn-export-cancel');
  const confirmBtn = document.getElementById('btn-export-confirm');
  const backdrop = modal.querySelector('.modal-backdrop');

  // Open modal
  exportBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
  });

  // Close modal
  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  backdrop.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Generate PDF
  confirmBtn.addEventListener('click', () => {
    const layoutRadio = document.querySelector('input[name="layout"]:checked');
    const layout = layoutRadio ? layoutRadio.value : CONFIG.currentLayout;
    const showCutGuides = document.getElementById('export-cut-guides').checked;

    CONFIG.currentLayout = layout;

    generatePDF({ layout, showCutGuides });
    modal.classList.add('hidden');
  });
}
