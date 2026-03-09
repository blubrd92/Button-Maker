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
 * update SHEET_LAYOUTS if the new size needs different tiling.
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

  // Currently selected layout key - Defaulted to 20
  currentLayout: "20",

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

  guidesVisible: true,
  WRAP_ZONE_DIM: "rgba(0, 0, 0, 0.08)",

  // ─── Font list ──────────────────────────────────────────────────────
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

  // ─── PDF export settings ────────────────────────────────────────────
  PDF: {
    showCutGuides: true,         // whether to draw cut circles on the PDF
    pointsPerInch: 72            // jsPDF uses 72 points per inch
  }
};


// ─── Helper functions ───────────────────────────────────────────────

function getCurrentButtonSize() {
  return CONFIG.BUTTON_SIZES[CONFIG.currentButtonSize];
}

function getCurrentLayout() {
  return CONFIG.SHEET_LAYOUTS[CONFIG.currentLayout];
}

function inchesToPrintPixels(inches) {
  return inches * CONFIG.DPI;
}

function inchesToPoints(inches) {
  return inches * CONFIG.PDF.pointsPerInch;
}

function getCanvasScale() {
  const size = getCurrentButtonSize();
  return CONFIG.CANVAS_DISPLAY_DIAMETER / size.cutDiameter;
}

function inchesToCanvasPixels(inches) {
  return inches * getCanvasScale();
}

function computeSheetGutters(layoutKey) {
  const layout = CONFIG.SHEET_LAYOUTS[layoutKey || CONFIG.currentLayout];
  const size = getCurrentButtonSize();
  const usableWidth = CONFIG.PAGE.width - 2 * CONFIG.PAGE.margin;
  const usableHeight = CONFIG.PAGE.height - 2 * CONFIG.PAGE.margin;
  const rowGutter = (usableHeight - layout.rows * size.cutDiameter) / (layout.rows - 1);

  var columnGutter, columnInset;
  if (layout.cols === 3) {
    var totalWhitespace = usableWidth - layout.cols * size.cutDiameter;
    columnGutter = totalWhitespace / 4;
    columnInset = columnGutter;
  } else {
    columnGutter = (usableWidth - layout.cols * size.cutDiameter) / (layout.cols - 1);
    columnInset = 0;
  }

  return { columnGutter, rowGutter, columnInset, usableWidth, usableHeight };
}