/**
 * config.js
 *
 * Central configuration for the Button Maker application.
 *
 * Responsibilities:
 * - Defines all button size dimensions (cut, face, safe zone)
 * - Stores layout math for PDF tiling (margins, gutters, rows/columns)
 * - Lists available fonts, colors, and template metadata
 * - Provides coordinate conversion helpers (inches <-> pixels)
 *
 * Depends on:
 * - Nothing. This file has no dependencies.
 *
 * Gotchas:
 * - All physical measurements are in INCHES. Screen display uses pixels.
 * - DPI (300) is used for print rendering. SCREEN_DPI is for canvas display.
 * - To add a new button size, add an entry to BUTTON_SIZES and optionally
 *   update SHEET_LAYOUTS if the new size needs different tiling.
 */

const CONFIG = {

  // ─── Print resolution ───────────────────────────────────────────────
  DPI: 300,             // Print resolution (dots per inch)
  SCREEN_DPI: 96,       // Standard screen resolution for reference

  // ─── Canvas display settings ────────────────────────────────────────
  // The editing canvas shows the button much larger than actual size.
  // CANVAS_DISPLAY_DIAMETER is the on-screen pixel diameter for editing.
  CANVAS_DISPLAY_DIAMETER: 500,

  // ─── Button size definitions ────────────────────────────────────────
  // Each size stores physical dimensions in inches.
  // cutDiameter:  where the paper is physically cut
  // faceDiameter: the visible front of the finished button
  // safeDiameter: all important content must stay inside this circle
  BUTTON_SIZES: {
    "1.5": {
      label: '1.5"',
      cutDiameter: 1.837,     // inches
      faceDiameter: 1.5,      // inches
      safeDiameter: 1.35,     // inches
      primary: true
    }
    // Future sizes can be added here, e.g.:
    // "2.25": { label: '2.25"', cutDiameter: 2.625, faceDiameter: 2.25, safeDiameter: 2.0 }
  },

  // The currently selected button size key (matches a key in BUTTON_SIZES)
  currentButtonSize: "1.5",

  // ─── Page & layout constants (US Letter) ────────────────────────────
  PAGE: {
    width: 8.5,           // inches
    height: 11,           // inches
    margin: 0.25          // inches on all sides
  },

  // ─── Sheet tiling layouts ───────────────────────────────────────────
  // Each layout defines how buttons are arranged on a US Letter page.
  // Gutters are computed automatically from page size, margins, button size,
  // and the number of rows/columns.
  //
  // usableWidth  = PAGE.width  - 2 * PAGE.margin = 8.0"
  // usableHeight = PAGE.height - 2 * PAGE.margin = 10.5"
  //
  // columnGutter = (usableWidth  - cols * cutDiameter) / (cols - 1)
  // rowGutter    = (usableHeight - rows * cutDiameter) / (rows - 1)
  SHEET_LAYOUTS: {
    "15": {
      label: "Standard (15)",
      description: "3 columns × 5 rows — generous gutters for easy cutting",
      cols: 3,
      rows: 5
    },
    "20": {
      label: "Max (20)",
      description: "4 columns × 5 rows — tighter fit, maximizes yield",
      cols: 4,
      rows: 5
    }
  },

  // Currently selected layout key
  currentLayout: "15",

  // ─── Guide circle styles ───────────────────────────────────────────
  GUIDES: {
    cutLine: {
      color: "rgba(255, 80, 80, 0.6)",
      lineWidth: 1.5,
      dashPattern: [6, 4],
      label: "Cut Line"
    },
    buttonEdge: {
      color: "rgba(50, 50, 50, 0.8)",
      lineWidth: 2,
      dashPattern: [],            // solid line
      label: "Button Edge"
    },
    safeZone: {
      color: "rgba(80, 150, 255, 0.5)",
      lineWidth: 1,
      dashPattern: [4, 4],
      label: "Safe Zone"
    }
  },

  // Whether guide circles are currently visible
  guidesVisible: true,

  // ─── Wrap zone dimming ──────────────────────────────────────────────
  // The area between the button face and cut circle is dimmed in the editor
  // to show the user that content there will wrap behind the button.
  WRAP_ZONE_DIM: "rgba(0, 0, 0, 0.08)",

  // ─── Font list ──────────────────────────────────────────────────────
  // Google Fonts loaded for the text tool. Each entry has:
  //   family: the Google Fonts family name (used in CSS and canvas)
  //   category: serif | sans-serif | display | handwriting
  FONTS: [
    { family: "Roboto", category: "sans-serif" },
    { family: "Merriweather", category: "serif" },
    { family: "Open Sans", category: "sans-serif" },
    { family: "Playfair Display", category: "serif" },
    { family: "Pacifico", category: "handwriting" },
    { family: "Oswald", category: "sans-serif" },
    { family: "Lobster", category: "display" },
    { family: "Lora", category: "serif" }
  ],

  // ─── Color palette ─────────────────────────────────────────────────
  // Preset swatches for background and text color pickers.
  // Library-friendly palette plus bold accent options.
  COLOR_PALETTE: [
    "#FFFFFF",   // White
    "#222222",   // Near Black
    "#4A90D9",   // Library Blue
    "#2ECC71",   // Emerald Green
    "#E74C3C",   // Crimson Red
    "#F39C12",   // Amber
    "#9B59B6",   // Purple
    "#1ABC9C",   // Teal
    "#E91E63",   // Pink
    "#34495E"    // Slate
  ],

  // ─── Default design values ──────────────────────────────────────────
  DEFAULTS: {
    backgroundColor: "#FFFFFF",
    textColor: "#222222",
    fontFamily: "Roboto",
    fontSize: 24,              // points (at print size)
    libraryInfoFontSize: 4.3,  // points (at print size) — intentionally small
    libraryInfoColor: "#666666",
    libraryInfoText: ""
  },

  // ─── Template system ────────────────────────────────────────────────
  // Templates are defined in templates.js but their metadata keys are
  // referenced here for consistency. See templates.js for full definitions.

  // ─── PDF export settings ────────────────────────────────────────────
  PDF: {
    showCutGuides: true,         // whether to draw cut circles on the PDF
    pointsPerInch: 72            // jsPDF uses 72 points per inch
  }
};


// ─── Helper functions ───────────────────────────────────────────────

/**
 * Get the current button size configuration object.
 * @returns {Object} The size object with cutDiameter, faceDiameter, safeDiameter
 */
function getCurrentButtonSize() {
  return CONFIG.BUTTON_SIZES[CONFIG.currentButtonSize];
}

/**
 * Get the current sheet layout configuration object.
 * @returns {Object} The layout with cols, rows, label, description
 */
function getCurrentLayout() {
  return CONFIG.SHEET_LAYOUTS[CONFIG.currentLayout];
}

/**
 * Convert inches to pixels at print DPI (300).
 * Use this for internal print-resolution calculations.
 * @param {number} inches
 * @returns {number} pixels at 300 DPI
 */
function inchesToPrintPixels(inches) {
  return inches * CONFIG.DPI;
}

/**
 * Convert inches to points for jsPDF (72 points per inch).
 * @param {number} inches
 * @returns {number} points
 */
function inchesToPoints(inches) {
  return inches * CONFIG.PDF.pointsPerInch;
}

/**
 * Compute the scale factor from physical inches to canvas display pixels.
 * This maps the full cut circle diameter to CANVAS_DISPLAY_DIAMETER.
 * @returns {number} pixels per inch for the editing canvas
 */
function getCanvasScale() {
  const size = getCurrentButtonSize();
  return CONFIG.CANVAS_DISPLAY_DIAMETER / size.cutDiameter;
}

/**
 * Convert inches to canvas display pixels (for the editing view).
 * @param {number} inches
 * @returns {number} pixels on the editing canvas
 */
function inchesToCanvasPixels(inches) {
  return inches * getCanvasScale();
}

/**
 * Compute sheet layout gutters for the current button size and layout.
 * Returns an object with columnGutter, rowGutter, and columnInset in inches.
 *
 * For 3-column layouts, whitespace is distributed evenly between gaps and
 * side margins (columnInset), so side columns sit centered between the
 * center column and the page edges. For 4-column layouts, columns start
 * flush at the margin with equal internal gaps only.
 *
 * @param {string} [layoutKey] - optional layout key, defaults to current
 * @returns {{ columnGutter: number, rowGutter: number, columnInset: number, usableWidth: number, usableHeight: number }}
 */
function computeSheetGutters(layoutKey) {
  const layout = CONFIG.SHEET_LAYOUTS[layoutKey || CONFIG.currentLayout];
  const size = getCurrentButtonSize();
  const usableWidth = CONFIG.PAGE.width - 2 * CONFIG.PAGE.margin;
  const usableHeight = CONFIG.PAGE.height - 2 * CONFIG.PAGE.margin;
  const rowGutter = (usableHeight - layout.rows * size.cutDiameter) / (layout.rows - 1);

  var columnGutter, columnInset;
  if (layout.cols === 3) {
    // Distribute whitespace evenly: 2 gaps + 2 side margins = 4 equal spaces
    var totalWhitespace = usableWidth - layout.cols * size.cutDiameter;
    columnGutter = totalWhitespace / 4;
    columnInset = columnGutter;
  } else {
    // 4+ columns: flush at margins, equal internal gaps
    columnGutter = (usableWidth - layout.cols * size.cutDiameter) / (layout.cols - 1);
    columnInset = 0;
  }

  return { columnGutter, rowGutter, columnInset, usableWidth, usableHeight };
}
