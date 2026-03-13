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
    "1": {
      label: '1"',
      cutDiameter: 1.313,     // inches
      faceDiameter: 1.0,      // inches
      safeDiameter: 0.875,     // inches
      primary: false
    },
    "1.25": {
      label: '1.25"',
      cutDiameter: 1.629,     // inches
      faceDiameter: 1.3,     // inches - Made a little bigger than the strict face diameter to better fit brand text under safe diameter
      safeDiameter: 1.15,     // inches
      primary: false
    },
    "1.5": {
      label: '1.5"',
      cutDiameter: 1.837,     // inches
      faceDiameter: 1.5,      // inches
      safeDiameter: 1.35,     // inches
      primary: true
    },
    "1.75": {
      label: '1.75"',
      cutDiameter: 2.088,     // inches
      faceDiameter: 1.75,     // inches
      safeDiameter: 1.575,    // inches
      primary: false
    },
    "2.25": {
      label: '2.25"',
      cutDiameter: 2.625,     // inches
      faceDiameter: 2.25,     // inches
      safeDiameter: 2.025,    // inches
      primary: false
    },
    "3": {
      label: '3"',
      cutDiameter: 3.451,     // inches
      faceDiameter: 3.0,      // inches
      safeDiameter: 2.8,     // inches
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
    "1": {
      label: "Standard (35)",
      description: "5 columns x 7 rows",
      cols: 5,
      rows: 7
    },
    "1.25": {
      label: "Standard (24)",
      description: "4 columns x 6 rows",
      cols: 4,
      rows: 6
    },
    "1.5": {
      label: "Standard (20)",
      description: "4 columns x 5 rows",
      cols: 4,
      rows: 5
    },
    "1.75": {
      label: "Standard (12)",
      description: "3 columns x 4 rows",
      cols: 3,
      rows: 4
    },
    "2.25": {
      label: "Standard (9)",
      description: "3 columns x 3 rows",
      cols: 3,
      rows: 3
    },
    "3": {
      label: "Standard (4)",
      description: "2 columns x 2 rows",
      cols: 2,
      rows: 2,
      equalRowSpacing: true
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
  
  var rowGutter = (usableHeight - layout.rows * size.cutDiameter) / (layout.rows - 1);
  var columnGutter = (usableWidth - layout.cols * size.cutDiameter) / (layout.cols - 1);
  var columnInset = 0;
  var rowInset = 0;

  // Cap gutters and center the grid with remaining space
  if (layout.maxColumnGutter && columnGutter > layout.maxColumnGutter) {
    var gridWidth = layout.cols * size.cutDiameter + (layout.cols - 1) * layout.maxColumnGutter;
    columnInset = (usableWidth - gridWidth) / 2;
    columnGutter = layout.maxColumnGutter;
  }
  if (layout.equalRowSpacing) {
    // Equal gaps above, between, and below rows
    var totalRowSpace = usableHeight - layout.rows * size.cutDiameter;
    var gap = totalRowSpace / (layout.rows + 1);
    rowGutter = gap;
    rowInset = gap;
  } else if (layout.maxRowGutter && rowGutter > layout.maxRowGutter) {
    var gridHeight = layout.rows * size.cutDiameter + (layout.rows - 1) * layout.maxRowGutter;
    rowInset = (usableHeight - gridHeight) / 2;
    rowGutter = layout.maxRowGutter;
  }

  return { columnGutter, rowGutter, columnInset, rowInset, usableWidth, usableHeight };
}
