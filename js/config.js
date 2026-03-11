/**
 * config.js
 *
 * Central configuration for the Button Maker application.
 */

const CONFIG = {

  // Print resolution
  DPI: 300,             
  SCREEN_DPI: 96,       

  // Canvas display settings
  CANVAS_DISPLAY_DIAMETER: 500,

  // Button size definitions
  BUTTON_SIZES: {
    "1.5": {
      label: '1.5"',
      cutDiameter: 1.837,     // inches
      faceDiameter: 1.5,      // inches
      safeDiameter: 1.35,     // inches
      primary: true
    },
    "1.25": {
      label: '1.25"',
      cutDiameter: 1.629,     // inches
      faceDiameter: 1.3,     // inches
      safeDiameter: 1.15,     // inches
      primary: false
    }
  },

  currentButtonSize: "1.5",

  // Page & layout constants (US Letter)
  PAGE: {
    width: 8.5,           // inches
    height: 11,           // inches
    margin: 0.3           // inches on all sides
  },

  // Sheet tiling layouts mapped directly to button size
  SHEET_LAYOUTS: {
    "1.5": {
      label: "Standard (20)",
      description: "4 columns x 5 rows",
      cols: 4,
      rows: 5
    },
    "1.25": {
      label: "Standard (24)",
      description: "4 columns x 6 rows",
      cols: 4,
      rows: 6
    }
  },

  // Guide circle styles
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

  // Font list
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

  // Color palette
  COLOR_PALETTE: [
    "#FFFFFF",   // White
    "#1A202C",   // Rich Black
    "#2B6CB0",   // Marin Blue
    "#C53030",   // Crimson Red
    "#2F855A",   // Forest Green
    "#D69E2E",   // Warm Amber
    "#6B46C1",   // Royal Purple
    "#D53F8C",   // Vibrant Pink
    "#2C7A7B",   // Deep Teal
    "#718096"    // Neutral Slate
  ],

  // Default design values
  DEFAULTS: {
    backgroundColor: "#FFFFFF",
    fontFamily: "Roboto",
    libraryInfoFontSize: 4.5,  // points (at print size)
    libraryInfoColor: "#000000",
    libraryInfoText: ""
  },

  // PDF export settings
  PDF: {
    showCutGuides: true,         // whether to draw cut circles on the PDF
    pointsPerInch: 72            // jsPDF uses 72 points per inch
  }
};


// Helper functions

function getCurrentButtonSize() {
  return CONFIG.BUTTON_SIZES[CONFIG.currentButtonSize];
}

function getCurrentLayout() {
  return CONFIG.SHEET_LAYOUTS[CONFIG.currentButtonSize];
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

function computeSheetGutters() {
  const layout = getCurrentLayout();
  const size = getCurrentButtonSize();
  const usableWidth = CONFIG.PAGE.width - 2 * CONFIG.PAGE.margin;
  const usableHeight = CONFIG.PAGE.height - 2 * CONFIG.PAGE.margin;
  
  const rowGutter = (usableHeight - layout.rows * size.cutDiameter) / (layout.rows - 1);
  const columnGutter = (usableWidth - layout.cols * size.cutDiameter) / (layout.cols - 1);
  const columnInset = 0;

  return { columnGutter, rowGutter, columnInset, usableWidth, usableHeight };
}
