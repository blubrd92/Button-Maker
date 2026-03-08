# Button Maker — Coding Conventions

## Naming Conventions

### JavaScript
- **Functions**: camelCase, verb-first, descriptive. E.g., `renderDesignCanvas()`, `drawGuideCircles()`, `handleCanvasMouseDown()`
- **Variables**: camelCase. E.g., `currentDesign`, `selectedElement`, `sheetSlots`
- **Constants**: UPPER_SNAKE_CASE for top-level config. E.g., `CONFIG`, `TEMPLATES`, `STORAGE_KEY`
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

### Render-time Conversion Pattern
```javascript
// In any render function, scale is passed as pixels-per-inch
const px = cx + element.x * scale;    // cx is center X of target
const py = cy + element.y * scale;    // cy is center Y of target
```

## Event Handling Patterns

1. **Initialization**: Each module has an `init*()` function called from `app.js`
2. **Event listeners**: Attached in `init*()` functions, not inline in HTML
3. **Cross-module communication**: Via shared state (`currentDesign`, `selectedElement`) and direct function calls. No event bus or pub/sub.
4. **Mode awareness**: Controls check `currentMode` to decide whether to modify the master or apply overrides

## Config.js Structure

```javascript
CONFIG = {
  DPI, SCREEN_DPI,                    // Resolution constants
  CANVAS_DISPLAY_DIAMETER,            // Editing canvas size
  BUTTON_SIZES: { "1.5": {...} },     // Physical dimensions
  currentButtonSize,                   // Active size key
  PAGE: { width, height, margin },    // Print page setup
  SHEET_LAYOUTS: { "15": {...} },     // Tiling options
  currentLayout,                       // Active layout key
  GUIDES: { cutLine, buttonEdge, safeZone },  // Guide circle styles
  guidesVisible,                       // Toggle state
  WRAP_ZONE_DIM,                       // Wrap zone overlay color
  FONTS: [...],                        // Available fonts
  COLOR_PALETTE: [...],                // Preset colors
  DEFAULTS: { ... },                   // Default design values
  PDF: { showCutGuides, pointsPerInch } // PDF settings
}
```

To extend: add new keys following the same pattern. Group related values.

## Template System

Templates are objects in the `TEMPLATES` array in `templates.js`:

```javascript
{
  id: "unique-string-id",
  label: "Display Name",
  category: "solid" | "pattern" | "gradient",
  backgroundColor: "#hex",           // fallback / reported color
  draw(ctx, cx, cy, radius) { ... }  // canvas draw function
}
```

To add a new template:
1. Add an object to the `TEMPLATES` array
2. Implement the `draw()` function — receives a clipped canvas context
3. The thumbnail is auto-generated from `draw()`

## Save/Load Data Structure

Saved in localStorage under key `buttonmaker_designs`:

```javascript
{
  designs: [{
    name: "string",
    savedAt: "ISO date",
    buttonSize: "1.5",
    layout: "15",
    master: {
      templateId, backgroundColor,
      textElements: [{ text, fontFamily, fontSize, color, bold, italic, align, x, y, curved, curveRadius }],
      imageElements: [{ dataUrl, x, y, width, height, naturalWidth, naturalHeight, lockAspect }],
      libraryInfoText, libraryInfoColor
    },
    slots: [{ slotIndex, row, col, overrides: {} }]
  }]
}
```

**Important**: `templateDraw` (function) and `imgObj` (DOM Image) are NOT serialized. They are reconstructed on load from `templateId` and `dataUrl` respectively.
