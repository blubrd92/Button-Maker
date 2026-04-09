/**
 * pdf-export.js
 *
 * Generates print-ready tiled PDFs of button designs.
 *
 * Responsibilities:
 * - Tiling button designs onto US Letter pages
 * - Drawing cut line guides (toggleable)
 * - Rendering all design elements at print DPI for accuracy
 *
 * Depends on:
 * - config.js (button dimensions, layout constants, DPI, PDF settings)
 * - canvas.js (renderButtonDesign for shared rendering)
 * - templates.js (template draw functions)
 * - jsPDF (external library, loaded via CDN)
 */

/**
 * Generate and download a PDF with tiled button designs.
 *
 * @param {Object} [options] - Export options
 * @param {boolean} [options.showCutGuides] - Draw cut circle guides on each button
 */
function generatePDF(options) {
  options = options || {};
  var showCutGuides = options.showCutGuides !== undefined ? options.showCutGuides : CONFIG.PDF.showCutGuides;

  // Resolve jsPDF constructor across possible global shapes
  var jsPDFConstructor = null;
  if (window.jspdf && window.jspdf.jsPDF) {
    jsPDFConstructor = window.jspdf.jsPDF;
  } else if (window.jspdf && window.jspdf.default) {
    jsPDFConstructor = window.jspdf.default;
  } else if (window.jsPDF) {
    jsPDFConstructor = window.jsPDF;
  }
  if (!jsPDFConstructor) {
    alert('PDF library (jsPDF) is not loaded. Check your internet connection and reload the page.');
    return;
  }

  var layout = getCurrentLayout();
  if (!layout) {
    alert('Invalid layout. Please select a valid button size and try again.');
    return;
  }

  var btnSize = getCurrentButtonSize();
  var gutters = computeSheetGutters();
  var columnGutter = gutters.columnGutter;
  var rowGutter = gutters.rowGutter;
  var columnInset = gutters.columnInset || 0;
  var rowInset = gutters.rowInset || 0;

  var totalButtons = layout.cols * layout.rows;
  var buttonDesigns = getButtonDesignsForExport(totalButtons);

  // Each button rendered at CONFIG.DPI as an offscreen canvas image.
  // Force even pixel count so the center falls on an integer pixel,
  // which prevents asymmetric anti-aliasing on arc clip paths (the
  // half-pixel center causes jagged edges in some quadrants).
  var printPixels = Math.ceil(btnSize.cutDiameter * CONFIG.DPI);
  if (printPixels % 2 !== 0) printPixels++;

  // Show notification and defer the heavy rendering so the browser
  // has a chance to paint the message before the synchronous loop blocks.
  if (typeof showNotification === 'function') {
    showNotification('Generating PDF, please wait\u2026', 'info', false);
  }

  setTimeout(function() {
  try {
    var doc = new jsPDFConstructor({
      orientation: 'portrait',
      unit: 'in',
      format: 'letter',
      compress: CONFIG.PDF.compress
    });

    for (var row = 0; row < layout.rows; row++) {
      for (var col = 0; col < layout.cols; col++) {
        var slotIndex = row * layout.cols + col;
        var design = buttonDesigns[slotIndex];

        var offCanvas = document.createElement('canvas');
        offCanvas.width = printPixels;
        offCanvas.height = printPixels;
        var offCtx = offCanvas.getContext('2d');
        offCtx.imageSmoothingEnabled = true;
        offCtx.imageSmoothingQuality = 'high';

        var printScale = CONFIG.DPI;
        var printCx = printPixels / 2;
        var printCy = printPixels / 2;

        // Fill white background for JPEG (no transparency support)
        if ((CONFIG.PDF.imageFormat || 'JPEG') === 'JPEG') {
          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, printPixels, printPixels);
        }

        renderButtonDesign(offCtx, printCx, printCy, printScale, design, {
          showCutGuide: showCutGuides,
          isPrint: true
        });

        var cellX = CONFIG.PAGE.margin + columnInset + col * (btnSize.cutDiameter + columnGutter);
        var cellY = CONFIG.PAGE.margin + rowInset + row * (btnSize.cutDiameter + rowGutter);

        var imgFormat = CONFIG.PDF.imageFormat || 'JPEG';
        var imgMime = imgFormat === 'JPEG' ? 'image/jpeg' : 'image/png';
        var imgData = imgFormat === 'JPEG'
          ? offCanvas.toDataURL(imgMime, CONFIG.PDF.imageQuality || 0.92)
          : offCanvas.toDataURL(imgMime);
        doc.addImage(imgData, imgFormat, cellX, cellY, btnSize.cutDiameter, btnSize.cutDiameter);
      }
    }

    // Use button size and sheet name as filename, fallback to 'buttons'
    var baseName = (typeof sheetName === 'string' && sheetName.trim())
      ? sheetName.trim()
      : 'buttons';
    var sizeSlug = CONFIG.currentButtonSize + 'in';
    var filename = sizeSlug + ' - ' + baseName + '.pdf';
    doc.save(filename);

    if (typeof showNotification === 'function') {
      showNotification('PDF saved!', 'success', true);
    }

  } catch (err) {
    console.error('PDF generation failed:', err);
    if (typeof showNotification === 'function') {
      showNotification('PDF generation failed: ' + err.message, 'error', true);
    } else {
      alert('PDF generation failed: ' + err.message);
    }
  }
  }, 50);
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
    gradient: design.gradient || null,
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
    // (but preserve gradient if present on master)
    if (!design.gradient) {
      design.templateDraw = null;
    }
  }
  if (overrides.gradient !== undefined) {
    design.gradient = overrides.gradient
      ? JSON.parse(JSON.stringify(overrides.gradient))
      : null;

    if (design.gradient && typeof buildGradientDrawFunction === 'function') {
      design.templateDraw = buildGradientDrawFunction(design.gradient);
      design.templateId = null;
    } else {
      // Gradient explicitly disabled for this slot: do not inherit prior
      // template/gradient draw state from the master design clone.
      design.templateDraw = null;
      design.templateId = null;
    }
  }
  if (overrides.templateId !== undefined) {
    design.templateId = overrides.templateId;
    // "blank" is the default solid-fill state, not a visual template.
    // Its draw function fills white regardless of backgroundColor,
    // so skip restoring it to let backgroundColor render correctly.
    if (overrides.templateId && overrides.templateId !== 'blank') {
      const template = getTemplateById(overrides.templateId);
      design.templateDraw = template ? template.draw : null;
    } else {
      design.templateDraw = null;
    }
  }
  if (overrides.textElements !== undefined) {
    design.textElements = overrides.textElements.map(t => ({ ...t }));
  }
  if (overrides.imageElements !== undefined) {
    design.imageElements = overrides.imageElements.map(function(img) {
      // Hydrate fully so imgObj is reconstructed from assetId or dataUrl
      if (!img.imgObj) {
        return (typeof hydrateImageElement === 'function')
          ? hydrateImageElement(img)
          : { ...img };
      }
      return { ...img };
    });
  }
  if (overrides.libraryInfoText !== undefined) {
    design.libraryInfoText = overrides.libraryInfoText;
  }
  if (overrides.libraryInfoColor !== undefined) {
    design.libraryInfoColor = overrides.libraryInfoColor;
  }
}

/**
 * Initialize PDF export: wire up the export button.
 * Called once from app.js.
 */
function initPDFExport() {
  const exportBtn = document.getElementById('btn-export');
  
  exportBtn.addEventListener('click', function() {
    generatePDF({ showCutGuides: true });
  });
}