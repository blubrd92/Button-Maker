# Button Maker — Coding Conventions

## Naming Conventions

### JavaScript
- **Functions**: camelCase, verb-first, descriptive. E.g., `renderDesignCanvas()`, `drawGuideCircles()`, `handleCanvasMouseDown()`
- **Variables**: camelCase. E.g., `currentDesign`, `selectedElement`, `sheetSlots`
- **Constants**: UPPER_SNAKE_CASE for top-level config objects. E.g., `CONFIG`, `TEMPLATES`, `STORAGE_KEY`
- **Config keys**: camelCase within CONFIG object. E.g., `CONFIG.guidesVisible`, `CONFIG.currentButtonSize`
- **DOM IDs**: kebab-case. E.g., `design-canvas`, `bg-color-picker`, `btn-export`

### CSS
- **Class names**: BEM-lite (component-based). E.g., `.sidebar-heading`, `.template-card`, `.color-swatch`
- **State classes**: `.active`, `.selected`, `.hidden`
- **Layout classes**: Match the HTML structure. E.g., `.top-bar-left`, `.canvas-wrapper`

## Canvas Coordinate System

All design element positions are stored in **inches** relative to the button center:
- `(0, 0)` = center of the button
- Positive X = right, Positive Y = down
- Stored in the design state, converted to pixels only at render time

### Conversion Functions (in config.js)

| Function | Input | Output | Use When |
|----------|-------|--------|----------|
| `getCanvasScale()` | — | px/inch | Getting the editing canvas scale factor |
| `inchesToCanvasPixels(inches)` | inches | canvas px | Positioning on the editing canvas |
| `inchesToPrintPixels(inches)` | inches | print px | Rendering at 300 DPI |
| `inchesToPoints(inches)` | inches | PDF points | jsPDF coordinates (72pt/inch) |
| `computeSheetGutters(layoutKey)` | layout key | { columnGutter, rowGutter } | PDF tiling gutter calculation |

### Render-time Conversion Pattern
```javascript
// In any render function, `scale` is passed as pixels-per-inch for the target
const px = cx + element.x * scale;    // cx is center X of target context
const py = cy + element.y * scale;    // cy is center Y of target context
```

### Font Size Conversion
Font sizes are stored in **points** (1 pt = 1/72 inch). To convert to canvas pixels:
```javascript
const fontSizePx = fontSizePoints * (scale / 72);
```
This works for both screen rendering (scale = `getCanvasScale()`) and print (scale = 300 DPI).

## Event Handling Patterns

1. **Initialization**: Each module has an `init*()` function called from `app.js:initApp()`
2. **Event listeners**: Attached in `init*()` functions, not inline in HTML
3. **Cross-module communication**: Via shared globals (`currentDesign`, `selectedElement`, `currentMode`) and direct function calls. No event bus or pub/sub.
4. **Mode awareness**: Controls in `app.js` check `currentMode` ('design' or 'sheet') to decide whether to modify the master design or apply overrides to selected slots.
5. **Mouse interaction**: Canvas mouse events (mousedown/move/up) in `canvas.js` handle element selection and dragging. CSS-to-canvas coordinate conversion uses `canvas.width / rect.width` ratio.

## Module Communication

Global variables shared across modules:
- `currentDesign` (canvas.js) — master design state
- `selectedElement` (canvas.js) — currently selected text/image element
- `currentMode` (app.js) — 'design' or 'sheet'
- `selectedSlots` (sheet-mode.js) — selected slot indices in sheet mode
- `sheetSlots` (sheet-mode.js) — per-button override data
- `CONFIG` (config.js) — all configuration
- `TEMPLATES` (templates.js) — template definitions

## Config.js Structure

```javascript
CONFIG = {
  DPI: 300,                           // Print resolution
  SCREEN_DPI: 96,                     // Reference screen DPI
  CANVAS_DISPLAY_DIAMETER: 500,       // Editing canvas px size

  BUTTON_SIZES: { "1.5": { cutDiameter, faceDiameter, safeDiameter } },
  currentButtonSize: "1.5",

  PAGE: { width: 8.5, height: 11, margin: 0.25 },

  SHEET_LAYOUTS: { "15": { cols: 3, rows: 5 }, "20": { cols: 4, rows: 5 } },
  currentLayout: "15",

  GUIDES: { cutLine: {...}, buttonEdge: {...}, safeZone: {...} },
  guidesVisible: true,

  WRAP_ZONE_DIM: "rgba(0,0,0,0.08)",

  FONTS: [{ family: "Roboto", category: "sans-serif" }, ...],
  COLOR_PALETTE: ["#FFFFFF", "#222222", ...],

  DEFAULTS: { backgroundColor, textColor, fontFamily, fontSize,
              libraryInfoFontSize: 4.3, libraryInfoColor, libraryInfoText },

  PDF: { showCutGuides: true, pointsPerInch: 72 }
}
```

To extend: add new keys following the same pattern. Group related values together.

## Template System

Templates are objects in the `TEMPLATES` array in `templates.js`:

```javascript
{
  id: "unique-string-id",              // used as key, stored with designs
  label: "Display Name",               // shown in UI
  category: "solid" | "pattern" | "gradient",
  backgroundColor: "#hex",             // reported color for the design state
  draw(ctx, cx, cy, radius) { ... }    // canvas rendering function
}
```

To add a new template:
1. Add an object to the `TEMPLATES` array in `templates.js`
2. Implement the `draw()` function — receives a context already clipped to the cut circle
3. The thumbnail is auto-generated from `draw()` via `renderTemplatePicker()`

**Important**: The `draw` function is NOT serializable. On save, only `templateId` is stored. On load, the draw function is looked up via `getTemplateById()`.

## Save/Load Data Structure

Saved in localStorage under key `buttonmaker_designs` (storage.js):

```javascript
{
  designs: [{
    name: "My Design",                   // user-provided name
    savedAt: "2024-01-15T10:30:00Z",     // ISO timestamp
    buttonSize: "1.5",                    // key into CONFIG.BUTTON_SIZES
    layout: "15",                         // key into CONFIG.SHEET_LAYOUTS
    master: {
      templateId: "blank",               // key into TEMPLATES array
      backgroundColor: "#FFFFFF",
      textElements: [{
        text, fontFamily, fontSize, color, bold, italic,
        align, x, y, curved, curveRadius
      }],
      imageElements: [{
        dataUrl,                          // base64 data URL (NOT imgObj)
        x, y, width, height,
        naturalWidth, naturalHeight, lockAspect
      }],
      libraryInfoText: "",
      libraryInfoColor: "#666666"
    },
    slots: [{
      slotIndex: 0, row: 0, col: 0,
      overrides: {}                       // sparse: only changed properties
    }]
  }]
}
```

**Non-serializable fields**:
- `templateDraw` (function) → reconstructed from `templateId` via `getTemplateById()`
- `imgObj` (DOM Image) → reconstructed from `dataUrl` via `new Image()`

Both are restored in `deserializeDesign()` (storage.js).

## Rendering Pipeline

The same design can be rendered at different scales:

| Context | Scale Value | Used By |
|---------|-------------|---------|
| Editing canvas | `getCanvasScale()` ≈ 272 px/in | `renderDesignCanvas()` |
| Sheet thumbnail | `76 / cutDiameter` ≈ 41 px/in | `renderSheetThumbnail()` |
| PDF export | `CONFIG.DPI` = 300 px/in | `generatePDF()` |

All three use `renderButtonDesign()` (canvas.js) as the shared renderer.

## PDF Tiling Math

Gutter calculations in `computeSheetGutters()` (config.js):
```
usableWidth  = PAGE.width  - 2 × PAGE.margin  = 8.0"
usableHeight = PAGE.height - 2 × PAGE.margin  = 10.5"
columnGutter = (usableWidth  - cols × cutDiameter) / (cols - 1)
rowGutter    = (usableHeight - rows × cutDiameter) / (rows - 1)
```

Button position on PDF page:
```
cellX = PAGE.margin + col × (cutDiameter + columnGutter)
cellY = PAGE.margin + row × (cutDiameter + rowGutter)
```

### Verification (1.5" button)
- **15 layout** (3×5): columnGutter ≈ 1.24", rowGutter ≈ 0.33"
- **20 layout** (4×5): columnGutter ≈ 0.22", rowGutter ≈ 0.33"
